// Ona's brain: CV in, matches out (by state, remote/abroad, scholarships), plain-word search, checklists, reminders.
const { OPPS, TASKS } = require('./opportunities');
const store = require('./store');
const ai = require('./ai');
const feeds = require('./feeds');
const places = require('./places');
const portfolio = require('./portfolio');

const LEVELS = { secondary:'Secondary school', undergraduate:'Undergraduate student', bachelors:'Bachelor’s degree', masters:'Master’s degree', phd:'PhD' };
const INTENSITY = { '1':'gentle', '2':'standard', '3':'restless', gentle:'gentle', standard:'standard', restless:'restless' };
const BATCH = 3;
const MAX_MATCHES = 60;
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

// Every opportunity Ona knows: the hand-picked list plus today's live listings (lib/feeds.js).
// SAVED keeps copies of listings people matched, so they still work after a site removes them.
const SAVED = new Map();
const allOpps = () => OPPS.concat(feeds.current());
const opp = id => OPPS.find(o => o.id === id) || feeds.current().find(o => o.id === id) || SAVED.get(id);
function adopt(u){ Object.values(u.saved || {}).forEach(o => SAVED.set(o.id, o)); }
function keepCopies(u){
  u.saved = {};
  for (const m of u.matches){ const o = opp(m.id); if (o && o.live) u.saved[o.id] = o; }
}
const first = u => ((u.profile && u.profile.name) || u.waName || '').split(' ')[0] || 'friend';

/* ---------- User ---------- */
function freshUser(phone, waName){
  return { phone, waName: waName || '', stage: 'cv', profile: null, age: null, intensity: 'standard',
    prefs: { state: null, anyState: false }, wants: null, view: null,
    matches: [], cursor: 0, status: {}, tasks: {}, snooze: {}, laterUntil: {}, focus: null,
    offset: 0, lastRun: null, created: new Date().toISOString(), lastSeen: null, ratings: [] };
}

/* ---------- Where an opportunity is ---------- */
// ng = a job in Nigeria · world = a remote job or a job abroad · grow = scholarships, fellowships, grants, programmes
function scopeOf(o){
  if (o.scope) return o.scope;
  if (o.kind !== 'job') return 'grow';
  return /nigeria|lagos|abuja|port harcourt|ibadan|kano/i.test(`${o.org} ${o.location || ''}`) ? 'ng' : 'world';
}
const stateOf = o => o.state || (scopeOf(o) === 'ng' ? places.stateIn(`${o.org} ${o.location || ''}`) : null);
const myState = u => (u.prefs && !u.prefs.anyState && u.prefs.state) || null;
// Nigerian jobs in the person's state, plus ones whose location isn't listed. Everything else is unaffected.
const inMyArea = (u, o, state = myState(u)) => {
  if (scopeOf(o) !== 'ng') return true;
  if (u.prefs && u.prefs.remoteOnly) return false; // they asked for remote work only
  return !state || !stateOf(o) || stateOf(o) === state;
};
const jobsLabel = u => myState(u) ? `Jobs in ${myState(u)}` : 'Jobs in Nigeria';

/* ---------- What people ask for in their own words ---------- */
const KIND_WORDS = [
  [/\b(jobs?|work|vacanc\w*|roles?|positions?|hiring|employment|careers?)\b/i, 'job'],
  [/\b(internships?|intern|siwes|industrial training)\b/i, 'job', 'intern'],
  [/\b(graduate trainee|trainee|graduate programmes?)\b/i, 'job', 'trainee'],
  [/\b(scholarships?|bursar\w*|study|studies|masters?|msc|mba|postgraduate|undergraduate|degree)\b/i, 'scholarship'],
  [/\b(ph\.?d|doctoral|doctorate)\b/i, 'phd'],
  [/\b(fellowships?|grants?|funding|accelerators?|competitions?|programmes?|programs?|conferences?|exchange|leadership|awards?|prizes?)\b/i, 'fellowship']
];
const LEVEL_TERMS = [[/\bmasters?|\bmsc\b|\bmba\b|postgraduate/i, ['master', 'msc', 'mba', 'postgraduate']], [/\bph\.?d|doctora/i, ['phd', 'doctora']], [/\bundergraduate|\bbachelor/i, ['undergraduate', 'bachelor']]];
const STOP = new Set('i im i’m me my we you your a an the and or of for to in on at by with from into about please pls kindly show find get give send see want wants need needs looking look search any some all more new latest open current good best right now today this that these those can could would will just also only like such jobs job work role roles position positions vacancy vacancies opportunity opportunities opening openings scholarship scholarships fellowship fellowships grant grants internship internships program programs programme programmes study remote abroad international overseas outside nigeria state states anywhere near around based located lagos abuja hiring career careers apply application applications masters master phd doctoral undergraduate postgraduate degree funding funded fully'.split(' '));

function parseWants(raw){
  const text = raw.trim();
  if (!text || text.length > 160) return null;
  const kinds = new Set(); const kindTerms = []; const levelTerms = []; const words = []; const stems = [];
  for (const [re, kind, term] of KIND_WORDS) if (re.test(text)){ kinds.add(kind); if (term) kindTerms.push(term); }
  for (const [re, ts] of LEVEL_TERMS) if (re.test(text)) levelTerms.push(...ts);
  let place = null;
  const st = places.stateIn(text);
  if (/\b(any|all|every)\s+states?\b|\banywhere in nigeria\b|\bnationwide\b/i.test(text)) place = 'any';
  else if (st) place = st;
  else if (/\bremote|work from home|online\b/i.test(text)) place = 'remote';
  else if (/\babroad|international|overseas|outside nigeria|\b(uk|usa|us|canada|germany|europe|australia|dubai|uae)\b/i.test(text)) place = 'abroad';
  const mapped = feeds.fieldsOf(text, 'scholarship').filter(f => f !== 'any');
  text.toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/).forEach(w => {
    if (w.length >= 4 && !STOP.has(w) && !places.stateIn(w)){ words.push(w); stems.push(w.replace(/(ing|ers|er|s)$/, '') || w); }
  });
  const isQuestion = /\?\s*$/.test(text) || /^(what|how|why|when|where|who|which|is|are|can|does|do|should)\b/i.test(text);
  const strong = kinds.size || place || mapped.length;
  if (!strong && (isQuestion || words.length === 0 || words.length > 3)) return null;
  if (isQuestion && !kinds.size && !place) return null;
  if (place && !kinds.size && !mapped.length && !words.length) kinds.add('job'); // "Abuja" alone = jobs there
  if ((place === 'remote' || place === 'abroad' || place === 'any') && !kinds.size) kinds.add('job');
  // Every group must match (any word within a group): the field, the level, the kind of role.
  const groups = [];
  if (mapped.length) groups.push(mapped); else if (stems.length) groups.push(stems);
  if (levelTerms.length) groups.push(levelTerms);
  if (kindTerms.length) groups.push(kindTerms);
  const kindName = kinds.size === 1 ? { job: 'jobs', scholarship: 'scholarships', phd: 'PhD positions', fellowship: 'fellowships and programmes' }[[...kinds][0]] : 'opportunities';
  const placeName = !place ? '' : place === 'any' ? ' anywhere in Nigeria' : place === 'remote' ? ' (remote)' : place === 'abroad' ? ' abroad' : ` in ${place}`;
  const levelName = /\bph\.?d|doctora/i.test(text) && kindName !== 'PhD positions' ? 'PhD ' : /\bmasters?|\bmsc\b|\bmba\b|postgraduate/i.test(text) ? 'masters ' : /\bundergraduate|\bbachelor/i.test(text) ? 'undergraduate ' : '';
  const label = `${words.length ? words.join(' ') + ' ' : ''}${levelName}${kindName}${placeName}`.trim();
  return { kinds: [...kinds], place, groups, label };
}

const termRe = t => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
// The word that matched, if every group of words finds a match in the listing.
function termHit(groups, o){
  if (!groups || !groups.length) return null;
  const hay = `${o.title} ${o.type} ${o.org} ${(o.fields || []).filter(f => f !== 'any').join(' ')}`;
  let shown = null;
  for (const g of groups){ const h = g.find(t => termRe(t).test(hay)); if (!h) return null; shown = shown || h; }
  return shown;
}
function placeOk(w, o, u){
  if (o.kind !== 'job' || !w.place) return inMyArea(u, o);
  const sc = scopeOf(o);
  if (w.place === 'any') return true;
  if (w.place === 'remote') return sc === 'world' && /remote/i.test(o.location || '');
  if (w.place === 'abroad') return sc === 'world';
  return sc === 'ng' && (!stateOf(o) || stateOf(o) === w.place);
}
const kindOk = (w, o) => !w.kinds.length || w.kinds.includes(o.kind);

/* ---------- Matching ---------- */
function evaluate(u, o){
  const p = u.profile; if (!p) return null;
  if (!o.levels.includes(p.level)) return null;
  if (o.ageMin && u.age && u.age < o.ageMin) return null;
  if (o.ageMax && u.age && u.age > o.ageMax) return null;
  if (o.minExp && (p.years_experience || 0) < o.minExp) return null;
  const left = diff(today(u), o.deadline); if (left < 0) return null;
  const reasons = [];
  let score = 55;
  const hay = [p.field, ...(p.fields || []), ...(p.skills || []), ...(p.roles || []).map(r => r.title || ''), ...(p.education || []).map(e => e.degree || ''), p.summary || '', linkHints(p)].join(' ').toLowerCase();
  if (o.fields[0] === 'any'){ score += 12; reasons.push('open to all fields'); }
  else { const hit = o.fields.find(f => hay.includes(f)); if (hit){ score += 30; reasons.push(`fits your background in ${hit}`); } else score -= 5; }
  const asked = u.wants && kindOk(u.wants, o) && termHit(u.wants.groups, o);
  if (asked){ score += 15; reasons.unshift('what you asked for'); }
  if (o.leadership && p.leadership){ score += 10; reasons.push('your leadership counts'); }
  if (scopeOf(o) === 'ng' && myState(u) && stateOf(o) === myState(u)){ score += 5; reasons.push(`in ${myState(u)}`); }
  if (!o.estimated && left <= 10) reasons.push('closes soon');
  return { id: o.id, score: Math.min(98, score), reasons: reasons.slice(0, 2) };
}

const rank = u => (a, b) => b.score - a.score || diff(today(u), opp(a.id).deadline) - diff(today(u), opp(b.id).deadline);
const isOpen = (u, o) => o && diff(today(u), o.deadline) >= 0;
// Everything this person qualifies for today (level, age, experience, still open).
const pool = u => allOpps().map(o => evaluate(u, o)).filter(Boolean);

// The best from each group first (a local job, a remote/abroad job, a scholarship or fellowship), then by score.
function topPicks(u, list){
  const picks = [];
  ['ng', 'world', 'grow'].forEach(g => { const m = list.find(x => scopeOf(opp(x.id)) === g); if (m) picks.push(m); });
  list.forEach(m => { if (picks.length < BATCH && !picks.includes(m)) picks.push(m); });
  return picks.slice(0, BATCH).sort(rank(u));
}

function computeMatches(u){
  const kept = (u.matches || []).filter(m => u.status && u.status[m.id]); // applications keep a number
  const keptIds = new Set(kept.map(m => m.id));
  const ranked = pool(u).filter(m => !keptIds.has(m.id) && m.score >= 60 && inMyArea(u, opp(m.id))).sort(rank(u));
  const picks = topPicks(u, ranked);
  u.matches = kept.concat(picks, ranked.filter(m => !picks.includes(m))).slice(0, MAX_MATCHES + kept.length);
  u.cursor = 0; u.view = null;
  keepCopies(u);
}

// Makes sure these matches have a number (APPLY 7), keeping everyone's existing numbers.
function register(u, list){
  const have = new Set(u.matches.map(m => m.id));
  list.forEach(m => { if (!have.has(m.id)){ u.matches.push(m); have.add(m.id); } });
  keepCopies(u);
}

// Adds newly listed opportunities that fit (after the existing ones). Returns their ids.
function addNewMatches(u){
  if (!u.profile) return [];
  const have = new Set(u.matches.map(m => m.id));
  const fresh = pool(u).filter(m => !have.has(m.id) && m.score >= 60 && inMyArea(u, opp(m.id))).sort(rank(u)).slice(0, 20);
  register(u, fresh);
  return fresh.map(m => m.id);
}

const numOf = (u, id) => u.matches.findIndex(m => m.id === id) + 1;
const idOf = (u, n) => (u.matches[n - 1] || {}).id;

function closesLine(u, o){
  const left = diff(today(u), o.deadline);
  if (left < 0) return o.estimated ? 'May have closed' : 'Closed';
  if (o.estimated) return `🟢 posted ${fmt(o.posted || today(u), { day: 'numeric', month: 'short' })} · no deadline listed, apply early`;
  const icon = left <= 3 ? '🔴' : left <= 10 ? '🟠' : '🟢';
  const when = left === 0 ? 'closes *today*' : left === 1 ? 'closes *tomorrow*' : `closes ${fmt(o.deadline, { day: 'numeric', month: 'short' })} (${left} days)`;
  return `${icon} ${when}${o.deadlineNote ? ` · ${o.deadlineNote}` : ''}`;
}

function card(u, m){
  const o = opp(m.id); const n = numOf(u, m.id);
  const where = scopeOf(o) === 'ng' ? (stateOf(o) || (o.multi ? 'various locations' : 'location not listed')) : (o.location || '');
  const ages = !u.age && (o.ageMin || o.ageMax) ? ` · ages ${o.ageMin || ''}${o.ageMin && o.ageMax ? '–' : o.ageMax ? 'up to ' : '+'}${o.ageMax || ''}` : '';
  const why = m.reasons && m.reasons.length ? `\nWhy: ${m.reasons.join(', ')}` : '';
  return `*${n}. ${o.title}*\n${o.type} · ${o.org}${where ? ` · ${where}` : ''}${ages}\n${closesLine(u, o)}${why}\n${o.url}${o.source && o.source !== o.org ? `\n(found on ${o.source})` : ''}`;
}

/* ---------- Views: what MORE pages through ---------- */
// all · group (ng / world / grow, optional kinds) · search (what they typed) · ids (e.g. today's new ones)
function listFor(u, v){
  const open = m => { const o = opp(m.id); return isOpen(u, o) && !u.status[m.id]; };
  if (!v || v.kind === 'all'){ const skip = new Set((v && v.skip) || []); return u.matches.filter(m => open(m) && !skip.has(m.id) && inMyArea(u, opp(m.id))).sort(rank(u)); }
  if (v.kind === 'ids'){ const s = new Set(v.ids); return u.matches.filter(m => s.has(m.id) && open(m)); }
  const all = pool(u).filter(open);
  if (v.kind === 'group'){
    return all.filter(m => { const o = opp(m.id); return scopeOf(o) === v.group && (!v.kinds || v.kinds.includes(o.kind)) && (v.group !== 'ng' || inMyArea(u, o, v.state || myState(u))) && m.score >= (v.loose ? 0 : 60); }).sort(rank(u));
  }
  if (v.kind === 'search'){
    const w = v.w;
    return all.map(m => { const o = opp(m.id); if (!kindOk(w, o) || !placeOk(w, o, u)) return null;
      const hit = termHit(w.groups, o); if (w.groups.length && !hit) return null;
      return { ...m, score: Math.min(98, m.score + (hit ? 20 : 0)), reasons: hit ? [`matches “${hit}”`, ...m.reasons].slice(0, 2) : m.reasons };
    }).filter(Boolean).sort(rank(u));
  }
  return [];
}

function page(u, intro){
  const list = listFor(u, u.view);
  const batch = list.slice(u.cursor, u.cursor + BATCH);
  if (!batch.length) return u.cursor ? 'That’s all I have here for now. I check for new ones every day. Reply *MATCHES* for your overview, or tell me what you’re looking for.' : null;
  register(u, batch);
  u.cursor += batch.length;
  const n = numOf(u, batch[0].id);
  const left = list.length - u.cursor;
  return `${intro ? intro + '\n\n' : ''}${batch.map(m => card(u, m)).join('\n\n')}\n\nReply *APPLY ${n}* to start one, or *SAVE ${n}* to keep it on your radar${batch.length > 1 ? ` (or save them all: *SAVE ${batch.map(m => numOf(u, m.id)).join(' ')}*)` : ''}.${left > 0 ? ` *MORE* for ${left} more.` : ''}`;
}

function show(u, view, intro, empty){
  u.view = view; u.cursor = 0;
  return page(u, intro) || (empty !== undefined ? empty : 'Nothing here right now. I check for new ones every day and I’ll message you when one fits.');
}

function counts(u){
  const all = pool(u).filter(m => m.score >= 60 && isOpen(u, opp(m.id)) && !u.status[m.id]);
  const c = { ng: 0, other: 0, world: 0, grow: 0 };
  all.forEach(m => { const o = opp(m.id); const s = scopeOf(o); if (s === 'ng') inMyArea(u, o) ? c.ng++ : c.other++; else c[s]++; });
  return c;
}

function overview(u, intro){
  const c = counts(u);
  const lines = [
    u.prefs && u.prefs.remoteOnly ? `📍 Jobs in Nigeria: hidden, you chose remote only → *ANY STATE* to show them` : `📍 ${jobsLabel(u)}: *${c.ng}* → reply *JOBS*${c.other && myState(u) ? `\n     +${c.other} in other states → *ANY STATE*` : ''}`,
    `🌍 Remote and abroad: *${c.world}* → *REMOTE*`,
    `🎓 Scholarships and fellowships: *${c.grow}* → *SCHOLARSHIPS* or *FELLOWSHIPS*`
  ];
  // Top picks: the best from each group first, so people see the range.
  const top = topPicks(u, listFor(u, { kind: 'all' }));
  u.view = { kind: 'all', skip: top.map(m => m.id) }; u.cursor = 0; // MORE continues after these three
  if (!top.length) return `${intro ? intro + '\n\n' : ''}${lines.join('\n')}\n\nI don’t have a strong match yet. Tell me what you’re looking for, like “data jobs in Abuja” or “masters scholarships”, and I’ll keep watching every day.`;
  register(u, top);
  const n = numOf(u, top[0].id);
  return `${intro ? intro + '\n\n' : ''}Here’s what fits you today:\n${lines.join('\n')}\n\n*Your top ${top.length}:*\n\n${top.map(m => card(u, m)).join('\n\n')}\n\nReply *APPLY ${n}* to start one, *SAVE ${top.map(m => numOf(u, m.id)).join(' ')}* to keep them on your radar, *MORE* for more, or just tell me what you want, like “data jobs in Abuja”.`;
}

function search(u, w){
  u.wants = { kinds: w.kinds, groups: w.groups, label: w.label };
  const say = `🔎 *${w.label.charAt(0).toUpperCase() + w.label.slice(1)}*`;
  const found = show(u, { kind: 'search', w }, say, '');
  if (found) return `${found}\n\nI’ll also put ${w.label} first in your daily updates. Reply *CLEAR* to stop.`;
  // Nothing exact: widen the place, then the words, and say so.
  if (w.place && w.place !== 'any'){
    const wide = { ...w, place: w.place === 'remote' ? 'abroad' : 'any' };
    const r = show(u, { kind: 'search', w: wide }, `🔎 Nothing for *${w.label}* right now. Here’s the closest I have${w.place === 'remote' ? ' (remote and abroad)' : ' in other states'}:`, '');
    if (r) return r;
  }
  if (w.groups.length){
    const r = show(u, { kind: 'search', w: { ...w, groups: [] } }, `🔎 Nothing for *${w.label}* right now. These are your best ${w.kinds.length === 1 && w.kinds[0] === 'job' ? 'jobs' : 'matches'} instead:`, '');
    if (r) return `${r}\n\nI’ll message you as soon as ${w.label} come up.`;
  }
  return `🔎 Nothing for *${w.label}* right now. I check new listings every day and I’ll message you when one comes up.`;
}

/* ---------- Portfolio links ---------- */
// Links people share (in their CV or with PORTFOLIO): LinkedIn, GitHub, Behance, a website…
const LINK_KINDS = [
  [/linkedin\.com/i, 'LinkedIn', ''],
  [/github\.com|gitlab\.com/i, 'GitHub', 'software developer programming computer'],
  [/behance\.net|dribbble\.com|figma\.com|artstation/i, 'Design portfolio', 'design graphic creative figma'],
  [/medium\.com|substack\.com|hashnode|dev\.to|blogspot|wordpress\.com/i, 'Writing', 'writing content communication media'],
  [/youtube\.com|youtu\.be|vimeo\.com|tiktok\.com/i, 'Videos', 'media content creative film'],
  [/kaggle\.com|tableau/i, 'Data portfolio', 'data analytics']
];
const URL_RE = /\b((?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|me|app|ng|co|site|page|xyz|art|design|tech|ai|blog|info|uk)(?:\/[^\s,;()<>"']*)?)/gi;
const shortLink = url => url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
function linkKind(url){ const k = LINK_KINDS.find(([re]) => re.test(url)); return k ? k[1] : 'Website'; }
function findLinks(text){
  const out = [];
  for (const m of String(text || '').matchAll(URL_RE)){
    const url = m[1].replace(/[.)\]]+$/, '');
    const before = text.slice(Math.max(0, m.index - 1), m.index);
    if (before === '@' || /^(gmail|yahoo|hotmail|outlook|icloud|ymail)\./i.test(shortLink(url))) continue; // part of an email address
    const full = /^https?:/i.test(url) ? url : 'https://' + url;
    if (!out.some(x => shortLink(x.url).toLowerCase() === shortLink(full).toLowerCase())) out.push({ url: full, kind: linkKind(full) });
  }
  return out.slice(0, 6);
}
const linkHints = p => (p.links || []).map(l => (LINK_KINDS.find(([, k]) => k === l.kind) || [])[2] || '').join(' ');
const linksLine = p => (p.links || []).map(l => `${l.kind}: ${shortLink(l.url)}`).join(' · ');
const CREATIVE = /design|graphic|creative|software|developer|programming|computer|writing|content|media|journalism|film|art|architect|marketing|brand|ux|ui/i;

/* ---------- Checklists ---------- */
function ensureTasks(u, id){
  if (!u.tasks[id]){
    const o = opp(id); const steps = TASKS[o.kind].slice();
    const links = (u.profile && u.profile.links) || [];
    const wantsWork = o.kind !== 'phd' && (CREATIVE.test(`${o.title} ${(o.fields || []).join(' ')}`) || o.kind === 'fellowship');
    const best = links.find(l => l.kind !== 'LinkedIn') || links[0];
    if (best) steps.splice(steps.length - 1, 0, `Add your portfolio link (${shortLink(best.url)}) to the application`);
    else if (wantsWork) steps.splice(steps.length - 1, 0, 'Prepare a portfolio link to show your work (GitHub, Behance or a simple website)');
    u.tasks[id] = steps.map(t => ({ t, done: false }));
  }
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

// Saved ("on my radar") items: lighter reminders, at the person's chosen pace.
function savedDue(u, left){
  if (u.intensity === 'gentle') return [7, 2].includes(left);
  if (u.intensity === 'restless') return [14, 7, 5, 3, 2, 1, 0].includes(left);
  return [14, 7, 3, 1].includes(left);
}
const EVERY = { gentle: 7, standard: 4, restless: 2 }; // days between nudges when there's no deadline
const IDLE = { gentle: 7, standard: 3, restless: 2 };  // days without progress before "continue?"
const touch = (u, id) => { u.touched = u.touched || {}; u.touched[id] = today(u); };

function savedLine(u, o){
  const left = diff(today(u), o.deadline);
  const when = o.estimated ? 'no deadline listed, apply soon' : left === 0 ? '*closes today*' : left === 1 ? '*closes tomorrow*' : `closes ${fmt(o.deadline, { day: 'numeric', month: 'short' })} (${left} days)`;
  return `🔖 *${numOf(u, o.id)}. ${o.title}* · ${o.org}
     ${when}`;
}
function savedList(u){
  return Object.keys(u.status).filter(id => u.status[id] === 'saved' && opp(id))
    .sort((a, b) => diff(today(u), opp(a).deadline) - diff(today(u), opp(b).deadline));
}

function reminder(u, o, left){
  const t = ensureTasks(u, o.id); const done = t.filter(x => x.done).length; const next = t.find(x => !x.done);
  const n = numOf(u, o.id);
  let head;
  if (o.estimated) head = `📌 How’s *${o.title}* going? It has no fixed deadline, and listings like this can close any day.`;
  else if (left === 0) head = `🔥 Deadline day, ${first(u)}: *${o.title}* closes today.`;
  else if (left === 1) head = `🚨 *${o.title}* closes tomorrow.`;
  else if (left <= 3) head = `⚠️ ${left} days left for *${o.title}*.`;
  else if (left <= 7) head = `⏳ ${left} days left for *${o.title}*.`;
  else head = `📌 *${o.title}* closes in ${left} days.`;
  let body = ` You’ve done ${done} of ${t.length} steps.`;
  body += next ? ` Next: ${next.t.charAt(0).toLowerCase() + next.t.slice(1)}.` : ' Every step is ticked, so reply *SUBMITTED* once it’s in.';
  if (t.some(x => !x.done && /referee|recommender/i.test(x.t)) && left <= 14 && left > 7) body += ' Referees often need a week or two, so ask them today.';
  if (left === 0) body += ' Check the closing time and time zone on the official page.';
  return `${head}${body}\n\nReply *CONTINUE ${n}* for the checklist, *SUBMITTED ${n}* when it’s in, *SNOOZE ${n}* for a day off, or *QUIT ${n}* if you’re no longer interested.`;
}

// Runs reminders for the user's current date once. Returns messages.
function runDue(u){
  const date = today(u);
  if (u.stage !== 'ready' || u.lastRun === date) return [];
  u.lastRun = date;
  const out = [];
  adopt(u);
  // New listings that fit this person since yesterday.
  const added = addNewMatches(u);
  if (added.length){
    u.view = { kind: 'ids', ids: added }; u.cursor = 0;
    const best = opp(added[0]); const n = added.length;
    out.push(`🆕 I found *${n}* new ${n === 1 ? 'opportunity that fits' : 'opportunities that fit'} you, ${first(u)}, including *${best.title}*${best.org ? ` (${best.org})` : ''}.\n\nReply *MORE* to see ${n === 1 ? 'it' : 'them'}.`);
  }
  const radar = []; const closed = [];
  u.savedAt = u.savedAt || {}; u.nudged = u.nudged || {}; u.touched = u.touched || {};
  for (const m of u.matches){
    const o = opp(m.id); if (!o) continue;
    const st = u.status[o.id]; const left = diff(date, o.deadline);
    if (st === 'saved'){
      if (left < 0){ closed.push(o); delete u.status[o.id]; continue; }
      const since = diff(u.savedAt[o.id] || date, date);
      const dueNow = o.estimated ? since > 0 && since % (EVERY[u.intensity] || 4) === 0 : savedDue(u, left);
      if (dueNow) radar.push(o);
      continue;
    }
    if (st === 'later' && u.laterUntil[o.id] && u.laterUntil[o.id] <= date){
      delete u.laterUntil[o.id]; delete u.status[o.id];
      if (left >= 0) out.push(`You asked me to come back to *${numOf(u, o.id)}. ${o.title}*. ${closesLine(u, o)}.\nReply *APPLY ${numOf(u, o.id)}* or *SKIP ${numOf(u, o.id)}*.`);
      continue;
    }
    if (st !== 'applying') continue;
    if (left < 0){
      u.status[o.id] = 'missed';
      if (o.estimated){ out.push(`*${o.title}* has probably closed by now. If you applied, reply *SUBMITTED ${numOf(u, o.id)}*. Reply *MATCHES* for fresh ones.`); continue; }
      out.push(`*${o.title}* has closed and it wasn’t marked submitted. If you did submit, reply *SUBMITTED ${numOf(u, o.id)}*. Otherwise I’ll watch for next year’s cycle and warn you early.`);
      continue;
    }
    if (u.snooze[o.id] && u.snooze[o.id] >= date) continue;
    if (due(u, left)){ out.push(reminder(u, o, left)); u.nudged[o.id] = date; continue; }
    // Started but stalled: no progress for a few days, so check in.
    if (!u.touched[o.id]) u.touched[o.id] = date;
    const idle = IDLE[u.intensity] || 3;
    const quiet = diff(u.touched[o.id] || date, date), sinceNudge = diff(u.nudged[o.id] || '2000-01-01', date);
    if (quiet >= idle && sinceNudge >= idle){
      const t = ensureTasks(u, o.id); const done = t.filter(x => x.done).length; const next = t.find(x => !x.done); const n = numOf(u, o.id);
      out.push(`👋 Still working on *${o.title}*? You’ve done ${done} of ${t.length} steps${next ? `; next is “${next.t.toLowerCase()}”` : ''}. ${closesLine(u, o)}.\n\nReply *CONTINUE ${n}* to pick up where you stopped, or *QUIT ${n}* if you’re no longer interested.`);
      u.nudged[o.id] = date;
    }
  }
  // One message for everything on the radar, soonest deadline first.
  if (radar.length){
    radar.sort((a, b) => diff(date, a.deadline) - diff(date, b.deadline));
    const n = numOf(u, radar[0].id);
    out.push(`🔖 *On your radar, ${first(u)}*\n\n${radar.map(o => savedLine(u, o)).join('\n')}\n\nReply *APPLY ${n}* to start, *UNSAVE ${n}* to drop it, or *SAVED* to see your whole list.`);
  }
  if (closed.length) out.push(`These saved ones have closed: ${closed.map(o => `*${o.title}*`).join(', ')}. I’ve taken them off your list.`);
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
  lines.push(`*Portfolio:* ${(p.links || []).length ? '\n' + p.links.map((l, i) => `  ${i + 1}. ${l.kind}: ${shortLink(l.url)}`).join('\n') : 'none yet'}`);
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
• Tell me what you want, like “data jobs in Abuja”, “remote marketing” or “masters scholarships”
• *MATCHES*: your overview · *MORE*: see more
• *JOBS* · *REMOTE* · *SCHOLARSHIPS* · *FELLOWSHIPS*
• A state, like *ABUJA*, to see jobs there · *ANY STATE* for all of Nigeria · *REMOTE ONLY* for remote work only
• *SAVE 2 4 5*: keep several on your radar with reminders · *SAVED*: see them · *UNSAVE 4*
• *APPLY 2* · *CONTINUE 2* · *DONE 1* · *SUBMITTED 2* · *QUIT 2* · *STATUS*
• *FIX*: correct what I read from your CV · *CV*: send a new one
• *PORTFOLIO* + link: add your website, GitHub, Behance or LinkedIn
• *REMIND 1/2/3*: fewer or more reminders
• *NEXT 7*: test mode, jump a week ahead to see reminders
• *FEEDBACK* + your thoughts · *STOP* · *RESET*`;

const WELCOME = (waName) => `👋 Hi${waName ? ' ' + waName.split(' ')[0] : ''}, I’m ${NAME}. I find jobs, scholarships and fellowships that fit your CV, then remind you until you’ve applied.\n\nSend me your CV as a *PDF* or *Word* file, or paste it here. A portfolio link works too (GitHub, Behance or your website). No CV handy? Reply *SAMPLE*.\n\n🔒 I only use your CV to find your matches. Reply *STOP* anytime.`;

// Age, if the CV states it ("Date of Birth: 12/03/1998", "Age: 27").
function ageFromCV(text){
  const a = text.match(/\bage\s*[:\-]\s*(\d{2})\b/i); if (a && +a[1] >= 14 && +a[1] <= 70) return +a[1];
  const d = text.match(/\b(?:date of birth|d\.?\s?o\.?\s?b\.?|born(?: on)?)\s*[:\-]?\s*([^\n]{6,30})/i);
  if (!d) return null;
  const iso = feeds.parseDate(d[1]); if (!iso) return null;
  const now = todayLagos(); let age = +now.slice(0, 4) - +iso.slice(0, 4);
  if (now.slice(5) < iso.slice(5)) age--;
  return age >= 14 && age <= 70 ? age : null;
}

// One line summing up what Ona read, so people can spot a mistake without a full form.
function summaryLine(u){
  const p = u.profile;
  const bits = [`*${p.field}*`, LEVELS[p.level], `about ${p.years_experience || 0} yr${p.years_experience === 1 ? '' : 's'} experience`];
  const st = u.prefs && u.prefs.state;
  bits.push(st ? `📍 ${st}${u.prefs.anyState ? ' (showing all states)' : ''}` : '📍 state not found');
  return bits.join(' · ') + ((p.links || []).length ? `\n🔗 ${linksLine(p)}` : '');
}

// Reads portfolio links into the profile: skills, a likely field, and a location if the page states one.
async function readLinks(links){
  const got = await Promise.all(links.slice(0, 3).map(l => portfolio.read(l.url).then(r => ({ ...r, link: l }))));
  return { ok: got.filter(r => r.ok), failed: got.filter(r => !r.ok) };
}
const whyFailed = f => f.reason === 'login' ? `${shortLink(f.link.url)} needs a login, so I can’t open it` : `I couldn’t open ${shortLink(f.link.url)}`;

function mergeSkills(p, extra){
  const have = new Set((p.skills || []).map(x => x.toLowerCase()));
  const add = (extra || []).filter(x => x && !have.has(String(x).toLowerCase()));
  p.skills = (p.skills || []).concat(add).slice(0, 15);
  return add;
}

// A portfolio is not a CV, so read it differently: what kind of work it shows, the tools named,
// any degree mentioned, and "N years" if the page says so.
const WORK_KINDS = [
  [/\b(developer|software|engineer|backend|frontend|full[- ]?stack|javascript|typescript|python|java\b|golang|react|node|api|devops|mobile app)/gi, 'Software Development'],
  [/\b(ui|ux|product design|graphic|brand|branding|identity|illustrat|figma|visual design|designer|logo)/gi, 'Design'],
  [/\b(data|analytics|analyst|sql|power bi|tableau|dashboard|machine learning|data science)/gi, 'Data Analysis'],
  [/\b(writer|writing|copywrit|content|journalis|editor|blog|newsletter|essay|article)/gi, 'Writing and Content'],
  [/\b(marketing|growth|seo|social media|campaign|brand strategy)/gi, 'Marketing'],
  [/\b(film|video|photograph|animation|motion|music|podcast|youtube)/gi, 'Media and Film'],
  [/\b(fintech|payments?|banking)/gi, 'Fintech'],
  [/\b(research|policy|development|ngo|advocacy)/gi, 'Research and Policy'],
  [/\b(architect|interior|construction)/gi, 'Architecture']
];
function profileFromPortfolio(text, results){
  const scored = WORK_KINDS.map(([re, label]) => [label, (text.match(re) || []).length]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const cv = require('./cvparse').parse(text);
  const degree = (cv.education || []).length || /\b(b\.?\s?sc|b\.?\s?a\b|bachelor|hnd|m\.?\s?sc|master|mba|ph\.?\s?d)\b/i.test(text);
  const yrs = text.match(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs)\b(?:\s+of)?(?:\s+\w+){0,3}?\s*(?:experience|designing|building|working|in\b)/i);
  const skills = [...(results.flatMap(r => r.skills || [])), ...(cv.skills || [])];
  return {
    name: (results.find(r => r.name) || {}).name || '',
    level: degree ? (cv.level === 'secondary' ? 'bachelors' : cv.level) : 'bachelors',
    assumedLevel: !degree,
    field: scored.length ? scored[0][0] : 'General',
    fields: scored.slice(1, 4).map(([l]) => l),
    years_experience: yrs && +yrs[1] <= 40 ? +yrs[1] : 0,
    roles: [], education: cv.education || [],
    skills: [...new Set(skills.map(x => String(x).trim()).filter(Boolean))].slice(0, 15),
    leadership: /\b(founder|co-?founder|lead|head of|led a team)\b/i.test(text),
    summary: text.replace(/\s+/g, ' ').slice(0, 300)
  };
}

// Someone sends a portfolio link instead of a CV.
async function takePortfolio(u, links, say){
  const { ok, failed } = await readLinks(links);
  u.pendingLinks = links;
  if (!ok.length){
    say(`${failed.map(whyFailed).join('. ')}. Please send your CV as a *PDF* or *Word* file, or a link I can open, like *GitHub*, *Behance* or your own website. No CV handy? Reply *SAMPLE*.`);
    return;
  }
  const text = ok.map(r => r.text).join('\n\n');
  const p = profileFromPortfolio(text, ok);
  const assumedLevel = p.assumedLevel; delete p.assumedLevel;
  u.profile = clean(p); u.usedSample = false; u.profile.source = 'portfolio';
  u.profile.links = links;
  const loc = ok.map(r => r.location).join(' ');
  u.prefs = { state: places.stateIn(loc) || places.stateIn(text.slice(0, 600)), anyState: false, remoteOnly: false };
  u.stage = 'ready'; u.lastRun = today(u); u.wants = null;
  computeMatches(u);
  await store.count('cv_shared'); await store.count('portfolio_start'); await store.count('matched'); if (u.matches.length) await store.count('had_matches');
  const gaps = [assumedLevel ? '*LEVEL* masters' : '', !u.profile.years_experience ? '*EXPERIENCE* 3' : '', !myState(u) ? '*STATE* Lagos (or *REMOTE ONLY*)' : ''].filter(Boolean);
  const note = gaps.length ? `\nA portfolio doesn’t always say everything, so tell me what’s missing, e.g. ${gaps.join(' · ')}. Or send your CV for the best matches.` : '';
  const skipped = failed.length ? `\n(${failed.map(whyFailed).join('; ')}.)` : '';
  say(overview(u, `Thanks${u.profile.name ? ', ' + u.profile.name.split(' ')[0] : ''}! I read your portfolio as:\n${summaryLine(u)}${note}${skipped}`));
}

// A link added later: read it and add what it shows to the profile.
async function enrichFromLinks(u, added){
  if (!added.length) return '';
  const { ok, failed } = await readLinks(added);
  const newSkills = mergeSkills(u.profile, ok.flatMap(r => r.skills || []));
  if (!myState(u) && !(u.prefs && u.prefs.anyState)){ const st = places.stateIn(ok.map(r => r.location).join(' ')); if (st) u.prefs.state = st; }
  const bits = [];
  if (ok.length) bits.push(newSkills.length ? `I read it and added *${newSkills.slice(0, 6).join(', ')}* to your skills.` : 'I read it, and it matches what I already have.');
  if (failed.length) bits.push(`${failed.map(whyFailed).join('; ')}, so I’ve only saved the link.`);
  return bits.join(' ');
}

async function takeCV(u, cvText, isSample, say){
  const { p } = await readCV(cvText, null);
  if (!p){ say('I couldn’t read that CV. Please paste the text instead, or reply *SAMPLE*.'); return; }
  u.profile = clean(p); u.usedSample = isSample;
  u.profile.links = findLinks(cvText);
  (u.pendingLinks || []).forEach(l => { if (!u.profile.links.some(x => shortLink(x.url) === shortLink(l.url))) u.profile.links.push(l); });
  delete u.pendingLinks;
  const head = cvText.split('\n').slice(0, 8).join('\n').slice(0, 500);
  u.prefs = { state: places.stateIn(head), anyState: false, remoteOnly: false };
  if (!u.age) u.age = ageFromCV(cvText);
  u.stage = 'ready'; u.lastRun = today(u); u.wants = null;
  computeMatches(u);
  await store.count('cv_shared'); await store.count('matched'); if (u.matches.length) await store.count('had_matches');
  const noLinks = !u.profile.links.length ? '\nGot a portfolio, GitHub or LinkedIn? Reply *PORTFOLIO* + the link.' : '';
  say(overview(u, `Thanks${u.profile.name ? ', ' + u.profile.name.split(' ')[0] : ''}! I read your CV as:\n${summaryLine(u)}\nSomething wrong? Reply *FIX*.${noLinks}`));
}

const FIX_HELP = `To correct anything, send for example:\n*FIELD* Data Science\n*SKILLS* Excel, SQL, Power BI\n*EXPERIENCE* 5\n*LEVEL* masters\n*STATE* Abuja\n*AGE* 27\n*NAME* Ada Obi\n*PORTFOLIO* behance.net/adaobi\n\nOr reply *CV* to send a different CV.`;

/* ---------- Main handler ---------- */
async function handle({ phone, text = '', waName = '', media = null }){
  await feeds.load();
  let u = await store.getUser(phone);
  if (u) adopt(u);
  const out = [];
  const say = s => { if (s) out.push(s); };
  const raw = text.trim();
  const upper = raw.toUpperCase();
  const [cmd, ...rest] = upper.split(/\s+/);
  const nums = rest.map(x => parseInt(x, 10)).filter(n => !isNaN(n));
  const restText = raw.split(/\s+/).slice(1).join(' ');

  if (!u){
    u = freshUser(phone, waName);
    await store.count('users');
    u.lastSeen = new Date().toISOString();
    // Someone who opens with their CV goes straight to matches.
    if (raw.length >= 300){ await takeCV(u, raw, false, say); await store.saveUser(u); return out; }
    if (findLinks(raw).length && raw.split(/\s+/).length <= 8){ await takePortfolio(u, findLinks(raw), say); await store.saveUser(u); return out; }
    say(WELCOME(waName));
    await store.saveUser(u);
    return out;
  }
  u.lastSeen = new Date().toISOString();
  if (waName && !u.waName) u.waName = waName;
  u.prefs = u.prefs || { state: null, anyState: false };
  // People who started on the older, longer sign-up go straight to their matches.
  if (['consent', 'paused'].includes(u.stage)) u.stage = u.profile ? 'ready' : 'cv';
  if (['confirm', 'age', 'intensity'].includes(u.stage) && u.profile){
    const n = parseInt(raw, 10);
    if (u.stage === 'age' && n >= 14 && n <= 80) u.age = n;
    if (u.stage === 'intensity' && INTENSITY[raw]) u.intensity = INTENSITY[raw];
    u.stage = 'ready'; u.intensity = u.intensity || 'standard'; u.lastRun = today(u); computeMatches(u);
    if (/^\s*(\d+|yes|y|ok)\s*$/i.test(raw)){ say(overview(u, `Thanks! I’ve made ${NAME} quicker: here are your matches.\n${summaryLine(u)}\nSomething wrong? Reply *FIX*.`)); await store.saveUser(u); return out; }
  }

  const finish = async () => { await store.saveUser(u); return out; };

  // Commands that work at any stage
  if (cmd === 'RESET'){
    await store.deleteUser(phone); await store.count('resets');
    say('Done, I’ve cleared everything. Send *Hi* to start again.');
    return out;
  }
  if (cmd === 'STOP'){
    u.stage = 'stopped'; await store.count('stops');
    say('Okay, I’ve paused. Your applications are saved. Send *START* to turn me back on.');
    return finish();
  }
  if (cmd === 'START' && u.stage === 'stopped'){ u.stage = u.profile ? 'ready' : 'cv'; say(u.profile ? 'Welcome back. Reminders are on again. Reply *STATUS* to see where you stand.' : WELCOME(u.waName)); return finish(); }
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
  if (u.stage === 'stopped'){ say('I’m paused right now. Send *START* to turn me back on.'); return finish(); }

  // Waiting for a CV: the only question Ona asks.
  if (u.stage === 'cv'){
    if (cmd === 'SAMPLE'){ await takeCV(u, SAMPLE_CV, true, say); return finish(); }
    if (findLinks(raw).length && raw.split(/\s+/).length <= 8){ await takePortfolio(u, findLinks(raw), say); return finish(); }
    if (raw.length < 80){ say('Send me your CV as a *PDF* or *Word* file, paste the text, or send a portfolio link (GitHub, Behance or your website). No CV handy? Reply *SAMPLE*.'); return finish(); }
    await takeCV(u, raw, false, say);
    return finish();
  }

  // Ready: main commands
  const pick = () => {
    const n = nums[0] || (u.focus ? numOf(u, u.focus) : 0);
    const id = idOf(u, n);
    if (!id){ say(nums[0] ? `I don’t have a number ${nums[0]}. Reply *MATCHES* to see your list.` : 'Which one? Add its number, like *APPLY 2*.'); return null; }
    return id;
  };
  const refit = async (msg) => { u.profile = clean(u.profile); computeMatches(u); await store.count('profile_corrected'); say(overview(u, `${msg}\n${summaryLine(u)}`)); };

  // "JOBS" on its own opens a group; "jobs in Abuja" or "remote marketing" is a search.
  if (/^(REMOTE ONLY|ONLY REMOTE|REMOTE JOBS ONLY|WORK FROM HOME ONLY)$/.test(upper)){
    u.prefs.remoteOnly = true; computeMatches(u);
    say(show(u, { kind: 'group', group: 'world' }, '🌍 Got it: *remote only*. I’ll leave out jobs that need you in a Nigerian office. Scholarships and fellowships stay on. Reply *ANY STATE* to undo.', '🌍 Got it: *remote only*. I don’t have a remote job that fits you yet, and I’ll message you when one comes up. Reply *ANY STATE* to undo.'));
    return finish();
  }
  const GROUPS = ['JOBS', 'JOB', 'REMOTE', 'ABROAD', 'INTERNATIONAL', 'WORLD', 'SCHOLARSHIPS', 'SCHOLARSHIP', 'STUDY', 'FELLOWSHIPS', 'FELLOWSHIP', 'GRANTS', 'PROGRAMMES', 'PROGRAMS', 'NIGERIA'];
  const asSearch = GROUPS.includes(cmd) && rest.length && parseWants(raw);
  switch (asSearch ? '' : cmd){
    case 'CV': case 'RESEND': u.stage = 'cv'; say('Okay, send your new CV as a *PDF* or *Word* file, or paste the text. I’ll update your matches.'); break;
    case 'FIX': case 'EDIT': case 'CORRECT': {
      if (restText && ai.enabled()){
        const fixed = await fixProfile(u, cmd, restText, restText);
        if (fixed){ u.profile = fixed; await refit('Updated ✅'); break; }
      }
      say(`Here’s everything I read from your CV:\n\n${profileCard(u.profile)}\n*Location:* ${(u.prefs && u.prefs.state) || 'not found'}\n*Age:* ${u.age || 'not given'}\n\n${FIX_HELP}`);
      break;
    }
    case 'FIELD': case 'SKILLS': case 'EXPERIENCE': case 'NAME': case 'LEVEL': {
      const fixed = await fixProfile(u, cmd, restText, raw);
      if (!fixed){ say(`I didn’t get that. ${FIX_HELP}`); break; }
      u.profile = fixed; await refit('Updated ✅'); break;
    }
    case 'PORTFOLIO': case 'LINK': case 'LINKS': case 'WEBSITE': case 'GITHUB': case 'LINKEDIN': case 'BEHANCE': {
      const p = u.profile; p.links = p.links || [];
      const sub = (rest[0] || '').toUpperCase();
      if (sub === 'REMOVE' || sub === 'DELETE'){
        const i = (nums[0] || 0) - 1;
        if (!p.links[i]){ say('Send the number to remove, like *PORTFOLIO REMOVE 2*. Reply *PORTFOLIO* to see your links.'); break; }
        const [gone] = p.links.splice(i, 1); computeMatches(u);
        say(`Removed ${shortLink(gone.url)}.`); break;
      }
      const found = findLinks(restText);
      if (!found.length){
        say(p.links.length
          ? `🔗 *Your portfolio links*\n${p.links.map((l, i) => `${i + 1}. ${l.kind}: ${shortLink(l.url)}`).join('\n')}\n\nAdd another with *PORTFOLIO* + link, or remove one with *PORTFOLIO REMOVE 2*.`
          : 'Send your link like this: *PORTFOLIO behance.net/yourname*. It can be a website, GitHub, Behance, LinkedIn, Medium or YouTube. I’ll add it to your profile and remind you to include it when you apply.');
        break;
      }
      const added = found.filter(f => !p.links.some(l => shortLink(l.url).toLowerCase() === shortLink(f.url).toLowerCase()));
      p.links = p.links.concat(added).slice(0, 6); await store.count('portfolio_added', added.length);
      const learnt = await enrichFromLinks(u, added); computeMatches(u);
      say(added.length
        ? `🔗 Saved: ${added.map(l => `${l.kind}: ${shortLink(l.url)}`).join(' · ')}\n${learnt}\n\nI’ll remind you to include ${added.length === 1 ? 'it' : 'them'} when you apply. Reply *MATCHES* to see your updated matches.`
        : 'You already have that link saved. Reply *PORTFOLIO* to see your links.');
      break;
    }
    case 'AGE': {
      if (!(nums[0] >= 14 && nums[0] <= 80)){ say('Send your age as a number, like *AGE 27*.'); break; }
      u.age = nums[0]; await refit('Updated ✅'); break;
    }
    case 'STATE': case 'LOCATION': {
      const s = places.STATES.find(x => x.toLowerCase() === restText.trim().toLowerCase().replace(/\s+state$/, '').replace(/^fct$|^federal capital territory$/, 'abuja')) || places.stateIn(restText);
      if (!s){ say('Which state? For example *STATE Abuja* or *STATE Rivers*.'); break; }
      u.prefs = { state: s, anyState: false }; computeMatches(u);
      say(show(u, { kind: 'group', group: 'ng' }, `📍 Got it, I’ll show you jobs in *${s}* (plus remote jobs, scholarships and fellowships as usual).`, `📍 Got it, ${s} it is. I don’t have a job there that fits you yet; I’ll message you when one comes up. Reply *ANY STATE* to see the rest of Nigeria.`));
      break;
    }
    case 'REMIND': case 'PUSH': {
      const i = INTENSITY[String(nums[0] || '')];
      if (!i){ say('Reply *REMIND 1* (gentle), *REMIND 2* (standard) or *REMIND 3* (every day in the final week).'); break; }
      u.intensity = i; say(`Done. Reminders are now *${i}*.`); break;
    }
    case 'MATCHES': case 'ALL': case 'OVERVIEW':
      if (cmd === 'ALL' && /STATE/.test(upper)){ u.prefs.anyState = true; say(show(u, { kind: 'group', group: 'ng' }, '📍 Showing jobs anywhere in Nigeria.')); break; }
      addNewMatches(u); say(overview(u)); break;
    case 'MORE': say(page(u) || overview(u)); break;
    case 'CLEAR': u.wants = null; say('Done. I’ll go back to matching from your CV only.'); break;
    case 'JOBS': case 'JOB': {
      const intro = `📍 *${jobsLabel(u)}*${myState(u) ? ' (and ones with no location listed)' : ''}`;
      const r = show(u, { kind: 'group', group: 'ng' }, intro, '');
      say(r || `I don’t have a job in ${myState(u) || 'Nigeria'} that fits you right now. Reply *REMOTE* for remote and abroad${myState(u) ? ', or *ANY STATE* for the rest of Nigeria' : ''}. Or tell me what you want, like “sales jobs in Lagos”.`);
      break;
    }
    case 'ANY': case 'NIGERIA': case 'NATIONWIDE': {
      u.prefs.anyState = true; u.prefs.remoteOnly = false;
      say(show(u, { kind: 'group', group: 'ng' }, '📍 *Jobs anywhere in Nigeria*', 'I don’t have a job in Nigeria that fits you right now. Reply *REMOTE* or *SCHOLARSHIPS*, or tell me what you want.'));
      if (myState(u) === null && u.prefs.state) say(`(Reply *STATE ${u.prefs.state}* to go back to ${u.prefs.state} only.)`);
      break;
    }
    case 'REMOTE': case 'ABROAD': case 'INTERNATIONAL': case 'WORLD':
      say(show(u, { kind: 'group', group: 'world' }, '🌍 *Remote jobs and jobs abroad*', 'No remote or abroad jobs fit you right now. I’ll message you when one does.')); break;
    case 'SCHOLARSHIPS': case 'SCHOLARSHIP': case 'STUDY':
      say(show(u, { kind: 'group', group: 'grow', kinds: ['scholarship', 'phd'] }, '🎓 *Scholarships*', 'No scholarships fit you right now. Reply *FELLOWSHIPS* for fellowships and programmes.')); break;
    case 'FELLOWSHIPS': case 'FELLOWSHIP': case 'GRANTS': case 'PROGRAMMES': case 'PROGRAMS':
      say(show(u, { kind: 'group', group: 'grow', kinds: ['fellowship'] }, '🌱 *Fellowships, grants and programmes*', 'None fit you right now. Reply *SCHOLARSHIPS* for scholarships.')); break;
    case 'SAVE': case 'BOOKMARK': case 'KEEP': case 'RADAR': {
      const list = (nums.length ? nums : [u.focus ? numOf(u, u.focus) : 0]).map(n => [n, idOf(u, n)]);
      const ok = [], bad = [];
      for (const [n, id] of list){
        if (!id){ bad.push(n); continue; }
        if (diff(today(u), opp(id).deadline) < 0){ bad.push(n); continue; }
        if (!['applying', 'submitted'].includes(u.status[id])){ u.status[id] = 'saved'; u.savedAt = u.savedAt || {}; u.savedAt[id] = today(u); ok.push(id); }
      }
      if (ok.length) await store.count('saved', ok.length);
      if (!ok.length){ say(bad.length && bad[0] ? `I couldn’t save number ${bad.join(', ')}. Check the numbers on your list, or reply *MATCHES*.` : 'Which ones? Add the numbers, like *SAVE 2* or *SAVE 2 4 5*.'); break; }
      const pace = { gentle: 'a week and two days before each deadline', standard: '2 weeks, 1 week, 3 days and 1 day before each deadline', restless: 'often in the last 2 weeks before each deadline' }[u.intensity] || '';
      say(`🔖 Saved ${ok.length === 1 ? `*${opp(ok[0]).title}*` : `*${ok.length}* opportunities`} to your radar.${bad.length ? ` (Couldn’t save ${bad.join(', ')}.)` : ''}\n\n${ok.map(id => savedLine(u, opp(id))).join('\n')}\n\nI’ll remind you ${pace}, and every few days for ones with no deadline. Keep browsing with *MORE*, or reply *SAVED* to see your list.`);
      break;
    }
    case 'SAVED': case 'RADAR-LIST': case 'WATCHLIST': {
      const ids = savedList(u);
      if (!ids.length){ say('Nothing saved yet. When you see one you like, reply *SAVE* + its number (or several: *SAVE 2 4 5*).'); break; }
      say(`🔖 *Your radar* (${ids.length}), soonest deadline first:\n\n${ids.map(id => savedLine(u, opp(id))).join('\n')}\n\nReply *APPLY* + number to start one, or *UNSAVE* + number to drop it.`);
      break;
    }
    case 'UNSAVE': case 'REMOVE': {
      const ids = nums.map(n => idOf(u, n)).filter(id => id && u.status[id] === 'saved');
      if (!ids.length){ say('Send the number of a saved one, like *UNSAVE 3*. Reply *SAVED* to see your list.'); break; }
      ids.forEach(id => { delete u.status[id]; });
      say(`Removed ${ids.length === 1 ? `*${opp(ids[0]).title}*` : `${ids.length} opportunities`} from your radar.`);
      break;
    }
    case 'QUIT': case 'CANCEL': case 'DROP': {
      const id = pick(); if (!id) break;
      if (u.status[id] !== 'applying' && u.status[id] !== 'saved'){ say(`You’re not working on *${opp(id).title}*. Reply *STATUS* to see your applications.`); break; }
      u.status[id] = 'quit'; await store.count('quit');
      if (u.focus === id) u.focus = null;
      say(`Okay, I’ve stopped reminders for *${opp(id).title}*. No problem, not every opportunity is the right one. If you tell me why (*FEEDBACK* …), I’ll find better matches.`);
      break;
    }
    case 'APPLY': case 'APPLYING': {
      if (nums.length > 1){
        const ids = nums.map(n => idOf(u, n)).filter(id => id && diff(today(u), opp(id).deadline) >= 0);
        if (!ids.length){ say('I couldn’t find those numbers. Reply *MATCHES* to see your list.'); break; }
        for (const id of ids){ if (u.status[id] !== 'applying'){ u.status[id] = 'applying'; await store.count('applying'); } touch(u, id); }
        u.focus = ids[0];
        say(`Great, you’re applying to *${ids.length}*. I’ll remind you about each one until it’s submitted:\n\n${ids.map(id => `• *${numOf(u, id)}. ${opp(id).title}* · ${closesLine(u, opp(id))}`).join('\n')}\n\nReply *CONTINUE* + number to open a checklist, starting with *CONTINUE ${numOf(u, ids[0])}*.`);
        break;
      }
      const id = pick(); if (!id) break;
      if (diff(today(u), opp(id).deadline) < 0){ say(`*${opp(id).title}* has already closed. Reply *MATCHES* for open ones.`); break; }
      const firstTime = !Object.values(u.status).includes('applying') && !Object.values(u.status).includes('submitted');
      if (u.status[id] !== 'applying'){ u.status[id] = 'applying'; await store.count('applying'); }
      u.focus = id; touch(u, id);
      say(`Love it! Here’s your plan. I’ll keep reminding you until it’s submitted.\n\n${checklist(u, id)}`);
      if (firstTime) say('⏰ I’ll remind you 3 weeks, 2 weeks and 1 week before the deadline, then daily for the last 3 days. Reply *REMIND 1* for fewer or *REMIND 3* for more.\n\n🧪 Testing? Reply *NEXT 7* to jump a week ahead and see the reminders.');
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
      say(`Got it, I won’t show that one again.${u.view ? ' Reply *MORE* for the next one.' : ''} If you tell me why (*FEEDBACK* wrong field, wrong place…), I’ll get better.`);
      break;
    }
    case 'OPEN': case 'CHECKLIST': case 'CONTINUE': case 'RESUME': {
      const id = pick(); if (!id) break;
      if (cmd !== 'OPEN' && cmd !== 'CHECKLIST' && u.status[id] !== 'applying'){ u.status[id] = 'applying'; await store.count('applying'); }
      u.focus = id; touch(u, id); say(checklist(u, id)); break;
    }
    case 'DONE': case 'TICK': {
      if (!u.focus){ say('Open a checklist first, e.g. *OPEN 2*.'); break; }
      const t = ensureTasks(u, u.focus);
      const bad = nums.filter(n => n < 1 || n > t.length);
      if (!nums.length || bad.length){ say(`Send the step number, like *DONE 1*. This checklist has ${t.length} steps.`); break; }
      nums.forEach(n => { t[n - 1].done = true; }); touch(u, u.focus);
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
      const ids = Object.keys(u.status).filter(id => ['applying', 'submitted', 'missed', 'later'].includes(u.status[id]) && opp(id));
      const nSaved = savedList(u).length;
      const radarNote = nSaved ? `\n\n🔖 You also have *${nSaved}* saved on your radar. Reply *SAVED* to see them.` : '';
      if (!ids.length){ say(nSaved ? `You haven’t started an application yet.${radarNote}` : 'You haven’t picked anything yet. Reply *MATCHES* to see your matches.'); break; }
      const label = { applying: '', submitted: '✅ submitted', missed: '❌ missed', later: '🕒 deciding' };
      say('📊 *Where you stand* (' + fmt(today(u), { weekday: 'short', day: 'numeric', month: 'short' }) + ')\n\n' + ids.map(id => {
        const t = ensureTasks(u, id); const st = u.status[id];
        return `*${numOf(u, id)}. ${opp(id).title}*\n${st === 'applying' ? `${t.filter(x => x.done).length} of ${t.length} steps · ${closesLine(u, opp(id))}` : label[st]}`;
      }).join('\n\n') + '\n\nReply *CONTINUE* + number for a checklist, or *QUIT* + number to stop one.' + radarNote);
      break;
    }
    case 'NEXT': case 'TOMORROW': {
      const k = Math.min(Math.max(nums[0] || 1, 1), 30);
      await store.count('time_jumps');
      const msgs = [];
      for (let i = 0; i < k; i++){ u.offset = (u.offset || 0) + 1; runDue(u).forEach(m => msgs.push(`📅 *${fmt(today(u), { weekday: 'short', day: 'numeric', month: 'short' })}*\n${m}`)); }
      if (!msgs.length) say(`📅 It’s now *${fmt(today(u), { weekday: 'long', day: 'numeric', month: 'long' })}* in test mode. No reminders due${k > 1 ? ' in that stretch' : ' today'}. ${Object.values(u.status).includes('applying') ? 'Try *NEXT 7*.' : 'You have no open applications right now. Reply *APPLY* + a number to get reminders.'}`);
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
    default: {
      if (['HI', 'HELLO', 'HEY', 'GOOD', 'MORNING'].includes(cmd) && raw.split(/\s+/).length <= 3){ say(overview(u, `Hi ${first(u)}! 👋`)); break; }
      if (['THANKS', 'THANK', 'OK', 'OKAY', 'COOL', 'NICE', 'GREAT'].includes(cmd) && raw.split(/\s+/).length <= 3){ say('You’re welcome! Tell me what you’re looking for anytime, or reply *MATCHES*.'); break; }
      // A state name on its own switches the jobs Ona shows.
      const st = places.stateIn(raw);
      if (st && raw.split(/\s+/).length <= 3 && !/\b(job|jobs|scholar|fellow|remote|intern)/i.test(raw)){
        u.prefs = { state: st, anyState: false }; computeMatches(u);
        say(show(u, { kind: 'group', group: 'ng' }, `📍 *Jobs in ${st}*. I’ll use ${st} from now on.`, `📍 I’ll use ${st} from now on. I don’t have a job there that fits you yet, and I’ll message you when one comes up. Reply *ANY STATE* to see the rest of Nigeria.`));
        break;
      }
      // A link on its own (or "my portfolio is …") is a portfolio link.
      const lk = findLinks(raw);
      if (lk.length && raw.split(/\s+/).length <= 8){
        u.profile.links = u.profile.links || [];
        const added = lk.filter(f => !u.profile.links.some(l => shortLink(l.url).toLowerCase() === shortLink(f.url).toLowerCase()));
        u.profile.links = u.profile.links.concat(added).slice(0, 6);
        const learnt = await enrichFromLinks(u, added); computeMatches(u);
        say(added.length ? `🔗 Added to your portfolio: ${added.map(l => `${l.kind}: ${shortLink(l.url)}`).join(' · ')}. ${learnt} I’ll remind you to include it when you apply. Reply *PORTFOLIO* to see or remove links.` : 'You already have that link saved. Reply *PORTFOLIO* to see your links.');
        break;
      }
      // Plain words: treat them as a search ("data jobs in Abuja", "masters scholarships").
      const w = parseWants(raw);
      if (w){ await store.count('searches'); say(search(u, w)); break; }
      await answerQuestion(u, raw, say);
    }
  }
  return finish();
}

async function answerQuestion(u, q, say){
  await store.count('questions');
  const o = u.focus ? opp(u.focus) : null;
  if (!ai.enabled()){
    say(o && /\?/.test(q) ? `Good question. I can’t answer free questions in this test yet. For *${o.title}*, the official page is the safest source: ${o.url}` : 'I didn’t quite get that. Tell me what you’re looking for, like “data jobs in Abuja”, “remote marketing” or “masters scholarships”. Or reply *HELP* to see everything I can do.');
    return;
  }
  try {
    const applying = Object.keys(u.status).filter(id => u.status[id] === 'applying').map(id => opp(id).title);
    say(await ai.answer({ question: q, profile: u.profile, age: u.age, today: today(u), opp: o, applying }));
  } catch (e){ console.error(e); say('Something went wrong on my side. Ask again in a moment.'); }
}

function mask(phone){ const d = String(phone).replace(/\D/g, ''); return d.length > 6 ? d.slice(0, 3) + '…' + d.slice(-3) : d; }

module.exports = { handle, runDue, today, mask, SAMPLE_CV, heuristicCV, prepare: feeds.load };
