import { isRedirect, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { cachedProfile, withAuth } from '$lib/server/guard';
import type { VehicleProfile } from '$lib/vehicle';

const PUBLIC = ['/login', '/select', '/logout'];

export const load: LayoutServerLoad = async ({ locals, cookies, url }) => {
	const { token, uuid } = locals.session;
	if (!PUBLIC.includes(url.pathname)) {
		if (!token) redirect(303, '/login');
		if (!uuid) redirect(303, '/select');
	}
	let profile: VehicleProfile | null = null;
	if (token && uuid) {
		try {
			profile = await withAuth(cookies, () => cachedProfile(token, uuid));
		} catch (e) {
			if (isRedirect(e)) throw e;
		}
	}
	return { signedIn: !!(token && uuid), profile };
};
