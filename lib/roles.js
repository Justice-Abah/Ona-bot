// Job families: what kind of work a job title describes, and what kind of work a person has done.
// Ona matches jobs on these families, so a Relationship Manager sees banking and sales roles,
// not Social Media Manager or Graphic Designer just because their CV says "communication" or "designed".

const FAMILIES = {
  banking:      { label: 'banking and financial services', re: /\b(relationship (manager|officer|executive)|bank(ing|er)?|teller|loans?|lending|credit (officer|analyst|risk)|microfinance|mfb|fintech|payments?|insurance|underwrit\w*|actuar\w*|wealth|asset management|trade (finance|operations)|portfolio manager|mobile money|pos agent|agent banking|personal banker)\b/i },
  finance:      { label: 'corporate finance', re: /\b(finance (officer|manager|administrator|analyst|executive|director|lead|assistant|associate|business partner)|head of finance|financial (analyst|controller|planning|manager|officer|reporting analyst)|chief financial officer|\bcfo\b|treasury|fp&a|budget (analyst|officer)|financial controller|investment analyst|corporate finance|credit analyst|msc\.? finance|m\.?sc\.? finance|finance)\b/i },
  accounting:   { label: 'accounting and audit', re: /\b(accountant|accounting|accounts (officer|assistant|payable|receivable)|audit(or|ing)?|tax(ation)?|bookkeep\w*|payroll accountant|payroll officer|accounts clerk|financial reporting|revenue assurance|earnings reporting|reconciliation|ican|acca|chartered accountant)\b/i },
  sales:        { label: 'sales and business development', re: /\b(sales|business develop\w*|account (executive|manager)|key accounts?|merchant (acquisition|manager|officer)|acquisition (officer|manager)|marketer|field (sales|agent)|territory manager|customer acquisition|partnerships?)\b/i },
  marketing:    { label: 'marketing and communications', re: /\b(marketing|brand (manager|executive|strategist)|social media|digital market\w*|content (creator|manager|strategist|writer)|communications? (officer|manager|specialist|executive)|public relations|\bpr\b|copywrit\w*|seo|growth (marketer|manager)|community manager)\b/i },
  media:        { label: 'media and journalism', re: /\b(journalis\w*|reporter|editor|broadcast\w*|presenter|news|correspondent)\b/i },
  design:       { label: 'design', re: /\b(graphics? design\w*|(?<!fashion |interior )designer|ui\/ux|ux|ui designer|product design\w*|illustrat\w*|visual design|motion design|animator|video editor|photograph\w*|art director|creative director)\b/i },
  software:     { label: 'software development', re: /\b(software|developer|programmer|front[- ]?end|back[- ]?end|full[- ]?stack|devops|mobile (app|developer|engineer)|android|ios|web developer|qa engineer|test engineer|cloud engineer|site reliability|\bsre\b|engineering manager)\b/i },
  data:         { label: 'data and analytics', re: /\b(data (analyst|scientist|engineer|analytics|science)|business analyst|analytics|business intelligence|\bbi\b|annotator|data annotation|data labell?(ing|er)|ai trainer|statistician|machine learning|\bml\b engineer|ai engineer|data entry)\b/i },
  it:           { label: 'IT and security', re: /\b(it (support|officer|manager|specialist|technician)|network (engineer|administrator)|system(s)? (administrator|admin|engineer)|helpdesk|help desk|ict|cyber ?security|information security|security analyst|soc analyst)\b/i },
  product:      { label: 'product and project management', re: /\b(product (manager|owner|lead|analyst)|business analyst|project (manager|coordinator|officer|lead)|programme manager|program manager|scrum master|delivery manager|pmo)\b/i },
  customer:     { label: 'customer service', re: /\b(customer (service|support|experience|care|success)|client (service|support|experience)|call cent(er|re)|contact cent(er|re)|front desk|receptionist|(?<!it )support (agent|officer|specialist))\b/i },
  hr:           { label: 'human resources', re: /\b(human resources?|\bhr\b|recruit\w*|talent (acquisition|manager)|people (operations|partner)|payroll (officer|specialist)|learning and development)\b/i },
  admin:        { label: 'admin and office', re: /\b((?<!(business|finance|financial|system|systems|database|network|it) )admin\w*|secretar\w*|office (assistant|manager|administrator)|personal assistant|executive assistant|clerk|data entry clerk)\b/i },
  operations:   { label: 'operations, supply chain and logistics', re: /\b(operations?|procurement|supply chain|logistics?|warehouse|inventory|store ?keeper|purchas\w*|fleet|dispatch (officer|manager))\b/i },
  legal:        { label: 'legal and compliance', re: /\b(legal|lawyer|counsel|solicitor|attorney|paralegal|compliance|company secretary|regulatory)\b/i },
  health:       { label: 'health and medicine', re: /\b(nurs(e|ing)|doctor|medical|physician|pharmac\w*|clinic\w*|laborator\w*|lab scientist|midwi\w*|physiotherap\w*|dentist|public health|health (officer|worker|programme)|mbbs|epidemiolog\w*|nutrition\w*)\b/i },
  construction: { label: 'civil engineering and construction', re: /\b((civil|structural|site|construction|geotechnical|highway|water resources|drainage|building|project) engineer\w*|civil( and \w+)? engineering|construction|quantity surveyor|surveyor|site (supervisor|manager)|building inspector|draughts?man|draftsman|clerk of works|estimator)\b/i },
  architecture: { label: 'architecture and interior design', re: /\b(architect(?!ure engineer)|architectural|interior design\w*|urban plann\w*|town planner)\b/i },
  mechanical:   { label: 'mechanical engineering', re: /\b((mechanical|maintenance|production|automotive|hvac|mechatronics|manufacturing|plant) engineer\w*|mechanical engineering|mechanical technician|hvac)\b/i },
  electrical:   { label: 'electrical and power engineering', re: /\b((electrical|electronics?|power|instrumentation|control|telecoms?|telecommunications) engineer\w*|electrical engineering|electrical technician|solar (installer|installation|technician|engineer)|inverter)\b/i },
  petroleum:    { label: 'oil, gas and chemical engineering', re: /\b((chemical|petroleum|process|reservoir|drilling|pipeline|field|subsea) engineer\w*|oil and gas|oil & gas|petroleum|refinery|petrochemical)\b/i },
  hse:          { label: 'health, safety and environment', re: /\b(hse|hseq|health,? safety (and|&) environment|health and safety|safety officer|safety engineer)\b/i },
  biomedical:   { label: 'biomedical engineering', re: /\b(biomedical engineer\w*|biomedical engineering)\b/i },
  education:    { label: 'education and teaching', re: /\b(teacher|teaching(?! hospital)|tutor|lecturer|instructor|education(?!al institution)\w*|curriculum|facilitator|head teacher|principal of)\b/i },
  development:  { label: 'research, policy and development', re: /\b(research(er)?|policy|programme (officer|associate|assistant|coordinator)|program (officer|associate)|monitoring|evaluation|m&e|\bmel\b|advocacy|ngo|humanitarian|grants? (officer|manager)|social work\w*|protection officer|gender|international development|community development)\b/i },
  agriculture:  { label: 'agriculture', re: /\b(agric\w*|farm\w*|agro\w*|agronomist|livestock|crop|food security)\b/i },
  hospitality:  { label: 'hospitality and food', re: /\b(hotel|chef|cook|hospitality|restaurant|catering|waiter|waitress|steward|bartender|barista|housekeep\w*)\b/i },
  driving:      { label: 'driving and security', re: /\b(driver|dispatch rider|security (guard|officer)|guard|cleaner|janitor|porter)\b/i },
  retail:       { label: 'retail and shops', re: /\b(retail|store (manager|supervisor|attendant)|shop (attendant|manager)|supermarket|merchandis\w*|sales (assistant|girl|boy|attendant)|cashier|brand ambassador|showroom)\b/i },
  trades:       { label: 'skilled trades', re: /\b(tailor|fashion designer|seamstress|welder|electrician|plumber|carpenter|mason|bricklayer|painter|auto mechanic|mechanic|artisan|hairstylist|barber|make-?up artist|cosmetolog\w*)\b/i },
  energy:       { label: 'energy and power', re: /\b(oil|gas|energy|solar|renewable|power plant|power generation)\b/i },
  environment:  { label: 'environment and climate', re: /\b(environment\w*|climate|sustainab\w*|conservation|waste management|ecolog\w*)\b/i },
};

// Kinds of work close enough to show, at a lower score. Read as: a job in the key family may also
// suit people experienced in these families. Kept short on purpose: a wrong match is worse than a missing one.
const NEAR = {
  banking: ['sales'],
  finance: ['accounting', 'banking'],
  accounting: ['finance'],
  sales: ['banking', 'marketing', 'customer', 'retail'],
  retail: ['sales', 'customer'],
  marketing: ['media'],
  media: ['marketing'],
  software: ['it'],
  data: ['software'],
  it: ['software'],
  customer: ['admin', 'retail'],
  hr: ['admin'],
  admin: ['hr', 'customer'],
  operations: ['admin'],
  development: [],
  construction: ['architecture'],
  architecture: [],
  hse: ['construction', 'petroleum', 'energy', 'environment'],
  environment: ['hse'],
  petroleum: ['energy'],
  electrical: ['energy'],
  energy: ['electrical', 'petroleum']
};

// Words every CV has. They say nothing about the kind of work, so they never decide a match.
const SOFT = /^(communication|communication skills|negotiation|presentation|public speaking|leadership|teamwork|team player|problem[- ]solving|critical thinking|creativ\w*|time management|management|interpersonal\w*|organi[sz]ation\w*|attention to detail|adaptab\w*|multitasking|microsoft office|ms office|microsoft word|word|powerpoint|report writing|writing|research|customer focus)$/i;

function familiesOf(text){
  const out = [];
  for (const [k, f] of Object.entries(FAMILIES)) if (f.re.test(text || '')) out.push(k);
  return out;
}

// What kinds of work a person has done: job titles count most, then their field and degree, then hard skills.
function personFamilies(p){
  const score = {}, why = {}, whyW = {};
  // The reason shown is the strongest evidence; the most recent job wins ties.
  const add = (fams, w, reason) => fams.forEach(f => { score[f] = (score[f] || 0) + w; if (!why[f] || w > whyW[f]){ why[f] = reason; whyW[f] = w; } });
  // Recent and longer jobs count most; an old or short side job (a 9-month tutoring stint years ago) counts little.
  const now = new Date().getFullYear();
  (p.roles || []).forEach((r, i) => {
    const end = r.end === 'present' ? now : +r.end || now, start = +r.start || end;
    const recent = now - end <= 4, long = end - start >= 2 || r.end === 'present';
    const w = i === 0 ? 4 : recent && long ? 3 : recent || long ? 2 : 1;
    add(familiesOf(r.title), /\b(intern|internship|volunteer)\b/i.test(r.title) ? Math.min(w, 2) : w, `your experience as ${r.title}`);
  });
  [p.field, ...(p.fields || [])].forEach(f => add(familiesOf(f), 2, `your background in ${String(f).toLowerCase()}`));
  (p.education || []).forEach(e => add(familiesOf(e.degree), 2, `your ${e.degree}`));
  (p.skills || []).filter(s => !SOFT.test(String(s).trim())).forEach(s => add(familiesOf(s), 1, `your ${s} skills`));
  if (p.portfolioHints) add(familiesOf(p.portfolioHints), 2, 'your portfolio');
  return { score, why, whyW };
}

module.exports = { FAMILIES, NEAR, SOFT, familiesOf, personFamilies };
