import { isRedirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { fetchVehicleHealth } from '$lib/server/ather';
import { requireScooter, withAuth } from '$lib/server/guard';
import type { ScorecardState } from '$lib/types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const { token, uuid } = requireScooter(locals.session);
	let scorecard: ScorecardState;
	try {
		scorecard = await withAuth(cookies, () => fetchVehicleHealth(token, uuid));
	} catch (e) {
		if (isRedirect(e)) throw e;
		scorecard = { kind: 'error', reason: e instanceof Error ? e.message : 'Network error' };
	}
	return { scorecard };
};
