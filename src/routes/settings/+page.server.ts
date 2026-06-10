import { redirect, fail } from '@sveltejs/kit';
import { scanDuplicates, removeDuplicates } from '$lib/dedupe.server';
import { backfillMissingMetadata } from '$lib/backfill.server';
import type { Actions, PageServerLoad } from './$types';

const MAX_AVATAR_BYTES = 512 * 1024; // 512 KB after client-side resize is plenty
const ALLOWED_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, '/login');

	const [profileRes, albumsRes, totalCountRes] = await Promise.all([
		locals.supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
		locals.supabase
			.from('albums')
			.select('id, artist, title, year, cover_url, accent_color')
			.eq('user_id', user.id)
			.eq('ownership', 'OWN')
			.order('artist', { ascending: true }),
		locals.supabase
			.from('albums')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', user.id)
	]);

	if (profileRes.error) throw profileRes.error;

	let featured = null;
	if (profileRes.data?.featured_album_id) {
		featured =
			(albumsRes.data ?? []).find((a) => a.id === profileRes.data!.featured_album_id) ?? null;
	}

	return {
		profile: profileRes.data,
		albums: albumsRes.data ?? [],
		featured,
		totalAlbumCount: totalCountRes.count ?? 0,
		lastfmConnected: Boolean(profileRes.data?.lastfm_session_key)
	};
};

export const actions: Actions = {
	updateProfile: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');

		const form = await request.formData();
		const username = ((form.get('username') as string) ?? '').trim().toLowerCase();
		const display_name = ((form.get('display_name') as string) ?? '').trim() || null;
		const last_fm_username = ((form.get('last_fm_username') as string) ?? '').trim() || null;
		const discogs_username = ((form.get('discogs_username') as string) ?? '').trim() || null;
		const themeRaw = form.get('theme') as string;
		const theme = ['auto', 'light', 'dark'].includes(themeRaw) ? themeRaw : 'auto';

		if (!username || !/^[a-z0-9][a-z0-9_.-]*$/.test(username) || username.length < 2) {
			return fail(400, {
				error:
					'Username must start with a letter or number and can contain letters, numbers, underscores, hyphens, and periods.'
			});
		}

		const { error } = await locals.supabase
			.from('profiles')
			.update({ username, display_name, last_fm_username, discogs_username, theme })
			.eq('id', user.id);

		if (error) {
			if (error.code === '23505') return fail(400, { error: 'That username is taken.' });
			return fail(500, { error: error.message });
		}

		return { savedProfile: true };
	},

	setFeatured: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');

		const form = await request.formData();
		const albumId = form.get('album_id') as string;

		const { error } = await locals.supabase
			.from('profiles')
			.update({ featured_album_id: albumId || null })
			.eq('id', user.id);

		if (error) return fail(500, { error: error.message });
		return { savedFeatured: true };
	},

	uploadAvatar: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');

		const form = await request.formData();
		const file = form.get('avatar');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { avatarError: 'No file selected.' });
		}
		if (file.size > MAX_AVATAR_BYTES) {
			return fail(400, { avatarError: 'File is too large.' });
		}
		if (!ALLOWED_TYPES.has(file.type)) {
			return fail(400, { avatarError: 'Unsupported file type. Use JPEG, PNG, or WebP.' });
		}

		const ext = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'webp';
		const filename = `${user.id}/avatar-${Date.now()}.${ext}`;

		// Delete any prior avatars in the user's folder so we don't accumulate orphans
		const { data: existing } = await locals.supabase.storage.from('avatars').list(user.id);
		if (existing && existing.length > 0) {
			const toDelete = existing.map((f) => `${user.id}/${f.name}`);
			await locals.supabase.storage.from('avatars').remove(toDelete);
		}

		const { error: uploadErr } = await locals.supabase.storage
			.from('avatars')
			.upload(filename, file, { contentType: file.type, upsert: false });
		if (uploadErr) return fail(500, { avatarError: uploadErr.message });

		const { data: pub } = locals.supabase.storage.from('avatars').getPublicUrl(filename);
		const publicUrl = pub.publicUrl;

		const { error: updateErr } = await locals.supabase
			.from('profiles')
			.update({ avatar_url: publicUrl })
			.eq('id', user.id);
		if (updateErr) return fail(500, { avatarError: updateErr.message });

		return { savedAvatar: publicUrl };
	},

	disconnectLastfm: async ({ locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');

		const { error } = await locals.supabase
			.from('profiles')
			.update({ lastfm_session_key: null })
			.eq('id', user.id);

		if (error) return fail(500, { error: error.message });
		return { lastfmDisconnected: true };
	},

	removeAvatar: async ({ locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');

		const { data: existing } = await locals.supabase.storage.from('avatars').list(user.id);
		if (existing && existing.length > 0) {
			const toDelete = existing.map((f) => `${user.id}/${f.name}`);
			await locals.supabase.storage.from('avatars').remove(toDelete);
		}

		const { error: updateErr } = await locals.supabase
			.from('profiles')
			.update({ avatar_url: null })
			.eq('id', user.id);
		if (updateErr) return fail(500, { avatarError: updateErr.message });

		return { savedAvatar: null };
	},

	scanDuplicates: async ({ locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');
		try {
			const scan = await scanDuplicates(locals.supabase, user.id);
			return {
				dupeScan: {
					totalDuplicates: scan.totalDuplicates,
					groupCount: scan.groups.length,
					preview: scan.groups.slice(0, 8).map((g) => ({
						artist: g[0].artist,
						title: g[0].title,
						count: g.length
					}))
				}
			};
		} catch (err) {
			return fail(500, { dupeError: err instanceof Error ? err.message : 'Scan failed.' });
		}
	},

	removeDuplicates: async ({ locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');
		try {
			const removed = await removeDuplicates(locals.supabase, user.id);
			if (removed > 0) {
				await locals.supabase.from('activity').insert({
					user_id: user.id,
					type: 'dedupe',
					description: `Removed ${removed} duplicate ${removed === 1 ? 'album' : 'albums'}`
				});
			}
			return { dupeRemoved: removed };
		} catch (err) {
			return fail(500, { dupeError: err instanceof Error ? err.message : 'Cleanup failed.' });
		}
	},

	backfillMetadata: async ({ locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');
		try {
			const summary = await backfillMissingMetadata(locals.supabase, user.id);
			if (summary.affected > 0) {
				await locals.supabase.from('activity').insert({
					user_id: user.id,
					type: 'backfill',
					description: `Filled missing metadata on ${summary.affected} ${summary.affected === 1 ? 'album' : 'albums'}`
				});
			}
			return { backfillSummary: summary };
		} catch (err) {
			return fail(500, { backfillError: err instanceof Error ? err.message : 'Backfill failed.' });
		}
	}
};
