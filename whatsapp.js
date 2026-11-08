// Twilio calls this URL every time someone messages Ona on WhatsApp.
// Set it in Twilio as the "When a message comes in" webhook (method POST).
const ona = require('../lib/ona');
const store = require('../lib/store');
const tw = require('../lib/twilio');

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
  const media = +b.NumMedia > 0 ? { type: b.MediaContentType0, load: () => tw.downloadMedia(b.MediaUrl0) } : null;

  let messages;
  try {
    if (!store.hasRedis()) {
      messages = ['⚙️ Ona is almost ready, but its memory isn’t connected yet. (Setup: add Upstash Redis in the Vercel project’s Storage tab, then redeploy.)'];
    } else {
      messages = await ona.handle({ phone, text: b.Body || '', waName: b.ProfileName || '', media });
    }
  } catch (e){
    console.error(e);
    messages = ['Sorry, something went wrong on my side. Please try again in a minute.'];
  }
  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(tw.twiml(messages));
};
