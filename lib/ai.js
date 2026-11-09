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

const PROFILE_SCHEMA = `{"name": string,
 "level": one of "secondary","undergraduate","bachelors","masters","phd" (the HIGHEST qualification COMPLETED; "undergraduate" only if still studying for a first degree; HND, B.Sc., B.A., B.Eng., B.Tech, LL.B, MBBS count as "bachelors"; M.Sc., M.A., MBA, M.Eng, LL.M count as "masters"),
 "field": the main professional/academic field in 1-4 words (e.g. "Statistics", "Software Engineering", "Public Health"),
 "fields": array of up to 4 related fields or industries the person has worked or studied in,
 "years_experience": number of years of work experience including internships, NYSC and freelance work (add up the roles, do not double-count overlapping years; current roles run to today),
 "roles": array of up to 8 {"title": string, "organisation": string, "start": "YYYY" or "", "end": "YYYY" or "present"} newest first,
 "education": array of up to 4 {"degree": string, "institution": string, "year": "YYYY" or ""},
 "skills": array of up to 15 short skills actually stated or clearly demonstrated in the CV (tools, technical and professional skills; no generic filler),
 "leadership": boolean (led a team, founded something, or held an elected/leadership role),
 "summary": one sentence describing the person}`;

const RULES = `Read the WHOLE CV carefully, including every section. Use only facts written in the CV; never guess or invent. If something is missing use "" or [].`;

async function profileFromText(text){
  return json(await call(`Extract an applicant profile from this CV. ${RULES} Today is ${new Date().toISOString().slice(0, 10)}.\nReturn ONLY JSON in this shape:\n${PROFILE_SCHEMA}\n\nCV:\n${text}`, 1500));
}

async function profileFromPdf(buffer){
  return json(await call([
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } },
    { type: 'text', text: `Extract an applicant profile from this CV. ${RULES}\nReturn ONLY JSON in this shape:\n${PROFILE_SCHEMA}` }
  ], 1500));
}

// Applies the person's own correction ("my field is data science, add Power BI") to their profile.
async function correctProfile(profile, correction){
  return json(await call(`Here is an applicant profile as JSON:\n${JSON.stringify(profile)}\n\nThe applicant says this needs fixing: "${correction}"\nApply ONLY what they asked to change and keep everything else the same. Keep the same JSON shape:\n${PROFILE_SCHEMA}\nReturn ONLY the updated JSON.`, 1500));
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

module.exports = { enabled, profileFromText, profileFromPdf, correctProfile, answer };
