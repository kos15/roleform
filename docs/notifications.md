# Notifications & the installable app — setup (F29)

What it takes to switch on round reminders in an environment. Behaviour is specified in
`specs.md` §F29; this is the runbook.

## 1. Keys (once per environment)

```bash
pnpm push:keys            # prints NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
openssl rand -hex 32      # → CRON_SECRET
```

Set on Vercel (Production and Preview **separately** — never share keys across environments) and in
`.env.local`:

| Variable | Exposed to browser | Notes |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | yes | Baked in at build time — redeploy after setting it. |
| `VAPID_PRIVATE_KEY` | **no** | Signs every push. Rotating it invalidates every subscription. |
| `VAPID_SUBJECT` | no | `mailto:` or `https:` contact for push services. Defaults to support. |
| `CRON_SECRET` | **no** | 32+ chars. Unset → the reminder route refuses every call. |

## 2. Database

The migration `20261011000000_interview_rounds_push` runs with every deploy (`pnpm build` runs
`prisma migrate deploy` and `pnpm db:policies`), which also turns RLS on for the three new tables.
Study-plan alerts (F30, `20261014000000_study_plans`) ride the same route and scheduler — nothing
extra to install; the sender settles `study_reminders` in the same call, after round reminders.

## 3. The scheduler (once per environment, and after rotating `CRON_SECRET`)

```bash
APP_URL=https://roleform.koustubh.org pnpm db:schedule
```

Installs a Supabase **pg_cron** job (`roleform-round-reminders`, every 5 minutes) that calls
`GET /api/cron/reminders` through **pg_net**, with the secret read from **Supabase Vault** at run
time. Both extensions are available on every Supabase plan; the script enables them.
`pnpm db:schedule --remove` takes it out.

Why not Vercel Cron: the project is on Vercel's Hobby plan, where a cron job runs at most once a
day — too coarse for "in an hour". On a plan that allows sub-daily crons you may add instead:

```json
{ "crons": [{ "path": "/api/cron/reminders", "schedule": "*/5 * * * *" }] }
```

Vercel sends `Authorization: Bearer $CRON_SECRET` itself. Running both is safe (the sender claims
each reminder before sending) but pointless.

Check it is running:

```sql
select jobname, schedule, active from cron.job;
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
select status_code, content from net._http_response order by created desc limit 5;  -- 200 + counts
```

## 4. Verify on a phone (phase-gate check, by looking)

1. **Android (Chrome):** open the site → Profile → *Install app* (or the ⋮ menu). Launch from the
   home screen; it opens without browser chrome.
2. **iPhone (iOS 16.4+, Safari):** Share → *Add to Home Screen*. Open from the icon — not from the
   Safari tab; Safari tabs cannot receive pushes.
3. In the installed app: Profile → *Turn on notifications* → allow → *Send a test*. It should land
   within seconds, with the Roleform mark (a white silhouette) in the Android status bar.
4. *Test with the app closed* → swipe the app away or lock the phone. About 30 seconds later the
   push arrives with nothing open — this is the path every reminder takes. If it never comes, the
   VAPID keys are missing on this deployment (Profile says so) or the device's permission is off.
5. On an analysis → **Rounds** → pick a type (say *System design*), set it 20 minutes out with
   *15 minutes before* ticked. The reminder should arrive within five minutes of its due time, show
   no notes, and open Prep on the System design family. Two hours after the start, the *after*
   nudge should arrive and open the Rounds tab.
6. Airplane mode, then navigate: the offline page shows, not a browser error.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Panel says "not switched on for this site" | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` unset at build time — set it and redeploy. |
| iPhone shows no *Turn on* button | Opened in a Safari tab, not from the Home Screen icon. |
| "Blocked" | The member denied the OS prompt; only browser/OS settings can undo it. |
| Test works, reminders never come | Scheduler not installed, wrong `APP_URL`, or `CRON_SECRET` differs between Vercel and Vault — check `net._http_response` for 401s. |
| Reminder row `skipped` | Round moved/finished/cancelled/started, or the member had no device subscribed when it came due. |
