// Twilio calls this URL every time someone messages Ona on WhatsApp.
// Set it in Twilio as the "When a message comes in" webhook (method POST).
const ona = require('../lib/ona');
const store = require('../lib/store');
const tw = require('../lib/twilio');
const files = require('../lib/files');

module.exports = async (req, res) => {
  if (req.method === 'GET'){
    res.status(200).send(`Ona is running. Memory connected: ${store.hasRedis() ? 'yes' : 'NO (add Upstash Redis in Vercel Storage)'}.`);
    return;
  }
  if (req.method !== 'POST'){ res.status(405).send('Method not allowed'); return; }

  if (!tw.validSignature(req)){
    console.warn('Rejected: Twilio signature check failed. Check the webhook URL in Twilio matches exactly.');
    res.status(403).send('Invalid signature');
    return;
  }

  const b = req.body || {};
  const phone = b.From;                       // e.g. whatsapp:+2348012345678

  let messages;
  try {
    if (!store.hasRedis()) {
      messages = ['⚙️ Ona is almost ready, but its memory isn’t connected yet. (Setup: add Upstash Redis in the Vercel project’s Storage tab, then redeploy.)'];
    } else {
      let text = b.Body || '';
      if (+b.NumMedia > 0){
        // A file was sent (PDF, Word, photo…): turn it into text and treat it like a pasted CV.
        const r = await files.extract({ buffer: await tw.downloadMedia(b.MediaUrl0), type: b.MediaContentType0 || '', name: b.Body || '' });
        if (r.error) messages = [r.error];
        else text = r.text;
      }
      if (!messages) messages = await ona.handle({ phone, text, waName: b.ProfileName || '' });
    }
  } catch (e){
    console.error(e);
    messages = ['Sorry, something went wrong on my side. Please try again in a minute.'];
  }
  // Twilio's newer "Try out WhatsApp" webhook does not deliver TwiML replies, so by default
  // Ona sends its replies through the Twilio API (needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
  // TWILIO_WHATSAPP_FROM). Set REPLY_MODE=twiml to reply with TwiML instead.
  const useApi = process.env.REPLY_MODE !== 'twiml' && tw.canSend();
  if (useApi){
    for (const m of messages){
      try { await tw.send(phone, m); }
      catch (e){ console.error('Reply via API failed:', e.message); break; }
    }
    console.log(`Replied to ${ona.mask(phone)} with ${messages.length} message(s) via API`);
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    return;
  }
  if (!tw.canSend()) console.warn('Twilio API settings missing; replying with TwiML.');
  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(tw.twiml(messages));
};
