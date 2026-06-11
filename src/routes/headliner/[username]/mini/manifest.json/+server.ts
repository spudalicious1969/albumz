import type { RequestHandler } from './$types';

// Per-user manifest for the Mini Headliner. It can't be a static file in
// /static because start_url, scope and id all have to carry the username — the
// installed app has to land back on *this* user's mini, not a generic one.
//
// display_override flips on Window Controls Overlay: when launched as its own
// installed app the OS titlebar collapses into the window, so the square cover
// paints edge-to-edge with only the min/close buttons floating in a corner. The
// drag/no-drag wiring that makes that usable lives in mini/+page.svelte's
// `@media (display-mode: window-controls-overlay)` block.
export const GET: RequestHandler = ({ params }) => {
	const base = `/headliner/${params.username}/mini`;
	const manifest = {
		id: base,
		name: `Headliner Mini — ${params.username}`,
		short_name: 'Mini',
		description: 'Albumz mini — a corner-of-the-screen now-playing widget',
		start_url: base,
		scope: base,
		display: 'standalone',
		display_override: ['window-controls-overlay'],
		background_color: '#08070a',
		theme_color: '#08070a',
		orientation: 'natural',
		icons: [
			{
				src: '/headliner/icon.svg',
				sizes: 'any',
				type: 'image/svg+xml',
				purpose: 'any maskable'
			}
		]
	};

	return new Response(JSON.stringify(manifest), {
		headers: {
			'content-type': 'application/manifest+json',
			'cache-control': 'public, max-age=3600'
		}
	});
};
