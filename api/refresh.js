// Fetches fresh opportunities from all sources (lib/feeds.js).
// Runs by itself every morning (see vercel.json). To run it now and see what came in, open:
// https://ona-bot.vercel.app/api/refresh?key=YOUR_ADMIN_KEY
const feeds = require('../lib/feeds');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const admin = process.env.ADMIN_KEY && q.get('key') === process.env.ADMIN_KEY;
  const secret = process.env.CRON_SECRET;
  const cron = secret ? req.headers.authorization === `Bearer ${secret}` : /vercel-cron/i.test(req.headers['user-agent'] || '');
  if (!admin && !cron){ res.status(401).send('Add ?key=YOUR_ADMIN_KEY to the address.'); return; }

  // ?view=1 shows the current list without fetching again.
  const data = q.get('view') ? await feeds.info() : await feeds.refresh();
  if (cron && !admin){ res.status(200).json({ ok: true, items: data.items.length, report: data.report }); return; }

  const items = data.items || [];
  const by = k => items.reduce((m, o) => (m[o[k]] = (m[o[k]] || 0) + 1, m), {});
  const kinds = by('type'); const srcs = by('source');
  const rep = (data.report || []).map(r => `<tr><td>${esc(r.name)}</td><td>${r.ok ? '✅ working' : '❌ failed'}</td><td class="n">${r.ok ? r.found : ''}</td><td class="n">${srcs[r.name] || 0}</td><td class="m">${esc(r.error || '')}</td></tr>`).join('');
  const list = items.slice(0, 400).map(o => `<tr><td><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.title)}</a><div class="m">${esc(o.org)}${o.location ? ' · ' + esc(o.location) : ''}</div></td><td>${esc(o.type)}</td><td>${o.estimated ? '<span class="m">not listed</span>' : esc(o.deadline)}</td><td class="m">${esc((o.fields || []).slice(0, 4).join(', '))}</td><td class="m">${esc(o.source)}</td></tr>`).join('');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ona opportunities</title>
<style>:root{--bg:#F6F7F4;--card:#fff;--ink:#16233B;--m:#5B677A;--line:#E2E6DF;--leaf:#167A4C}
@media(prefers-color-scheme:dark){:root{--bg:#0F1512;--card:#18201C;--ink:#E8EEEA;--m:#93A39A;--line:#2A3530;--leaf:#3CCB86}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px}
.m{color:var(--m);font-size:12.5px}.kpis{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
.k{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px;min-width:120px}.k b{display:block;font-size:22px}
.t{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}table{border-collapse:collapse;width:100%}
td,th{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:12px;color:var(--m);font-weight:600}
.n{text-align:right;font-variant-numeric:tabular-nums}a{color:var(--leaf);font-weight:600;text-decoration:none}
.btn{display:inline-block;margin-top:12px;padding:8px 14px;border-radius:999px;background:var(--leaf);color:#fff}</style></head><body><main>
<h1>Ona’s live opportunities</h1><div class="m">Last updated ${esc((data.updated || '').slice(0, 16).replace('T', ' '))} UTC · refreshes by itself every morning</div>
<div class="kpis"><div class="k"><b>${items.length}</b>open listings</div>${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="k"><b>${n}</b>${esc(k)}</div>`).join('')}</div>
<a class="btn" href="?key=${esc(q.get('key') || '')}">Refresh now</a>
<h2>Sources</h2><div class="t"><table><tr><th>Source</th><th>Status</th><th class="n">Found today</th><th class="n">In Ona now</th><th>Note</th></tr>${rep}</table></div>
<h2>Listings ${items.length > 400 ? '(first 400)' : ''}</h2><div class="t"><table><tr><th>Opportunity</th><th>Type</th><th>Deadline</th><th>Matches people in</th><th>Found on</th></tr>${list || '<tr><td class="m" colspan="5">Nothing yet.</td></tr>'}</table></div>
</main></body></html>`);
};
