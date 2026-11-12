// Live opportunities: every day Ona reads job boards and opportunity sites, keeps the ones
// that are still open, and adds them to its hand-picked list (lib/opportunities.js).
// To add or remove a source, edit SOURCES below. Run it any time at /api/refresh?key=YOUR_ADMIN_KEY
// Optional: your own Google Sheet (File > Share > Publish to web > CSV) in the OPPS_SHEET_CSV setting.

const crypto = require('crypto');
const places = require('./places');

// type: 'rss' (WordPress/RSS/Atom feeds) or one of the job APIs below.
// group: 'ng-jobs' (Nigerian jobs) · 'opps' (scholarships, fellowships, grants…) · 'abroad' (jobs abroad/remote)
const SOURCES = [
  // Nigerian jobs
  { name: 'Hot Nigerian Jobs', type: 'rss', group: 'ng-jobs', max: 300, url: 'https://www.hotnigerianjobs.com/feed/rss.xml' },
  { name: 'MyJobMag', type: 'rss', group: 'ng-jobs', max: 200, url: 'https://www.myjobmag.com/aggregate_feed.xml' },
  { name: 'Jobnow Nigeria', type: 'rss', group: 'ng-jobs', url: 'https://jobnow.ng/feed/' },
  { name: 'YESHub Nigeria', type: 'rss', group: 'ng-jobs', url: 'https://yeshub.ng/feed/' },
  { name: 'NGO Jobs in Africa', type: 'rss', group: 'ng-jobs', url: 'https://ngojobsinafrica.com/feed/', country: 'Africa' },
  // Scholarships, fellowships, grants, internships, competitions
  { name: 'Opportunities for Africans', type: 'rss', group: 'opps', url: 'https://www.opportunitiesforafricans.com/feed/', pages: 3 },
  { name: 'Opportunity Desk', type: 'rss', group: 'opps', url: 'https://opportunitydesk.org/feed/', pages: 3 },
  { name: 'After School Africa', type: 'rss', group: 'opps', url: 'https://www.afterschoolafrica.com/feed/', pages: 2 },
  { name: 'Global South Opportunities', type: 'rss', group: 'opps', url: 'https://www.globalsouthopportunities.com/feed/', pages: 2 },
  { name: 'Scholars4Dev', type: 'rss', group: 'opps', url: 'https://www.scholars4dev.com/feed/' },
  // Jobs abroad and remote jobs open to Nigerians
  { name: 'Arbeitnow (visa sponsorship, Europe)', type: 'arbeitnow', group: 'abroad', max: 80, url: 'https://www.arbeitnow.com/api/job-board-api?visa_sponsorship=true' },
  { name: 'Himalayas (remote)', type: 'himalayas', group: 'abroad', url: 'https://himalayas.app/jobs/api?limit=100' },
  { name: 'Remote OK', type: 'remoteok', group: 'abroad', url: 'https://remoteok.com/api' },
  { name: 'We Work Remotely', type: 'wwr', group: 'abroad', url: 'https://weworkremotely.com/remote-jobs.rss' }
];

const MAX_ITEMS = 1200;
const PER_SOURCE = 150; // default most-recent listings kept from one source, so no single site crowds out the rest
const KEY = 'ona:feed';
const UA = 'Mozilla/5.0 (compatible; OnaBot/1.0; opportunity coach for African applicants)';

/* ---------- Small helpers ---------- */
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, '0');
const isoOf = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2020 && y <= 2100) ? `${y}-${pad(m)}-${pad(d)}` : null;
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const todayLagos = () => process.env.ONA_TODAY || new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const hash = s => crypto.createHash('md5').update(s).digest('hex').slice(0, 10);

function decode(s = ''){
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'")
    .replace(/&[rl]squo;/g, "'").replace(/&[rl]dquo;/g, '"').replace(/&ndash;|&mdash;/g, '-').replace(/&hellip;/g, '...');
}
const strip = s => decode(decode(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Reads a date written like "30 November 2026", "November 30th, 2026", "2026-11-30" or "30/11/2026".
function parseDate(t, ref){
  t = t.replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/,/g, ' ');
  let m;
  if ((m = t.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/))) return isoOf(+m[1], +m[2], +m[3]);
  if ((m = t.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(20\d\d)\b/i))) return isoOf(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  if ((m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\s+(20\d\d)\b/i))) return isoOf(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  if ((m = t.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d\d)\b/))) return isoOf(+m[3], +m[2], +m[1]); // day first, as in Nigeria
  // No year written: take the next time that date comes round after the post date.
  if (ref && ((m = t.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\b/i)) || (m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/i)))){
    const [mon, day] = /\d/.test(m[1]) ? [m[2], +m[1]] : [m[1], +m[2]];
    let y = +ref.slice(0, 4); let d = isoOf(y, MONTHS[mon.toLowerCase()], day);
    if (d && d < ref) d = isoOf(y + 1, MONTHS[mon.toLowerCase()], day);
    return d;
  }
  return null;
}

// Finds the application deadline in a post's text, if it states one.
function findDeadline(text, posted){
  const re = /(deadline|closing date|closes on|close on|apply before|apply by|applications? (?:will )?close|due date|last date|submission date|not later than|on or before)/gi;
  let m;
  while ((m = re.exec(text))){
    const window = text.slice(m.index, m.index + 90);
    const d = parseDate(window, posted);
    // Past deadlines are returned too, so closed listings get dropped instead of shown as open.
    if (d && (!posted || (d >= addDays(posted, -400) && d <= addDays(posted, 450)))) return d;
  }
  return null;
}

/* ---------- Understanding a listing ---------- */
// Profile words each listing word should match (Ona compares these with the person's CV).
const FIELD_MAP = [
  [/\b(data|analytics|analyst|bi\b|power bi|tableau|sql)/i, ['data', 'analytics', 'sql', 'excel']],
  [/\b(software|developer|programmer|frontend|front-end|backend|back-end|full[- ]?stack|web dev|mobile dev|android|ios|react|python|java\b|javascript|node)/i, ['software', 'developer', 'computer', 'programming', 'python', 'javascript']],
  [/\b(devops|cloud|aws|azure|sre|site reliability|infrastructure engineer)/i, ['cloud', 'devops', 'aws', 'azure', 'computer']],
  [/\b(cyber|information security|infosec|security analyst|soc analyst)/i, ['cyber', 'security']],
  [/\b(it support|it officer|it manager|network|system admin|sysadmin|helpdesk|help desk|ict)/i, ['network', 'ict', 'information technology', 'computer']],
  [/\b(machine learning|artificial intelligence|\bai\b|\bml\b|data scien)/i, ['machine learning', 'data scien', 'artificial intelligence', 'python']],
  [/\b(product manager|product owner|product lead|product management)/i, ['product']],
  [/\b(project manager|project officer|programme manager|program manager|programme officer|program officer|pmo)/i, ['project', 'programme', 'program']],
  [/\b(ux|ui\/ux|user experience|designer|graphic|creative|visual)/i, ['design', 'figma', 'graphic', 'creative']],
  [/\b(account|audit|tax|bookkeep|payable|receivable)/i, ['account', 'audit', 'finance', 'tax']],
  [/\b(financ|treasury|investment|credit|loan|banking|bank\b|teller|relationship officer|relationship manager)/i, ['finance', 'bank', 'credit', 'investment', 'economics']],
  [/\b(fintech|payment|payments)/i, ['payment', 'fintech', 'finance']],
  [/\b(risk|compliance|aml|kyc|fraud|internal control)/i, ['risk', 'compliance', 'audit', 'fraud']],
  [/\b(insurance|actuar|underwrit)/i, ['insurance', 'actuar', 'risk']],
  [/\b(marketing|brand|growth|seo|digital market)/i, ['marketing', 'brand', 'digital', 'growth']],
  [/\b(sales|business develop|account executive|key account)/i, ['sales', 'business development', 'marketing']],
  [/\b(customer|client service|call cent|contact cent|support agent|front desk|receptionist)/i, ['customer', 'client', 'service']],
  [/\b(communication|public relations|\bpr\b|media|journalis|content|copywrit|writer|editor|social media)/i, ['communication', 'media', 'content', 'writing', 'journalism']],
  [/\b(human resource|\bhr\b|recruit|talent|people operations|payroll)/i, ['human resource', 'recruit', 'talent', 'payroll']],
  [/\b(admin|secretar|office assistant|personal assistant|executive assistant|office manager)/i, ['admin', 'office', 'secretar']],
  [/\b(procurement|supply chain|logistic|warehouse|inventory|store keeper|storekeeper|purchas)/i, ['procurement', 'supply chain', 'logistics', 'inventory']],
  [/\b(operations|operation officer|ops\b)/i, ['operations']],
  [/\b(legal|lawyer|counsel|solicitor|attorney|law\b|paralegal)/i, ['law', 'legal']],
  [/\b(nurs|midwi)/i, ['nurs', 'health', 'midwi']],
  [/\b(doctor|medical officer|physician|mbbs|clinic|medical)/i, ['medic', 'mbbs', 'health', 'clinical']],
  [/\b(pharma|pharmacist)/i, ['pharm', 'health']],
  [/\b(laborator|lab scientist|lab tech)/i, ['laborator', 'science', 'biology']],
  [/\b(health|public health|nutrition|epidemiolog|hiv|malaria)/i, ['health', 'public health', 'nutrition']],
  [/\b(teach|teacher|tutor|lecturer|education|school|instructor|curriculum)/i, ['teach', 'education', 'tutor']],
  [/\b(agric|farm|agro|food security|livestock|crop)/i, ['agric', 'farm', 'food']],
  [/\b(climate|environment|sustainab|renewable|solar|conservation|energy)/i, ['climate', 'environment', 'sustainab', 'energy']],
  [/\b(oil|gas|petroleum|drilling|reservoir|upstream)/i, ['petroleum', 'oil', 'gas', 'engineering']],
  [/\b(electrical|electronics|power engineer)/i, ['electrical', 'electronic', 'engineering']],
  [/\b(mechanical|maintenance engineer|technician)/i, ['mechanical', 'engineering', 'technician']],
  [/\b(civil|structural|construction|quantity surveyor|site engineer|architect)/i, ['civil', 'construction', 'architect', 'engineering']],
  [/\b(chemical|process engineer|production)/i, ['chemical', 'chemistry', 'engineering', 'production']],
  [/\b(engineer|engineering)/i, ['engineering']],
  [/\b(monitoring|evaluation|m&e|mel\b|meal\b)/i, ['monitoring', 'evaluation', 'research']],
  [/\b(research|researcher|policy|advocacy|governance|development|humanitarian|ngo|social work|protection|gender)/i, ['research', 'policy', 'development', 'advocacy', 'social']],
  [/\b(econom)/i, ['economics', 'economic']],
  [/\b(statistic|biostat)/i, ['statistic', 'data']],
  [/\b(entrepreneur|startup|founder|business owner|smes?\b|innovat|accelerator|incubat)/i, ['entrepreneur', 'founder', 'startup', 'business']],
  [/\b(journalis|reporter|broadcast)/i, ['journalism', 'media']],
  [/\b(film|music|art\b|arts\b|artist|photograph|fashion)/i, ['art', 'creative', 'film', 'music', 'design']],
  [/\b(hospitality|hotel|chef|cook|restaurant|catering)/i, ['hospitality', 'hotel', 'catering']],
  [/\b(driver|dispatch rider|security guard|cleaner|janitor|steward|nanny|housekeep)/i, ['driver', 'driving', 'security', 'cleaning']]
];

const NOT_AN_OPPORTUNITY = /^(how to|why |what |when |where |top \d+|\d+ (tips|ways|reasons|things|best|mistakes|questions)|tips|guide|list of|the best|best \w+ (in|for)|interview questions|sample|template|news|update:|webinar recap|meet the|congratulations|winners|announc|recap|review)/i;

function classify(title, extra, group){
  const t = `${title} ${extra}`.toLowerCase();
  if (/\b(ph\.?d|doctoral|doctorate)\b/.test(t) && !/\b(job|vacanc|recruitment)\b/.test(t)) return { kind: 'phd', type: 'PhD' };
  if (/\b(scholarships?|bursar|tuition|fully[- ]funded (masters|degree|study)|study abroad|masters? (degree )?programme)\b/.test(t) && group !== 'ng-jobs') return { kind: 'scholarship', type: 'Scholarship' };
  if (/\b(internships?|intern|industrial training|siwes)\b/.test(t)) return { kind: 'job', type: 'Internship' };
  if (/\b(graduate trainee|trainee programme|trainee program|graduate programme|graduate program|management trainee|young graduates?|entry[- ]level programme|nysc)\b/.test(t)) return { kind: 'job', type: 'Graduate programme' };
  if (/\bfellowships?\b/.test(t)) return { kind: 'fellowship', type: 'Fellowship' };
  if (/\b(grants?|funding|seed fund|financing)\b/.test(t) && group !== 'ng-jobs') return { kind: 'fellowship', type: 'Grant' };
  if (/\b(accelerator|incubat)/.test(t)) return { kind: 'fellowship', type: 'Accelerator' };
  if (/\b(competition|challenge|contest|prize|award|hackathon|pitch)\b/.test(t) && group !== 'ng-jobs') return { kind: 'fellowship', type: 'Competition' };
  if (/\b(conference|summit|forum|exchange programme|exchange program|youth assembly|leadership programme|leadership program|bootcamp|training programme|training program|workshop|summer school|winter school|course|academy)\b/.test(t) && group !== 'ng-jobs') return { kind: 'fellowship', type: 'Programme' };
  if (group !== 'opps' || /\b(jobs?|vacanc|recruit|hiring|careers?|positions?|officer|manager|engineer|analyst|developer|assistant|associate|consultant|specialist|coordinator|executive|accountant|director|representative|lead\b)/.test(t)) return { kind: 'job', type: group === 'abroad' ? 'Job abroad' : 'Job' };
  return null;
}

const GENERIC = new Set('senior junior lead head chief principal manager officer assistant associate executive intern internship graduate trainee entry level team member staff personnel nigeria lagos abuja port harcourt ibadan kano remote hybrid full part time contract recruitment recruiting vacancy vacancies job jobs apply application hiring urgent wanted needed limited ltd plc company firm group global africa international programme program 2025 2026 2027 2028 the and for with of at in on new latest open opening openings position positions role roles opportunity opportunities'.split(' '));

function fieldsOf(text, kind){
  const out = new Set();
  for (const [re, words] of FIELD_MAP) if (re.test(text)) words.forEach(w => out.add(w));
  if (!out.size && kind === 'job'){
    text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length >= 5 && !GENERIC.has(w)).slice(0, 4).forEach(w => out.add(w));
  }
  return out.size ? [...out].slice(0, 10) : ['any'];
}

function levelsOf(t, kind, type){
  t = t.toLowerCase();
  if (kind === 'phd') return ['bachelors', 'masters'];
  if (kind === 'scholarship'){
    if (/\b(ph\.?d|doctoral)\b/.test(t)) return ['bachelors', 'masters'];
    if (/\b(masters?|postgraduate|msc|m\.sc|mba|llm|graduate stud)/.test(t)) return ['bachelors', 'masters'];
    if (/\b(undergraduate|bachelor|first degree|secondary school|high school)/.test(t)) return ['secondary', 'undergraduate'];
    return ['secondary', 'undergraduate', 'bachelors', 'masters'];
  }
  if (kind === 'job'){
    if (/\b(driver|dispatch rider|security guard|cleaner|janitor|steward|nanny|housekeep|waiter|waitress|cook|sales (rep|girl|boy|agent)|ssce|o'?level|marketer)\b/.test(t)) return ['secondary', 'undergraduate', 'bachelors', 'masters', 'phd'];
    if (type === 'Internship') return ['undergraduate', 'bachelors', 'masters'];
    return ['bachelors', 'masters', 'phd'];
  }
  if (/\b(high school|secondary school|teen|aged 1[3-7])\b/.test(t)) return ['secondary', 'undergraduate'];
  return ['undergraduate', 'bachelors', 'masters', 'phd'];
}

function minExpOf(title, body){
  const m = body.match(/\b(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?years?(?:'|’)?\s+(?:of\s+)?(?:[a-z-]+\s+){0,4}?experience/i);
  if (m && +m[1] <= 20) return +m[1];
  if (/\b(director|chief|head of|vp|vice president|general manager)\b/i.test(title)) return 7;
  if (/\b(senior|sr\.?|lead|principal|manager|supervisor)\b/i.test(title)) return 3;
  return 0;
}

function agesOf(t){
  let m = t.match(/\b(?:aged?|ages? of|between)\s*(1\d|2\d|3\d)\s*(?:-|–|to|and)\s*(1\d|2\d|3\d|4\d)\b/i);
  if (m) return { ageMin: +m[1], ageMax: +m[2] };
  m = t.match(/\b(?:under|below|not older than|not above|maximum age of|aged? up to)\s*(\d{2})\b/i);
  if (m && +m[1] >= 18 && +m[1] <= 45) return { ageMax: +m[1] };
  return {};
}

// Turns one raw listing into an Ona opportunity (or null if it isn't one).
function toOpp({ title, link, posted, body = '', extra = '', org = '', deadline = null, src, location = '' }){
  title = strip(title).replace(/\s+/g, ' ').trim();
  if (!title || !link || NOT_AN_OPPORTUNITY.test(title)) return null;
  if (/^\W*closed\b|\(closed\)|\bexpired\b/i.test(title)) return null;
  const years = (title.match(/\b20\d\d\b/g) || []).map(Number);
  if (years.length && Math.max(...years) < +todayLagos().slice(0, 4)) return null; // last year's cycle
  const c = classify(title, extra, src.group); if (!c) return null;
  if (!org){
    const m = title.match(/^(.{4,90}?)\s+(?:at|@)\s+(.{2,70})$/i);
    if (m && c.kind === 'job'){ title = m[1].trim(); org = m[2].replace(/\s*\(.*$/, '').trim(); }
  }
  posted = posted || todayLagos();
  const realDeadline = deadline || findDeadline(body, posted);
  const est = !realDeadline;
  const dl = realDeadline || addDays(posted, c.kind === 'job' ? 21 : 30);
  const text = `${title} ${extra}`;
  // Where it is: a Nigerian state for local jobs, or remote / abroad.
  let where = {}, scope = c.kind === 'job' ? 'ng' : 'grow';
  if (c.kind === 'job'){
    if (src.group === 'abroad' || places.isRemote(`${title} ${location}`)) scope = 'world';
    else {
      const js = places.jobState(title, body);
      if (js.state) where = { state: js.state }; else if (js.multi) where = { multi: true };
      // Africa-wide boards: no Nigerian state and no mention of Nigeria = another country.
      if (!js.state && src.country === 'Africa' && !/nigeria/i.test(`${title} ${body.slice(0, 1500)}`)) scope = 'world';
    }
  }
  return { scope, ...where,
    id: 'f' + hash(link), type: c.type, kind: c.kind, title: title.slice(0, 140), org: (org || src.name).slice(0, 80),
    deadline: dl, ...(est ? { estimated: true, posted } : {}),
    levels: levelsOf(`${title} ${extra} ${body.slice(0, 600)}`, c.kind, c.type),
    // The title says what the job is; tags only help when the title alone says nothing.
    fields: (() => { const f = fieldsOf(title, c.kind); return f[0] !== 'any' ? f : fieldsOf(text, c.kind); })(),
    ...(c.kind === 'job' ? { minExp: minExpOf(title, body.slice(0, 4000)) } : {}),
    ...agesOf(body.slice(0, 3000)),
    location: where.state || (where.multi ? 'Various locations, Nigeria' : '') || location || src.country || (src.group === 'ng-jobs' ? 'Nigeria' : ''),
    url: link, source: src.name, live: true
  };
}

/* ---------- Reading each kind of source ---------- */
async function get(url, json){
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'application/rss+xml, application/xml, text/xml, */*' }, signal: ctrl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return json ? await r.json() : await r.text();
  } finally { clearTimeout(timer); }
}

const tag = (x, name) => { const m = x.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };
const dateOf = s => { const d = new Date(decode(s).trim()); return isNaN(d) ? null : d.toISOString().slice(0, 10); };

function parseRss(xml){
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks){
    let link = decode(tag(b, 'link')).trim();
    if (!link){ const m = b.match(/<link[^>]*href="([^"]+)"/i); link = m ? m[1] : ''; }
    const cats = (b.match(/<category[^>]*>([\s\S]*?)<\/category>/gi) || []).map(c => strip(c)).join(' ');
    const catAttr = (b.match(/<category[^>]*term="([^"]+)"/gi) || []).map(c => c.replace(/.*term="|"$/g, '')).join(' ');
    items.push({
      title: tag(b, 'title'), link,
      posted: dateOf(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')),
      body: strip(tag(b, 'content:encoded') || tag(b, 'content') || tag(b, 'description') || tag(b, 'summary')),
      extra: `${cats} ${catAttr}`, region: strip(tag(b, 'region'))
    });
  }
  return items;
}

const OPEN_TO_NIGERIA = /^\s*$|anywhere|worldwide|world|global|africa|nigeria|emea|remote$/i;

async function readSource(src){
  const today = todayLagos();
  if (src.type === 'rss' || src.type === 'wwr'){
    const pages = src.pages || 1; let raw = [];
    for (let p = 1; p <= pages; p++){
      const url = p === 1 ? src.url : src.url + (src.url.includes('?') ? '&' : '?') + 'paged=' + p;
      try { raw = raw.concat(parseRss(await get(url))); } catch (e){ if (p === 1) throw e; break; }
    }
    if (src.type === 'wwr'){
      raw = raw.filter(r => OPEN_TO_NIGERIA.test(r.region || '')).map(r => {
        const m = strip(r.title).match(/^([^:]{2,60}):\s*(.+)$/);
        return m ? { ...r, title: m[2], org: m[1], location: 'Remote' } : r;
      });
    }
    return raw.map(r => toOpp({ ...r, src })).filter(Boolean);
  }
  if (src.type === 'arbeitnow'){
    const j = await get(src.url, true);
    // Skip postings written in German or asking for German: most Nigerian applicants can't take them.
    const german = x => /\((m|w|d|f)\s*\/\s*(m|w|d|f)/i.test(x.title || '') || /\b(deutsch|german (skills|language|is required|required)|fluent (in )?german|german [abc][12])\b/i.test(x.description || '')
      || (strip(x.description || '').slice(0, 1500).match(/\b(und|der|die|das|wir|mit|für|sie|ist|bei)\b/gi) || []).length > 12;
    return (j.data || []).filter(x => !german(x)).map(x => toOpp({ title: x.title, link: x.url, org: x.company_name, posted: x.created_at ? new Date(x.created_at * 1000).toISOString().slice(0, 10) : today,
      body: strip(x.description || ''), extra: (x.tags || []).join(' '), location: `${x.location || 'Germany'} · visa sponsorship`, src })).filter(Boolean);
  }
  if (src.type === 'himalayas'){
    const j = await get(src.url, true);
    return (j.jobs || []).filter(x => !(x.locationRestrictions || []).length || (x.locationRestrictions || []).some(l => /nigeria|africa/i.test(String(l.name || l))))
      .map(x => {
        const exp = x.expiryDate ? new Date(x.expiryDate * 1000).toISOString().slice(0, 10) : null;
        return toOpp({ title: x.title, link: x.applicationLink || x.guid, org: x.companyName, posted: x.pubDate ? new Date(x.pubDate * 1000).toISOString().slice(0, 10) : today,
          deadline: exp && exp >= today ? exp : null, body: strip(x.description || x.excerpt || ''), extra: [...(x.categories || []), ...(x.parentCategories || []), x.seniority || ''].join(' '), location: 'Remote', src });
      }).filter(Boolean);
  }
  if (src.type === 'remoteok'){
    const j = await get(src.url, true);
    return (Array.isArray(j) ? j : []).filter(x => x && x.position && OPEN_TO_NIGERIA.test(x.location || ''))
      .map(x => toOpp({ title: x.position, link: x.url || x.apply_url, org: x.company, posted: (x.date || '').slice(0, 10) || today,
        body: strip(x.description || ''), extra: (x.tags || []).join(' '), location: 'Remote', src })).filter(Boolean);
  }
  throw new Error('Unknown source type ' + src.type);
}

/* ---------- Your own Google Sheet (optional) ---------- */
function parseCsv(text){
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    if (q){ if (ch === '"' && text[i + 1] === '"'){ cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ','){ row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r'){ if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

async function readSheet(url){
  const rows = parseCsv(await get(url));
  const head = (rows.shift() || []).map(h => h.trim().toLowerCase());
  const col = (r, ...names) => { for (const n of names){ const i = head.indexOf(n); if (i >= 0 && r[i]) return r[i].trim(); } return ''; };
  const src = { name: 'Ona team', group: 'opps' };
  return rows.map(r => {
    const title = col(r, 'title', 'name', 'opportunity'); const link = col(r, 'link', 'url', 'website');
    if (!title || !link) return null;
    const type = col(r, 'type', 'category') || 'Opportunity';
    const kind = /job|intern|graduate|trainee|vacanc/i.test(type) ? 'job' : /scholar/i.test(type) ? 'scholarship' : /ph\.?d/i.test(type) ? 'phd' : 'fellowship';
    const dl = parseDate(col(r, 'deadline', 'closing date'), todayLagos());
    const lv = col(r, 'levels', 'level').toLowerCase().split(/[,;]/).map(s => s.trim()).filter(Boolean);
    const fl = col(r, 'fields', 'field', 'keywords').toLowerCase().split(/[,;]/).map(s => s.trim()).filter(Boolean);
    const base = { title, link, src, org: col(r, 'organisation', 'organization', 'org', 'company'), deadline: dl };
    const o = toOpp({ ...base, extra: type }) || { id: 'f' + hash(link), title, url: link, org: base.org || 'Ona team', source: 'Ona team', live: true };
    Object.assign(o, { id: 's' + hash(link), type, kind, source: 'Ona team', location: col(r, 'location', 'country') || o.location || '' });
    if (dl){ o.deadline = dl; delete o.estimated; delete o.posted; }
    else { o.deadline = o.deadline || addDays(todayLagos(), 30); o.estimated = true; o.posted = o.posted || todayLagos(); }
    if (lv.length) o.levels = lv;
    o.levels = o.levels || levelsOf(title, kind, type);
    o.fields = fl.length ? fl : (o.fields || ['any']);
    const me = parseInt(col(r, 'min_experience', 'experience', 'years'), 10); if (me >= 0) o.minExp = me;
    const a1 = parseInt(col(r, 'age_min', 'min_age'), 10), a2 = parseInt(col(r, 'age_max', 'max_age'), 10);
    if (a1) o.ageMin = a1; if (a2) o.ageMax = a2;
    return o;
  }).filter(Boolean);
}

/* ---------- Storage (same Upstash database as the rest of Ona) ---------- */
const R_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const R_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
let memoryCopy = null;
async function redis(cmd){
  const r = await fetch(R_URL, { method: 'POST', headers: { Authorization: `Bearer ${R_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json(); if (j.error) throw new Error('Redis: ' + j.error); return j.result;
}
async function readStore(){
  if (!(R_URL && R_TOKEN)) return memoryCopy;
  const v = await redis(['GET', KEY]); return v ? JSON.parse(v) : null;
}
async function writeStore(data){
  if (!(R_URL && R_TOKEN)){ memoryCopy = data; return; }
  await redis(['SET', KEY, JSON.stringify(data)]);
}

/* ---------- Public: refresh (daily) and load (every message) ---------- */
const norm = t => t.toLowerCase().replace(/\b(20\d\d|\d{4}\/\d{2,4})\b/g, '').replace(/[^a-z0-9]/g, '').slice(0, 70);

async function refresh(){
  const today = todayLagos();
  const report = [];
  const results = await Promise.all(SOURCES.map(async src => {
    const t0 = Date.now();
    try { const items = await readSource(src); report.push({ name: src.name, group: src.group, ok: true, found: items.length, ms: Date.now() - t0 }); return items; }
    catch (e){ report.push({ name: src.name, group: src.group, ok: false, error: String(e.message || e).slice(0, 120), ms: Date.now() - t0 }); return []; }
  }));
  const prev = (await readStore()) || { items: [] };
  let sheet = [], sheetOk = true;
  if (process.env.OPPS_SHEET_CSV){
    try { sheet = await readSheet(process.env.OPPS_SHEET_CSV); report.push({ name: 'Your Google Sheet', group: 'sheet', ok: true, found: sheet.length }); }
    catch (e){ sheetOk = false; report.push({ name: 'Your Google Sheet', group: 'sheet', ok: false, error: String(e.message || e).slice(0, 120) }); }
  }
  if (!sheetOk) sheet = prev.items.filter(o => o.id.startsWith('s')); // keep yesterday's sheet rows if it couldn't be read
  // Newest first; keep the copy that has a real deadline when the same listing appears twice.
  const byId = new Map(); const byTitle = new Map();
  const add = o => {
    if (!o || o.deadline < today) return;
    const k = norm(o.title + ' ' + (o.kind === 'job' ? o.org : ''));
    const twin = byTitle.get(k);
    if (twin && (twin.estimated && !o.estimated)){ byId.delete(twin.id); }
    else if (twin) return;
    byId.set(o.id, o); byTitle.set(k, o);
  };
  sheet.forEach(add);
  // Take turns across sources (newest first from each), so a very busy site can't fill Ona on its own.
  const lists = results.map((items, i) => items.slice(0, SOURCES[i].max || PER_SOURCE));
  for (let k = 0; lists.some(l => k < l.length); k++) lists.forEach(l => { if (k < l.length) add(l[k]); });
  prev.items.filter(o => !o.id.startsWith('s')).forEach(o => { if (!byId.has(o.id)) add(o); });
  const items = [...byId.values()].slice(0, MAX_ITEMS);
  const data = { updated: new Date().toISOString(), items, report };
  await writeStore(data);
  cache = { at: Date.now(), data };
  return data;
}

let cache = { at: 0, data: null };
async function load(){
  if (cache.data && Date.now() - cache.at < 5 * 60 * 1000) return cache.data.items;
  try { const d = await readStore(); cache = { at: Date.now(), data: d || { items: [] } }; }
  catch (e){ console.error('Feed load failed:', e.message); if (!cache.data) cache = { at: Date.now(), data: { items: [] } }; }
  return cache.data.items;
}
const current = () => (cache.data && cache.data.items) || [];
const info = async () => { await load(); return cache.data; };

module.exports = { fieldsOf, SOURCES, refresh, load, current, info, parseRss, toOpp, findDeadline, parseDate, readSheet, parseCsv };
