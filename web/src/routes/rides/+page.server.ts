import { isRedirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { fetchRides } from '$lib/server/ather';
import { cachedProfile, requireScooter, withAuth } from '$lib/server/guard';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const { token, uuid } = requireScooter(locals.session);
	try {
		const profile = await withAuth(cookies, () => cachedProfile(token, uuid));
		if (!profile.scooterId) return { rides: null, error: 'Scooter ID (bike_id) was not reported, so rides cannot be loaded.' };
		const rides = await withAuth(cookies, () => fetchRides(token, profile.scooterId!));
		return { rides, error: null };
	} catch (e) {
		if (isRedirect(e)) throw e;
		return { rides: null, error: e instanceof Error ? e.message : 'Could not load rides' };
	}
};
