import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { peekHub } from '$lib/server/live';

export const POST: RequestHandler = ({ locals }) => {
	const { token, uuid } = locals.session;
	if (!token || !uuid) error(401, 'Not signed in');
	peekHub(token, uuid)?.refresh();
	return json({ ok: true });
};
