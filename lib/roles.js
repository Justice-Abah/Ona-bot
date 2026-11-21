// Job families: what kind of work a job title describes, and what kind of work a person has done.
// Ona matches jobs on these families, so a Relationship Manager sees banking and sales roles,
// not Social Media Manager or Graphic Designer just because their CV says "communication" or "designed".

const FAMILIES = {
  banking:      { label: 'banking and finance', re: /\b(relationship (manager|officer|executive)|bank(ing|er)?|teller|credit|loans?|lending|treasury|investment|wealth|asset management|financ(e|ial)(?! reporting)|fintech|payments?|microfinance|mfb|mobile money|pos agent|agent banking|insurance|actuar|underwrit|trade (finance|operations)|portfolio manager)\b/i },
  accounting:   { label: 'accounting and audit', re: /\b(accountant|accounting|accounts (officer|assistant|payable|receivable)|audit(or|ing)?|tax(ation)?|bookkeep\w*|payroll accountant|financial reporting|ican|acca)\b/i },
  sales:        { label: 'sales and business development', re: /\b(sales|business develop\w*|account (executive|manager)|key accounts?|merchant (acquisition|manager|officer)|acquisition (officer|manager)|marketer|field (sales|agent)|territory manager|customer acquisition|partnerships?)\b/i },
  marketing:    { label: 'marketing and communications', re: /\b(marketing|brand (manager|executive|strategist)|social media|digital market\w*|content (creator|manager|strategist|writer)|communications? (officer|manager|specialist|executive)|public relations|\bpr\b|copywrit\w*|seo|growth (marketer|manager)|community manager)\b/i },
  media:        { label: 'media and journalism', re: /\b(journalis\w*|reporter|editor|broadcast\w*|presenter|news|correspondent)\b/i },
  design:       { label: 'design', re: /\b(graphics? design\w*|(?<!fashion |interior )designer|ui\/ux|ux|ui designer|product design\w*|illustrat\w*|visual design|motion design|animator|video editor|photograph\w*|art director|creative director)\b/i },
  software:     { label: 'software development', re: /\b(software|developer|programmer|front[- ]?end|back[- ]?end|full[- ]?stack|devops|mobile (app|developer|engineer)|android|ios|web developer|qa engineer|test engineer|cloud engineer|site reliability|\bsre\b|engineering manager)\b/i },
  data:         { label: 'data and analytics', re: /\b(data (analyst|scientist|engineer|analytics|science)|business analyst|analytics|business intelligence|\bbi\b|statistician|machine learning|\bml\b engineer|ai engineer|data entry)\b/i },
  it:           { label: 'IT and security', re: /\b(it (support|officer|manager|specialist|technician)|network (engineer|administrator)|system(s)? (administrator|admin|engineer)|helpdesk|help desk|ict|cyber ?security|information security|security analyst|soc analyst)\b/i },
  product:      { label: 'product and project management', re: /\b(product (manager|owner|lead|analyst)|business analyst|project (manager|coordinator|officer|lead)|programme manager|program manager|scrum master|delivery manager|pmo)\b/i },
  customer:     { label: 'customer service', re: /\b(customer (service|support|experience|care|success)|client (service|support|experience)|call cent(er|re)|contact cent(er|re)|front desk|receptionist|(?<!it )support (agent|officer|specialist))\b/i },
  hr:           { label: 'human resources', re: /\b(human resources?|\bhr\b|recruit\w*|talent (acquisition|manager)|people (operations|partner)|payroll (officer|specialist)|learning and development)\b/i },
  admin:        { label: 'admin and office', re: /\b((?<!business )admin\w*|secretar\w*|office (assistant|manager|administrator)|personal assistant|executive assistant|clerk|data entry clerk)\b/i },
  operations:   { label: 'operations, supply chain and logistics', re: /\b(operations?|procurement|supply chain|logistics?|warehouse|inventory|store ?keeper|purchas\w*|fleet|dispatch (officer|manager))\b/i },
  legal:        { label: 'legal and compliance', re: /\b(legal|lawyer|counsel|solicitor|attorney|paralegal|compliance|company secretary|regulatory)\b/i },
  health:       { label: 'health and medicine', re: /\b(nurs(e|ing)|doctor|medical|physician|pharmac\w*|clinic\w*|laborator\w*|lab scientist|midwi\w*|physiotherap\w*|dentist|public health|health (officer|worker|programme)|mbbs|epidemiolog\w*|nutrition\w*)\b/i },
  engineering:  { label: 'engineering and construction', re: /\b((civil|mechanical|electrical|chemical|petroleum|process|site|structural|maintenance|production|reservoir|drilling|biomedical) engineer\w*|technician|quantity surveyor|architect|interior design\w*|construction|surveyor|hse|health and safety)\b/i },
  education:    { label: 'education and teaching', re: /\b(teacher|teaching(?! hospital)|tutor|lecturer|instructor|education(?!al institution)\w*|curriculum|facilitator|head teacher|principal of)\b/i },
  development:  { label: 'research, policy and development', re: /\b(research(er)?|policy|programme (officer|associate|assistant|coordinator)|program (officer|associate)|monitoring|evaluation|m&e|\bmel\b|advocacy|ngo|humanitarian|grants? (officer|manager)|social work\w*|protection officer|gender|international development|community development)\b/i },
  agriculture:  { label: 'agriculture', re: /\b(agric\w*|farm\w*|agro\w*|agronomist|livestock|crop|food security)\b/i },
  hospitality:  { label: 'hospitality and food', re: /\b(hotel|chef|cook|hospitality|restaurant|catering|waiter|waitress|steward|bartender|barista|housekeep\w*)\b/i },
  driving:      { label: 'driving and security', re: /\b(driver|dispatch rider|security (guard|officer)|guard|cleaner|janitor|porter)\b/i },
  retail:       { label: 'retail and shops', re: /\b(retail|store (manager|supervisor|attendant)|shop (attendant|manager)|supermarket|merchandis\w*|sales (assistant|girl|boy|attendant)|cashier|brand ambassador|showroom)\b/i },
  trades:       { label: 'skilled trades', re: /\b(tailor|fashion designer|seamstress|welder|electrician|plumber|carpenter|mason|bricklayer|painter|auto mechanic|mechanic|artisan|hairstylist|barber|make-?up artist|cosmetolog\w*)\b/i },
  energy:       { label: 'energy and environment', re: /\b(oil|gas|energy|solar|renewable|power plant|environment\w*|climate|sustainab\w*)\b/i }
};

// Kinds of work close enough to show, at a lower score. Read as: a job in the key family may also
// suit people experienced in these families. Kept short on purpose: a wrong match is worse than a missing one.
const NEAR = {
  banking: ['accounting', 'sales'],
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
  engineering: ['energy'],
  energy: ['engineering']
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
  (p.roles || []).forEach((r, i) => add(familiesOf(r.title), i === 0 ? 4 : 3, `your experience as ${r.title}`));
  [p.field, ...(p.fields || [])].forEach(f => add(familiesOf(f), 2, `your background in ${String(f).toLowerCase()}`));
  (p.education || []).forEach(e => add(familiesOf(e.degree), 2, `your ${e.degree}`));
  (p.skills || []).filter(s => !SOFT.test(String(s).trim())).forEach(s => add(familiesOf(s), 1, `your ${s} skills`));
  if (p.portfolioHints) add(familiesOf(p.portfolioHints), 2, 'your portfolio');
  return { score, why };
}

module.exports = { FAMILIES, NEAR, SOFT, familiesOf, personFamilies };
