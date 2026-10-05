import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { clearSession } from '$lib/server/session';

export const load = () => redirect(303, '/');

// Ather has no logout endpoint in the app; this only forgets the token locally.
export const actions: Actions = {
	default: ({ cookies }) => {
		clearSession(cookies);
		redirect(303, '/login');
	}
};
