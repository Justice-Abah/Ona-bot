// Test results dashboard: /api/stats?key=YOUR_ADMIN_KEY
const store = require('../lib/store');
const ona = require('../lib/ona');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

module.exports = async (req, res) => {
  const key = process.env.ADMIN_KEY;
  const given = new URL(req.url, 'http://x').searchParams.get('key');
  if (!key || given !== key){ res.status(401).send('Add ?key=YOUR_ADMIN_KEY to the address. Set ADMIN_KEY in Vercel first.'); return; }

  const s = await store.stats();
  const users = [];
  for (const p of await store.allPhones()){ const u = await store.getUser(p); if (u) users.push(u); }
  const fb = await store.feedback(100);

  const st = u => Object.values(u.status || {});
  const funnel = [
    ['Started a chat', users.length],
    ['Said YES', users.filter(u => u.stage !== 'consent').length],
    ['Shared a CV', users.filter(u => u.profile).length],
    ['Got matches', users.filter(u => (u.matches || []).length).length],
    ['Committed to apply', users.filter(u => st(u).some(x => ['applying', 'submitted', 'missed'].includes(x))).length],
    ['Submitted at least one', users.filter(u => st(u).includes('submitted')).length]
  ];
  const top = Math.max(1, funnel[0][1]);
  const avg = s.ratings ? (s.rating_total / s.ratings).toFixed(1) : '–';

  const rows = users.sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || '')).map(u => {
    const v = st(u); const steps = Object.values(u.tasks || {}).flat();
    return `<tr><td>${esc(ona.mask(u.phone))}</td><td>${esc((u.profile && u.profile.name) || u.waName || '')}</td><td>${esc(u.stage)}</td>
      <td>${u.profile ? (u.usedSample ? 'sample' : 'own') : '–'}</td><td class="n">${(u.matches || []).length}</td>
      <td class="n">${v.filter(x => x === 'applying').length}</td><td class="n">${v.filter(x => x === 'submitted').length}</td>
      <td class="n">${v.filter(x => x === 'declined').length}</td><td class="n">${steps.filter(x => x.done).length}/${steps.length}</td>
      <td class="n">${(u.ratings || []).join(', ') || '–'}</td><td>${esc((u.lastSeen || '').slice(0, 16).replace('T', ' '))}</td></tr>`;
  }).join('');

  const fbHtml = fb.map(f => `<li><b>${esc(f.name || f.phone)}</b> <span class="m">${esc((f.at || '').slice(0, 10))}${f.stage ? ' · ' + esc(f.stage) : ''}</span><br>${f.rating ? `Rated <b>${f.rating}/5</b>` : esc(f.text)}</li>`).join('') || '<li class="m">No feedback yet.</li>';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ona test results</title><style>
:root{--bg:#F4F6F3;--card:#fff;--ink:#16233B;--m:#5B677A;--line:#DCE2DA;--g:#167A4C}
@media(prefers-color-scheme:dark){:root{--bg:#0E151C;--card:#151F29;--ink:#E5ECF2;--m:#93A1B2;--line:#25313D;--g:#3FBF7F}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px max(16px,4vw)}
h1{margin:0 0 4px;font-size:28px}h2{font-size:17px;margin:0 0 12px}.m{color:var(--m);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:20px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;min-width:0}
.k b{display:block;font-size:30px;font-variant-numeric:tabular-nums}.bar{height:8px;background:var(--line);border-radius:4px;overflow:hidden;margin-top:6px}.bar i{display:block;height:100%;background:var(--g)}
.f{display:grid;grid-template-columns:200px 1fr 50px;gap:10px;align-items:center;margin:8px 0}.n{text-align:right;font-variant-numeric:tabular-nums}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}th{color:var(--m);font-weight:600}
ul{list-style:none;padding:0;margin:0}li{padding:10px 0;border-bottom:1px solid var(--line)}
@media(max-width:600px){.f{grid-template-columns:1fr 50px}.f .bar{grid-column:1/-1}}
</style></head><body>
<h1>Ona test results</h1><p class="m">Live from the bot · ${new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })} Lagos time</p>
<div class="grid">
<div class="card k"><span class="m">Testers</span><b>${users.length}</b></div>
<div class="card k"><span class="m">Committed to apply</span><b>${s.applying || 0}</b></div>
<div class="card k"><span class="m">Submitted</span><b>${s.submitted || 0}</b></div>
<div class="card k"><span class="m">Average rating</span><b>${avg}</b></div>
<div class="card k"><span class="m">Questions asked</span><b>${s.questions || 0}</b></div>
<div class="card k"><span class="m">Skipped matches</span><b>${s.skipped || 0}</b></div>
</div>
<div class="card"><h2>Funnel</h2>${funnel.map(([l, n]) => `<div class="f"><span>${l}</span><div class="bar"><i style="width:${Math.round(n / top * 100)}%"></i></div><span class="n">${n}</span></div>`).join('')}</div>
<div class="card" style="margin-top:12px"><h2>Testers</h2><div class="wrap"><table><tr><th>Phone</th><th>Name</th><th>Stage</th><th>CV</th><th class="n">Matches</th><th class="n">Applying</th><th class="n">Submitted</th><th class="n">Skipped</th><th class="n">Steps done</th><th class="n">Ratings</th><th>Last seen (UTC)</th></tr>${rows || '<tr><td colspan="11" class="m">No testers yet.</td></tr>'}</table></div></div>
<div class="card" style="margin-top:12px"><h2>Feedback</h2><ul>${fbHtml}</ul></div>
</body></html>`);
};
