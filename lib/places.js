// Nigerian states, and the cities and areas people write instead of the state name.
// Used to read a person's state from their CV or message, and a job's state from its listing.

// [state as shown to people, words that point to it]. Words that are also ordinary English
// (Niger, Delta, Rivers, Plateau) only count when written as "... State".
const STATES = [
  ['Abia', ['abia', 'umuahia', 'aba']],
  ['Adamawa', ['adamawa', 'yola', 'mubi']],
  ['Akwa Ibom', ['akwa ibom', 'uyo', 'eket']],
  ['Anambra', ['anambra', 'awka', 'onitsha', 'nnewi']],
  ['Bauchi', ['bauchi']],
  ['Bayelsa', ['bayelsa', 'yenagoa']],
  ['Benue', ['benue', 'makurdi']],
  ['Borno', ['borno', 'maiduguri']],
  ['Cross River', ['cross river', 'calabar']],
  ['Delta', ['delta state', 'asaba', 'warri', 'sapele', 'ughelli']],
  ['Ebonyi', ['ebonyi', 'abakaliki']],
  ['Edo', ['edo', 'benin city', 'auchi']],
  ['Ekiti', ['ekiti', 'ado-ekiti', 'ado ekiti']],
  ['Enugu', ['enugu', 'nsukka']],
  ['Gombe', ['gombe']],
  ['Imo', ['imo', 'owerri']],
  ['Jigawa', ['jigawa', 'dutse']],
  ['Kaduna', ['kaduna', 'zaria', 'kafanchan']],
  ['Kano', ['kano']],
  ['Katsina', ['katsina']],
  ['Kebbi', ['kebbi', 'birnin kebbi']],
  ['Kogi', ['kogi', 'lokoja', 'anyigba']],
  ['Kwara', ['kwara', 'ilorin']],
  ['Lagos', ['lagos', 'ikeja', 'lekki', 'victoria island', 'ikoyi', 'yaba', 'surulere', 'ajah', 'apapa', 'ikorodu', 'festac', 'gbagada', 'oshodi', 'agege', 'magodo', 'ojota', 'ogba', 'isolo', 'ilupeju', 'oregun', 'alausa', 'epe', 'badagry', 'egbeda', 'ikotun', 'sangotedo', 'obalende']],
  ['Nasarawa', ['nasarawa', 'nassarawa', 'lafia', 'keffi', 'karu']],
  ['Niger', ['niger state', 'minna', 'suleja', 'bida']],
  ['Ogun', ['ogun', 'abeokuta', 'sango ota', 'sango-ota', 'ota', 'ijebu', 'sagamu', 'shagamu', 'mowe', 'ibafo', 'ifo', 'agbara', 'ilaro']],
  ['Ondo', ['ondo', 'akure']],
  ['Osun', ['osun', 'osogbo', 'oshogbo', 'ile-ife', 'ile ife', 'ilesa', 'ilesha']],
  ['Oyo', ['oyo', 'ibadan', 'ogbomoso', 'iseyin']],
  ['Plateau', ['plateau state', 'jos']],
  ['Rivers', ['rivers state', 'port harcourt', 'port-harcourt', 'onne', 'bonny', 'eleme', 'obio-akpor', 'obio akpor']],
  ['Sokoto', ['sokoto']],
  ['Taraba', ['taraba', 'jalingo']],
  ['Yobe', ['yobe', 'damaturu', 'potiskum']],
  ['Zamfara', ['zamfara', 'gusau']],
  ['Abuja', ['abuja', 'fct', 'federal capital territory', 'garki', 'wuse', 'maitama', 'asokoro', 'gwarinpa', 'gwarimpa', 'kubwa', 'jabi', 'utako', 'lugbe', 'gwagwalada', 'jahi', 'katampe', 'lokogoma', 'durumi', 'mabushi', 'wuye', 'life camp', 'dutse alhaji']]
];

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = STATES.map(([name, words]) => [name, new RegExp(`(?:^|[^a-z])(${words.map(esc).join('|')})(?![a-z])`, 'i')]);

// The first state mentioned, in order of where it appears in the text.
function stateIn(text){
  if (!text) return null;
  let best = null, at = Infinity;
  for (const [name, re] of PATTERNS){
    const m = re.exec(text);
    if (m && m.index < at){ at = m.index; best = name; }
  }
  return best;
}

// Every state mentioned (for listings that name several).
function statesIn(text){
  if (!text) return [];
  return PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

// A job listing's state: the "Location:" line first, then the title, then the opening text.
function jobState(title = '', body = ''){
  const loc = body.match(/\b(?:job\s+)?locations?\s*[:\-–]\s*([^\n.;|]{2,80})/i);
  if (loc){
    if (/\b(nationwide|various|multiple|several|all states|across nigeria)\b/i.test(loc[1])) return { state: null, multi: true };
    const s = stateIn(loc[1]); if (s) return { state: s };
  }
  const t = stateIn(title); if (t) return { state: t };
  const b = stateIn(body.slice(0, 700)); if (b) return { state: b };
  if (/\b(nationwide|various locations|multiple locations|across nigeria)\b/i.test(body.slice(0, 1500))) return { state: null, multi: true };
  return { state: null };
}

const isRemote = text => /\b(remote|work from home|work-from-home|wfh|anywhere in the world|fully distributed)\b/i.test(text || '');

module.exports = { STATES: STATES.map(s => s[0]), stateIn, statesIn, jobState, isRemote };
