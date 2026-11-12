// Reads a public portfolio link (GitHub, Behance, a personal website…) into plain text,
// so Ona can understand someone's work even without a CV. No AI needed.
// LinkedIn and some other sites hide pages behind a login, so they can't be read.

const UA = 'Mozilla/5.0 (compatible; OnaBot/1.0; reads public portfolio pages to match opportunities)';
const LOGIN_WALLED = /linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|tiktok\.com/i;

async function get(url, json){
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/vnd.github+json' : 'text/html,*/*' }, signal: ctrl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (json) return r.json();
    const text = await r.text();
    return text.slice(0, 400000);
  } finally { clearTimeout(t); }
}

const decode = s => String(s || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const meta = (html, name) => { const m = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i')); return m ? decode(m[1]) : ''; };

// GitHub: the public API gives the bio, location and the languages and topics of their projects.
async function readGitHub(user){
  const p = await get(`https://api.github.com/users/${encodeURIComponent(user)}`, true);
  let repos = [];
  try { repos = await get(`https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=updated`, true); } catch (e){}
  const own = (Array.isArray(repos) ? repos : []).filter(r => !r.fork);
  const count = {}; own.forEach(r => { if (r.language) count[r.language] = (count[r.language] || 0) + 1; });
  const langs = Object.entries(count).sort((a, b) => b[1] - a[1]).map(([l]) => l).slice(0, 8);
  const topics = [...new Set(own.flatMap(r => r.topics || []))].slice(0, 15);
  const years = p.created_at ? Math.max(0, new Date().getFullYear() - +p.created_at.slice(0, 4)) : 0;
  const text = [p.name || user, p.location || '', p.bio || '', p.company ? `Works at ${p.company}` : '',
    'Software developer', `Skills: ${[...langs, ...topics].join(', ')}`,
    own.slice(0, 12).map(r => `${r.name}: ${r.description || ''}`).join('\n')].filter(Boolean).join('\n');
  return { text, name: p.name || '', location: p.location || '', skills: [...langs, ...topics.slice(0, 6)], note: years ? `GitHub account since ${p.created_at.slice(0, 4)}` : '' };
}

// Any other public page: title, description, headings and the opening text.
async function readPage(url){
  const html = await get(url);
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  const desc = meta(html, 'description') || meta(html, 'og:description');
  const ogTitle = meta(html, 'og:title');
  const heads = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map(m => decode(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 25);
  const body = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 5000);
  const name = (ogTitle || title).split(/[|–—-]/)[0].trim().slice(0, 60);
  return { text: [ogTitle || title, desc, heads.join('\n'), body].filter(Boolean).join('\n'), name, location: '', skills: [], note: '' };
}

// Returns { ok, text, name, location, skills, note } or { ok:false, reason }.
async function read(url){
  try {
    if (LOGIN_WALLED.test(url)) return { ok: false, reason: 'login' };
    const gh = url.match(/github\.com\/([A-Za-z0-9-]{1,39})\/?(?:$|[?#])/i);
    const r = gh ? await readGitHub(gh[1]) : await readPage(url);
    if (!r.text || r.text.replace(/\s/g, '').length < 40) return { ok: false, reason: 'empty' };
    return { ok: true, ...r };
  } catch (e){
    console.error('Portfolio read failed:', url, e.message);
    return { ok: false, reason: 'unreachable' };
  }
}

module.exports = { read };
