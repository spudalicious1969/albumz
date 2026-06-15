<script lang="ts">
	// User guide. Mirrors README.md so visitors who never touch GitHub can still
	// learn the place. Sections are scroll-anchored so we can link into them.
</script>

<svelte:head><title>Help — albumz</title></svelte:head>

<div class="page">
	<header class="topbar">
		<a href="/" class="back">← Collection</a>
		<h1>Help</h1>
	</header>

	<section class="lede">
		<p>
			Albumz is a music collection manager for people who treat records like they treat books —
			kept, revisited, occasionally read aloud to a friend. A collection isn't an inventory. It's a
			slow autobiography you write one purchase at a time.
		</p>
		<p>
			This page is the user guide. Browse the sections, or skim the
			<a href="#shortcuts">keyboard shortcuts</a> if you're already in a hurry.
		</p>
	</section>

	<nav class="toc" aria-label="On this page">
		<h2>On this page</h2>
		<ul>
			<li><a href="#start">The shortest tour</a></li>
			<li><a href="#collection">Your collection</a></li>
			<li><a href="#wantlist">The Wantlist</a></li>
			<li><a href="#covers">Covers &amp; look-up</a></li>
			<li><a href="#sort">Sorting</a></li>
			<li><a href="#import">Import &amp; export</a></li>
			<li><a href="#public">Your public page</a></li>
			<li><a href="#headliner">The Headliner</a></li>
			<li><a href="#dig">Dig — pull from the crate</a></li>
			<li><a href="#discover">Discover — steer the next record</a></li>
			<li><a href="#spin">Spin — tonight's set</a></li>
			<li><a href="#digest">Weekly digest</a></li>
			<li><a href="#lastfm">Last.fm integration</a></li>
			<li><a href="#look">Avatars &amp; themes</a></li>
			<li><a href="#shortcuts">Keyboard shortcuts</a></li>
			<li><a href="#trouble">Troubleshooting</a></li>
		</ul>
	</nav>

	<section id="start" class="card">
		<h2>The shortest tour</h2>
		<ol>
			<li>
				Sign up, confirm your email, and pick a username on the welcome screen — that becomes the
				address of your public page.
			</li>
			<li>
				Add albums with <strong>+ Add</strong> on the home page, or import a CSV / Discogs export from
				Settings.
			</li>
			<li>
				Connect Last.fm in Settings if you scrobble — this unlocks the Headliner stage and Spin.
			</li>
			<li>
				Visit your public page at <code>/u/&lt;your-username&gt;</code>. Pick a featured album in
				Settings to anchor it.
			</li>
			<li>
				Open the Headliner for a full-screen "what I'm playing right now" view. Install it as a PWA
				on a tablet next to the stereo if you want the full effect.
			</li>
		</ol>
	</section>

	<section id="collection" class="card">
		<h2>Your collection</h2>
		<p>
			<strong>Add an album.</strong> Hit <strong>+ Add</strong> on the home page. Fill in artist + title
			and Albumz fetches the rest — cover, year, format, label, tracklist. If you only have a fragment
			of an artist or title, the discovery search will offer matches you can click to populate the form.
			You choose whether the album is something you own or something you want.
		</p>
		<p>
			<strong>Edit or fix.</strong> On any album detail page, click <strong>Edit details</strong>.
			Inside the editor is a <strong>🔎 Look up details</strong> panel that searches Spotify,
			iTunes, Last.fm, MusicBrainz, and Deezer — one click fills artist / title / year, and stages a
			cover too if there isn't one yet. Underneath the cover picker, the same panel surfaces
			<strong>suggestions for empty fields</strong>
			— tags from Discogs (or Last.fm as a fallback), and a label / tag suggestion from a local AI as
			a final fallback. Each one is marked with its source and has
			<strong>Accept / Edit / Skip</strong> controls, so nothing writes without your say-so.
		</p>
		<p>
			<strong>Pick a tracklist.</strong> The same panel also surfaces a <strong>Tracklist</strong>
			chooser — one row per source that returned tracks (Spotify, Deezer, iTunes, Last.fm), with track
			count + total runtime. Click a row to expand the full list; click
			<strong>Accept</strong>
			to pin that source's tracklist to the album. The album page reads the pinned snapshot on every load,
			so what you picked is what you see. <strong>Use auto-pick</strong> clears the pin and goes back
			to "longest wins."
		</p>
		<p>
			<strong>Notes, tags, ratings.</strong> The <code>notes</code> field is the depth ceiling on purpose.
			Want to write three paragraphs about how you found a record? Do it there. Tags are free-form — make
			up your own vocabulary. Rating is 1–5 stars and entirely optional.
		</p>
		<p class="aside">
			Albumz won't ask you to log producers, engineers, or pressing variants. If you want a
			database, use Discogs. If you want a place to remember music, you're already here.
		</p>
	</section>

	<section id="wantlist" class="card">
		<h2>The Wantlist</h2>
		<p>
			Anything you mark as <em>want</em> lives at <code>/wantlist</code>. The home page shows only
			what you actually own.
		</p>
		<p>
			Each wantlist album has a row of buy-links — Record Exchange first (Boise's local shop), then
			Discogs and the streaming services. When you finally pick the thing up, click <strong
				>✓ I got it!</strong
			> on the album page and it promotes to your collection.
		</p>
	</section>

	<section id="covers" class="card">
		<h2>Covers &amp; look-up</h2>
		<p>
			<strong>Auto-search.</strong> When you save an album without a cover, Albumz pulls in parallel
			from Spotify, iTunes, Last.fm, MusicBrainz / Cover Art Archive, and Deezer, scores by how well
			artist and title match, and uses the top hit —
			<em>but only when the match is strong enough</em>. Artist names that only partially match (the
			old "Helium" / "Hellium" / "Helium Sound" trap) no longer auto-attach; ambiguous albums stay
			in the missing-covers list so you can pick manually.
		</p>
		<p>
			<strong>Manual picker.</strong> If the auto-pick is wrong, click <strong>Pick a cover</strong> on
			the album page. Same sources, you choose.
		</p>
		<p>
			<strong>Bulk backfill missing details.</strong> Settings → Import / Export →
			<strong>Backfill missing data</strong>. Walks your collection — including the wantlist — and
			fills missing <strong>covers, years, labels, and tags</strong> without touching anything you've
			already set. Sources are tried in priority order: Discogs first (release-level styles + genres for
			tags, year + label from the release record), Last.fm artist tags as a fallback, then a local AI
			as a final fallback for tags and label.
		</p>
		<p>
			The recap shows per-field results: what was attempted, what was filled, and what's still
			missing. Anything sourced from the AI surfaces in the recap with an <strong>"AI"</strong>
			badge and <strong>Accept / Edit / Skip</strong> controls — verifiable catalog data writes automatically,
			AI guesses don't.
		</p>
		<p>
			<strong>Refresh broken covers.</strong> Settings → <strong>Refresh broken covers</strong>.
			Cover URLs live on outside CDNs, and once in a while an image gets removed or relinked there —
			the album still has a cover <em>set</em>, so backfill skips it, but it shows up blank. This
			pass pings every cover you have (owned and wantlist), and for any that come back dead (a 404
			from the source) it re-fetches a working one. It only touches covers it confirms are broken,
			and only swaps in a replacement it confirms loads — a slow network or a temporary outage won't
			cause it to wipe good art. Anything it can't auto-heal is listed so you can
			<strong>Pick a cover</strong> by hand.
		</p>
		<p>
			<strong>Look-up palette (⌘K / Ctrl-K).</strong> From anywhere in the signed-in app. Checks your
			collection first ("do I already own this?"), then offers Discogs and Spotify lookups for anything
			that isn't a match. Useful when you're in a record shop staring at a sleeve.
		</p>
	</section>

	<section id="sort" class="card">
		<h2>Sorting</h2>
		<p>The home page, full-collection page, and wantlist all share a Sort control in the topbar:</p>
		<ul>
			<li>
				<strong>Recent</strong> — newest first (for the wantlist this is "recently added"; for the collection
				it's when the album entered your collection, which includes wantlist promotions)
			</li>
			<li>
				<strong>Artist</strong> — alphabetical, article-aware ("The Beths" sorts under <em>B</em>,
				not <em>T</em>)
			</li>
			<li><strong>Album</strong> / <strong>Title</strong> — alphabetical, also article-aware</li>
			<li><strong>Rating</strong> — highest stars first</li>
			<li>
				<strong>Format</strong> — groups by CD / LP / cassette / etc., nulls last, artist as the tiebreak
			</li>
		</ul>
		<p>
			Next to the sort dropdown is a small arrow button that <strong>reverses</strong> whichever sort
			you've picked — useful for flipping artist to Z→A, rating to lowest first, recent to oldest first,
			and so on.
		</p>
		<p>Whatever you pick sticks. Albumz remembers your sort and direction preference per page.</p>
	</section>

	<section id="import" class="card">
		<h2>Import &amp; export</h2>
		<p>
			<strong>Importing.</strong> Settings → Import / Export → drop in a CSV, XLS, or XLSX file. Discogs
			exports work out of the box; so do most spreadsheets where the column headers are roughly named
			"Artist", "Album", "Year", "Format", etc. You'll see a preview before anything commits — rows missing
			required fields are flagged with a skip reason.
		</p>
		<p>
			<strong>Exporting.</strong> Settings → Import / Export → <strong>Download CSV</strong>. It
			round-trips: download, edit, re-import.
		</p>
		<p>
			<strong>Duplicates.</strong> Settings → <strong>Duplicates</strong> scans your collection for the
			same artist + title (case-insensitive) and cleans up on confirm. Highest-metadata copy of each group
			is kept — cover, rating, notes, tags weighted — and the rest are removed. The import preview also
			flags would-be duplicates ahead of time so re-imports of the same CSV don't pile on.
		</p>
	</section>

	<section id="public" class="card">
		<h2>Your public page</h2>
		<p>Every signed-in user gets a public address at <code>/u/&lt;username&gt;</code>. It shows:</p>
		<ul>
			<li>
				A <strong>featured album</strong> — atmospheric hero with the cover, accent color from the art,
				and a fade into the background.
			</li>
			<li><strong>Recent additions</strong> — the last 12 albums you added.</li>
			<li>A <strong>Headliner</strong> link if you have Last.fm connected.</li>
			<li>
				A link to your <strong>full collection</strong> at
				<code>/u/&lt;username&gt;/collection</code> for visitors who want to dig.
			</li>
		</ul>
		<p>
			The featured album hero is overridden by your current Last.fm now-playing track. If you're
			actively scrobbling, visitors see what's spinning rather than your pinned pick.
		</p>
	</section>

	<section id="headliner" class="card">
		<h2>The Headliner</h2>
		<p>
			A full-screen "what I'm playing right now" view at <code>/headliner/&lt;username&gt;</code>.
			Designed to live on a tablet or a second monitor in the listening room. Background is a
			blurred version of the current cover; foreground is the cover itself — big — with the track /
			artist / album text and a pulsing live dot when you're actively playing.
		</p>
		<p>
			It refreshes every 15 seconds. It's also a <strong>PWA</strong> — open it in Chrome / Edge, click
			"Install", and you get an app icon that opens to full-screen mode.
		</p>
		<p>
			If you're the owner, you'll also see the <strong>Tonight's set</strong> card in the bottom-right.
			That's where Spin lives.
		</p>
		<p>
			<strong>Mini mode.</strong> Up in the top-right of the Headliner there's a small
			<strong>⊟ Mini</strong> link. It opens a tiny square window —
			<code>/headliner/&lt;username&gt;/mini</code> — that's just the album cover with the track details
			tucked into the bottom. Made to sit in a corner of your screen while you work, instead of taking
			over a whole monitor. It pops open small (240&times;240) and you can resize it however you like.
		</p>
		<p>
			The mini has two little controls that float over the cover, and both stay out of the way until
			you hover them. Top-right is the <strong>listen</strong> toggle (owner only) — a mic that
			glows red and pulses while it's catching spins, so you can keep an eye on your set without the
			full card. Top-left is a <strong>maximize</strong> button that swaps you back to the full Headliner
			and tidies the mini window away in one click.
		</p>
		<p class="aside">
			Heads-up: if you leave <em>both</em> the full Headliner and the mini open with listening on, they'll
			each catch the same spin and you'll get duplicates. Easiest habit is to keep listening on in just
			one of them — and the maximize button does that for you, since it closes the mini as it reopens
			the full view.
		</p>
	</section>

	<section id="dig" class="card">
		<h2>Dig — pull from the crate</h2>
		<p>
			Tucked into the avatar menu (top right) is a single link: <strong>Dig</strong>. Click it and
			Albumz pulls one album from the back of the crate — something you own but haven't spun in at
			least a month — and shows it full-page, cover forward, with a quiet line above the title
			noting when (or whether) you last played it.
		</p>
		<p>
			Two actions sit underneath: <strong>Pull another</strong> re-rolls without repeating what you
			just saw, and <strong>Open album</strong> drops you on the album page. Nothing else, no list, no
			metric — just one record at a time.
		</p>
		<p>
			It's intentionally hidden in the menu rather than parked on the home page. Dig is meant to be
			a thing you walk over to, not a button that pesters you. Use it when you're staring at the
			shelf wondering what to play.
		</p>
	</section>

	<section id="discover" class="card">
		<h2>Discover — steer the next record</h2>
		<p>
			Discover is the part of Albumz that points you at music you don't yet own. At <code
				>/discover</code
			>, Albumz reads your last week of listening as the starting point, you type a free-text
			<em>nudge</em> — warmer, weirder, more electronic, in the spirit of some band — and 3–5 albums come
			back tilted that way, each with a short sentence explaining the angle.
		</p>
		<p>
			<strong>The steering frame.</strong> Discover isn't a recommender that hands you "more of what
			you played." It's a steering wheel: the system knows your baseline; you supply the direction.
			<em
				>"Like what I've been on but happier." "Weirder, more electronic." "Like The Beths but by
				dudes."</em
			> Whatever you'd say to a clerk who's been at the counter all week. The discovery happens in the
			angle of the nudge, not in the math of similarity.
		</p>
		<p>
			<strong>How it works.</strong> The system reads your top tags from the last seven days of Last.fm
			scrobbles. A local AI (Ollama, on the box running Albumz) translates your nudge into a Discogs catalog
			query — styles, era, sometimes a label. Discogs returns candidates. The same AI picks 3–5 of them,
			writes a short "why" sentence for each, and filters anything you already own out of the result.
		</p>
		<p>
			<strong>What you do with the picks.</strong> Each one shows cover, artist, title, year, label,
			country, style. A small <strong>Listen on Spotify</strong> link goes straight to the album so
			you can preview before committing. The cover itself links to the Discogs master page for
			digging deeper. <strong>Try a different direction</strong> rolls the wheel again.
		</p>
		<p>
			<strong>Needs Last.fm.</strong> Discover relies on your scrobbles for the baseline — connect Last.fm
			in Settings first, otherwise the page will tell you politely that there's nothing to steer from.
		</p>
		<p class="aside">
			Like Dig, Discover is meant to be a moment you walk over to, not a feed that pesters you. Sit
			down, think about how you feel, ask for the nudge. The clerk has been at the counter all week.
		</p>
	</section>

	<section id="spin" class="card">
		<h2>Spin — tonight's set</h2>
		<p>Spin is the part of Albumz that catches what's actually on the turntable.</p>
		<p>
			<strong>What you see.</strong> On your Headliner there's a small pill in the lower-right:
			<em>"Tonight's set."</em>
			Click it to expand. The card has a mic toggle, a set list (latest at top), and an End set link that
			wipes everything and closes out the session. The label changes with the time of day —
			<em>this morning's set</em>, <em>this afternoon's set</em>, <em>this evening's set</em>,
			<em>tonight's set</em>.
		</p>
		<p><strong>Spun vs streamed.</strong> Each track gets a small mark:</p>
		<ul>
			<li>
				<strong>◉ spun</strong> — physical playback that Albumz heard through your mic and identified
			</li>
			<li>
				<strong>⇢ streamed</strong> — a track that was on your Last.fm now-playing while Albumz was watching
				(you weren't playing it physically, you were streaming it)
			</li>
		</ul>
		<p>
			The distinction matters because Spotify already scrobbles your streams to Last.fm; Albumz
			quietly scrobbles your <em>physical</em> plays the same way, so your Last.fm history finally reflects
			everything you actually listened to.
		</p>
		<p>
			<strong>The set is bigger than the Headliner.</strong> You don't need to be on the Headliner page
			for the set to track. Open the card, then go browse the rest of the site — your session keeps running.
			Come back, the list is intact. The set ends when you close the tab or click End set, not when you
			wander off.
		</p>
		<p>
			<strong>Without the mic.</strong> Even with the mic off, opening the card on the Headliner shows
			your currently-streaming tracks as they play (provided Last.fm is connected). The mic adds physical-play
			detection on top.
		</p>
		<p>
			<strong>Privacy.</strong> The microphone only records when you explicitly turn it on. Audio is sent
			to a private identification service for matching — nothing is stored on disk after identification.
			Toggle it off anytime; the indicator pulses red when it's listening.
		</p>
	</section>

	<section id="digest" class="card">
		<h2>Weekly digest</h2>
		<p>
			The digest is the part of Albumz that <em>narrates</em>. Last.fm has always been a ledger —
			plays, dates, counts, charts — and the digest is the columnist that ledger never had. Same
			data, rendered as warm prose a person would actually want to read.
		</p>
		<p>
			<strong>How it works.</strong> A draft of your week is written automatically
			<strong>every Sunday evening</strong>. You'll see a small "Your weekly digest is ready" pill
			in the corner the next time you visit Albumz — click it to read the draft. Generation happens
			locally on the host running Albumz, no paid AI API and nothing audio leaves the room. Weeks
			with fewer than ten plays get skipped quietly.
		</p>
		<p>
			<strong>Generating manually.</strong> Want to preview the in-progress week mid-week, or
			regenerate after a discard? On your own archive at
			<code>/u/&lt;your-username&gt;/digests</code>
			there's a <strong>Generate this week</strong> button. Takes ~15–45 seconds.
		</p>
		<p>
			<strong>Drafts, publish, archive.</strong> Every digest starts as a <strong>draft</strong> — owner-only.
			Open the draft permalink, read it, decide:
		</p>
		<ul>
			<li>
				<strong>Publish</strong> — readable at <code>/digests/&lt;id&gt;</code> to anyone with the link;
				shows in your archive.
			</li>
			<li><strong>Discard</strong> — hides it from everywhere, including future you.</li>
			<li><strong>Unpublish</strong> — turns a published digest back into a draft.</li>
		</ul>
		<p>
			Visitors browsing your public page see a <strong>Digests</strong> chip in the topbar when you have
			any published columns to read.
		</p>
		<p>
			<strong>What's in the column.</strong> Day-by-day narration of what you actually put on with
			track names and album names, <code>spun</code> vs <code>streamed</code> markers woven into the prose,
			a dormant pick from your own shelf, a wildcard from another collection, and a year-shaped closing
			sentence. Picks aren't random — they're scored against the tag profile of what you played this week,
			so a "wildcard" actually shares something musical with your listening.
		</p>
	</section>

	<section id="lastfm" class="card">
		<h2>Last.fm integration</h2>
		<p>
			Settings → <strong>Last.fm connection</strong> → Connect. You'll authorize Albumz on Last.fm, get
			bounced back, and Albumz will:
		</p>
		<ul>
			<li>Use your Last.fm username for now-playing displays on your public page and Headliner</li>
			<li>
				Send <code>updateNowPlaying</code> whenever Spin identifies something (so the Headliner stage
				stays current)
			</li>
			<li>
				<strong>Scrobble</strong> physical plays — about 60 seconds of confirmed presence on the same
				track is enough to count
			</li>
			<li><em>Not</em> scrobble streamed plays, since your streaming service already did</li>
		</ul>
		<p>Disconnect at any time from the same panel.</p>
	</section>

	<section id="look" class="card">
		<h2>Avatars &amp; themes</h2>
		<p><strong>Avatars</strong> use three layers in order:</p>
		<ol>
			<li>An avatar you upload (square, resized to 256px WebP)</li>
			<li>A Gravatar matched to your email</li>
			<li>
				A generated tile with the first letter of your username and a color derived from the
				username string
			</li>
		</ol>
		<p>Upload from Settings → Profile. Remove to fall back to Gravatar / generated.</p>
		<p>
			<strong>Themes</strong> live as pills in Settings — pick light, dark, or auto (follows your OS).
			The accent color throughout the app comes from whatever album cover is "active" — your featured
			album, the Headliner's current track, or the album you're viewing — so the palette shifts as you
			move around.
		</p>
	</section>

	<section id="shortcuts" class="card">
		<h2>Keyboard shortcuts</h2>
		<table class="shortcuts">
			<thead>
				<tr><th>Shortcut</th><th>Where</th><th>What it does</th></tr>
			</thead>
			<tbody>
				<tr
					><td><kbd>⌘K</kbd> / <kbd>Ctrl-K</kbd></td><td>Anywhere signed in</td><td
						>Open the Look-up palette</td
					></tr
				>
				<tr><td><kbd>Esc</kbd></td><td>Inside Look-up or pickers</td><td>Close</td></tr>
				<tr
					><td><kbd>↑</kbd> / <kbd>↓</kbd></td><td>Inside Look-up</td><td>Move through results</td
					></tr
				>
				<tr><td><kbd>Enter</kbd></td><td>Inside Look-up</td><td>Open the highlighted match</td></tr>
			</tbody>
		</table>
	</section>

	<section id="trouble" class="card">
		<h2>Troubleshooting</h2>
		<dl>
			<dt>My cover is wrong.</dt>
			<dd>
				Open the album, click <strong>Pick a cover</strong>, choose manually. If none of the
				candidates are right, click <strong>Edit details</strong> → 🔎 Look up details and pick a match
				from there.
			</dd>
			<dt>The Headliner is stuck on a track that finished an hour ago.</dt>
			<dd>
				Make sure Last.fm is connected in Settings. If you're streaming and the Headliner is stale,
				your streaming service may have stopped scrobbling.
			</dd>
			<dt>Spin won't turn on.</dt>
			<dd>
				It needs microphone permission and HTTPS. Browser permission prompts are per-origin;
				clearing site data resets them.
			</dd>
			<dt>The Wantlist link in the topbar shows a number — what is it?</dt>
			<dd>The count of items you've marked want. A quiet reminder.</dd>
		</dl>
	</section>

	<section class="card foot">
		<p>
			Found something broken? Open an issue at
			<a href="https://github.com/spudalicious1969/albumz/issues" target="_blank" rel="noopener"
				>github.com/spudalicious1969/albumz/issues</a
			>, or just write to me. Albumz is small enough that bugs get looked at the same day.
		</p>
	</section>
</div>

<style>
	.page {
		max-width: 760px;
		margin: 0 auto;
		padding: 2rem 1.5rem 4rem;
	}
	.topbar {
		display: flex;
		align-items: baseline;
		gap: 1.5rem;
		margin-bottom: 2rem;
	}
	.back {
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	h1 {
		font-size: 1.5rem;
		font-weight: 700;
	}

	.lede {
		margin-bottom: 1.8rem;
	}
	.lede p {
		font-size: 1rem;
		line-height: 1.65;
		color: var(--text);
	}
	.lede p + p {
		margin-top: 0.85rem;
		color: var(--text-muted);
	}
	.lede a {
		color: var(--accent);
		text-decoration: none;
		border-bottom: 1px dotted color-mix(in oklch, var(--accent) 40%, transparent);
	}
	.lede a:hover {
		border-bottom-color: var(--accent);
	}

	.toc {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 1.1rem 1.5rem;
		margin-bottom: 2rem;
	}
	.toc h2 {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin: 0 0 0.65rem;
	}
	.toc ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.35rem 1rem;
	}
	.toc a {
		color: var(--text);
		text-decoration: none;
		font-size: 0.88rem;
	}
	.toc a:hover {
		color: var(--accent);
	}

	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 1.5rem 1.75rem;
		margin-bottom: 1.5rem;
		scroll-margin-top: 1rem;
	}
	.card h2 {
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin: 0 0 1rem;
	}

	.card p {
		font-size: 0.95rem;
		line-height: 1.6;
		color: var(--text);
		margin: 0 0 0.9rem;
	}
	.card p:last-child {
		margin-bottom: 0;
	}
	.card p.aside {
		color: var(--text-muted);
		font-style: italic;
		font-size: 0.88rem;
	}

	.card ul,
	.card ol {
		font-size: 0.95rem;
		line-height: 1.6;
		color: var(--text);
		margin: 0 0 0.9rem;
		padding-left: 1.4rem;
	}
	.card li {
		margin-bottom: 0.35rem;
	}
	.card li:last-child {
		margin-bottom: 0;
	}

	.card code {
		font-family: ui-monospace, monospace;
		font-size: 0.85em;
		background: var(--bg-elevated);
		padding: 0.08rem 0.35rem;
		border-radius: 4px;
	}

	.card a {
		color: var(--accent);
		text-decoration: none;
		border-bottom: 1px dotted color-mix(in oklch, var(--accent) 40%, transparent);
	}
	.card a:hover {
		border-bottom-color: var(--accent);
	}

	.shortcuts {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	.shortcuts th,
	.shortcuts td {
		text-align: left;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--border);
	}
	.shortcuts th {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.shortcuts tr:last-child td {
		border-bottom: none;
	}
	kbd {
		font-family: ui-monospace, monospace;
		font-size: 0.82em;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-bottom-width: 2px;
		border-radius: 4px;
		padding: 0.1rem 0.4rem;
	}

	dl {
		margin: 0;
		font-size: 0.95rem;
		line-height: 1.6;
	}
	dt {
		font-weight: 600;
		color: var(--text);
		margin-top: 0.85rem;
	}
	dt:first-child {
		margin-top: 0;
	}
	dd {
		margin: 0.2rem 0 0;
		color: var(--text-muted);
		padding-left: 0;
	}

	.foot p {
		font-size: 0.88rem;
		color: var(--text-muted);
		text-align: center;
	}
</style>
