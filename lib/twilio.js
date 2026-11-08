// Twilio helpers: signature check, TwiML replies, outbound sends, media download.
const crypto = require('crypto');

const SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_WHATSAPP_FROM; // e.g. whatsapp:+17372508034

function validSignature(req){
  if (!AUTH || process.env.SKIP_TWILIO_SIGNATURE === '1') return true;
  const sig = req.headers['x-twilio-signature'];
  if (!sig) return false;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const url = `https://${host}${req.url}`;
  const params = req.body || {};
  const data = Object.keys(params).sort().reduce((s, k) => s + k + params[k], url);
  const expected = crypto.createHmac('sha1', AUTH).update(Buffer.from(data, 'utf-8')).digest('base64');
  const a = Buffer.from(expected), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const xml = s => String(s).replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));

// WhatsApp messages over 1600 characters are rejected, so split long ones.
function chunk(text){
  const out = []; let rest = String(text);
  while (rest.length > 1500){
    let cut = rest.lastIndexOf('\n\n', 1500); if (cut < 500) cut = rest.lastIndexOf('\n', 1500); if (cut < 500) cut = 1500;
    out.push(rest.slice(0, cut)); rest = rest.slice(cut).replace(/^\s+/, '');
  }
  if (rest) out.push(rest);
  return out;
}

function twiml(messages){
  const parts = messages.flatMap(chunk).map(m => `<Message>${xml(m)}</Message>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${parts}</Response>`;
}

function canSend(){ return !!(SID && AUTH && FROM); }

async function send(to, body){
  if (!canSend()) throw new Error('Twilio sending is not configured');
  for (const part of chunk(body)){
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${SID}:${AUTH}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: FROM, To: to, Body: part })
    });
    if (!r.ok) throw new Error(`Twilio send failed (${r.status}): ${await r.text()}`);
  }
}

async function downloadMedia(url){
  const headers = SID && AUTH ? { Authorization: 'Basic ' + Buffer.from(`${SID}:${AUTH}`).toString('base64') } : {};
  const r = await fetch(url, { headers, redirect: 'follow' });
  if (!r.ok) throw new Error('Media download failed: ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

module.exports = { validSignature, twiml, canSend, send, downloadMedia };
