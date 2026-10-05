import type { Handle } from '@sveltejs/kit';
import { readSession } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.session = readSession(event.cookies);
	const response = await resolve(event);
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	return response;
};
