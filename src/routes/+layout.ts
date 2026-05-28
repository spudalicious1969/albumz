import { createSupabaseBrowserClient } from '$lib/supabase/client';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data, depends }) => {
	depends('supabase:auth');
	const supabase = createSupabaseBrowserClient();
	return {
		supabase,
		session: data.session,
		user: data.user,
		theme: data.theme,
		profile: data.profile
	};
};
