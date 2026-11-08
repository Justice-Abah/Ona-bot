// Optional AI (Claude). Ona works without it: CV reading falls back to keyword rules,
// and questions point people to the official page.
// To turn it on, add ANTHROPIC_API_KEY (and optionally ANTHROPIC_MODEL) in Vercel.

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

function enabled(){ return !!KEY; }

async function call(content, maxTokens = 700){
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content }] })
  });
  if (!r.ok) throw new Error(`AI request failed (${r.status}): ${await r.text()}`);
  const j = await r.json();
  return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

function json(text){
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

const PROFILE_PROMPT = `Extract an applicant profile from this CV. Return ONLY JSON with these keys:
{"name": string, "level": one of "secondary","undergraduate","bachelors","masters","phd" (highest completed qualification; "undergraduate" if still studying for a first degree; treat HND as "bachelors"), "field": short string, "skills": array of up to 8 short strings, "years_experience": number (estimate, internships included), "leadership": boolean (led teams, founded something, or held a leadership role), "summary": one sentence}`;

async function profileFromText(text){
  return json(await call(`${PROFILE_PROMPT}\nCV:\n${text}`));
}

async function profileFromPdf(buffer){
  return json(await call([
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } },
    { type: 'text', text: PROFILE_PROMPT }
  ]));
}

async function answer({ question, profile, age, today, opp, applying }){
  const prompt = `You are Ona, a WhatsApp assistant that helps African applicants finish scholarship, fellowship and job applications. Today is ${today}.
Reply in a warm, short WhatsApp style: at most 110 words, plain sentences, *single asterisks* for bold sparingly, no headings.
Never invent programme-specific facts such as exact deadlines, age limits, required documents or stipends. If the answer depends on the programme's rules, say what is usually true and tell them to confirm on the official page.
Applicant profile: ${JSON.stringify({ ...profile, age })}
Applications in progress: ${JSON.stringify(applying)}
Programme in focus: ${opp ? JSON.stringify({ title: opp.title, org: opp.org, type: opp.type, deadline: opp.deadline, deadlineNote: opp.deadlineNote || '', official_url: opp.url }) : 'none'}
Question: ${question}`;
  return (await call(prompt, 400)).trim();
}

module.exports = { enabled, profileFromText, profileFromPdf, answer };
