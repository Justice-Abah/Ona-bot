# Ona bot (test version)

Ona is a WhatsApp coach that matches people to scholarships, fellowships and jobs from their CV, then keeps reminding them until they apply.

This version runs on the **Twilio WhatsApp Sandbox** and is hosted on **Vercel**. When Meta business verification is done, the same logic moves to Ona's own WhatsApp number.

## What's in here

| File | What it does |
|---|---|
| `api/whatsapp.js` | Twilio calls this every time a tester messages Ona |
| `api/cron.js` | Runs daily at 08:00 Lagos time and sends due reminders |
| `api/stats.js` | Test results dashboard: `/api/stats?key=YOUR_ADMIN_KEY` |
| `lib/ona.js` | Ona's brain: onboarding, CV profile, matching, checklists, reminders |
| `lib/opportunities.js` | **The opportunity list. Edit this to add or update opportunities.** |
| `lib/store.js` | Memory (Upstash Redis) |
| `lib/ai.js` | Optional AI for reading CVs (including PDFs) and answering questions |

## Settings (Vercel → Project → Settings → Environment Variables)

| Name | Needed? | Value |
|---|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | **Yes** | Added automatically when you connect Upstash Redis in the Storage tab |
| `TWILIO_AUTH_TOKEN` | Recommended | From the Twilio Console home page. Lets Ona reject fake requests |
| `TWILIO_ACCOUNT_SID` | For daily reminders | From the Twilio Console home page (starts with AC) |
| `TWILIO_WHATSAPP_FROM` | For daily reminders | `whatsapp:+17372508034` (the sandbox number) |
| `ADMIN_KEY` | For the dashboard | Any password you choose |
| `CRON_SECRET` | Optional | Any long random text; protects the daily reminder job |
| `ANTHROPIC_API_KEY` | Optional | Turns on AI CV reading, PDF CVs and free questions |
| `ANTHROPIC_MODEL` | Optional | Defaults to `claude-haiku-4-5` |

After changing settings, redeploy (Deployments → ⋯ → Redeploy).

## Connect to Twilio

In the Twilio sandbox settings, set **When a message comes in** to:

`https://YOUR-PROJECT.vercel.app/api/whatsapp` with method **POST**.

Check it's live by opening that address in a browser. It should say "Ona is running. Memory connected: yes."

## What testers can send

`YES` · `SAMPLE` · `MATCHES` · `MORE` · `APPLY 2` · `LATER 2` · `SKIP 2` · `ASK 2 question` · `OPEN 2` · `DONE 1` · `SUBMITTED 2` · `SNOOZE 2` · `STATUS` · `NEXT` / `NEXT 7` (test mode: jump ahead in time) · `TODAY` · `REALTIME` · `FEEDBACK text` · `RATE 1-5` · `HELP` · `STOP` / `START` · `RESET`

## Troubleshooting

- **No reply at all:** open the Vercel project → Logs. If you see "signature check failed", the webhook URL in Twilio must match exactly (https, no trailing slash). As a quick test you can add `SKIP_TWILIO_SIGNATURE` = `1`.
- **"memory isn't connected":** connect Upstash Redis in Vercel → Storage, then redeploy.
- **Sandbox stopped replying:** sandbox sessions expire 3 days after joining. Send `join twilio-trial` again.

## Test locally

`ONA_TODAY=2026-11-08 node scripts/simulate.js` plays a full conversation with in-memory storage.
