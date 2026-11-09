// Ona's brain: onboarding, CV profile, matching, checklists, reminders and test-mode time travel.
const { OPPS, TASKS } = require('./opportunities');
const store = require('./store');
const ai = require('./ai');

const LEVELS = { secondary:'Secondary school', undergraduate:'Undergraduate student', bachelors:'Bachelor’s degree', masters:'Master’s degree', phd:'PhD' };
const INTENSITY = { '1':'gentle', '2':'standard', '3':'restless', gentle:'gentle', standard:'standard', restless:'restless' };
const BATCH = 3;
// The bot's name. Change it anytime in Vercel with the BOT_NAME setting (default: Ona).
const NAME = process.env.BOT_NAME || 'Ona';

const SAMPLE_CV = `Adaeze Okafor, Lagos, Nigeria
B.Sc. Economics, University of Lagos (2022), Second Class Upper.
Experience:
Programme Associate, youth policy NGO (2023 to present): coordinated a 40-person civic education project across 3 states; wrote policy briefs on youth unemployment.
Data Analyst Intern, Lagos fintech (2022): built Excel and Python dashboards.
Leadership: Founder, campus financial literacy club (120 members).
Skills: Excel, Python, Stata, policy research, public speaking, report writing.
Volunteer: SDG advocate.`;

/* ---------- Dates ---------- */
const D = s => new Date(s + 'T00:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const diff = (a, b) => Math.round((D(b) - D(a)) / 86400000);
const fmt = (s, o) => D(s).toLocaleDateString('en-GB', { timeZone: 'UTC', ...o });
function todayLagos(){
  if (process.env.ONA_TODAY) return process.env.ONA_TODAY;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const today = u => addDays(todayLagos(), u.offset || 0);

const opp = id => OPPS.find(o => o.id === id);
const first = u => ((u.profile && u.profile.name) || u.waName || '').split(' ')[0] || 'friend';

/* ---------- User ---------- */
function freshUser(phone, waName){
  return { phone, waName: waName || '', stage: 'consent', profile: null, age: null, intensity: 'standard',
    matches: [], cursor: 0, status: {}, tasks: {}, snooze: {}, laterUntil: {}, focus: null,
    offset: 0, lastRun: null, created: new Date().toISOString(), lastSeen: null, ratings: [] };
}

/* ---------- Matching ---------- */
function evaluate(u, o){
  const p = u.profile; if (!p) return null;
  if (!o.levels.includes(p.level)) return null;
  if (o.ageMin && u.age && u.age < o.ageMin) return null;
  if (o.ageMax && u.age && u.age > o.ageMax) return null;
  if (o.minExp && (p.years_experience || 0) < o.minExp) return null;
  const left = diff(today(u), o.deadline); if (left < 0) return null;
  const reasons = [`open to your level (${LEVELS[p.level]})`];
  let score = 55;
  const hay = [p.field, ...(p.fields || []), ...(p.skills || []), ...(p.roles || []).map(r => r.title || ''), ...(p.education || []).map(e => e.degree || ''), p.summary || ''].join(' ').toLowerCase();
  if (o.fields[0] === 'any'){ score += 12; reasons.push('open to all fields'); }
  else { const hit = o.fields.find(f => hay.includes(f)); if (hit){ score += 30; reasons.push(`fits your background in ${hit}`); } else score -= 5; }
  if (o.leadership && p.leadership){ score += 10; reasons.push('your leadership record counts'); }
  if (left <= 10) reasons.push('closes soon');
  return { id: o.id, score: Math.min(98, score), reasons };
}

function computeMatches(u){
  u.matches = OPPS.map(o => evaluate(u, o)).filter(m => m && m.score >= 60)
    .sort((a, b) => b.score - a.score || diff(today(u), opp(a.id).deadline) - diff(today(u), opp(b.id).deadline));
  u.cursor = 0;
}

const numOf = (u, id) => u.matches.findIndex(m => m.id === id) + 1;
const idOf = (u, n) => (u.matches[n - 1] || {}).id;

function closesLine(u, o){
  const left = diff(today(u), o.deadline);
  if (left < 0) return 'Closed';
  const icon = left <= 3 ? '🔴' : left <= 10 ? '🟠' : '🟢';
  const when = left === 0 ? 'closes *today*' : left === 1 ? 'closes *tomorrow*' : `closes ${fmt(o.deadline, { day: 'numeric', month: 'short' })}, ${left} days left`;
  return `${icon} ${when}${o.deadlineNote ? ` (${o.deadlineNote})` : ''}`;
}

function matchesMessage(u){
  const open = u.matches.filter(m => !u.status[m.id] && diff(today(u), opp(m.id).deadline) >= 0);
  const batch = open.slice(u.cursor, u.cursor + BATCH);
  if (!batch.length) return u.matches.length
    ? 'That’s every match I have for you right now. I’ll tell you when a new one fits. Reply *STATUS* to see your applications.'
    : 'I didn’t find a strong match in my current list yet. I’ll message you when one fits your profile.';
  u.cursor += batch.length;
  const cards = batch.map(m => {
    const o = opp(m.id); const n = numOf(u, m.id);
    return `*${n}. ${o.title}*\n${o.type} · ${o.org}\n${closesLine(u, o)}\nMatch ${m.score}%: ${m.reasons.join(', ')}\n${o.url}`;
  }).join('\n\n');
  const n = numOf(u, batch[0].id);
  const more = open.length > u.cursor ? `\nReply *MORE* for ${open.length - u.cursor} more.` : '';
  return `${cards}\n\nWhat do you think?\n• *APPLY ${n}*: I’m applying\n• *LATER ${n}*: remind me in 2 days\n• *SKIP ${n}*: not for me\n• *ASK ${n}* + your question${more}`;
}

/* ---------- Checklists ---------- */
function ensureTasks(u, id){
  if (!u.tasks[id]) u.tasks[id] = TASKS[opp(id).kind].map(t => ({ t, done: false }));
  return u.tasks[id];
}
function checklist(u, id){
  const o = opp(id); const t = ensureTasks(u, id); const done = t.filter(x => x.done).length;
  const n = numOf(u, id);
  const lines = t.map((x, i) => `${x.done ? '✅' : '⬜'} ${i + 1}. ${x.t}`).join('\n');
  const nx = t.findIndex(x => !x.done) + 1;
  const hint = nx ? `Reply *DONE ${nx}* when you finish step ${nx}, or *SUBMITTED ${n}* once it’s in.` : `All steps ticked. Reply *SUBMITTED ${n}* once it’s in.`;
  return `📋 *${o.title}*\n${closesLine(u, o)} · ${done} of ${t.length} steps done\n\n${lines}\n\n${hint}\nOfficial page: ${o.url}`;
}

/* ---------- Reminders ---------- */
function due(u, left){
  if (u.intensity === 'gentle') return [14, 7, 3, 1, 0].includes(left);
  if (u.intensity === 'restless') return left <= 7 || [21, 14, 10].includes(left);
  return [21, 14, 7, 3, 2, 1, 0].includes(left);
}

function reminder(u, o, left){
  const t = ensureTasks(u, o.id); const done = t.filter(x => x.done).length; const next = t.find(x => !x.done);
  const n = numOf(u, o.id);
  let head;
  if (left === 0) head = `🔥 Deadline day, ${first(u)}: *${o.title}* closes today.`;
  else if (left === 1) head = `🚨 *${o.title}* closes tomorrow.`;
  else if (left <= 3) head = `⚠️ ${left} days left for *${o.title}*.`;
  else if (left <= 7) head = `⏳ ${left} days left for *${o.title}*.`;
  else head = `📌 *${o.title}* closes in ${left} days.`;
  let body = ` You’ve done ${done} of ${t.length} steps.`;
  body += next ? ` Next: ${next.t.charAt(0).toLowerCase() + next.t.slice(1)}.` : ' Every step is ticked, so reply *SUBMITTED* once it’s in.';
  if (t.some(x => !x.done && /referee|recommender/i.test(x.t)) && left <= 14 && left > 7) body += ' Referees often need a week or two, so ask them today.';
  if (left === 0) body += ' Check the closing time and time zone on the official page.';
  return `${head}${body}\n\nReply *OPEN ${n}* for the checklist, *SUBMITTED ${n}* when it’s in, or *SNOOZE ${n}* for a day off.`;
}

// Runs reminders for the user's current date once. Returns messages.
function runDue(u){
  const date = today(u);
  if (u.stage !== 'ready' || u.lastRun === date) return [];
  u.lastRun = date;
  const out = [];
  for (const m of u.matches){
    const o = opp(m.id); const st = u.status[o.id]; const left = diff(date, o.deadline);
    if (st === 'later' && u.laterUntil[o.id] && u.laterUntil[o.id] <= date){
      delete u.laterUntil[o.id]; delete u.status[o.id];
      if (left >= 0) out.push(`You asked me to come back to *${numOf(u, o.id)}. ${o.title}*. ${closesLine(u, o)}.\nReply *APPLY ${numOf(u, o.id)}* or *SKIP ${numOf(u, o.id)}*.`);
      continue;
    }
    if (st !== 'applying') continue;
    if (left < 0){
      u.status[o.id] = 'missed';
      out.push(`*${o.title}* has closed and it wasn’t marked submitted. If you did submit, reply *SUBMITTED ${numOf(u, o.id)}*. Otherwise I’ll watch for next year’s cycle and warn you early.`);
      continue;
    }
    if (u.snooze[o.id] && u.snooze[o.id] >= date) continue;
    if (due(u, left)) out.push(reminder(u, o, left));
  }
  return out;
}

/* ---------- CV ---------- */
function heuristicCV(text){
  const t = text.toLowerCase();
  const level = /\bph\.?d\b|doctor of philosophy/.test(t) ? 'phd'
    : /\bm\.?sc\b|\bmaster|\bm\.?a\b|\bmba\b|\bm\.?eng/.test(t) ? 'masters'
    : /(undergraduate|student|\d00 level|final year)/.test(t) && !/\bb\.?sc\b.*\(\d{4}\)/.test(t) ? 'undergraduate'
    : /\bb\.?sc\b|\bbachelor|\bb\.?a\b|\bb\.?eng|\bb\.?tech|\bhnd\b/.test(t) ? 'bachelors' : 'secondary';
  const fields = ['economics','computer science','engineering','law','medicine','biology','chemistry','physics','accounting','finance','communication','political science','sociology','public health','mathematics','statistics','data','marketing','agriculture','business'];
  const field = fields.find(f => t.includes(f)) || 'General';
  const skillLine = (text.match(/skills?\s*:\s*(.+)/i) || [])[1] || '';
  const skills = skillLine.split(/[,;]/).map(s => s.trim().replace(/[.]+$/, '')).filter(Boolean).slice(0, 12);
  const years = [...text.matchAll(/(20\d\d)\s*(?:to|-|–)\s*(present|now|20\d\d)/gi)]
    .reduce((n, m) => n + ((/present|now/i.test(m[2]) ? new Date().getFullYear() : +m[2]) - +m[1]), 0);
  const name = text.split('\n')[0].split(',')[0].trim().slice(0, 40);
  return { name, level, field: field.replace(/\b\w/g, c => c.toUpperCase()), skills, years_experience: Math.max(years, /intern/.test(t) ? 1 : 0),
    leadership: /\b(led|lead|founder|founded|president|coordinat|captain|head of|secretary)/.test(t), summary: text.slice(0, 200) };
}

async function readCV(text, media){
  if (media && ai.enabled() && /pdf/i.test(media.type || '')){
    try { const p = await ai.profileFromPdf(await media.load()); if (p && LEVELS[p.level]) return { p, how: 'ai' }; } catch (e) { console.error(e); }
    return { p: null, how: 'pdf-failed' };
  }
  if (media) return { p: null, how: 'no-pdf' };
  if (ai.enabled()){
    try { const p = await ai.profileFromText(text); if (p && LEVELS[p.level]) return { p, how: 'ai' }; } catch (e) { console.error(e); }
  }
  return { p: require('./cvparse').parse(text), how: 'rules' };
}

/* ---------- Profile card and corrections ---------- */
const CONFIRM_HELP = 'Fix anything with *FIELD* Data Science · *SKILLS* Excel, SQL · *EXPERIENCE* 5 · *LEVEL* masters · *NAME* Ada Obi. Reply *CV* to send a different CV.';
const CONFIRM_ASK_AI = 'Is this right? Reply *YES* to continue, or tell me what to fix in your own words (e.g. “my field is Data Science” or “add Power BI to my skills”).';
const CONFIRM_ASK_RULES = 'Is this right? Reply *YES* to continue, or fix anything like this: *FIELD* Data Science · *SKILLS* Excel, SQL, Power BI · *EXPERIENCE* 5 · *LEVEL* masters · *NAME* Ada Obi';
const CONFIRM_ASK = { toString: () => ai.enabled() ? CONFIRM_ASK_AI : CONFIRM_ASK_RULES };

function clean(p){
  const arr = v => Array.isArray(v) ? v.filter(Boolean) : (typeof v === 'string' && v ? v.split(/[,;]/).map(x => x.trim()).filter(Boolean) : []);
  const out = { ...p };
  out.level = LEVELS[out.level] ? out.level : 'bachelors';
  out.skills = arr(out.skills).slice(0, 15);
  out.fields = arr(out.fields).slice(0, 4);
  out.roles = Array.isArray(out.roles) ? out.roles.filter(r => r && (r.title || r.organisation)).slice(0, 8) : [];
  out.education = Array.isArray(out.education) ? out.education.filter(e => e && (e.degree || e.institution)).slice(0, 4) : [];
  out.years_experience = Math.max(0, Math.round(+out.years_experience || 0));
  out.field = out.field || out.fields[0] || 'General';
  return out;
}

function profileCard(p){
  const lines = [];
  if (p.name) lines.push(`*Name:* ${p.name}`);
  lines.push(`*Level:* ${LEVELS[p.level]}`);
  const other = (p.fields || []).filter(f => f.toLowerCase() !== String(p.field).toLowerCase());
  lines.push(`*Field:* ${p.field}${other.length ? ` (also ${other.join(', ')})` : ''}`);
  lines.push(`*Experience:* about ${p.years_experience || 0} year${p.years_experience === 1 ? '' : 's'}`);
  (p.roles || []).slice(0, 5).forEach(r => lines.push(`  • ${[r.title, r.organisation].filter(Boolean).join(', ')}${r.start || r.end ? ` (${r.start || '?'}–${r.end || '?'})` : ''}`));
  if ((p.education || []).length){ lines.push('*Education:*'); p.education.forEach(e => lines.push(`  • ${[e.degree, e.institution].filter(Boolean).join(', ')}${e.year ? ` (${e.year})` : ''}`)); }
  lines.push(`*Skills:* ${(p.skills || []).join(', ') || 'none found'}`);
  if (p.leadership) lines.push('*Leadership:* yes');
  return lines.join('\n');
}

async function fixProfile(u, cmd, restText, raw){
  const p = { ...u.profile };
  const v = restText.trim();
  if (cmd === 'FIELD' && v){ p.field = v; return p; }
  if (cmd === 'SKILLS' && v){ p.skills = v.split(/[,;]/).map(x => x.trim()).filter(Boolean); return p; }
  if (cmd === 'EXPERIENCE' && /\d/.test(v)){ p.years_experience = parseInt(v, 10); return p; }
  if (cmd === 'NAME' && v){ p.name = v; return p; }
  if (cmd === 'LEVEL' && v){
    const l = v.toLowerCase();
    const map = { secondary: 'secondary', undergraduate: 'undergraduate', student: 'undergraduate', bachelors: 'bachelors', bachelor: 'bachelors', degree: 'bachelors', bsc: 'bachelors', hnd: 'bachelors', masters: 'masters', master: 'masters', msc: 'masters', mba: 'masters', phd: 'phd', doctorate: 'phd' };
    const k = Object.keys(map).find(x => l.replace(/[.\s’']/g, '').includes(x));
    if (k){ p.level = map[k]; return p; }
    return null;
  }
  if (ai.enabled() && raw.length > 3){
    try { const f = await ai.correctProfile(u.profile, raw); if (f && f.level) return f; } catch (e){ console.error(e); }
  }
  return null;
}

/* ---------- Help text ---------- */
const HELP = `Here’s what you can send me:
• *MATCHES*: see your matches again
• *STATUS*: your applications and progress
• *OPEN 2*: the checklist for match 2
• *DONE 1*: tick step 1 on the checklist you opened
• *SUBMITTED 2*: you’ve applied to match 2
• *NEXT*: test mode, jump ahead 1 day (or *NEXT 7* for a week) to see reminders
• *CV*: send a new or updated CV\n• *FEEDBACK* + your thoughts: tell us what to improve
• *STOP*: pause reminders · *RESET*: start over`;

/* ---------- Main handler ---------- */
async function handle({ phone, text = '', waName = '', media = null }){
  let u = await store.getUser(phone);
  const out = [];
  const say = s => out.push(s);
  const raw = text.trim();
  const upper = raw.toUpperCase();
  const [cmd, ...rest] = upper.split(/\s+/);
  const nums = rest.map(x => parseInt(x, 10)).filter(n => !isNaN(n));
  const restText = raw.split(/\s+/).slice(1).join(' ');

  if (!u){
    u = freshUser(phone, waName);
    await store.count('users');
    say(`👋 Hi${waName ? ' ' + waName.split(' ')[0] : ''}, I’m ${NAME}. I find scholarships, fellowships and jobs that fit your CV, then I stay on you until you’ve applied.\n\nThis is a test version, and your feedback shapes it.\n\nReply *YES* to start. Reply *STOP* anytime.`);
    u.lastSeen = new Date().toISOString();
    await store.saveUser(u);
    return out;
  }
  u.lastSeen = new Date().toISOString();
  if (waName && !u.waName) u.waName = waName;

  const finish = async () => { await store.saveUser(u); return out; };

  // Commands that work at any stage
  if (cmd === 'RESET'){
    await store.deleteUser(phone); await store.count('resets');
    say('Done, I’ve cleared everything. Send *Hi* to start again.');
    return out;
  }
  if (cmd === 'STOP'){
    u.stage = u.stage === 'ready' ? 'stopped' : 'paused'; await store.count('stops');
    say('Okay, I’ve paused. Your applications are saved. Send *START* to turn me back on.');
    return finish();
  }
  if (cmd === 'START' && (u.stage === 'stopped')){ u.stage = 'ready'; say('Welcome back. Reminders are on again. Reply *STATUS* to see where you stand.'); return finish(); }
  if (cmd === 'HELP' || cmd === 'MENU'){ say(HELP); return finish(); }
  if (cmd === 'FEEDBACK'){
    if (!restText){ say('Type *FEEDBACK* followed by your thoughts, e.g. “FEEDBACK the reminders were too frequent”.'); return finish(); }
    await store.addFeedback({ phone: mask(phone), name: first(u), text: restText, at: new Date().toISOString(), stage: u.stage });
    await store.count('feedback');
    say(`🙏 Thank you! That goes straight to the ${NAME} team.`);
    return finish();
  }
  if (cmd === 'RATE' && nums[0] >= 1 && nums[0] <= 5){
    u.ratings.push(nums[0]); await store.addFeedback({ phone: mask(phone), name: first(u), rating: nums[0], at: new Date().toISOString() });
    await store.count('ratings'); await store.count('rating_total', nums[0]);
    say(nums[0] >= 4 ? `Thanks! Glad ${NAME} helped. 💚` : 'Thanks for being honest. What should we fix? Reply *FEEDBACK* and tell us.');
    return finish();
  }

  // Onboarding
  if (u.stage === 'consent' || u.stage === 'paused'){
    if (['YES', 'Y', 'START', 'OK'].includes(cmd)){
      u.stage = 'cv'; await store.count('consented');
      say(`Great! Send me your CV. You can attach it as a *PDF* or *Word* document, or paste the text here.\n\nNo CV handy? Reply *SAMPLE* to try me with a sample CV.`);
    } else say('Reply *YES* to get matches and reminders, or *STOP* if you’d rather not.');
    return finish();
  }
  if (u.stage === 'cv'){
    let cvText = raw;
    if (cmd === 'SAMPLE') cvText = SAMPLE_CV;
    else if (!media && raw.length < 80){ say('That looks a bit short for a CV. Attach your CV as a PDF or Word document, paste the full text, or reply *SAMPLE*.'); return finish(); }
    const { p, how } = await readCV(cvText, media);
    if (!p){
      say(how === 'no-pdf' ? 'I can’t read files in this test version yet. Please paste your CV as text instead.' : 'I couldn’t read that file. Please paste your CV as text instead.');
      return finish();
    }
    u.profile = clean(p); u.usedSample = cmd === 'SAMPLE'; u.stage = 'confirm'; await store.count('cv_shared');
    say(`Thanks${u.profile.name ? ', ' + u.profile.name.split(' ')[0] : ''}! I’ve read your CV. Here’s what I picked up:\n\n${profileCard(u.profile)}\n\n${CONFIRM_ASK}`);
    return finish();
  }
  if (u.stage === 'confirm'){
    if (['YES', 'Y', 'OK', 'OKAY', 'CORRECT', 'RIGHT', 'CONFIRM'].includes(cmd) && rest.length <= 1){
      u.stage = 'age'; await store.count('profile_confirmed');
      say('Great, saved. How old are you? Many programmes have age limits. Just send a number, like 26.');
      return finish();
    }
    if (cmd === 'CV' || cmd === 'RESEND'){ u.stage = 'cv'; say('Okay, send your CV again as a *PDF* or *Word* file, or paste it as text.'); return finish(); }
    const fixed = await fixProfile(u, cmd, restText, raw);
    if (fixed){
      u.profile = clean(fixed); await store.count('profile_corrected');
      say(`Updated. Here’s your profile now:\n\n${profileCard(u.profile)}\n\n${CONFIRM_ASK}`);
    } else say(`Sorry, I didn’t get that. ${CONFIRM_HELP}`);
    return finish();
  }
  if (u.stage === 'age'){
    const n = parseInt(raw, 10);
    if (!(n >= 13 && n <= 80)){ say('Just send your age as a number, like 26.'); return finish(); }
    u.age = n; u.stage = 'intensity';
    say('Last thing: how hard should I push you?\n\n*1* Gentle: a few check-ins before each deadline\n*2* Standard: 3 weeks, 2 weeks, 1 week, then daily for the last 3 days\n*3* Restless: daily for the final week, until you apply\n\nReply 1, 2 or 3.');
    return finish();
  }
  if (u.stage === 'intensity'){
    const i = INTENSITY[raw.toLowerCase()];
    if (!i){ say('Reply *1*, *2* or *3* to choose how often I remind you.'); return finish(); }
    u.intensity = i; u.stage = 'ready'; u.lastRun = today(u);
    computeMatches(u); await store.count('matched'); if (u.matches.length) await store.count('had_matches');
    say(`${{ gentle: 'Gentle', standard: 'Standard', restless: 'Restless' }[i]} it is. ${u.matches.length ? `I found *${u.matches.length}* opportunities that fit you, ${first(u)}. Here are the strongest:` : ''}`);
    say(matchesMessage(u));
    say('🧪 *Test mode:* deadlines are real, so reminders would take weeks. Reply *NEXT* to jump ahead a day, or *NEXT 7* for a week, and see what I’d send. Reply *HELP* for all commands.');
    return finish();
  }
  if (u.stage === 'stopped'){ say('I’m paused right now. Send *START* to turn me back on.'); return finish(); }

  // Ready: main commands
  const pick = () => {
    const n = nums[0] || (u.focus ? numOf(u, u.focus) : 0);
    const id = idOf(u, n);
    if (!id){ say(nums[0] ? `I don’t have a match number ${nums[0]}. Reply *MATCHES* to see them.` : 'Which one? Add its number, like *APPLY 2*.'); return null; }
    return id;
  };

  switch (cmd){
    case 'CV': case 'RESEND': u.stage = 'cv'; say('Okay, send your new CV as a *PDF* or *Word* document, or paste the text. I’ll update your profile and matches.'); break;
    case 'MATCHES': u.cursor = 0; say(matchesMessage(u)); break;
    case 'MORE': say(matchesMessage(u)); break;
    case 'APPLY': case 'APPLYING': {
      const id = pick(); if (!id) break;
      if (diff(today(u), opp(id).deadline) < 0){ say(`*${opp(id).title}* has already closed. Reply *MATCHES* for open ones.`); break; }
      if (u.status[id] !== 'applying'){ u.status[id] = 'applying'; await store.count('applying'); }
      u.focus = id;
      say(`Love it! Here’s your plan. I’ll keep reminding you until it’s submitted.\n\n${checklist(u, id)}`);
      break;
    }
    case 'LATER': {
      const id = pick(); if (!id) break;
      if (diff(today(u), opp(id).deadline) <= 2){ say(`*${opp(id).title}* ${diff(today(u), opp(id).deadline) < 0 ? 'has already closed' : 'closes too soon to wait'}. Reply *APPLY ${numOf(u, id)}* to go for it now, or *SKIP ${numOf(u, id)}*.`); break; }
      u.status[id] = 'later'; u.laterUntil[id] = addDays(today(u), 2); await store.count('later');
      say(`Okay, I’ll bring *${opp(id).title}* back on ${fmt(u.laterUntil[id], { weekday: 'long' })}.`);
      break;
    }
    case 'SKIP': {
      const id = pick(); if (!id) break;
      u.status[id] = 'declined'; await store.count('skipped');
      say('Got it, I won’t show that one again. Mind telling me why? Reply *FEEDBACK* + the reason (wrong field, not interested, no time…).');
      break;
    }
    case 'OPEN': case 'CHECKLIST': {
      const id = pick(); if (!id) break;
      u.focus = id; say(checklist(u, id)); break;
    }
    case 'DONE': case 'TICK': {
      if (!u.focus){ say('Open a checklist first, e.g. *OPEN 2*.'); break; }
      const t = ensureTasks(u, u.focus);
      const bad = nums.filter(n => n < 1 || n > t.length);
      if (!nums.length || bad.length){ say(`Send the step number, like *DONE 1*. This checklist has ${t.length} steps.`); break; }
      nums.forEach(n => { t[n - 1].done = true; });
      await store.count('steps_done', nums.length);
      const left = t.filter(x => !x.done).length;
      say(left ? `✅ Nice work. ${left} step${left > 1 ? 's' : ''} to go.\n\n${checklist(u, u.focus)}` : `🙌 Every step is ticked for *${opp(u.focus).title}*. Reply *SUBMITTED ${numOf(u, u.focus)}* once the application is in.`);
      break;
    }
    case 'UNDO': {
      if (!u.focus || !nums.length){ say('Send *UNDO 2* to untick step 2 on the checklist you opened.'); break; }
      const t = ensureTasks(u, u.focus); nums.forEach(n => { if (t[n - 1]) t[n - 1].done = false; });
      say(checklist(u, u.focus)); break;
    }
    case 'SUBMITTED': case 'SUBMIT': {
      const id = pick(); if (!id) break;
      if (u.status[id] !== 'submitted'){ u.status[id] = 'submitted'; await store.count('submitted'); }
      ensureTasks(u, id).forEach(x => { x.done = true; });
      say(`🎉 Submitted! *${opp(id).title}* is done, ${first(u)}. Screenshot your confirmation email and keep it safe. I’ll stop reminders for this one.\n\nQuick question for our test: how much did ${NAME} help with this, from 1 (not at all) to 5 (a lot)? Reply *RATE 4*, for example.`);
      break;
    }
    case 'SNOOZE': {
      const id = pick(); if (!id) break;
      u.snooze[id] = addDays(today(u), 1); await store.count('snoozed');
      say(`Okay, I’ll stay quiet about *${opp(id).title}* until ${fmt(addDays(today(u), 2), { weekday: 'long' })}.`);
      break;
    }
    case 'STATUS': case 'APPS': {
      const ids = Object.keys(u.status).filter(id => ['applying', 'submitted', 'missed', 'later'].includes(u.status[id]));
      if (!ids.length){ say('You haven’t picked anything yet. Reply *MATCHES* to see your matches.'); break; }
      const label = { applying: '', submitted: '✅ submitted', missed: '❌ missed', later: '🕒 deciding' };
      say('📊 *Where you stand* (' + fmt(today(u), { weekday: 'short', day: 'numeric', month: 'short' }) + ')\n\n' + ids.map(id => {
        const t = ensureTasks(u, id); const st = u.status[id];
        return `*${numOf(u, id)}. ${opp(id).title}*\n${st === 'applying' ? `${t.filter(x => x.done).length} of ${t.length} steps · ${closesLine(u, opp(id))}` : label[st]}`;
      }).join('\n\n') + '\n\nReply *OPEN* + number for a checklist.');
      break;
    }
    case 'NEXT': case 'TOMORROW': {
      const k = Math.min(Math.max(nums[0] || 1, 1), 30);
      await store.count('time_jumps');
      const msgs = [];
      for (let i = 0; i < k; i++){ u.offset = (u.offset || 0) + 1; runDue(u).forEach(m => msgs.push(`📅 *${fmt(today(u), { weekday: 'short', day: 'numeric', month: 'short' })}*\n${m}`)); }
      if (!msgs.length) say(`📅 It’s now *${fmt(today(u), { weekday: 'long', day: 'numeric', month: 'long' })}* in test mode. No reminders due${k > 1 ? ' in that stretch' : ' today'}. ${Object.values(u.status).includes('applying') ? 'Try *NEXT 7*.' : 'You have no open applications right now. Reply *MATCHES* and *APPLY* + a number to get reminders.'}`);
      else { msgs.slice(0, 8).forEach(m => say(m)); if (msgs.length > 8) say(`…and ${msgs.length - 8} more reminders. Reply *STATUS* to see where you stand.`); }
      break;
    }
    case 'TODAY': say(`Test-mode date: *${fmt(today(u), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}*${u.offset ? ` (${u.offset} days ahead of real time)` : ''}. Reply *NEXT* to jump ahead, or *REALTIME* to go back.`); break;
    case 'REALTIME': u.offset = 0; u.lastRun = today(u); say('Back to real time. I’ll send real reminders as deadlines approach.'); break;
    case 'ASK': {
      const id = idOf(u, nums[0]); if (id) u.focus = id;
      const q = raw.replace(/^ask\s*\d*\s*/i, '');
      if (!q){ say(`What would you like to know about *${id ? opp(id).title : 'it'}*? Type *ASK ${nums[0] || 1}* followed by your question.`); break; }
      await answerQuestion(u, q, say); break;
    }
    default:
      if (['HI', 'HELLO', 'HEY'].includes(cmd)){ say(`Hi ${first(u)}! ${HELP}`); break; }
      await answerQuestion(u, raw, say);
  }
  return finish();
}

async function answerQuestion(u, q, say){
  await store.count('questions');
  const o = u.focus ? opp(u.focus) : null;
  if (!ai.enabled()){
    say(o ? `Good question. I can’t answer free questions in this test yet. For *${o.title}*, the official page is the safest source: ${o.url}\n\nReply *HELP* to see what I can do.` : `I didn’t catch that. ${HELP}`);
    return;
  }
  try {
    const applying = Object.keys(u.status).filter(id => u.status[id] === 'applying').map(id => opp(id).title);
    say(await ai.answer({ question: q, profile: u.profile, age: u.age, today: today(u), opp: o, applying }));
  } catch (e){ console.error(e); say('Something went wrong on my side. Ask again in a moment.'); }
}

function mask(phone){ const d = String(phone).replace(/\D/g, ''); return d.length > 6 ? d.slice(0, 3) + '…' + d.slice(-3) : d; }

module.exports = { handle, runDue, today, mask, SAMPLE_CV, heuristicCV };
