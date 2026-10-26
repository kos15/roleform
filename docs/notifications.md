# Notifications & the installable app — runbook (F29, F29.2)

What it takes to run reminders in an environment, test them on real phones, and roll back.
Behaviour is specified in `specs.md` §F29, §F29.1 and §F29.2; this is the runbook.

## 0. What to expect from Web Push (read first)

- **Accepted is not delivered.** A push service answering 201 means it *took* the message. Whether
  the phone showed it depends on the device being online, its OS settings, Focus/Do Not Disturb,
  battery savers and the browser. Web Push reports nothing back past the push service, and Roleform
  never claims a reminder was "seen" or "read". `push_deliveries.status = 'accepted'` is the
  furthest we know.
- **No silent pushes.** Every push shows a notification (`userVisibleOnly: true`); Safari and Chrome
  penalise a site whose pushes show nothing. Roleform never uses push for background sync.
- **Browsers differ.** Android Chrome/Edge/Samsung/Firefox: push works in the browser and in the
  installed app. iPhone/iPad: **only iOS/iPadOS 16.4+, only from the Home Screen app** (manifest
  `display: standalone`), only after a tap on *Turn on notifications*. Desktop Safari, Chrome, Edge,
  Firefox: in the browser. In-app browsers (Instagram, LinkedIn webviews): usually unsupported — the
  panel says so.
- **HTTPS is mandatory.** Service workers and the Push API only exist on secure origins.
  `http://localhost` counts as secure for development; a LAN IP (`http://192.168.x.x`) does **not**,
  so a phone cannot test against `next dev` on your laptop without an HTTPS tunnel. Use a Vercel
  preview deployment for phone testing.

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
| `VAPID_PRIVATE_KEY` | **no** | Signs every push. Only `lib/services/push/send.ts` reads it. Rotating it invalidates every subscription (members turn notifications on again). |
| `VAPID_SUBJECT` | no | `mailto:` or `https:` contact for push services. Defaults to support. |
| `CRON_SECRET` | **no** | 32+ chars. Unset → the reminder route refuses every call. |

## 2. Database

Migrations run with every deploy (`pnpm build` runs `prisma migrate deploy` then `pnpm db:policies`):

- `20261011000000_interview_rounds_push` — rounds, reminders, devices (F29)
- `20261014000000_study_plans` — study alerts (F30), settled by the same route
- `20261016000000_push_outbox` — F29.2: `push_deliveries` (the outbox), `push_subscriptions.enabled`
  / `last_seen_at`, `users.notify_rounds` / `notify_study` / `notify_details`, and the CHECKs.
  Additive only: new table, new columns with defaults. `db:policies` turns RLS on for
  `push_deliveries`.

Re-run the guard check at the gate: `pnpm check:constraints` (27 cases, two of them F29.2's).

## 3. The scheduler (once per environment, and after rotating `CRON_SECRET`)

```bash
APP_URL=https://roleform.koustubh.org pnpm db:schedule
```

Installs a Supabase **pg_cron** job (`roleform-round-reminders`, every 5 minutes) that calls
`GET /api/cron/reminders` through **pg_net**, with the secret read from **Supabase Vault** at run
time. Each call (a) queues the reminders that came due into `push_deliveries`, then (b) drains the
outbox — including retries that an earlier call scheduled. `pnpm db:schedule --remove` takes it out.

Why not Vercel Cron: on the Hobby plan a cron job runs at most once a day. On a plan that allows
sub-daily crons you may add instead:

```json
{ "crons": [{ "path": "/api/cron/reminders", "schedule": "*/5 * * * *" }] }
```

Vercel sends `Authorization: Bearer $CRON_SECRET` itself. Running both is safe (reminders are
claimed, deliveries are leased) but pointless.

Check it is running, and what the push services said:

```sql
select jobname, schedule, active from cron.job;
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
select status_code, content from net._http_response order by created desc limit 5;  -- 200 + counts

-- Outbox health, last 24h (counts only — never select endpoints into a shared screen)
select status, category, count(*), max(attempts) from push_deliveries
 where created_at > now() - interval '1 day' group by 1, 2 order by 1, 2;
select last_status, count(*) from push_deliveries
 where status in ('failed', 'gone') and created_at > now() - interval '1 day' group by 1;
```

The function logs one line per pass: `[push] leased= accepted= retrying= failed= expired= gone=
cancelled= codes=201:12,410:1`. A run of `403`s means the VAPID key pair on this deployment does not
match the one the devices subscribed with.

## 4. Verify on physical phones (phase-gate check, by looking)

Use a deployment with HTTPS and VAPID keys set (a Vercel preview for this branch is ideal). Use your
own account; **never test against real members' devices**.

### Android (Chrome)

1. Open the site → Profile → **Install app** (or ⋮ → *Install app*). The home-screen icon shows the
   Roleform mark large and uncropped in the launcher's shape (circle, squircle).
2. Launch from the icon: no browser chrome.
3. Profile → **Turn on notifications** → Allow. Then **Send a test**: it should land within
   seconds, with a white Roleform silhouette in the status bar. The panel says it was *handed to
   the push service* — that is all the server can know.
4. **Test with the app closed** → swipe the app away. ~30 s later the push arrives with nothing open.
5. Tap it → the app opens on Profile.
6. Profile → pause this device (⏸). *Send a test* says no device has notifications on. Resume (▶).
7. Turn off *Show company and round names*; add a round 20 minutes out with *15 minutes before*:
   the reminder says "Interview reminder · You have a round in 15 minutes", no company. Tap → the
   posting's prep page.
8. Sign out (user menu) → back on the landing page, send nothing; from another signed-in device add
   a round 20 minutes out → this phone gets **nothing**. Sign in again → panel shows *off* (opt in
   again, per account).
9. Airplane mode, then navigate: the offline page shows, not a browser error.

### iPhone / iPad (iOS/iPadOS 16.4 or later, Safari)

1. Open the site in Safari. Profile shows *Add Roleform to your Home Screen* with the steps (on
   older iOS, it says to update first).
2. Share → **Add to Home Screen** → Add. The icon is the Roleform mark on cream, filling the tile.
3. Open Roleform **from the Home Screen icon** — not the Safari tab (a Safari tab cannot receive
   push).
4. Profile → **Turn on notifications** → Allow → **Send a test** → arrives on the lock screen.
5. **Test with the app closed** → swipe up to close, lock the phone → it arrives ~30 s later.
6. Tap it → the app opens on the right page. If you were signed out, sign in: you land on the page
   the notification pointed at.
7. Settings → Notifications → Roleform shows the app; turning it off there makes the panel say
   *blocked* (only Settings can undo it).

### Failure drills (optional, on a preview)

- Point a test device row at a dead endpoint (or revoke permission in browser settings and send a
  test): the next pass logs `gone=1` / `410`, and the device disappears from Profile.
- Return 503 from a mock push service (or wait for a real outage): rows go `queued` with growing
  `next_attempt_at`, then `accepted` — one notification on the phone, not several.

## 5. Deploy

1. Set the four variables in §1 on the target environment; redeploy (the public key is build-time).
2. Merge → Vercel builds: `prisma migrate deploy` (applies `20261016000000_push_outbox`) →
   `pnpm db:policies` → `next build`.
3. `pnpm db:schedule` once per environment (§3) if not installed.
4. Walk §4 on one Android and one iPhone with your own account.

## 6. Rollback

- **Code only** (the usual case): redeploy the previous production deployment in Vercel
  (Deployments → previous → *Promote to Production*). The F29.2 migration is additive, so the
  previous code runs against the new schema unchanged: it ignores `push_deliveries` and the new
  columns. Anything still `queued` in the outbox simply waits; when F29.2 is redeployed, rows past
  their `expires_at` settle as `expired` instead of buzzing a phone late.
- **Stop all pushes immediately**: `pnpm db:schedule --remove` (nothing is queued or sent without
  the cron), or unset `VAPID_PRIVATE_KEY` and redeploy (the outbox and the test button refuse to
  send). Re-enable by reversing the step.
- **Schema** (only if the migration itself must go): there is no down-migration by policy. Drop by
  hand, in this order, on the affected database:

  ```sql
  drop table push_deliveries;
  drop type push_delivery_status; drop type push_category;
  alter table push_subscriptions drop column enabled, drop column last_seen_at;
  alter table users drop column notify_rounds, drop column notify_study, drop column notify_details;
  delete from _prisma_migrations where migration_name = '20261016000000_push_outbox';
  ```

  and deploy code from before F29.2.
- **Service worker**: a bad worker is replaced by publishing a fixed `public/sw.js` with a new
  `VERSION`; browsers re-fetch `/sw.js` (served `no-cache`) on the next navigation and the new
  worker takes over at once, deleting the old caches.

## 7. Icons

`pnpm icons` re-renders every app icon from the mark in `scripts/ops/app-icons.ts`. Then bump
`ICON_VERSION` (`lib/seo/icons.ts`) and the worker's `VERSION`: phones cache icons under their URL,
and an already-installed iPhone app keeps its old icon until it is removed and re-added.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Panel says "not switched on for this site" | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` unset at build time — set it and redeploy. |
| iPhone shows no *Turn on* button | Opened in a Safari tab, not from the Home Screen icon — or iOS below 16.4. |
| "Blocked" | The member denied the OS prompt; only browser/OS settings can undo it. |
| Test says "handed to the push service" but nothing shows | The device is offline, in Focus/Do Not Disturb, or has notifications off for the app/browser. The server cannot see this. |
| Test works, reminders never come | Scheduler not installed, wrong `APP_URL`, or `CRON_SECRET` differs between Vercel and Vault — check `net._http_response` for 401s. |
| Many `403` in `[push] codes=` | VAPID keys changed since devices subscribed — they must turn notifications on again. |
| Reminder row `skipped` | Round moved/finished/cancelled/started, the category is switched off, or the member had no enabled device when it came due. |
| Delivery row `cancelled` | Device paused, category switched off, or the device was signed into another account after it was queued. |
