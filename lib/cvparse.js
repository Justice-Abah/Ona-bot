// Free CV reader (no AI). Reads the CV section by section: name, education, work history,
// skills, fields and leadership. People can still fix anything in the "Is this right?" step.

const HEAD = {
  education: /^(education(al)?( background| history| qualifications?)?|academic (background|qualifications?|history)|qualifications?)$/i,
  experience: /^((work|professional|employment|relevant|career)\s+)?(experience|history)$|^employment$|^work$|^internships?$|^positions? held$/i,
  skills: /^((key|core|technical|professional|relevant|soft|hard)\s+)?(skills?|competenc(y|ies)|expertise|tools|technologies|proficienc(y|ies))( (&|and) (tools|technologies|competencies|abilities))?$/i,
  certs: /^(certifications?|certificates?|licen[cs]es?|courses|trainings?|professional development)( (&|and) (trainings?|certifications?|courses))?$/i,
  leadership: /^(leadership|volunteer(ing)?|extra[- ]?curricular|activities|community|leadership (&|and) volunteering)( (experience|activities))?$/i,
  summary: /^(summary|profile|professional summary|about( me)?|objective|career objective|personal statement)$/i,
  other: /^(references?|referees?|hobbies|interests|languages?|awards?|honou?rs|achievements|projects?|publications?|personal (details|information)|contact( details)?)$/i
};

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE = `(?:${MON}\\.?\\s*,?\\s*)?((?:19|20)\\d\\d)|(\\d{1,2})\\/((?:19|20)\\d\\d)`;
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to|until|till)\\s*(till date|to date|until date|until now|up to date|present|current|now|date|ongoing|${DATE})`, 'i');

const DEGREES = [
  { re: /\b(ph\.?\s?d|d\.?phil|doctor of philosophy|doctorate)\b/i, level: 'phd' },
  { re: /\b(m\.?\s?sc|m\.?\s?s\b|m\.?\s?a\b|m\.?\s?eng|m\.?\s?tech|m\.?\s?phil|mba|m\.?\s?ed|ll\.?\s?m|m\.?\s?p\.?\s?h|mpa|mph|master'?s?|masters)\b/i, level: 'masters' },
  { re: /\b(b\.?\s?sc|b\.?\s?s\b|b\.?\s?a\b|b\.?\s?eng|b\.?\s?tech|b\.?\s?ed|b\.?\s?(sc\.?\s?)?\(?ed\)?|ll\.?\s?b|mbbs|b\.?\s?pharm|b\.?\s?agric|bds|hnd|higher national diploma|bachelor'?s?|first degree)\b/i, level: 'bachelors' },
  { re: /\b(ond|ordinary national diploma|nce|diploma)\b/i, level: 'secondary' },
  { re: /\b(waec|ssce|neco|wassce|o'?\s?level|secondary school|high school)\b/i, level: 'secondary' }
];
const RANK = { secondary: 0, undergraduate: 1, bachelors: 2, masters: 3, phd: 4 };
const INSTITUTION = /\b(university|polytechnic|college|institute|school|academy|unilag|unn|oau|ui\b|abu\b|uniben|lasu|futa|covenant|yabatech)/i;

const SKILL_WORDS = ['Microsoft Excel','Excel','Power BI','Tableau','SQL','MySQL','PostgreSQL','Python','R','Stata','SPSS','SAS','EViews','MATLAB','Looker','Google Sheets','Google Analytics',
  'JavaScript','TypeScript','React','Node.js','Java','C++','C#','PHP','Django','Flask','HTML','CSS','Git','Docker','AWS','Azure','GCP','Linux','Kotlin','Swift','Flutter',
  'Figma','FigJam','Adobe Photoshop','Photoshop','Illustrator','InDesign','Canva','CorelDRAW','AutoCAD','Revit','SolidWorks','ArcGIS','QGIS',
  'Jira','Confluence','Trello','Asana','Notion','Scrum','Agile','Kanban','Product management','Project management','Requirements gathering','User stories','Stakeholder management',
  'Data analysis','Data visualisation','Data visualization','Data cleaning','Machine learning','Deep learning','Statistics','Statistical analysis','Research','Policy research','Monitoring and evaluation','M&E',
  'Financial modelling','Financial analysis','Accounting','Bookkeeping','QuickBooks','Sage','SAP','Budgeting','Auditing','Taxation','Risk management',
  'Digital marketing','Social media','SEO','Content writing','Copywriting','Email marketing','HubSpot','Salesforce','CRM','Sales','Customer service','Public speaking','Report writing',
  'Microsoft Office','MS Office','Word','PowerPoint','Google Workspace','Teaching','Lesson planning','Curriculum development','Graphic design','UI/UX','UX research','Video editing',
  'Customer relationship management','Supply chain','Logistics','Procurement'];
const SOFT = /^(communication|leadership|teamwork|team player|problem[- ]solving|critical thinking|time management|hardworking|hard[- ]working|attention to detail|adaptability|creativity)$/i;

const FIELD_MAP = [
  ['Software Engineering', /software|developer|programmer|programming|full[- ]stack|backend|frontend|web dev|devops/i],
  ['Data Science', /data scien|machine learning|\bml\b|\bai\b|artificial intelligence/i],
  ['Data Analysis', /data analy|business intelligence|\bbi analyst|analytics/i],
  ['Product Management', /product manag|product owner|product lead/i],
  ['Payments & Fintech', /payment|fintech|banking|nibss|settlement|pos\b/i],
  ['Finance', /financ|investment|accountan|audit|treasury|actuar/i],
  ['Economics', /econom/i],
  ['Statistics', /statistic/i],
  ['Mathematics', /mathemat/i],
  ['Computer Science', /computer science|computing|information technology|\bict\b/i],
  ['Engineering', /engineer/i],
  ['Public Policy', /public policy|policy analy|governance|public administration/i],
  ['International Development', /development|ngo|non[- ]profit|humanitarian|civil society|advocacy/i],
  ['Public Health', /public health|epidemiolog|health/i],
  ['Medicine', /medicine|medical|mbbs|clinical|doctor|nurs|physician|surgeon/i],
  ['Law', /\blaw\b|legal|ll\.?b|barrister|solicitor/i],
  ['Education', /teach|tutor|lectur|education|school/i],
  ['Marketing & Communications', /marketing|communication|public relations|\bpr\b|media|journalis|content/i],
  ['Business & Management', /business admin|management|operations|consult|entrepreneur|founder/i],
  ['Design', /design|ui\/ux|ux |graphic/i],
  ['Agriculture', /agricult|agronom|farm/i],
  ['Biology & Life Sciences', /biolog|biochem|microbio|genetic|life science|biomedical/i],
  ['Chemistry', /chemistr/i], ['Physics', /physic/i], ['Architecture', /architect/i],
  ['Sociology', /sociolog/i], ['Political Science', /political science|politics|international relations/i],
  ['Customer Service', /customer service|client service|customer experience|support/i]
];

function nowYM(){ const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; }

function lineify(text){
  return String(text).replace(/\r/g, '').replace(/\t/g, ' ').split('\n')
    .map(l => l.replace(/^[\s•●▪■◦\-*–·]+/, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function headingOf(line){
  const l = line.replace(/[:.]$/, '').trim();
  if (l.length > 45) return null;
  for (const k of Object.keys(HEAD)) if (HEAD[k].test(l)) return k;
  return null;
}

function sections(lines){
  const out = { top: [] }; let cur = 'top';
  for (const l of lines){
    const h = headingOf(l);
    if (h){ cur = h; out[cur] = out[cur] || []; continue; }
    // "Skills: Excel, SQL" style inline heading
    const m = l.match(/^([A-Za-z &]{3,40}):\s*(.+)$/);
    if (m && headingOf(m[1])){ const k = headingOf(m[1]); out[k] = out[k] || []; out[k].push(m[2]); continue; }
    (out[cur] = out[cur] || []).push(l);
  }
  return out;
}

function parseDate(s){
  if (!s) return null;
  if (/present|current|now|date|ongoing/i.test(s) && !/(?:19|20)\d\d/.test(s)) return { ...nowYM(), present: true };
  let m = s.match(/(\d{1,2})\/((?:19|20)\d\d)/); if (m) return { y: +m[2], m: +m[1] };
  m = s.match(new RegExp(`${MON}\\.?\\s*,?\\s*((?:19|20)\\d\\d)`, 'i')); if (m) return { y: +m[2], m: MONTHS[m[1].slice(0, 3).toLowerCase()] || 1 };
  m = s.match(/((?:19|20)\d\d)/); if (m) return { y: +m[1], m: 0 };
  return null;
}

function findRange(line){
  const m = line.match(RANGE); if (!m) return null;
  const parts = m[0].split(/\s*(?:-|–|—|\bto\b|\buntil\b|\btill\b)\s*/i).filter(Boolean);
  const start = parseDate(parts[0]); const end = parseDate(parts[parts.length - 1]);
  if (!start) return null;
  return { start, end: end || start, text: m[0] };
}

function monthsBetween(a, b){
  const am = a.m || 1, bm = b.m || (b.present ? b.m : 12);
  return Math.max(1, (b.y - a.y) * 12 + (bm - am) + 1);
}

const TITLEISH = /\b(manager|officer|analyst|engineer|developer|intern\b|associate|assistant|lead\b|head|director|consultant|executive|specialist|coordinator|teacher|tutor|lecturer|founder|president|secretary|designer|accountant|auditor|scientist|researcher|nurse|doctor|pharmacist|volunteer|representative|supervisor|administrator|advisor|adviser|fellow|trainee|ambassador|programmer|architect|writer|editor|marketer|clerk|cashier|agent|technician|instructor|coach|owner|partner|chairman|treasurer)/i;
function splitTitleOrg(s){
  s = s.replace(RANGE, '').replace(/\s*[:;].*$/, '').replace(/\(\s*\)/g, '').replace(/\(([^)]*)\)/g, ', $1').replace(/[|]+/g, ' - ').replace(/\s+/g, ' ').replace(/[,\-–—:\s]+$/, '').replace(/^[,\-–—:\s]+/, '').trim();
  let parts = s.split(/\s+at\s+|\s+[-–—|]\s+|,\s*/i).map(x => x.trim()).filter(Boolean);
  if (parts.length === 1) return { title: parts[0], organisation: '' };
  // Put the part that looks like a job title first
  const titleish = TITLEISH; const _unused = /(manager|officer|analyst|engineer|developer|intern|associate|assistant|lead|head|director|consultant|executive|specialist|coordinator|teacher|tutor|lecturer|founder|president|secretary|designer|accountant|auditor|scientist|researcher|nurse|doctor|pharmacist|volunteer|representative|supervisor|administrator|advisor|adviser|fellow|trainee|ambassador)/i;
  if (!titleish.test(parts[0]) && titleish.test(parts[1])) parts = [parts[1], parts[0], ...parts.slice(2)];
  return { title: parts[0], organisation: parts.slice(1, 3).join(', ') };
}

function rolesFrom(lines, strict){
  const roles = [];
  const isT = x => x && TITLEISH.test(x) && !findRange(x) && x.split(/\s+/).length <= 6 && !/[.;]$/.test(x) && !DEGREES.some(d => d.re.test(x));
  // Work out the CV's layout from its first dated line: is the job title on the line after the dates, or before?
  let layout = 'inline';
  for (let i = 0; i < lines.length; i++){
    if (!findRange(lines[i])) continue;
    const label = lines[i].replace(findRange(lines[i]).text, '');
    if (TITLEISH.test(label)) break;
    if (isT(lines[i + 1])) layout = 'after'; else if (isT(lines[i - 1])) layout = 'before';
    break;
  }
  for (let i = 0; i < lines.length; i++){
    let r = findRange(lines[i]);
    if (!r && strict && TITLEISH.test(lines[i])){
      // "Data Analyst Intern, Lagos fintech (2022)": a role with a single year
      const y = lines[i].match(new RegExp(`(?:${MON}\\.?\\s*)?((?:19|20)\\d\\d)`, 'i'));
      if (y){ const d = parseDate(y[0]); r = { start: d, end: d, text: y[0] }; }
    }
    if (!r) continue;
    let label = lines[i].replace(r.text, '').trim();
    const prev = i > 0 && !findRange(lines[i - 1]) && lines[i - 1].length < 90 ? lines[i - 1] : '';
    if (label.replace(/[^A-Za-z]/g, '').length < 4 && prev) label = prev;
    if (label.replace(/[^A-Za-z]/g, '').length < 4) continue;
    let { title, organisation } = splitTitleOrg(label);
    const isTitleLine = x => x && TITLEISH.test(x) && !findRange(x) && x.split(/\s+/).length <= 6 && !/[.;]$/.test(x) && !DEGREES.some(d => d.re.test(x));
    const next = lines[i + 1];
    // "NIBSS | May 2026 – Present" on one line, "Product Manager" on the next
    if (!TITLEISH.test(label) && isTitleLine(next) && (layout === 'after' || !isTitleLine(prev))){
      const t = splitTitleOrg(next);
      organisation = [title, organisation].filter(Boolean).join(', ');
      title = t.organisation && !TITLEISH.test(t.organisation) ? t.title + ', ' + t.organisation : t.title;
      if (t.organisation && TITLEISH.test(t.organisation) === false && /^[A-Z]/.test(t.organisation) && t.organisation.split(' ').length <= 2) title = t.title + ' (' + t.organisation + ')';
    }
    // "Product Manager" on one line, "NIBSS | May 2026 – Present" on the next
    else if (!TITLEISH.test(title) && isTitleLine(prev) && layout !== 'after'){
      const t = splitTitleOrg(prev);
      organisation = [title, organisation].filter(Boolean).join(', ');
      title = t.organisation && !TITLEISH.test(t.organisation) ? t.title + ', ' + t.organisation : t.title;
    }
    // "Data Analyst (Freelance)"
    const paren = label.match(/^(.*?)\s*\(([^)]+)\)/);
    if (paren && !organisation && TITLEISH.test(paren[1])){ title = paren[1].trim(); organisation = paren[2].trim(); }
    if (!title || DEGREES.some(d => d.re.test(title))) continue;
    roles.push({ title: title.slice(0, 80), organisation: organisation.slice(0, 80), start: String(r.start.y), end: r.end.present ? 'present' : String(r.end.y), _s: r.start, _e: r.end });
  }
  return roles;
}

function totalYears(roles){
  const iv = roles.map(r => [r._s.y * 12 + (r._s.m || 1), r._e.y * 12 + (r._e.m || (r._e.present ? nowYM().m : 12))]).filter(x => x[1] >= x[0]).sort((a, b) => a[0] - b[0]);
  let total = 0, cs = null, ce = null;
  for (const [s, e] of iv){ if (cs === null){ cs = s; ce = e; } else if (s <= ce + 1){ ce = Math.max(ce, e); } else { total += ce - cs + 1; cs = s; ce = e; } }
  if (cs !== null) total += ce - cs + 1;
  return total > 0 && total < 12 ? 1 : Math.round(total / 12);
}

function educationFrom(lines){
  const out = [];
  for (let i = 0; i < lines.length; i++){
    const l = lines[i];
    const d = DEGREES.find(x => x.re.test(l)); if (!d) continue;
    const parts = l.replace(RANGE, '').split(/\s*[,|]\s*|\s+[-–—]\s+/).map(x => x.trim()).filter(Boolean);
    let inst = parts.find(x => INSTITUTION.test(x) && !d.re.test(x)) || '';
    if (inst){ const k = parts.indexOf(inst); if (parts[k + 1] && !/\d|class|honou?r|grade|gpa|distinction/i.test(parts[k + 1]) && parts[k + 1].split(' ').length <= 3) inst += ', ' + parts[k + 1]; }
    const near = [lines[i - 1], lines[i + 1]].filter(x => x && INSTITUTION.test(x) && !DEGREES.some(y => y.re.test(x)));
    let nearYears = [];
    if (!inst && near.length){ inst = near[0].replace(RANGE, '').replace(/\(?\b(?:19|20)\d\d\b\)?/g, '').replace(/[,|\-–—\s]+$/, '').trim(); nearYears = near[0].match(/(?:19|20)\d\d/g) || []; }
    let degree = parts.filter(x => x !== inst && !inst.includes(x) && !/^(19|20)\d\d$/.test(x)).join(', ').replace(/^(?:(?:19|20)\d\d\s*)+/, '').trim();
    degree = degree.replace(/,?\s*(second|first|third)\s+class.*$/i, '').replace(/,?\s*(cgpa|gpa).*$/i, '').replace(/\(?\b(?:19|20)\d\d\b\)?/g, '').replace(/[,\s]+$/, '').trim();
    const ownYears = l.match(/(?:19|20)\d\d/g);
    const years = ownYears || (nearYears.length ? nearYears : null) || (lines[i + 1] || '').match(/(?:19|20)\d\d/g) || [];
    const ongoing = /expected|in view|ongoing|current|in progress|\b[1-5]00\s?level|final year|undergraduate|present/i.test(l + ' ' + (lines[i + 1] || ''));
    inst = inst.replace(/\(?\b(?:19|20)\d\d\b\)?/g, '').replace(/[,()\s]+$/, '').trim();
    out.push({ degree: (degree || l).slice(0, 90), institution: inst.slice(0, 80), year: years.length ? years[years.length - 1] : '', _level: ongoing && d.level === 'bachelors' ? 'undergraduate' : d.level });
    if (out.length >= 4) break;
  }
  return out;
}

function subjectOf(degree){
  const d = degree.replace(/\b(university|polytechnic|college|institute)\b.*$/i, '');
  const m = d.match(/(?:b\.?\s?sc|m\.?\s?sc|b\.?\s?a|m\.?\s?a|b\.?\s?eng|m\.?\s?eng|b\.?\s?tech|m\.?\s?tech|hnd|ond|ph\.?\s?d|ll\.?\s?b|mba|m\.?\s?ed|b\.?\s?ed|master'?s?|bachelor'?s?)\.?\s*(?:\(?\s*(?:hons?|ed|honours)\.?\s*\)?\.?)?\s*(?:degree)?\s*(?:in|of)?\s*([A-Za-z &/-]{3,60})/i);
  if (!m) return /mbbs|medicine/i.test(d) ? 'Medicine' : '';
  return m[1].replace(/\b(second|first|class|upper|lower|honou?rs|division|cgpa|gpa|with|distinction|merit|in view|expected)\b.*$/i, '').replace(/[,\s-]+$/, '').trim();
}

function skillsFrom(sec, all){
  const found = [];
  const add = s => { s = s.replace(/[.;:]+$/, '').replace(/\s+/g, ' ').trim(); if (s.length < 1 || s.length > 40 || SOFT.test(s) && found.length > 8) return; if (!found.some(f => f.toLowerCase() === s.toLowerCase())) found.push(s); };
  for (const l of (sec.skills || [])) l.split(/[,;•|·]| and (?=[A-Z])/).forEach(x => { const t = x.replace(/^.*?:\s*/, ''); if (t.split(' ').length <= 5) add(t); });
  const text = ' ' + all.join(' \n ') + ' ';
  for (const w of SKILL_WORDS){
    const re = new RegExp(`(^|[^A-Za-z])${w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^A-Za-z]|$)`, w.length <= 2 ? '' : 'i');
    if (re.test(text) && !found.some(f => f.toLowerCase().includes(w.toLowerCase()) || w.toLowerCase().includes(f.toLowerCase()))) add(w);
  }
  return found.slice(0, 15);
}

function parseInner(text){
  const lines = lineify(text);
  const sec = sections(lines);
  // Name: first short line without digits/emails that isn't a heading.
  const nameLine = (sec.top.find(l => !/[@\d]|http|curriculum|resume|résumé|\bcv\b/i.test(l) && l.split(/\s+/).length <= 6 && /[A-Za-z]/.test(l)) || lines[0] || '');
  let name = nameLine.split(/[,|]/)[0].trim().slice(0, 50);
  if (name === name.toUpperCase()) name = name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  const expLines = sec.experience && sec.experience.length ? [...sec.experience, ...(sec.leadership || [])] : lines;
  const hasExp = !!(sec.experience && sec.experience.length);
  let roles = rolesFrom(hasExp ? sec.experience : lines.filter(l => !DEGREES.some(d => d.re.test(l))), hasExp);
  roles = roles.filter((r, i, a) => a.findIndex(x => x.title === r.title && x.start === r.start) === i);
  roles.sort((a, b) => (b._e.y * 12 + (b._e.m || 0)) - (a._e.y * 12 + (a._e.m || 0)));

  const education = educationFrom(sec.education && sec.education.length ? sec.education : lines);
  let level = 'secondary';
  for (const e of education) if (RANK[e._level] > RANK[level]) level = e._level;
  if (!education.length){ const d = DEGREES.find(x => x.re.test(text)); if (d) level = d.level; }

  const subjects = education.map(e => subjectOf(e.degree)).filter(Boolean);
  const fieldHay = [...roles.slice(0, 3).map(r => r.title + ' ' + r.organisation), ...subjects].join(' | ');
  const fields = [];
  for (const [f, re] of FIELD_MAP) if (re.test(fieldHay) && !fields.includes(f)) fields.push(f);
  const roleField = roles[0] && (FIELD_MAP.find(([, re]) => re.test(roles[0].title)) || FIELD_MAP.find(([, re]) => re.test(roles[0].organisation)));
  const field = (roleField && roleField[0]) || subjects[0] || fields[0] || 'General';
  subjects.forEach(sj => { if (sj && !fields.some(f => f.toLowerCase() === sj.toLowerCase())) fields.push(sj.replace(/\b\w/g, c => c.toUpperCase())); });

  const skills = skillsFrom(sec, lines);
  const years = totalYears(roles);
  const leadership = /\b(led|lead(ing)?|founder|founded|co-founded|president|chairman|chairperson|captain|head of|secretary|coordinat|team lead|supervis|manag(ed|er)|director)\b/i.test(text);
  const summary = (sec.summary || []).join(' ').slice(0, 200) || `${roles[0] ? roles[0].title : field} with about ${years} years of experience.`;

  return {
    name, level, field: field.replace(/\b\w/g, c => c.toUpperCase()),
    fields: fields.filter(f => f.toLowerCase() !== field.toLowerCase()).slice(0, 4),
    years_experience: years,
    roles: roles.slice(0, 8).map(({ _s, _e, ...r }) => r),
    education: education.map(({ _level, ...e }) => e),
    skills, leadership, summary
  };
}

// Never let an unusual CV break the conversation: if anything goes wrong, return an empty
// profile and let the person fill it in at the "Is this right?" step.
function parse(text){
  try { return parseInner(text); }
  catch (e){
    console.error('CV reader failed:', e);
    return { name: '', level: 'bachelors', field: 'General', fields: [], years_experience: 0, roles: [], education: [], skills: [], leadership: false, summary: '' };
  }
}

module.exports = { parse };
