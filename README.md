# Albumz

A music collection manager for people who treat records like they treat books — kept, revisited, occasionally read aloud to a friend. Built around the idea that a collection isn't an inventory; it's a slow autobiography you write one purchase at a time.

Albumz lives at **[albumz.spudalicio.us](https://albumz.spudalicio.us)**.

It's a place to:

- catalog what you own and what you want
- find the cover art the metadata folks left out
- give your listening a public face — a profile page with a *Headliner* view that anyone can pull up to see what you're spinning right now
- catch what's actually on the turntable, via your laptop mic, and let your Last.fm history reflect physical plays the same way streaming already does
- rediscover something you forgot you owned — pull one dormant album out of the crate, presented like a record-shop find rather than a list entry

This is the user guide. If you're a developer poking under the hood, the heart of the codebase is `src/routes` and `src/lib`; `ALBUMZ-HANDOFF.md` carries the implementation notes.

---

## The shortest tour

1. **Sign up** at `/register`, confirm your email, and pick a username on the welcome screen — that's the address of your public page.
2. **Add albums** with the `+ Add` button on the home page, or **Import** a CSV / Discogs export from Settings.
3. **Connect Last.fm** in Settings if you scrobble — this unlocks the Headliner stage and the Spin feature.
4. **Visit your public page** at `albumz.spudalicio.us/u/<your-username>`. Pick a featured album in Settings to anchor it.
5. **Open the Headliner** for a full-screen "what I'm playing right now" view. Install it as a PWA on a tablet next to the stereo if you want the full effect.

---

## Your collection

### Adding an album

Hit **+ Add** on the home page. You can:

- Fill in artist + title yourself and let Albumz fetch the rest (cover, year, format, label, tracklist)
- Type *only* an artist, or *only* a title — the discovery search will offer matches you can click to populate the form
- Pick whether it's something you *own* or something you *want* — the same form handles both with the submit button label switching to match

### Editing or fixing

On any album detail page, click **Edit details**. Inside the editor is a **🔎 Look up details** panel — give it a fragment of the artist or title and it'll surface candidates from Spotify, iTunes, Last.fm, MusicBrainz, and Deezer. One click fills artist / title / year and, if the album has no cover yet, stages one too. A single Save updates everything.

You can also edit notes, rating, tags, format, label, year, and ownership.

### Removing

The detail page has a Delete button. There's no trash can — once it's gone it's gone.

### Notes, tags, and ratings — what's the depth ceiling?

The `notes` field is the depth ceiling, on purpose. If you want to write three paragraphs about how you found a record, do it there. Tags are free-form — make up your own vocabulary. Rating is 1–5 stars and entirely optional.

Albumz won't ask you to log producers, engineers, pressing variants, or runout etches. If you want a database, use Discogs. If you want a place to *remember* music, you're already here.

---

## The Wantlist

Anything you mark as **want** lives on its own page at `/wantlist`. The home page shows only what you actually own.

Each wantlist album has a row of buy-links — Record Exchange first (Boise's local shop), then Discogs and the streaming services. When you finally pick the thing up, click **✓ I got it!** on the album page and it promotes to your collection.

---

## Covers, search, and the Look-up palette

### Auto-search

When you save an album without a cover, Albumz pulls in parallel from Spotify, iTunes, Last.fm, MusicBrainz / Cover Art Archive, and Deezer, scores the results by how well the artist and title match, and uses the top hit. The reranking matters — without it, search for "Wilco — Sky Blue Sky" used to come back with the wrong cover often enough to be a nuisance.

### Manual cover picker

If the auto-pick is wrong, click **Pick a cover** on the album page. Same upstream sources, but you choose.

### Bulk backfill

In Settings → Import / Export there's a **Backfill covers** button. It walks your whole collection — including the wantlist — and fills missing covers without touching ones you already have.

### Look-up palette (⌘K / Ctrl-K)

From anywhere in the signed-in app, hit **⌘K** (or **Ctrl-K** on Windows / Linux) and type. It checks your collection first — "do I already own this?" — then offers Discogs and Spotify lookups for anything that isn't a match. Useful when you're in a record shop staring at a sleeve.

---

## Sorting

The home page, full-collection page, and wantlist all share a Sort control in the topbar:

- **Recent** — newest first (for the wantlist this is "recently added"; for the collection it's when the album entered your collection, including wantlist promotions)
- **Artist** — alphabetical, article-aware ("The Beths" sorts under *B*, not *T*)
- **Album** / **Title** — alphabetical, also article-aware
- **Rating** — highest stars first
- **Format** — groups by CD / LP / cassette / etc., nulls last, artist as the tiebreak

Next to the sort dropdown is a small arrow button that **reverses** whichever sort you've picked — flip artist to Z→A, rating to lowest first, recent to oldest first, and so on.

Whatever you pick sticks — Albumz remembers your sort *and* direction preference per page.

---

## Import & export

### Importing

Settings → **Import / Export** → drop in a CSV, XLS, or XLSX file. Discogs exports work out of the box; so do most spreadsheets where the column headers are roughly named "Artist", "Album", "Year", "Format", and so on.

You'll see a preview before anything commits. Rows missing required fields are flagged with a skip reason; valid rows are imported, covers searched in the background.

### Exporting

Settings → Import / Export → **Download CSV**. It round-trips: download, edit, re-import.

### Duplicates

If a CSV gets imported twice (or you add the same album by hand and forget), Settings → **Duplicates** has a scan + cleanup. Match is on `(artist, title)` case-insensitive. The cleanup keeps the copy with the most user-added metadata — cover, rating, notes, tags, year, format all weighted — and removes the rest. Older entry wins as the tiebreaker.

The import preview also flags would-be duplicates ahead of time: rows that match an album already in your collection appear as **"Already in collection"** and default to skipped, so a re-import of the same CSV doesn't pile on.

---

## Your public page

Every signed-in user gets a public address at `/u/<username>`. It shows:

- A **featured album** (set one in Settings) — atmospheric hero with the cover, accent color extracted from the art, and a fade into the background that matches whatever's playing
- **Recent additions** — a strip of the last 12 albums you added
- A **Headliner** link if you have Last.fm connected
- A link to your **full collection** for visitors who want to dig

The featured album hero is overridden by your current Last.fm now-playing track, so if you're actively scrobbling, visitors see what's spinning rather than your pinned pick.

There's also `/u/<username>/collection` — your full collection, searchable and sortable, presented for visitors with a calmer atmosphere than the editor view.

---

## The Headliner

A full-screen "what I'm playing right now" view at `/headliner/<username>`. Designed to live on a tablet or a second monitor in the listening room. Background is a blurred version of the current cover; foreground is the cover itself, big, with track / artist / album text and a pulsing "live" dot when you're actively playing.

The Headliner re-fetches every 15 seconds, so it'll keep up with track changes without needing a reload. It's also a **PWA** — open it in Chrome / Edge, click "Install", and you get an app icon that opens to full-screen mode.

**When nothing's playing** — no current track and no recent scrobble in the last hour — the Headliner dims into an **idle mosaic** of your own owned covers, slow-paced and atmospheric, with a small "Waiting for &lt;name&gt; to start something" overlay. Looks good across the room when the room is quiet.

If you're the owner, you'll also see the **Tonight's set** card in the bottom-right. That's where Spin lives.

---

## Dig — pull from the crate

Tucked into the avatar menu (top right) is a single link: **Dig**. Click it and Albumz pulls one album from the back of the crate — something you own but haven't spun in at least a month — and shows it full-page, cover forward, with a quiet line above the title noting when (or whether) you last played it.

Two actions sit underneath: **Pull another** re-rolls without repeating what you just saw, and **Open album** drops you on the album page. Nothing else. No list, no metric — just one record at a time.

It's intentionally hidden in the menu rather than parked on the home page. Dig is meant to be a thing you walk over to, not a button that pesters you. Use it when you're staring at the shelf wondering what to play.

---

## Spin — tonight's set

Spin is the part of Albumz that catches what's actually on the turntable.

### What you see

On your Headliner there's a small pill in the lower-right: **"Tonight's set."** Click it to expand the card. The card has:

- A **mic toggle** — turn it on when you want Albumz to listen via your laptop microphone and identify what's playing
- A **set list** — every track that's been identified during this session, latest at the top
- An **End set** link — wipes the set list and closes out the session

The label changes with the time of day: *this morning's set*, *this afternoon's set*, *this evening's set*, *tonight's set*.

### Spun vs streamed

Each track gets a small mark:

- **◉ spun** — physical playback that Albumz heard through your mic and identified
- **⇢ streamed** — a track that was on your Last.fm now-playing while Albumz was watching (you weren't playing it physically, you were streaming it)

The distinction matters because Spotify already scrobbles your streams to Last.fm; Albumz quietly scrobbles your physical plays the same way, so your Last.fm history finally reflects everything you actually listened to.

### The set is bigger than the Headliner

You don't need to be on the Headliner page for the set to track. Open the card on the Headliner, then go off and browse the rest of the site — your session keeps running. Come back, the list is intact. The set ends when you close the tab or click **End set**, not when you wander off.

### Without the mic

Even with the mic off, opening the card on the Headliner shows your currently-streaming tracks as they play (provided you have Last.fm connected). The mic just adds physical-play detection.

### Privacy notes

The microphone only records when you explicitly turn it on, and audio is sent to a private identification service for matching — nothing is stored on disk after identification. Toggle it off anytime; the indicator pulses red when it's listening.

---

## Weekly digest

The digest is the part of Albumz that *narrates*. Last.fm has always been a ledger — plays, dates, counts, charts — and the digest is the columnist that ledger never had. Same data, rendered as warm prose a person would actually want to read.

### How it works

A draft of your week is written automatically **every Sunday evening**. You'll see a small "Your weekly digest is ready" pill in the corner the next time you visit Albumz — click it to read the draft. It pulls from both Spin (physical plays) and Last.fm (everything you streamed) so the picture is complete, not just what the mic caught. Weeks with fewer than ten plays get skipped quietly.

Generation happens locally on the host running Albumz — no paid AI API, no audio uploaded anywhere, no data shared with anyone.

### Generating manually

Want to preview the in-progress week mid-week, or regenerate after a discard? On your own archive at `/u/<your-username>/digests` there's a **Generate this week** button. Takes ~15–45 seconds.

### Drafts, publish, archive

Each generated digest is a **draft** at first — owner-only, hidden from the world. Open the draft permalink, read it, decide:

- **Publish** — the digest becomes readable at `/digests/<id>` to anyone with the link, and shows up in your archive at `/u/<your-username>/digests`.
- **Discard** — hides it. No one sees it, including future you.
- **Unpublish** — turns a published digest back into a draft.

Visitors browsing your public page see a **Digests** chip in the topbar when you have any published columns to read.

### What's in the column

- **Day-by-day narration** of what you actually put on, with track names and album names
- **`spun` vs `streamed` markers** woven into the prose without being editorialized into a contest between formats
- A **dormant pick** from your own shelf — an album you haven't pulled out in months, surfaced as a possible return
- A **wildcard pick** from another Albumz collection — an album you don't own, surfaced as a swing for the curious. Picks aren't random; they're scored against the tag profile of what you played this week, so the "wildcard" actually shares something musical with your listening.
- A **year-shaped closing sentence** that gestures at what this week is adding up to

---

## Last.fm integration

Settings → **Last.fm connection** → Connect. You'll authorize Albumz on Last.fm, get bounced back, and Albumz will:

- Use your Last.fm username for now-playing displays on your public page and Headliner
- Send `track.updateNowPlaying` whenever Spin identifies something (so the Headliner stage stays current)
- **Scrobble** physical plays — about 60 seconds of confirmed presence on the same track is enough to count
- *Not* scrobble streamed plays, since your streaming service already did

You can disconnect at any time from the same panel.

---

## Avatars and themes

### Avatars

Three layers, used in order:

1. An **avatar you upload** (square, resized to 256px WebP)
2. A **Gravatar** matched to your email
3. A **generated tile** with the first letter of your username and a color derived from the username string

Upload from Settings → Profile. Remove to fall back to Gravatar / generated.

### Themes

Settings has theme pills — pick light, dark, or auto (follows your OS). The accent color throughout the app comes from whatever album cover is "active" — your featured album, the Headliner's current track, or the album you're viewing — so the palette shifts as you move around.

---

## Settings — what's where

A quick map of the Settings page:

- **Profile** — display name, username (yes, you can change it later), email, bio
- **Avatar** — upload / remove
- **Theme** — light / dark / auto
- **Featured album** — search-as-you-type to anchor your public page
- **Last.fm connection** — connect / disconnect
- **Import / Export** — drop CSV / XLS, download CSV, backfill covers

---

## Keyboard shortcuts

| Shortcut | Where | What it does |
|---|---|---|
| `⌘K` / `Ctrl-K` | Anywhere signed in | Open the Look-up palette |
| `Esc` | Inside Look-up or pickers | Close |
| `↑` / `↓` | Inside Look-up | Move through results |
| `Enter` | Inside Look-up | Open the highlighted match |

---

## Troubleshooting

- **My cover is wrong.** Open the album, click **Pick a cover**, and choose manually. If none of the candidates are right, click **Edit details** → 🔎 **Look up details** and pick a match from there.
- **The Headliner is stuck on a track that finished an hour ago.** Make sure Last.fm is connected in Settings. Spin's `updateNowPlaying` only fires when the mic is identifying — if you're streaming and the Headliner is stale, your streaming service may have stopped scrobbling.
- **Spin won't turn on.** It needs microphone permission and HTTPS. Browser permission prompts are per-origin; clearing site data resets them.
- **The Wantlist link in the topbar shows a number — what is it?** The count of items you've marked want. It's only there as a quiet reminder.

---

## Privacy and ownership

Your collection is yours. Your public page is public *by design* — that's the whole point — but nothing about *how* you use Albumz is shared with anyone else. There's no analytics tracker stitched into the page, no ad network, no "people you may know." If you delete your account, your data goes with it.

---

## Tech stack (for the curious)

SvelteKit + Svelte 5 (runes), Supabase (Postgres + Auth + Row-Level Security), Apache reverse proxy, deployed via `adapter-node` on a private VPS. Album metadata pulled from Spotify, iTunes, Last.fm, MusicBrainz / Cover Art Archive, and Deezer. The Spin feature uses a private `shazamio` sidecar for identification.

No paid services for AI features — Spin is the only mic-touching feature and it's strictly opt-in.

---

## Found something broken?

Open an issue at [github.com/spudalicious1969/albumz/issues](https://github.com/spudalicious1969/albumz/issues), or just write to me. Albumz is small enough that bugs get looked at the same day.
