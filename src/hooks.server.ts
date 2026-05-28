import { createSupabaseServerClient } from '$lib/supabase/server';
import { redirect, type Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createSupabaseServerClient(event.cookies);

	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();

		if (!session) return { session: null, user: null };

		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();

		if (error) return { session: null, user: null };

		return { session, user };
	};

	// Gate: signed-in users who haven't completed onboarding → /welcome
	const path = event.url.pathname;
	const exempt =
		path.startsWith('/welcome') ||
		path.startsWith('/auth') ||
		path.startsWith('/api') ||
		path.startsWith('/login') ||
		path.startsWith('/register');

	if (!exempt) {
		const { user } = await event.locals.safeGetSession();
		if (user) {
			const { data: profile } = await event.locals.supabase
				.from('profiles')
				.select('onboarded')
				.eq('id', user.id)
				.maybeSingle();
			if (profile?.onboarded === false) {
				redirect(303, '/welcome');
			}
		}
	}

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
