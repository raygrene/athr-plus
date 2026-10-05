import { fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { fetchScooters } from '$lib/server/ather';
import { withAuth } from '$lib/server/guard';
import { writeSession } from '$lib/server/session';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const token = locals.session.token;
	if (!token) redirect(303, '/login');
	const scooters = await withAuth(cookies, () => fetchScooters(token)).catch((e) => {
		if (isRedirect(e)) throw e;
		return null;
	});
	return { scooters, current: locals.session.uuid ?? null };
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		const token = locals.session.token;
		if (!token) redirect(303, '/login');
		const uuid = String((await request.formData()).get('uuid') ?? '').trim();
		if (!/^[\w-]{4,64}$/.test(uuid)) return fail(400, { error: 'Pick a scooter.' });
		const scooters = await withAuth(cookies, () => fetchScooters(token));
		if (!scooters.some((s) => s.uuid === uuid)) return fail(400, { error: 'That scooter is not on this account.' });
		writeSession(cookies, { token, uuid });
		redirect(303, '/');
	}
};
