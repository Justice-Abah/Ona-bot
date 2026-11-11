// Ona feedback survey: https://ona-bot.vercel.app/api/survey
// Anyone can fill it in (no sign-in). Answers are saved in Ona's memory (Upstash Redis).
// See all answers: https://ona-bot.vercel.app/api/survey?key=YOUR_ADMIN_KEY
const NAME = process.env.BOT_NAME || 'Ona';
const KEY = 'ona:survey';
const R_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const R_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const mem = [];

async function redis(cmd){
  const r = await fetch(R_URL, { method: 'POST', headers: { Authorization: `Bearer ${R_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json(); if (j.error) throw new Error('Redis: ' + j.error); return j.result;
}
const hasRedis = () => !!(R_URL && R_TOKEN);
async function save(entry){ if (!hasRedis()){ mem.unshift(JSON.stringify(entry)); return; } await redis(['LPUSH', KEY, JSON.stringify(entry)]); }
async function all(){ const rows = hasRedis() ? (await redis(['LRANGE', KEY, '0', '999'])) || [] : mem; return rows.map(s => { try { return JSON.parse(s); } catch (e){ return null; } }).filter(Boolean); }

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TRIED = { full: 'Yes, all the way to my matches', part: 'Partly', not: 'Not yet' };
const RELEVANT = { very: 'Very relevant', some: 'Somewhat relevant', not: 'Not relevant', none: 'I didn’t get matches' };
const YESNO = { yes: 'Yes', maybe: 'Maybe', no: 'No' };

const STYLE = `<style>
:root{--bg:#F2F5F0;--card:#FFFFFF;--ink:#10241A;--muted:#4F6157;--line:#D9E2D8;--leaf:#167A4C;--leaf-ink:#FFFFFF;--soft:#E7F2EB;--warn:#9A3B1B}
@media(prefers-color-scheme:dark){:root{--bg:#0D1511;--card:#162019;--ink:#E7EFE9;--muted:#98A99E;--line:#2A3830;--leaf:#3CC184;--leaf-ink:#062014;--soft:#173326;--warn:#F08A64}}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--bg);color:var(--ink);font:16px/1.5 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:620px;margin:0 auto;padding:28px max(16px,env(safe-area-inset-right)) 56px max(16px,env(safe-area-inset-left));display:flex;flex-direction:column;gap:18px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:20px}
.dot{width:34px;height:34px;border-radius:50%;background:var(--leaf);color:var(--leaf-ink);display:grid;place-items:center;font-size:18px}
h1{font-size:26px;line-height:1.2;margin:0;text-wrap:balance}
.lead{margin:0;color:var(--muted)}
.try{background:var(--soft);border-radius:14px;padding:14px 16px;font-size:15px}
.try a{color:var(--leaf);font-weight:700}
form{display:flex;flex-direction:column;gap:14px}
fieldset,.field{border:1px solid var(--line);background:var(--card);border-radius:14px;padding:16px;margin:0;display:flex;flex-direction:column;gap:10px;min-width:0}
legend,label.q{font-weight:650;padding:0;font-size:16px}
legend{float:left;width:100%;margin-bottom:10px}fieldset>*:not(legend){clear:both}
.hint{font-weight:400;color:var(--muted);font-size:14px}
input[type=text],textarea{width:100%;font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:11px 12px}
textarea{min-height:92px;resize:vertical}
.opts{display:flex;flex-wrap:wrap;gap:8px}
.opts label{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:999px;padding:8px 14px;cursor:pointer;background:var(--bg);font-size:15px}
.opts input{accent-color:var(--leaf);margin:0}
.opts label:has(input:checked){border-color:var(--leaf);background:var(--soft);font-weight:600}
.stars{display:flex;gap:6px}
.stars label{flex:1;text-align:center;border:1px solid var(--line);border-radius:12px;padding:10px 0;cursor:pointer;background:var(--bg);font-weight:700;font-size:18px}
.stars input{position:absolute;opacity:0;pointer-events:none}
.stars label:has(input:checked){background:var(--leaf);color:var(--leaf-ink);border-color:var(--leaf)}
.stars label:has(input:focus-visible){outline:2px solid var(--leaf);outline-offset:2px}
.scale{display:flex;justify-content:space-between;font-size:13px;color:var(--muted)}
button{font:700 16px/1 inherit;font-family:inherit;background:var(--leaf);color:var(--leaf-ink);border:0;border-radius:999px;padding:15px 22px;cursor:pointer}
button:disabled{opacity:.6;cursor:default}
.err{color:var(--warn);font-size:14px;margin:0}
.hp{position:absolute;left:-9999px}
.done{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px;text-align:center}
.done h2{margin:0 0 6px}
:focus-visible{outline:2px solid var(--leaf);outline-offset:2px}
.foot{color:var(--muted);font-size:13px;text-align:center}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}th{color:var(--muted);font-size:12px;font-weight:600}
.wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:14px}
.kpis{display:flex;flex-wrap:wrap;gap:10px}.k{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px;min-width:130px}.k b{display:block;font-size:22px;font-variant-numeric:tabular-nums}
.bars{display:grid;gap:6px}.bar{display:grid;grid-template-columns:minmax(0,10rem) 1fr 2.5rem;gap:8px;align-items:center;font-size:14px}.bar i{display:block;height:10px;border-radius:5px;background:var(--leaf)}.bar span:last-child{text-align:right;font-variant-numeric:tabular-nums}
</style>`;

const radios = (name, map) => `<div class="opts">${Object.entries(map).map(([v, t]) => `<label><input type="radio" name="${name}" value="${v}" required> ${esc(t)}</label>`).join('')}</div>`;

const FORM = () => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${esc(NAME)} feedback</title>${STYLE}</head><body><main>
<div class="brand"><div class="dot">${esc(NAME.charAt(0))}</div>${esc(NAME)}</div>
<h1>Tell us what you think of ${esc(NAME)}</h1>
<p class="lead">8 quick questions, about 2 minutes. Your honest answers help us make ${esc(NAME)} better.</p>
<div class="try">Haven’t tried it yet? <a href="/api/chat" target="_blank" rel="noopener">Try ${esc(NAME)} here</a> first (5 minutes, no app needed), then come back.</div>
<form id="f" novalidate>
<div class="field"><label class="q" for="name">1. Your name</label><input type="text" id="name" name="name" maxlength="80" autocomplete="name" required></div>
<div class="field"><label class="q" for="contact">2. Phone or email <span class="hint">(optional, only if you’re happy for us to follow up)</span></label><input type="text" id="contact" name="contact" maxlength="120" autocomplete="email"></div>
<fieldset><legend>3. Did you try ${esc(NAME)}?</legend>${radios('tried', TRIED)}</fieldset>
<fieldset><legend>4. Overall, how would you rate ${esc(NAME)}?</legend>
<div class="stars">${[1, 2, 3, 4, 5].map(n => `<label>${n}<input type="radio" name="rating" value="${n}" required aria-label="${n} out of 5"></label>`).join('')}</div>
<div class="scale"><span>1 Poor</span><span>5 Excellent</span></div></fieldset>
<fieldset><legend>5. How relevant were the opportunities it showed you?</legend>${radios('relevant', RELEVANT)}</fieldset>
<div class="field"><label class="q" for="liked">6. What did you like? <span class="hint">(optional)</span></label><textarea id="liked" name="liked" maxlength="1500"></textarea></div>
<div class="field"><label class="q" for="improve">7. What should we improve?</label><textarea id="improve" name="improve" maxlength="1500" required placeholder="Anything confusing, missing, or that could work better"></textarea></div>
<fieldset><legend>8. Would you use ${esc(NAME)} on WhatsApp? <span class="hint">(optional)</span></legend><div class="opts">${Object.entries(YESNO).map(([v, t]) => `<label><input type="radio" name="whatsapp" value="${v}"> ${t}</label>`).join('')}</div></fieldset>
<input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<p class="err" id="err" hidden></p>
<button type="submit" id="go">Send feedback</button>
</form>
<div class="done" id="done" hidden><h2>Thank you! 🙏</h2><p>Your feedback has reached the ${esc(NAME)} team.</p><p><a href="/api/chat" style="color:var(--leaf);font-weight:700">Back to ${esc(NAME)}</a></p></div>
<p class="foot">We only use your answers to improve ${esc(NAME)}.</p>
</main><script>
var f=document.getElementById('f'),err=document.getElementById('err'),go=document.getElementById('go');
f.addEventListener('submit',function(e){e.preventDefault();err.hidden=true;
 var d=new FormData(f),o={};d.forEach(function(v,k){o[k]=String(v).trim()});
 var miss=[];if(!o.name)miss.push('your name');if(!o.tried)miss.push('question 3');if(!o.rating)miss.push('a rating');if(!o.relevant)miss.push('question 5');if(!o.improve)miss.push('what we should improve');
 if(miss.length){err.textContent='Please add '+miss.join(', ')+'.';err.hidden=false;return}
 go.disabled=true;go.textContent='Sending…';
 fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)}).then(function(r){return r.json()}).then(function(j){
  if(j.ok){f.hidden=true;document.getElementById('done').hidden=false;window.scrollTo(0,0)}else throw new Error(j.error||'x')})
 .catch(function(){err.textContent='That didn’t send. Check your internet and press Send again.';err.hidden=false;go.disabled=false;go.textContent='Send feedback'})});
</script></body></html>`;

function results(rows){
  const n = rows.length;
  const avg = n ? (rows.reduce((s, r) => s + (+r.rating || 0), 0) / n).toFixed(1) : '–';
  const tally = (field, map) => { const c = {}; rows.forEach(r => { if (r[field]) c[r[field]] = (c[r[field]] || 0) + 1; }); const max = Math.max(1, ...Object.values(c));
    return `<div class="bars">${Object.entries(map).map(([v, t]) => `<div class="bar"><span>${esc(t)}</span><i style="width:${((c[v] || 0) / max * 100).toFixed(0)}%"></i><span>${c[v] || 0}</span></div>`).join('')}</div>`; };
  const stars = { 5: '5', 4: '4', 3: '3', 2: '2', 1: '1' };
  const table = rows.map(r => `<tr><td>${esc((r.at || '').slice(0, 10))}</td><td><b>${esc(r.name)}</b><br><span class="hint">${esc(r.contact)}</span></td><td>${esc(r.rating)}/5</td><td>${esc(RELEVANT[r.relevant] || '')}</td><td>${esc(r.liked)}</td><td>${esc(r.improve)}</td><td>${esc(YESNO[r.whatsapp] || '')}</td><td>${esc(TRIED[r.tried] || '')}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(NAME)} survey results</title>${STYLE}<style>main{max-width:1100px}</style></head><body><main>
<h1>${esc(NAME)} survey results</h1><p class="lead">Newest first. Share the form: <b>ona-bot.vercel.app/api/survey</b></p>
<div class="kpis"><div class="k"><b>${n}</b>responses</div><div class="k"><b>${avg}</b>average rating /5</div></div>
<div class="field"><b>Rating</b>${tally('rating', stars)}</div>
<div class="field"><b>Were the opportunities relevant?</b>${tally('relevant', RELEVANT)}</div>
<div class="field"><b>Would they use it on WhatsApp?</b>${tally('whatsapp', YESNO)}</div>
<div class="field"><b>Did they try it?</b>${tally('tried', TRIED)}</div>
<div class="wrap"><table><tr><th>Date</th><th>Name</th><th>Rating</th><th>Relevance</th><th>Liked</th><th>Improve</th><th>WhatsApp?</th><th>Tried</th></tr>${table || '<tr><td colspan="8" class="hint">No responses yet.</td></tr>'}</table></div>
</main></body></html>`;
}

module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  if (req.method === 'GET'){
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (q.get('key')){
      if (!process.env.ADMIN_KEY || q.get('key') !== process.env.ADMIN_KEY){ res.status(401).send('Wrong key.'); return; }
      res.status(200).send(results(await all())); return;
    }
    res.status(200).send(FORM()); return;
  }
  if (req.method !== 'POST'){ res.status(405).send('Method not allowed'); return; }
  let b = req.body || {};
  if (typeof b === 'string'){ try { b = JSON.parse(b); } catch (e){ b = {}; } }
  if (b.website){ res.status(200).json({ ok: true }); return; } // a bot filled the hidden box
  const s = (v, n) => String(v || '').trim().slice(0, n);
  const entry = {
    at: new Date().toISOString(), name: s(b.name, 80), contact: s(b.contact, 120),
    tried: TRIED[b.tried] ? b.tried : '', rating: Math.min(5, Math.max(1, parseInt(b.rating, 10) || 0)) || '',
    relevant: RELEVANT[b.relevant] ? b.relevant : '', liked: s(b.liked, 1500), improve: s(b.improve, 1500), whatsapp: YESNO[b.whatsapp] ? b.whatsapp : ''
  };
  if (!entry.name || !entry.rating || !entry.improve){ res.status(400).json({ ok: false, error: 'missing' }); return; }
  try { await save(entry); res.status(200).json({ ok: true }); }
  catch (e){ console.error(e); res.status(500).json({ ok: false, error: 'save failed' }); }
};
