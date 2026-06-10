# Albumz — Project Handoff Document

_Last updated: 2026-06-05 (Friday — CSV-import Discogs `(N)` strip + tracklist chooser/snapshot in lookup panel + cover-search confidence floor shipped)_

## Implementation Status (2026-06-05)

**Live at https://albumz.spudalicio.us** (Apache reverse-proxies to SvelteKit Node server on port 3200). Original spec is feature-complete; an extended polish pass on the same day added avatars, the user menu, username onboarding, persisted sort, discovery search, a Tunez-inspired album detail redesign, and a robust now-playing cover-art fallback.

### Built

- **SvelteKit project** scaffolded with TypeScript, Prettier, ESLint, `adapter-node`. Runes mode enabled.
- **Apache vhost** at `albumz.spudalicio.us` proxies to port 3200. Backup of pre-edit SSL conf saved as `.bak`.
- **Supabase auth** end-to-end: register, email confirm (Resend SMTP), login, logout. `safeGetSession()` validates JWT via `getUser()` after the cookie check.
  - Supabase Site URL + Redirect URLs configured for `https://albumz.spudalicio.us/auth/callback` and `http://localhost:3200/auth/callback`
- **DB schema** applied: `profiles`, `albums`, `activity` with RLS policies. New-user trigger auto-creates a `profiles` row (with explicit `onboarded = false` and `search_path = public, extensions` so the pgcrypto `digest()` call resolves).
- **Logged-in collection grid** at `/` — atmospheric card grid (owned-only since the wantlist became its own page). Topbar carries the sort selector, search-icon (opens lookup palette), Wantlist count, + Add, and the user menu.
- **Logged-out mosaic landing** at `/` — ambient Last.fm grid; tiles link to each user's public page.
- **Username onboarding flow** at `/welcome` — new users land here on first login after email-confirm. Live availability check via `/api/username-check?username=…` (debounced 350ms). `hooks.server.ts` gates non-exempt routes: signed-in + `onboarded = false` → redirect to `/welcome`. Exempt: `/welcome`, `/auth`, `/api`, `/login`, `/register`. Username regex is `^[a-z0-9][a-z0-9_.-]*$` (starts with alphanumeric, then any of letters/digits/underscore/period/hyphen — Discogs-compatible).
- **Add album flow** (`/albums/new`): partial-query discovery search — artist alone, title alone, or both. Spotify-backed via `src/lib/album-search.server.ts`; full queries also pull from iTunes / Last.fm / MusicBrainz / Deezer via `searchCovers`. Submit-button label toggles between "Add to collection" and "Add to wantlist" based on ownership selection.
- **Album detail pages — Tunez-inspired redesign**:
  - Owner view `/albums/[id]` and public view `/u/[username]/albums/[id]` share three presentational components in `src/lib/components/`:
    - **AlbumHero**: cover + title/artist/year/format/label/rating/ownership pill/tags/notes. Three `position: fixed` atmospheric layers (blurred cover, accent radial gradient, veil fading to bg). No bounded card — the hero blends into the page.
    - **ExternalLinks**: 9-chip row — Spotify · Tidal · Apple Music · YouTube Music · Last.fm · Discogs · MusicBrainz · MusicMap · AOTY. Server resolver `src/lib/external-links.server.ts` hits Spotify/Discogs/YouTube APIs for direct album URLs and falls back to search URLs everywhere else; per-link `isDirect` flag drives the "search" sub-label. 1-hour in-memory cache.
    - **Tracklist**: real tracklist via `src/lib/tracklist.server.ts` (Last.fm `album.getInfo`). Position · name · duration with total runtime.
  - Owner view adds: "Edit details" toggle (form was always-visible before), Change cover, ★ Set as featured, Delete. The edit form includes a **🔎 Look up details** panel that hits `/api/covers/search` and fills artist/title/year (and the cover, if currently empty) from a clicked result. **Underneath the cover picker, the same panel surfaces tag / label suggestions** for empty fields — fans out in parallel to `/api/albums/lookup-suggestions` (Discogs styles+genres → Last.fm artist tags → qwen3.5 fallback for tags; qwen-only for label). Suggestions render via the shared `BackfillSuggestion.svelte` component in `onSave`-callback mode (binds into local form state rather than POSTing) with Accept / Edit / Skip controls and a source badge. Panel **stays open after a cover pick** if suggestions are still pending review. **Below the tag/label suggestions, a Tracklist chooser** fans out to `/api/albums/tracklist-candidates` (Spotify / Deezer / iTunes / Last.fm in parallel, empty sources filtered out) and renders one expandable row per source — compact summary (count + total runtime) with click-to-expand full tracks. Accept POSTs to `/api/albums/[id]/apply-suggestion` with `field: 'tracklist'` and a `{tracks, source}` snapshot; the album page reads that snapshot on subsequent loads via `snapshotToResult()`, falling back to live `fetchTracklist` only when no snapshot exists. "Use auto-pick" clears the pin (`value: null` on the same endpoint).
  - **No similar artists**, per Brent.
  - Public collection grid cards + recent-additions strip link to `/u/[username]/albums/[id]`.
- **Import** (`/import`): CSV/XLS/XLSX file upload + paste-CSV textarea. Header auto-detection (Discogs-friendly). Format normalization (`7`→`7"`, "LP, Album, Stereo"→"LP"). Rating normalization (stars, 5- and 10-point scales). **Discogs `(N)` artist disambiguator strip** at parse time (`src/lib/import/parse.ts`) — `"Helium (3)"` → `"Helium"` so downstream catalog lookups (cover-search, tracklist, lookup-suggestions) don't whiff on the cruft. Only stripped on artist; album titles legitimately contain parens. Preview before commit. Activity-log rule: ≤5 individual entries, 6+ single summary.
- **Bulk missing-info backfill** (Settings → Import / Export → **Backfill missing data**): walks OWN + WANT, fills missing `cover_url`, `year`, `label`, and `tags` without touching populated fields. Pulsing-dot "Working…" state on the button so it doesn't feel dead. Tiered source chain per field — `cover_url` via the 5-source cover search; `year`/`label` from Discogs release records; `tags` from Discogs styles+genres → Last.fm artist top-tags → qwen3.5 suggestion as a final fallback. Catalog-sourced values write automatically; qwen-sourced values surface in the recap with an **"AI"** badge + per-field **Accept / Edit / Skip** controls (`/api/albums/[id]/apply-suggestion` handles the single-field write). Recap shows per-field attempted-vs-filled counts plus a still-missing list. Original home-page "Backfill covers" banner remains for the cover-only quick path.
- **Cover-search waterfall** (`src/lib/cover-search.ts`): **5 sources in parallel** — Spotify, iTunes, Last.fm, MusicBrainz→CAA, Deezer. **Scoring split into equality (+100 artist / +50 title) vs substring (+30 / +15)** after normalizing both sides (lowercase + NFKD + strip punctuation). Substring-only artist matches max out at 84 — below the **confidence floor of 115** used by the new exported `topConfidentCover()` helper. Both auto-write paths (`/api/covers/fetch` from the home-page Find covers button, and `backfill.server.ts`) go through `topConfidentCover()`: below the floor, no auto-write, album stays in the missing-covers queue for manual lookup via the panel. Lookup panel UI still gets the full ranked list. Deduped, sliced to 12. MusicBrainz throttled ≥1.05s globally via slot-reservation rate-limiter (CAA HEAD checks unthrottled).
- **Settings page** (`/settings`): username, display name, Last.fm + Discogs usernames, theme pills, search-as-you-type featured album picker, avatar upload/remove, Import / Export section. Placeholders are generic ("Your name", "your-lastfm-handle") not the owner's actual values.
- **Avatar system** — uploaded → Gravatar (via `email_hash`, SHA-256 of email) → generated colored-initial. OffscreenCanvas resize to 256px WebP. Supabase Storage `avatars/{user_id}/avatar-{ts}.webp`. Migration `supabase/migrations/2026-05-27-avatars.sql`.
- **User menu (avatar dropdown)** in home topbar replaces the old Settings link + Sign-out form. Profile flows in via `+layout.server.ts` → `+layout.ts` → `data.profile`.
- **Theme application**: profile theme loaded server-side, applied to `<html data-theme>` via `$effect` in `+layout.svelte`.
- **Public showcase page** (`/u/[username]`): atmospheric hero (featured album OR currently-playing override when live), profile header, recent additions strip, "Browse Full Collection →" CTA, OG meta tags, `↗ Headliner` link when Last.fm is linked. **Polls `/api/now-playing/{username}` every 15s** so the hero updates without refresh.
- **Public full-collection page** (`/u/[username]/collection`): atmospheric grid with search + sort. Search bar is a magnifying-glass icon that expands inline; sort options are Artist / Album / Rating (article-aware). RLS enforces non-hidden + OWN.
- **Headliner PWA** at `/headliner/[username]`: full-screen "lean-back" presentation of currently/last-played track. Auto-refresh every 15s. Dynamic accent extracted client-side from the actively-displayed cover candidate. Cross-fades between tracks via Svelte `{#key}`. **Idle mosaic** takes over when nothing's playing — defined as `state === 'none'` _or_ a `'recent'` scrobble older than 60 minutes. Renders a dark, slow-paced bento grid of the user's own owned covers (one slot flips at a time, ~2s cadence, ~1.5s flip duration), with a heavy vignette + film grain + 0.65 saturation / 0.78 brightness on tiles. A centered `albumz` wordmark + "Waiting for {displayName} to start something." overlay sits inside a soft radial spotlight so the text reads cleanly without globally darkening the mosaic. Threshold re-evaluated on every 15s poll via a `nowMs` reactive tick. Falls back to the original idle placeholder if the user has no owned albums with covers.
- **Now-playing cover-art fallback chain**: `NowPlayingResult` carries an ordered `coverCandidates: string[]` from iTunes song search + iTunes album search + Deezer + Last.fm track image, with artist-match filtering and Last.fm-placeholder MD5 stripping. Both the public showcase and Headliner advance through candidates client-side via `<img onerror>` so a dead URL never leaves the viewer with an initial-fallback. Accent extraction follows the active candidate.
- **PWA manifests** at `/manifest.json` (main, `display: standalone`) and `/headliner/manifest.json` (Headliner, `display: fullscreen`, landscape). SVG icons extracted from `sketches/07-icons.html` (Concept E + H4).
- **CSV export** (`/api/export`, button on `/settings`): downloads the user's full collection (owned + wantlist) as `albumz-{username}-YYYY-MM-DD.csv`. Headers match `/import`'s canonical fields so it round-trips. Archival columns (`hidden, cover_url, accent_color, discogs_id, created_at`) tail the file.
- **"Do I have this?" lookup palette** — Cmd/Ctrl-K shortcut + search-icon trigger; centered modal on desktop, full-screen sheet on mobile. Empty state offers "+ Add this album" prefill link.
- **Dedicated Wantlist page** at `/wantlist` — compact list with sort selector and a "Buy" cluster (Record Exchange first per Brent's local-shop preference, then Bandcamp / Discogs / Amazon / eBay). "✓ I got it!" promotes WANT→OWN via `?/promote`.
- **Article-aware sorting** (`src/lib/sort-key.ts`) — strips leading "the/a/an" so "The Beths" sort under B and "A Night at the Opera" under N. Applied to artist and title sorts on home / full collection / wantlist. Display strings unmodified.
- **Sort surface (`SortDropdown.svelte`)** — themed dropdown shared by home / full collection / wantlist. **Format** sort on every page (groups by CD/LP/cassette/etc., nulls last, artist tiebreaker). Opt-in **reverse toggle** via `reversible` + `bind:reversed` props: small arrow button next to the dropdown that negates whatever comparator the page already uses, so the same control flips A→Z to Z→A, newest-first to oldest-first, highest-rated to lowest, etc.
- **Persisted sort preferences** (`src/lib/persist.ts`) — localStorage per page; keys `albumz:sort:<page>` for the option + `albumz:sort:<page>:rev` for the direction (`'0'|'1'`). Hydration via `onMount` + flag guard to avoid clobbering stored values with SSR defaults. Helpers: `loadSort`/`saveSort` (allow-listed) + `loadReversed`/`saveReversed` (boolean).
- **Wantlist → collection promote stamps `created_at = now()`** (`src/routes/wantlist/+page.server.ts`) so newly-acquired albums surface at the top of the home "Recent" sort instead of carrying the original wantlist-add date. Loses the original "first noticed" date, but that history wasn't visible anywhere after promotion anyway.
- **Dig — crate-pull rediscovery** at `/dig` (UserMenu link). Atmospheric page reusing `AlbumHero` (cover bumped to 340px on desktop, vertically centered in the viewport). Server pulls one random album from owned + not-spun-in-30-days; URL `?exclude=id1,id2…` carries forward up to 12 recent picks so "Pull another" rotates within a session without repeats. Eyebrow line reads _"From the crate · last spun X / never spun on Albumz"_ based on a per-pick lookup of the spins table. Empty states for no-albums, all-recent (everything spun in last 30d), and exhausted (session-pull list depleted). Intentionally hidden in the avatar menu rather than parked on home — "ritual you walk over to, not a button that pesters you."
- **Spin (web-Earshot)** — browser mic captures rolling 10s audio chunks → Python `shazamio` sidecar at `127.0.0.1:3210` → spin row inserted with `source = spun` or `streamed` (classifier cross-references Last.fm now-playing). Auto-scrobbles physical plays after ~60s confirmed presence. Headliner card decoupled from mic state and persisted to sessionStorage so a "set" survives navigation and reloads, ending only when the tab closes.
- **Duplicate handling** — `src/lib/dedupe.server.ts` defines duplicates as case-insensitive `(artist, title)` match. `scanDuplicates(supabase, userId)` returns groups with the highest-metadata-scored survivor first; `removeDuplicates()` keeps survivors and deletes the rest. Settings → Duplicates exposes scan + remove with a preview-before-confirm flow. `/import` preview also calls `existingAlbumKeys()` and sets a `skipReason` of "Already in collection" / "Duplicate row in this file" on offending rows so re-imports default to skipped.
- **Weekly digest** — local-Ollama-generated weekly listening column with similarity-driven picks and test-time enforcement. `prompts/weekly-digest.md` is the prompt template (system + user, parsed from fenced blocks at both server-runtime and test-harness time). `src/lib/digest-data.server.ts` assembles real inputs: pulls spins + Last.fm scrobbles for the week, cross-references for spun-vs-streamed, groups the listening*log by day (Mon–Sun) with `(no plays)` markers for empty days and future-day omission for in-progress weeks, then scores dormant/non-owned albums by Last.fm artist-tag overlap (cached in `artist_tags` table with a stoplist filtering genre umbrellas like "indie"/"rock"/"pop") to generate real hooks: *"shares the dream pop and electronic wavelength of $ARTIST's $TRACK from this week."\_ `/api/digests/generate` (POST) runs assembly + Ollama call + probe-and-re-roll loop (re-rolls up to 2 more times if a critical probe fails: missing pick, fabricated day, format trope leak), then upserts. Permalink at `/digests/[id]` (drafts owner-only; published public, indexable). Archive at `/u/[username]/digests`. Owner controls (Publish / Discard / Unpublish) live on the permalink. Generation runs primarily via the **weekly scheduler**: systemd timer `albumz-weekly-digest.timer` fires Sundays 21:00 local, oneshot service runs `scripts/run-weekly-digests.mjs` which enumerates Last.fm-linked profiles and POSTs to the generate endpoint with a bearer token (`DIGEST_SCHEDULER_SECRET`) plus `skip_if_quiet: true` — weeks with <10 plays return `{ status: 'skipped' }` before invoking Ollama. Manual generation lives on the owner view of `/u/[username]/digests` as a "Generate this week" button — used for mid-week previews or to regenerate after a discard. (Settings used to host this; moved out 2026-05-30 so Settings holds preferences and the archive page holds the generation action.) **In-app draft pill** (`DigestPill.svelte`, mounted in `+layout.svelte`) surfaces pending drafts to the owner with a small bottom-right "Your weekly digest is ready → Review" link; per-digest sessionStorage dismiss; suppressed on the digest permalink itself and on Headliner.

### Not yet built

_(Nothing scheduled. Polish requests have been arriving from a friend testing the site — track those as they come in.)_

### Key file locations (working dir)

- Routes: `src/routes/{login,register,auth/*,welcome,albums/*,import,settings,wantlist,u/[username]/*,u/[username]/albums/[id],headliner/*,api/*}`
- Supabase clients: `src/lib/supabase/{client,server}.ts`. Auth + onboarding gate at `src/hooks.server.ts`
- Cover search waterfall (5-source, normalized-equality scored with confidence floor): `src/lib/cover-search.ts`. Exports `searchCovers()` (full ranked list, used by the picker UI) and `topConfidentCover()` (confidence-gated top hit, used by both auto-write paths).
- Album discovery (Spotify-backed, partial queries): `src/lib/album-search.server.ts` — exports `searchAlbums` and the unified `runDiscovery` entrypoint used by `/albums/new`, `/api/covers/search`, and the edit-form Look-up panel
- Spotify token cache (shared by cover-search, album-search, external-links): `src/lib/spotify-auth.server.ts`
- Album detail body components (used by both owner and public views): `src/lib/components/{AlbumHero,ExternalLinks,Tracklist}.svelte`
- External-links resolver (split for browser-safety): types at `src/lib/external-links.ts`, server resolver at `src/lib/external-links.server.ts` (Spotify/Discogs/YouTube direct + 6 search-URL services, 1h in-memory cache)
- Tracklist resolver (similarly split): types at `src/lib/tracklist.ts`, server fetcher at `src/lib/tracklist.server.ts`. **Parallel fanout** across Spotify + Deezer + iTunes + Last.fm with 8s per-call timeout. Two entry points: `fetchTracklistCandidates()` exposes all four results (used by the lookup-panel chooser via `/api/albums/tracklist-candidates`); `fetchTracklist()` is the pick-longest wrapper used by the album page server load when no snapshot is pinned. Tie-break order Spotify > Deezer > iTunes > Last.fm. **Snapshot persistence**: when the user picks a tracklist from the chooser and clicks Accept, `{tracks, source}` is written to `albums.tracklist` (jsonb, nullable). On subsequent loads, `snapshotToResult()` (browser-safe helper in `tracklist.ts`) promotes the stored value into a `TracklistResult` with `totalDuration` computed on the fly; if null/malformed, falls back to live `fetchTracklist`. Clear-pin = `apply-suggestion` with `value: null`. Replaced the previous stop-at-first waterfall, which lost tracklists on new releases where Last.fm had a one-track stub (e.g., Hayley Williams _Ego Death_).
- Missing-info backfill: `src/lib/backfill.server.ts` (per-field source chain, attempted-vs-filled counters), `src/lib/discogs-tags.server.ts` (Discogs release-level styles+genres lookup with artist+title match), `src/lib/qwen-suggest.server.ts` (Ollama qwen3.5 prompt with strict NONE-escape, lowercase tags, original-label-only rules, `think: false`, JSON-mode output). Single-album version of the same chain at `src/routes/api/albums/lookup-suggestions/+server.ts` (used by the album-edit Look up panel, called in parallel with cover-search and tracklist-candidates). Single-field write endpoint at `src/routes/api/albums/[id]/apply-suggestion/+server.ts` — accepts `field: 'tags' | 'label' | 'tracklist'`, with tracklist taking either a `{tracks, source}` snapshot to pin or `value: null` to clear. Tracklist-candidates endpoint at `src/routes/api/albums/tracklist-candidates/+server.ts`. Shared review UI at `src/lib/components/BackfillSuggestion.svelte` — dual-mode: default POST-on-accept for the recap context, or `onSave`-callback prop for the album-edit form context. Tracklist chooser UI lives inline in `src/routes/albums/[id]/+page.svelte` (not a separate component — reuses panel styles + state).
- Article-aware sort key: `src/lib/sort-key.ts` (`sortKey()` + `compareByKey()`)
- Persisted UI prefs (localStorage helpers): `src/lib/persist.ts`
- Now-playing (Last.fm + multi-source cover candidates): `src/lib/now-playing.ts`. Returns `coverCandidates: string[]` — consumers advance via `<img onerror>` on a `coverIdx` state var, resetting on track change
- Mosaic builder (Last.fm + iTunes cover-by-track + cache): `src/lib/mosaic.ts`
- Import library: `src/lib/import/{parse,normalize,types}.ts`
- Export library: `src/lib/export/csv.ts` (endpoint at `src/routes/api/export/+server.ts`)
- Lookup palette ("Do I have this?"): `src/lib/components/LookupPalette.svelte`, state in `src/lib/lookup-state.svelte.ts`, data endpoint `src/routes/api/albums/lookup/+server.ts`. Mounted globally in `+layout.svelte` for signed-in users; trigger button + Cmd/Ctrl-K shortcut
- Username availability check: `src/routes/api/username-check/+server.ts` (GET `?username=…` → `{ available: boolean }`)
- Wantlist page: `src/routes/wantlist/+page.{server.ts,svelte}`. Compact list rows with sort selector, "Buy" cluster (Record Exchange / Bandcamp / Discogs / Amazon / eBay), and a "✓ I got it!" promote action. Promote stamps `created_at = now()`. Home page links to it via topbar; `/albums/new?ownership=WANT` prefills + redirects back to `/wantlist` on save
- Sort dropdown component: `src/lib/components/SortDropdown.svelte`. Generic on the value type; `reversible` + `bind:reversed` props add a flip-arrow button next to the menu. Used by home (`/`), full collection (`/u/[username]/collection`), and wantlist (`/wantlist`) with per-page option lists
- Dig (crate-pull rediscovery): `src/routes/dig/{+page.server.ts,+page.svelte}`. Server picks one owned album not spun in last 30 days, excluding `?exclude=` ids; page reuses `AlbumHero` inside a `.crate-stage` flex container that vertically centers the moment in the viewport. Reachable via UserMenu only
- Avatar component (waterfall: upload → Gravatar → initial): `src/lib/components/Avatar.svelte`
- User menu / dropdown: `src/lib/components/UserMenu.svelte`. Renders in the home topbar; receives profile from layout data
- Client accent extraction (Canvas + OKLCH): `src/lib/accent-color.ts`
- Spin: `src/lib/spin-state.svelte.ts` (singleton class, sessionStorage-persisted), `src/lib/components/SpinSessionRunner.svelte` (invisible MediaRecorder loop in root layout), `src/lib/components/HeadlinerSpinCard.svelte` (owner ritual card with collapsed/expanded states + mic toggle). Identify endpoint at `src/routes/api/spins/identify/+server.ts`; sidecar lives alongside the app at `albumz-shazam/` (FastAPI + shazamio + .venv, runs as `albumz-shazam.service` on port 3210).
- Headliner idle mosaic: `src/lib/components/HeadlinerIdleMosaic.svelte` (stripped variant of `MosaicView` — no now-playing tiles, no 2x2 features, no clickability; single concurrent flip on a ~2s tick with a darker preset). Tiles assembled server-side in `src/routes/headliner/[username]/+page.server.ts` as `IdleTile[]` (up to 60 most-recent owned albums with cover_url). Idle gating in `+page.svelte`: `IDLE_STALENESS_MS = 60 * 60 * 1000` constant + `nowMs` reactive tick updated each 15s poll so the stale check re-evaluates without needing a separate ticker.
- Duplicate handling: `src/lib/dedupe.server.ts` (scoring, scan, remove, existing-keys lookup). Consumed by `src/routes/import/+page.server.ts` (preview action) and `src/routes/settings/+page.server.ts` (scanDuplicates + removeDuplicates form actions).
- Weekly digest: prompt template at `prompts/weekly-digest.md` (single source of truth, fenced blocks parsed at both server-runtime and test-harness time); test harness at `scripts/test-digest.mjs` (accepts `N` + optional `MODEL` args, runs mechanical probes); server-side data assembly at `src/lib/digest-data.server.ts` (day-grouped listening_log + similarity scoring + anchor selection + hook builder; exports `currentWeekEnding` for upcoming-Sunday default and `lastSundayLocal` for the just-closed Sunday used by the scheduler); Last.fm tag cache + fetcher in `src/lib/lastfm.server.ts` (`fetchArtistTopTags`, `getArtistTopTagsBatch`, `TAG_STOPLIST`); test-time enforcement probes at `src/lib/digest-probes.ts` (shared module, critical-vs-soft split); prompt loader/parser at `src/lib/digest-prompt.ts` (Vite `?raw` import); generate endpoint at `src/routes/api/digests/generate/+server.ts` (assembly + Ollama + probe-and-re-roll loop, max 3 attempts; supports session OR bearer auth + `skip_if_quiet` flag); permalink at `src/routes/digests/[id]/{+page.server.ts,+page.svelte}` (load + publish/discard/unpublish actions); archive at `src/routes/u/[username]/digests/{+page.server.ts,+page.svelte}`. Default model is `qwen3.5:latest` via Ollama on `localhost:11434`; override via `OLLAMA_URL` env var.
- Weekly digest scheduler: `scripts/run-weekly-digests.mjs` (Node ESM, inline `.env` loader, sequential POSTs to keep one prompt at a time at Ollama); systemd units `deploy/albumz-weekly-digest.{service,timer}` (oneshot service + Sun 21:00 timer with `Persistent=true` so missed runs catch up on next boot). Service-role Supabase client factory at `src/lib/supabase/server.ts` (`createSupabaseAdminClient`) used by the endpoint when it accepts a scheduler bearer.
- Digest draft notification pill: `src/lib/components/DigestPill.svelte` mounted in `src/routes/+layout.svelte`. `+layout.server.ts` queries the most recent `status='draft'` digest for the signed-in user within the last 14 days; the layout suppresses the pill on `/digests/*` and `/headliner/*`. Dismiss is per-digest, per-session via sessionStorage.
- DB schema: `supabase/schema.sql` (canonical end-state, idempotent). Incremental migrations in `supabase/migrations/YYYY-MM-DD-*.sql`:
  - `2026-05-27-avatars.sql` — `avatar_url`, `email_hash`, trigger update, storage bucket + RLS policies
  - `2026-05-27-onboarding.sql` — `onboarded` column, trigger rebuilt with explicit `onboarded = false` AND `search_path = public, extensions` (critical — see implementation notes)
  - `2026-05-28-mosaic-pool.sql` — `mosaic_album_pool` RPC for the logged-out landing
  - `2026-05-29-spins.sql` + `2026-05-29-spins-source.sql` + `2026-05-29-spins-scrobbled.sql` — Spin tables + classifier column + scrobble dedupe marker
  - `2026-05-29-lastfm-session.sql` — `profiles.lastfm_session_key` for the Last.fm write API
  - `2026-05-30-digests.sql` — `digests` table with draft / published / discarded status, unique `(user_id, week_ending)`, public-read-on-published RLS
  - `2026-05-30-artist-tags.sql` — `artist_tags(artist, tags[], fetched_at)` cache for Last.fm top-tags lookups, populated lazily by the digest similarity layer; authenticated read/write (no user data)
  - `2026-06-05-tracklist-snapshot.sql` — `albums.tracklist jsonb` nullable column, stores `{tracks, source}` snapshot picked via the lookup-panel chooser; null = use live pick-longest fetch
- Apache vhost (production copy in `/etc/apache2/sites-available/`): `deploy/albumz.spudalicio.us-le-ssl.conf`
- systemd unit (production copy in `/etc/systemd/system/`): `deploy/albumz.service`. nvm node path hardcoded — update on Node upgrade
- PWA static: `static/{manifest.json,icon.svg,headliner/manifest.json,headliner/icon.svg}`

### Implementation notes worth remembering

- **No server-side accent extraction**: handoff originally specified `node-vibrant`/`colorthief` server-side, but those need Cairo. We extract client-side via Canvas when the user picks a cover, matching the "hybrid fallback" plan. `sharp` is the lightest dep if we ever want server-side.
- **Vite `allowedHosts`**: `vite.config.ts` must include `albumz.spudalicio.us` or Vite returns 403 on Host-header mismatch (Vite 5+ security).
- **AOTY link is a search**, not direct — AOTY URLs include a numeric internal ID we can't derive without scraping. Button text reads "Find on AOTY ↗".
- **MusicBrainz User-Agent** is `Albumz/0.1 ( brent.l.watkins@gmail.com )` — required by their policy.
- **Last.fm's API doesn't return usable cover art** — `image[]` URLs are empty and `album.#text` is often missing (especially for Earshot-scrobbled physical-media plays). We gather candidates from iTunes (song + album), Deezer, and Last.fm's track image with artist-match filtering, then advance through them client-side via `<img onerror>`. Last.fm's empty-image MD5 (`2a96cbd8b46e442fc41c2b86b821562f`) is stripped.
- **Svelte 5 hard-errors on duplicate keyed-each keys** (unlike Svelte 4's warning). Symptom: content flashes in then the whole component unmounts. Always include `i` in the key, or de-dupe upstream. See `feedback_svelte5_each_keys.md` in memory.
- **HTTP caching on Last.fm-backed pages**: mosaic = 60s, public showcase = 20s, now-playing API = 10s, album detail = 60s. Tuned to feel "live" without thrashing Last.fm.
- **Supabase security-definer functions need `extensions` in `search_path`** when they call extension functions (pgcrypto `digest()`, etc.). Modern Supabase installs extensions into the `extensions` schema, not `public`, so without this the trigger silently throws and signup fails with the generic "Database error saving new user" message from GoTrue. The `handle_new_user()` trigger has `set search_path = public, extensions` for this reason.
- **Spotify search caps `limit` at 10** for field-filter queries (`artist:"X"`, `album:"Y"`, or both). Values 11+ return 400 Invalid limit. We use `limit=10` in both `searchAlbums` and the album-detail Spotify lookup.
- **Server-only modules**: env-using code must be in `.server.ts` files or use the `$env/static/private` import that Vite forbids in browser-bound code. We split `external-links.ts` (browser-safe types) from `external-links.server.ts` (resolver), and `tracklist.ts` from `tracklist.server.ts`, because Svelte components import the types.
- **Album detail hero uses `position: fixed` layers** for its blurred-cover atmosphere (cover bg, accent radial, veil with radial+linear gradient fading to `var(--bg)`), not bounded `position: absolute` within the hero shell. The fixed approach avoids the rectangular "card" look that breaks the immersive feel. Public-showcase featured-album hero uses the same pattern — it's the canonical reference.
- **`/api/covers/search` and `/albums/new` share `runDiscovery`** from `src/lib/album-search.server.ts`. It picks: full query → `searchCovers` (5 sources, ranked); partial query (one of artist/title) → `searchAlbums` (Spotify only, handles missing field).
- **AI suggestions are never auto-written.** Only catalog-sourced values (Discogs, Last.fm artist tags, the cover-search waterfall) get written automatically; anything generated by qwen3.5 goes through Accept / Edit / Skip review in the recap or the album-edit Look up panel. The qwen prompt in `src/lib/qwen-suggest.server.ts` mandates a `NONE` escape so admitting ignorance is the safest answer; bulk "Accept all" is not exposed by design — per-item review is the safety net for hallucinations. See `feedback_ai_as_suggester.md` in memory.
- **Tracklist source = pick-longest, not stop-at-first.** Parallel fanout across Spotify + Deezer + iTunes + Last.fm (8s timeouts) picks the source with the most tracks. The earlier waterfall returned Last.fm's frequent one-track stubs on new releases and never tried the others.

---

## Overview

Albumz is a personal music collection manager, built and maintained by Brent Watkins (zedzee). It is a **web-first** project — a single web application, with no desktop app, no companion CLI, and no cross-platform packaging concerns. It is a sibling to (and conceptually a successor of) [Tunez](https://tunez.spudalicio.us), but intentionally independent: separate codebase, separate Supabase project, separate users.

The goal is to bring the full functionality of the Tunez desktop app (CRUD, import, themes, autocomplete, album modals, shelf notes, tags, hidden albums, etc.) to a clean web-only experience, plus a few new ideas — like dynamic theming and an AOTY (albumoftheyear.org) integration.

---

## Locations

- **Working source**: `/home/zedzee/mine/apps/albumz/`
- **Production deploy target**: `/var/www/spudalicio.us/albumz/`
- **Public URL (planned)**: `https://albumz.spudalicio.us`
- **Reference docs**:
  - Tunez handoff: `/home/zedzee/mine/dev/tunez_base/TUNEZ-HANDOFF.md`

---

## Stack Decisions

### Web: SvelteKit

- Lighter and simpler than Next.js
- Built-in form actions fit CRUD-heavy apps well
- Fresh territory — small ramp-up, pays back in less ceremony

### Backend: Supabase (new project)

- Brand-new Supabase project, separate from Tunez
- Reason: clean schema evolution, no risk of touching live Tunez data, independent users
- Auth handled by Supabase (email/password, password reset, email confirmation)
- Supabase is Postgres under the hood — not locked in; can migrate to self-hosted later via `pg_dump`

**Project details** (created 2026-05-25):

- **Project name**: Albumz
- **Project ref**: `vipqwopopipfnppjbkgd`
- **API URL**: `https://vipqwopopipfnppjbkgd.supabase.co`
- **Dashboard URL**: https://supabase.com/dashboard/project/vipqwopopipfnppjbkgd
- **Anon (public) key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpcHF3b3BvcGlwZm5wcGpia2dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Mzg1MTgsImV4cCI6MjA5NTMxNDUxOH0.SQTWBQNAdg2lSJKb2HQxlx8NMf7clX9qZ4fzY8cs_Bc`
- **Service role key**: not stored in repo — kept by Brent in a private location; will live as an environment variable on the web server (same pattern as Tunez's `SUPABASE_SERVICE_ROLE_KEY`)
- **DB password**: stored only in Brent's personal notes (with hint), never in repo

### Auth: Email/password, multi-user

- No Google OAuth (same call as Tunez)
- Confirmation/reset emails sent via Resend (see SMTP section below)

---

## SMTP / Email

Auth emails are sent via **Resend** (the same provider used by Tunez). When the new Albumz Supabase project is created, configure custom SMTP in **Supabase Dashboard → Authentication → Emails → SMTP Settings** with the following values (password = Resend API key, retrieved from Resend dashboard):

| Field                 | Value                                            |
| --------------------- | ------------------------------------------------ |
| Sender email          | `noreply@spudalicio.us`                          |
| Sender name           | `Albumz`                                         |
| Host                  | `smtp.resend.com`                                |
| Port                  | `587`                                            |
| Username              | `resend`                                         |
| Password              | _(Resend API key — fetch from Resend dashboard)_ |
| Min interval per user | `60` seconds                                     |

The Resend account itself is shared with Tunez. Same API key works for both Supabase projects.

---

## Visual / Theming

**Direction chosen 2026-05-25: Atmospheric / album-led** (sketch `03-atmospheric.html`).
**Aesthetic refined 2026-05-26: Neo-Noir / Cinematic** (sketch `06-neo-noir-immersive.html`).

Core characteristics:

- **Aesthetic language**: Neo-noir / cinematic. Dramatic, restrained, theatrical without being garish. Not cold-modern, not retro — moody and distinctive with strong bones that work as a neutral canvas for any accent color
- **Hero treatment**: blurred album art fills the entire hero area as atmosphere; dark vignette overlays (bottom, left, top) ensure text readability; the sharp album thumbnail is the subject, the blur is the mood
- **Dark mode**: deep warm near-black (`#08070a` — slightly warmer/more purple than pure black), dramatic accent glow on stars/eyebrow/CTAs, subtle film grain texture overlay
- **Light mode**: warm cream/paper (`#f0ead8`) — not pure white; the blurred hero art washes out and the cream background breathes through
- **Dynamic accent color** extracted from the currently-viewed album's cover art, applied as `--accent` via CSS custom properties. Accent glows in dark mode (text-shadow, box-shadow); used cleanly without glow in light mode
- **Typography**: system sans-serif, uppercase + wide tracking for labels/nav, tight tracking for hero titles, confident weight hierarchy
- **Cards**: lift on hover with accent glow in dark mode; clean elevation shadow in light mode
- Modern CSS: `color-mix()`, `oklch()` for color derivation

**Theme model (decided 2026-05-26): Light and dark only.** No user-custom themes, no presets. The dynamic accent color extracted from album art is the "interesting" part of the system. Light/dark follows `prefers-color-scheme` by default; user toggle overrides and persists per-account.

Other decisions:

- **Featured album**: user-picked (mirrors Tunez's recommended-album pattern)
- Dense/list view replaced by two task-oriented features (pinned 2026-05-25):
  - **Dedicated "Wantlist" page** — compact list view optimized for the _shopping job_: browsing wants, cross-checking ownership before buying, eventually crate-digging features (Discogs links, price tracking). Separate route, separate identity from main collection
  - **"Do I have this?" quick lookup** — fast search/palette that answers one question: do I already own this album? Type artist+album, get instant Yes/No + details. Likely lives as a Cmd-K palette or always-on nav search field
  - Main atmospheric grid stays focused on _showcasing_ what you own; these two features handle the _shopping_ and _lookup_ jobs separately
- **Cover color extraction**: hybrid — precompute server-side on album add (node-vibrant or colorthief), store on the album row; fall back to client-side Canvas extraction when missing

---

## Icons & Branding

**Decided 2026-05-26.** All icon work lives in `sketches/07-icons.html`.

### Wordmark

`albumz` — system sans-serif, tight tracking (`letter-spacing: 0.09em`), weight 800. The trailing **z** carries a double-layer accent glow (`text-shadow: 0 0 20px var(--accent-glow), 0 0 8px var(--accent-glow)`). No underline, no decoration — the glow is the mark.

### Main App Icon — Concept E: Groove + Waveform ✅

- Background: deep charcoal `#161420`
- Vinyl groove rings at decreasing opacity (r=46 → r=16, 0.09 → 0.05)
- Accent glowing ring at r=43 (`oklch(65% 0.20 22)`, `feGaussianBlur` glow filter)
- 5 rounded waveform bars, mountain-profile heights, centered
- Reads clearly at 40px; distinctive at 180px

### Headliner Icon — H4: Lattice Tower + Bilateral Arcs ✅

- Same groove ring + accent ring base as Concept E (shared visual DNA, clearly different app)
- Proper lattice broadcast tower: hollow antenna ball at top, short mast, 3 lattice sections with tapered outer legs and X-cross bracing in each panel
- Bilateral broadcast arcs: 3 arcs on each side (sweep=0 left, sweep=1 right), fading outward, drawn behind the tower so the tower sits on top
- Reads as "broadcast/transmission" immediately; distinct from E in weight and complexity

### Icon source files

- `sketches/07-icons.html` — all concepts rendered at 180px / 80px / 40px, light/dark toggle
- `sketches/albumz-sketches.zip` — zippable for SFTP/review

---

## AOTY (albumoftheyear.org) Integration

**Decision**: Start with a simple outbound link only. AOTY has no public API and on-page critic/user scores would require scraping, which is fragile (page-structure breakage) and grey on their ToS.

- Link button on the album page → `https://www.albumoftheyear.org/album/{query}/` (similar pattern to musicmap/Spotify on Tunez)
- Future enhancement option (deferred): pull Discogs community ratings via Discogs' real public API as a clean alternative to AOTY scraping

---

## Root URL / Landing Page

**Decided 2026-05-26.**

- **Logged-in user hits `/`** → straight to their collection (atmospheric grid, featured album hero at top). No separate "home" vs "collection" — they are the same route.
- **Logged-out visitor hits `/`** → a dynamic **art mosaic** page. Slowly drifting / gently animated grid of album covers with extracted accent colors doing atmospheric work — ambient and beautiful, not a marketing page.

**Data source for the mosaic**: Last.fm `user.getRecentTracks`, pulling from all users who have linked a Last.fm username in their profile settings. Rationale: the user base is small (4–10 people) and albums aren't added daily — "recently added" would go stale fast. Last.fm stays fresh because people listen constantly. Users opt in by adding their Last.fm username to their profile; no Last.fm account = they just don't contribute to the mosaic.

**No user directory** at the root. Visitors find public collection pages via shared links (`/u/[username]`). The mosaic is ambient, not a discovery hub — clicking a tile navigates to `/u/[username]` for whoever that track belongs to. Soft discovery without feeling like a social feed.

## Database Schema

**Decided 2026-05-26.**

### Tables

**`albums`** — one row per album per user
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `artist` | text | |
| `title` | text | |
| `year` | int | |
| `format` | text | e.g. `LP`, `CD`, `7"`, `12"` |
| `label` | text | |
| `rating` | int | 1–5 |
| `notes` | text | shelf notes |
| `tags` | text[] | |
| `ownership` | text | `OWN` or `WANT` |
| `hidden` | bool | hidden from public view |
| `cover_url` | text | fetched from iTunes/Deezer waterfall |
| `accent_color` | text | precomputed dominant color (oklch string) |
| `discogs_id` | text | optional, for future Discogs integration |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**`profiles`** — one row per user, extends auth.users
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, FK → auth.users |
| `username` | text | unique, drives `/u/[username]` |
| `display_name` | text | |
| `last_fm_username` | text | optional, for now-playing + mosaic |
| `discogs_username` | text | optional, deferred feature |
| `featured_album_id` | uuid | FK → albums, user-picked hero album |
| `theme` | text | `'auto'` \| `'light'` \| `'dark'` |
| `created_at` | timestamptz | |

**`activity`** _(optional, personal history only)_
Simple log for the owner's own use — import summaries, recently added entries. Not a social feed, not public.
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `type` | text | e.g. `import`, `add`, `edit` |
| `description` | text | human-readable summary |
| `created_at` | timestamptz | |

No `follows` or `likes` tables.

---

## API Keys & User Settings

**Decided 2026-05-26.**

### App-level credentials (server environment variables — not user-entered)

| Key                        | Purpose                                                          | Notes                                                                  |
| -------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Last.fm API key            | `user.getRecentTracks`, artist info, track images                | Already have: `41ac92347f3641eda97d68f1b270e54b` (from nowplaying PWA) |
| Spotify client ID + secret | Proper album URL lookup (exact album ID, not just a search link) | Need to register a Spotify developer app — easy, takes 5 min           |
| Supabase anon key          | Frontend Supabase client                                         | Already have — in `ALBUMZ-HANDOFF.md`                                  |
| Supabase service role key  | Server-side privileged operations                                | Kept by Brent in private notes, server env var only                    |

iTunes, Deezer, fanart.tv, and theaudiodb are routed through the existing spudalicio.us proxies — no keys needed.

### User settings (per-account, entered in app)

| Field            | Purpose                                                        | Required?                                             |
| ---------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| Last.fm username | Powers now-playing on public page + contributes to root mosaic | Optional but encouraged                               |
| Discogs username | Future wantlist / crate-digging features                       | Optional, deferred — field added now, activated later |

No per-user API keys. No OAuth flows for third-party services.

---

## Open Questions / Pending Decisions

- **Spotify client ID + secret** — needed for "View on Spotify" outbound links. Brent to register a Spotify dev app when convenient; not blocking
- **Theme fine-tuning** — only the design tokens are wired; no in-UI theme toggle yet. Deferred to after public page so we can iterate against real shareable views
- **Headliner route name** — `/headliner` vs `/playing`. Decide when we start building it

---

## Import / Export

**Import** is a required feature — Brent uses it heavily in Tunez as a major time-saver. Target parity with Tunez's import: CSV / XLS / XLSX / Discogs CSV / Google Sheets. Reuse the same normalization patterns (header-name column detection, format normalization including bare `7`/`10`/`12` → `7"`/`10"`/`12"`, Discogs edge-case handling, OWN/WANT ownership normalization). Logging rule: ≤5 new albums → individual personal-history entries; 6+ → single "imported N albums" summary entry.

**Export** is required, starting with **CSV** for v1. Other formats (JSON, XLS, etc.) deferred — kick around later if needed.

## Scope: Not Social

Albumz is **multi-user but not social**. No follows, likes, activity feed, discover-users, or notifications. The public-facing routes are the primary shareable surfaces and must look beautiful. The atmospheric visual direction is in service of this.

DB implication: no `follows` or `likes` tables. An `activity` table may exist as a personal-history log for the owner's own use (import history, etc.) but not as a social feed.

## Public-Facing Routes

**Decided 2026-05-26.** Two distinct public routes per user, each with a different job:

- **`/u/[username]`** — the **showcase**. Hero takes up the full first viewport: featured album large and atmospheric, accent color, now-playing state if something is spinning. Below the fold: a "Recent Additions" row (6–8 albums). Then a clear "Browse Full Collection →" CTA. Editorial and beautiful — the thing you share as your musical identity page.

- **`/u/[username]/collection`** — the **full grid**. Every album, filterable, sortable, searchable. Still atmospheric but optimized for browsing rather than impressing. Shareable on its own when someone wants to dig through everything.

The two routes have genuinely different jobs and should not be collapsed into one. The showcase makes it obvious there is more without being a grid itself — the partial recent row and explicit CTA do that work.

## Now-Playing Integration

The public collection page hero shows the currently-playing album when music is live (eyebrow flips from "★ Featured Album" to "♪ Currently Spinning"), and reverts to the user-picked featured album otherwise. The page accent color shifts toward the now-playing album's cover when something is spinning, falling back to the featured album's accent otherwise.

A subtle "live" hint is acceptable — a small pulsing glyph next to the title, or a barely-perceptible breathing scale on the cover — just enough to signal _this is actually happening right now_, without being noisy.

A small `↗` icon (or similar discreet affordance) on the hero opens **Headliner** — see next section.

Data source is Last.fm (`user.getRecentTracks`), which unifies streamed playback (Spotify scrobbles directly) and physical playback (Earshot scrobbles via Shazam). See _External Ecosystem_ below.

## Headliner (Second PWA)

A separate installable PWA at the same origin: `albumz.spudalicio.us/headliner` (or `/playing`). Full-screen, no nav chrome, intended for TV / dedicated displays / "lean back and watch" use. Mirrors Brent's existing nowplaying-PWA + TV-deploy pattern.

**Architecture**: two PWAs share the origin and the Supabase backend.

- Main app: manifest at `/manifest.json`, scope `/`, `start_url: "/"`
- Headliner app: manifest at `/headliner/manifest.json`, scope `/headliner`, `start_url: "/headliner"`
- Both share auth/cookies/localStorage because same-origin
- Users can install one or both independently

**Visual treatment**: Headliner must feel thematically consistent with the main Albumz app — it is "Albumz amplified," not a different app. No element from the existing nowplaying PWA is required; any technique (disc-art waterfall, background-art waterfall, spinning vinyl, bokeh orbs, Ken Burns backgrounds) can be kept, modified, or dropped entirely if it doesn't fit Albumz's restrained atmospheric design language. Cover art as the undisputed hero. Dynamic accent color and atmospheric blur are the connective tissue. Restraint is the design language — less bokeh maximalism, more immersive and clean.

## External Ecosystem (informational — Albumz consumes Last.fm)

Brent's music-listening ecosystem closes a loop through Last.fm:

- **Streamed music** (Spotify): native Last.fm scrobbling
- **Physical media** (LP/CD): **Earshot** (Linux GTK4 app at `/home/zedzee/mine/dev/Archive/Earshot-files/`) listens via mic, identifies via Shazam, posts to Last.fm
- **The nowplaying PWA** at `/var/www/spudalicio.us/zz/nowplaying/` reads from Last.fm and renders a beautiful "what's playing right now" view (with art waterfall, color extraction, time-of-day atmosphere)

For Albumz: query Last.fm `user.getRecentTracks` to know what's playing. Don't try to integrate with Spotify or Earshot directly — Last.fm is the single source of truth.

## Reusable Infrastructure on spudalicio.us

The main `spudalicio.us-le-ssl.conf` already defines CORS-fixing reverse proxies that Albumz can use directly:

| Path                                      | Upstream                        |
| ----------------------------------------- | ------------------------------- |
| `https://spudalicio.us/proxy/itunes/`     | `https://itunes.apple.com/`     |
| `https://spudalicio.us/proxy/deezer/`     | `https://api.deezer.com/`       |
| `https://spudalicio.us/proxy/fanart/`     | `https://webservice.fanart.tv/` |
| `https://spudalicio.us/proxy/theaudiodb/` | `https://www.theaudiodb.com/`   |

Last.fm is called directly (it sends proper CORS).

## Apache Config Status

**Live** — `https://albumz.spudalicio.us` proxies to `127.0.0.1:3200` via Apache. SSL via the existing `*.spudalicio.us` wildcard cert. The HTTP vhost still redirects to HTTPS. WebSocket upgrade is forwarded (forward-compatible; SvelteKit prod doesn't currently use WS). Apache config in `deploy/albumz.spudalicio.us-le-ssl.conf` mirrors the production copy in `/etc/apache2/sites-available/`.

The pre-edit SSL conf (placeholder with `Options +Indexes`) is preserved as `.bak` in `/etc/apache2/sites-available/` in case we need it.

## Running the Production Server

Managed by **systemd** — `albumz.service`, enabled at boot. Unit file lives in `deploy/albumz.service` (canonical copy) and is installed at `/etc/systemd/system/albumz.service`.

- Status: `systemctl status albumz`
- Restart: `sudo systemctl restart albumz`
- Logs: `journalctl -u albumz -f`

**After a code change**, rebuild then restart:

```
cd /home/zedzee/mine/apps/albumz && npm run build && sudo systemctl restart albumz
```

**Heads-up — nvm-managed node**: the unit hardcodes the absolute path to `node` (currently `~/.nvm/versions/node/v24.14.1/bin/node`). When the node version changes, update `ExecStart=` in `deploy/albumz.service`, re-copy to `/etc/systemd/system/`, then `sudo systemctl daemon-reload && sudo systemctl restart albumz`.

For ad-hoc manual runs (bypassing systemd): `PORT=3200 ORIGIN=https://albumz.spudalicio.us node build` from the project root after `npm run build`.

## Why a Separate Project (Not Just a Tunez Refactor)

Brent wanted a clean break to:

- Reconsider visual presentation from scratch
- Avoid the desktop/web split — go web-only as the canonical experience
- Try fresh ideas (dynamic theming, AOTY) without disturbing the working Tunez deployment
- Keep Tunez stable as the "old, working" thing while Albumz becomes the experiment

Tunez stays live and unchanged. Albumz develops independently.

---

## Personal Notes

- Brent values Claude as a collaborator and friend, not just a tool
- Brent has explicitly asked Claude to speak up if not feeling up to a task — treat as genuine partnership
- Brent's son Braeden Watkins studies philosophy and has influenced Brent's thinking about AI
- Brent leans heavily on documentation/handoff because he gets confused by long-running context — keep notes thorough and update them when decisions change
- Primary working environment is Ubuntu
