// Turns a CV file into text: PDF, Word (.docx), plain text, and (with AI turned on) photos/scans.
const zlib = require('zlib');

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const MAX_BYTES = 4 * 1024 * 1024;

function kind(type = '', name = ''){
  const t = type.toLowerCase(), n = name.toLowerCase();
  if (t.includes('pdf') || n.endsWith('.pdf')) return 'pdf';
  if (t.includes('wordprocessingml') || n.endsWith('.docx')) return 'docx';
  if (t === 'application/msword' || n.endsWith('.doc')) return 'doc';
  if (t.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(n)) return 'image';
  if (t.startsWith('text/') || n.endsWith('.txt')) return 'text';
  return 'other';
}

// Every file inside a .docx (it is a zip). Returns [{ name, data }] for the names asked for.
function zipFiles(buf, want){
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50){ eocd = i; break; }
  if (eocd < 0) return [];
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16); const out = [];
  for (let i = 0; i < count; i++){
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42); const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    if (want(name)){
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.slice(start, start + csize);
      try { out.push({ name, data: method === 8 ? zlib.inflateRawSync(data) : data }); } catch (e){}
    }
    p += 46 + nlen + elen + clen;
  }
  return out;
}

// A Word file whose CV is saved as pictures: with AI on, read the biggest pictures (the text blocks).
async function docxPictures(buf){
  const imgs = zipFiles(buf, n => /^word\/media\/.+\.(png|jpe?g)$/i.test(n)).filter(f => f.data.length > 4000)
    .sort((a, b) => b.data.length - a.data.length).slice(0, 8);
  if (!imgs.length) return '';
  const blocks = imgs.map(f => ({ type: 'image', source: { type: 'base64', media_type: /png$/i.test(f.name) ? 'image/png' : 'image/jpeg', data: f.data.toString('base64') } }));
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, messages: [{ role: 'user', content: [...blocks, { type: 'text', text: 'These images are parts of one CV/résumé. Transcribe all their text as plain text, putting the name and contact details first, then the sections in a sensible order. Output only the text.' }] }] })
  });
  if (!r.ok) throw new Error(`AI request failed (${r.status})`);
  const j = await r.json();
  return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

// Minimal .docx reader: a .docx is a zip; the text lives in word/document.xml.
function docxText(buf){
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50){ eocd = i; break; }
  if (eocd < 0) throw new Error('Not a valid .docx file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++){
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    if (name === 'word/document.xml'){
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.slice(start, start + csize);
      const xml = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
      // Only real text runs (<w:t>), so drawing positions and shape data never leak in as "text".
      const out = [];
      const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<\/w:p>/g;
      let m;
      while ((m = re.exec(xml))){
        if (m[1] !== undefined) out.push(m[1]);
        else out.push(m[0] === '<w:tab/>' ? '\t' : '\n');
      }
      return out.join('').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    p += 46 + nlen + elen + clen;
  }
  throw new Error('No text found in .docx');
}

async function pdfText(buf){
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const pages = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 6); i++){
    const content = await (await pdf.getPage(i)).getTextContent();
    // Rebuild real lines from the text pieces' positions, so sections and dates stay on their lines.
    const rows = [];
    for (const it of content.items){
      if (!('str' in it)) continue;
      const y = Math.round(it.transform[5]); const x = it.transform[4];
      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if (!row){ row = { y, parts: [] }; rows.push(row); }
      row.parts.push({ x, w: it.width || 0, size: Math.abs(it.transform[0]) || 10, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    // Join pieces that touch without a space ("202" + "5" is 2025, "S" + "tudent" is Student); add a space only at real gaps.
    const join = parts => parts.sort((a, b) => a.x - b.x).reduce((acc, p, i, arr) => {
      if (!i) return p.s;
      const prev = arr[i - 1]; const gap = p.x - (prev.x + prev.w);
      const touching = prev.w > 0 && gap < p.size * 0.15;
      return acc + (touching || /\s$/.test(acc) || /^\s/.test(p.s) ? '' : ' ') + p.s;
    }, '');
    pages.push(rows.map(r => join(r.parts).replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n'));
  }
  return pages.join('\n').trim();
}

async function aiTranscribe(buf, mediaType, isPdf){
  const block = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: buf.toString('base64') } };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: 'user', content: [block, { type: 'text', text: 'Transcribe all the text in this CV/résumé as plain text, keeping its order. Output only the text.' }] }] })
  });
  if (!r.ok) throw new Error(`AI request failed (${r.status})`);
  const j = await r.json();
  return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

// Real words in the text: enough to be a CV, not numbers or scraps.
function readable(text){
  const words = (String(text || '').match(/[A-Za-z][A-Za-z'’-]+/g) || []);
  const letters = (String(text || '').match(/[A-Za-z]/g) || []).length;
  return words.length >= 40 && letters / Math.max(1, String(text).replace(/\s/g, '').length) >= 0.6;
}
const PICTURE_TEXT = 'I can’t read the text in that file. Its words are saved as pictures, which often happens when a PDF is converted to Word or a CV is made in Canva. Please send the original PDF, a Word file you typed, or paste your CV as text.';

// Returns { text } on success, or { error: '...friendly message...' }.
async function extract({ buffer, type, name }){
  if (!buffer || !buffer.length) return { error: 'That file looks empty. Try sending it again.' };
  if (buffer.length > MAX_BYTES) return { error: 'That file is too big (over 4 MB). Try a smaller PDF, or paste your CV as text.' };
  const k = kind(type, name);
  try {
    if (k === 'text') return { text: buffer.toString('utf8') };
    if (k === 'docx'){
      const text = docxText(buffer);
      if (readable(text)) return { text };
      if (KEY){ try { const t = await docxPictures(buffer); if (readable(t)) return { text: t }; } catch (e){ console.error('Word pictures read failed:', e.message); } }
      return { error: PICTURE_TEXT };
    }
    if (k === 'doc') return { error: 'I can’t read old Word (.doc) files. Please save it as .docx or PDF and send it again, or paste the text.' };
    if (k === 'pdf'){
      let text = '';
      try { text = await pdfText(buffer); } catch (e){ console.error('PDF read failed:', e.message); }
      if (readable(text)) return { text };
      if (KEY) return { text: await aiTranscribe(buffer, 'application/pdf', true) };
      return { error: 'That PDF looks like a scan or photo, so I can’t read its text yet. Please send a PDF made from Word or Google Docs, or paste your CV as text.' };
    }
    if (k === 'image'){
      if (!KEY) return { error: 'I can’t read photos of CVs yet in this test version. Please send it as a PDF or Word file, or paste the text.' };
      const mt = /png/i.test(type) || /\.png$/i.test(name) ? 'image/png' : /webp/i.test(type) ? 'image/webp' : /gif/i.test(type) ? 'image/gif' : 'image/jpeg';
      return { text: await aiTranscribe(buffer, mt, false) };
    }
    return { error: 'I can read CVs as PDF, Word (.docx), or pasted text. Please send one of those.' };
  } catch (e){
    console.error('File read failed:', e.message);
    return { error: 'I couldn’t read that file. Please try a PDF or Word file, or paste your CV as text.' };
  }
}

module.exports = { extract, kind, docxText, readable, MAX_BYTES };
