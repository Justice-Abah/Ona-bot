// Local test: plays a full conversation against Ona with in-memory storage.
// Run: ONA_TODAY=2026-11-08 node scripts/simulate.js
const ona = require('../lib/ona');

const phone = 'whatsapp:+2348000000000';
const script = process.argv.slice(2).length ? process.argv.slice(2) : [
  'hi', 'yes', 'SAMPLE', '26', '2', 'MORE', 'APPLY 1', 'DONE 1', 'DONE 2 3', 'STATUS',
  'LATER 2', 'SKIP 3', 'NEXT', 'NEXT 7', 'OPEN 1', 'what should my essay focus on?', 'SUBMITTED 1', 'RATE 4',
  'FEEDBACK reminders were helpful', 'NEXT 30', 'STATUS', 'HELP', 'STOP', 'status', 'START'
];

(async () => {
  for (const text of script){
    console.log(`\n\x1b[32m> ${text}\x1b[0m`);
    const out = await ona.handle({ phone, text, waName: 'Ada Tester' });
    out.forEach(m => console.log('\x1b[36m[Ona]\x1b[0m ' + m.replace(/\n/g, '\n      ')));
  }
})().catch(e => { console.error(e); process.exit(1); });
