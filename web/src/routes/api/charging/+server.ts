import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AtherHttpError, AuthExpiredError, setRemoteCharging } from '$lib/server/ather';

/**
 * Pause/resume charging. A 2xx means Ather accepted the desired-shadow change,
 * not that the scooter stopped or started; the page waits for telemetry.
 * JSON-only, so a cross-site form cannot trigger it.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const { token, uuid } = locals.session;
	if (!token || !uuid) error(401, 'Not signed in');
	if (!request.headers.get('content-type')?.startsWith('application/json')) error(415, 'JSON required');
	const body = await request.json().catch(() => null);
	const action = body?.action;
	if (action !== 'start' && action !== 'stop') error(400, 'action must be "start" or "stop"');
	try {
		await setRemoteCharging(token, uuid, action === 'start');
		return json({ accepted: true, action, requestedAt: Date.now() });
	} catch (e) {
		if (e instanceof AuthExpiredError) error(401, e.message);
		const status = e instanceof AtherHttpError ? e.status : 502;
		return json({ accepted: false, message: e instanceof Error ? e.message : 'Command failed' }, { status: status >= 400 ? status : 502 });
	}
};
