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
      return xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<\/w:p>/g, '\n')
        .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
    }
    p += 46 + nlen + elen + clen;
  }
  throw new Error('No text found in .docx');
}

async function pdfText(buf){
  const { getDocumentProxy, extractText } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text || '').replace(/[ \t]+\n/g, '\n').trim();
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

// Returns { text } on success, or { error: '...friendly message...' }.
async function extract({ buffer, type, name }){
  if (!buffer || !buffer.length) return { error: 'That file looks empty. Try sending it again.' };
  if (buffer.length > MAX_BYTES) return { error: 'That file is too big (over 4 MB). Try a smaller PDF, or paste your CV as text.' };
  const k = kind(type, name);
  try {
    if (k === 'text') return { text: buffer.toString('utf8') };
    if (k === 'docx') return { text: docxText(buffer) };
    if (k === 'doc') return { error: 'I can’t read old Word (.doc) files. Please save it as .docx or PDF and send it again, or paste the text.' };
    if (k === 'pdf'){
      let text = '';
      try { text = await pdfText(buffer); } catch (e){ console.error('PDF read failed:', e.message); }
      if (text.length >= 80) return { text };
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

module.exports = { extract, kind, docxText, MAX_BYTES };
