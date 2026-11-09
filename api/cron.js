// Runs once a day (see vercel.json) and sends due reminders to everyone.
// Note: on the Twilio sandbox and WhatsApp in general, free-form messages only reach
// people who messaged Ona in the last 24 hours. Others need approved templates (pilot phase).
const ona = require('../lib/ona');
const store = require('../lib/store');
const tw = require('../lib/twilio');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`){ res.status(401).send('Unauthorized'); return; }
  if (!store.hasRedis() || !tw.canSend()){ res.status(200).json({ ok: false, reason: 'Memory or Twilio sending not configured' }); return; }

  await ona.prepare(); // load today's live opportunities
  const report = { users: 0, sent: 0, failed: 0 };
  for (const phone of await store.allPhones()){
    const u = await store.getUser(phone); if (!u) continue;
    report.users++;
    const msgs = ona.runDue(u);
    for (const m of msgs){
      try { await tw.send(phone, m); report.sent++; await store.count('reminders_sent'); }
      catch (e){ report.failed++; console.error(`Send to ${ona.mask(phone)} failed:`, e.message); }
    }
    await store.saveUser(u);
  }
  res.status(200).json({ ok: true, ...report });
};
