# Self-hosting Albumz

This folder holds the systemd units and Apache vhost that run Albumz on its
home server. They're working files — adjust the host-specific bits for your
own install. Walk-through below.

## What you need before starting

- A Linux box with **Node.js 20+** (24+ recommended), **git**, and **systemd**
- A reverse proxy (Apache or nginx) for HTTPS
- A free **Supabase** project — Albumz uses Auth + Postgres
- A free **Last.fm API key** — needed for now-playing, scrobbles, the digest
- Optional: a free **fanart.tv API key** for artist images on public pages
- Optional: an **Ollama** install with a Qwen-family model for the weekly digest
- Optional: a **Shazam sidecar** for the "Spin" mic-listener feature

## 1. Clone and install

```bash
git clone https://github.com/spudalicious1969/albumz.git
cd albumz
npm install
```

## 2. Supabase project

1. Create a new project at [supabase.com](https://supabase.com).
2. In **SQL Editor → New query**, paste the contents of `supabase/schema.sql`
   and run it. That creates all tables, RLS policies, and trigger functions.
   The file is safe to re-run.
3. In **Authentication → URL Configuration**, set:
   - **Site URL** to your public URL (e.g. `https://albumz.example.com`)
   - **Redirect URLs** to include `https://albumz.example.com/**`
4. In **Authentication → Email**, configure an SMTP provider (Resend, Postmark,
   etc.) so signup confirmation emails actually send. The defaults work for
   local testing but not for real signups.
5. Optional: tweak the email template wording. Albumz expects the default
   confirmation flow.

## 3. External API keys

- **Last.fm**: register an app at <https://www.last.fm/api/account/create>.
  Only the API key is needed (no secret).
- **fanart.tv**: register at <https://fanart.tv/get-an-api-key/>. Personal-use
  keys are free.
- **theaudiodb**: the public key `123` works fine for non-commercial use.

## 4. `.env`

Copy `.env.example` to `.env` and fill in:

```
PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon key from Supabase Settings → API>
SUPABASE_SERVICE_ROLE_KEY=<service role key, same page>
LAST_FM_API_KEY=<your key>
FANART_TV_API_KEY=<your key, or leave blank>
THEAUDIODB_API_KEY=123
DIGEST_SCHEDULER_SECRET=<run: openssl rand -hex 32>
```

The commented-out vars in `.env.example` are all optional overrides — leave
them alone unless you have a specific reason.

## 5. Build and smoke-test

```bash
npm run build
PORT=3200 ORIGIN=https://albumz.example.com node build
```

Hit `http://127.0.0.1:3200` from the same box to confirm it loads. Then stop
it (Ctrl-C) and move on to systemd.

## 6. systemd service

Open `deploy/albumz.service` and adjust:

- `User=` and `Group=` — the Linux user that owns the repo
- `WorkingDirectory=` — absolute path to the clone
- `EnvironmentFile=` — absolute path to your `.env`
- `Environment=ORIGIN=` — your public URL (used for CSRF cookie checks)
- `ExecStart=` — path to `node`. If you installed Node from your distro's
  package manager, this is usually `/usr/bin/node`. The current file uses an
  nvm-managed path as an example — change it.

Install and start:

```bash
sudo cp deploy/albumz.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now albumz.service
sudo systemctl status albumz.service     # should be active (running)
journalctl -u albumz.service -f          # tail logs
```

## 7. Reverse proxy

`deploy/albumz.spudalicio.us-le-ssl.conf` is a working Apache vhost. For
your domain you'd change `ServerName`, the log paths, and the SSL cert paths
(use `certbot --apache` or equivalent to generate them).

For nginx, the gist is: proxy `/` to `http://127.0.0.1:3200/`, preserve
`Host`, forward `X-Forwarded-Proto: https`, and bump `client_max_body_size`
to 10MB or so to allow CSV/XLSX collection imports.

## 8. (Optional) Weekly digest

The digest is an AI-narrated weekly recap of your listening, generated each
Sunday at 21:00 local. It needs **Ollama** running somewhere reachable from
the Albumz box, with a Qwen-family model (currently `qwen3:8b` works well).

Install Ollama, pull a model, and either run it on the same host (the digest
service `After=ollama.service` assumes this) or set `OLLAMA_URL` in `.env` to
point at your remote box.

Adjust `deploy/albumz-weekly-digest.service` the same way you adjusted
`albumz.service` (User/WorkingDirectory/EnvironmentFile/ExecStart), then:

```bash
sudo cp deploy/albumz-weekly-digest.service /etc/systemd/system/
sudo cp deploy/albumz-weekly-digest.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now albumz-weekly-digest.timer
systemctl list-timers albumz-weekly-digest.timer   # confirm next fire time
```

Users can also generate their own digest on demand from
`/u/<username>/digests` — the timer just makes it automatic.

## 9. (Optional) Spin / Shazam sidecar

The "Spin" feature listens through the device mic and identifies tracks via
[shazamio](https://github.com/dotX12/ShazamIO). It runs as a separate FastAPI
sidecar (not in this repo). If you don't set up the sidecar, the Spin button
just returns a "not configured" message — everything else works fine.

If you want it: stand up a small FastAPI service that exposes a `/recognize`
endpoint accepting an audio blob, then set `SHAZAM_SIDECAR_URL` in `.env`.

## Troubleshooting

- **Signup hangs with "Database error saving new user"** — your Supabase
  project is missing the `pgcrypto` extension or the trigger functions
  weren't created. Re-run `supabase/schema.sql`.
- **Cover art is sparse** — make sure your `.env` has `LAST_FM_API_KEY` set.
  Without it, only iTunes and Deezer are queried.
- **Now-playing always says "Currently Streaming" even though you're spinning
  vinyl** — the Spin feature (step 9) needs to be set up; without it Albumz
  has no way to tell streaming from physical playback.
- **Digest fires but nothing gets written** — check `journalctl -u
  albumz-weekly-digest.service`. Most failures are Ollama unreachable or
  the model name in the digest endpoint not matching what you pulled.
