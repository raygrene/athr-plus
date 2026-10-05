import { redirect, type Cookies } from '@sveltejs/kit';
import { AuthExpiredError, fetchVehicleProfile } from './ather';
import { clearSession, type Session } from './session';
import type { VehicleProfile } from '$lib/vehicle';

export function requireScooter(session: Session): { token: string; uuid: string } {
	if (!session.token) redirect(303, '/login');
	if (!session.uuid) redirect(303, '/select');
	return { token: session.token, uuid: session.uuid };
}

/** Runs an Ather call; an expired token clears the session and sends the user to sign in again. */
export async function withAuth<T>(cookies: Cookies, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof AuthExpiredError) {
			clearSession(cookies);
			redirect(303, '/login?expired=1');
		}
		throw e;
	}
}

const profileCache = new Map<string, { at: number; profile: VehicleProfile }>();
const PROFILE_TTL_MS = 10 * 60_000;

export async function cachedProfile(token: string, uuid: string): Promise<VehicleProfile> {
	const key = `${uuid}:${token.slice(-16)}`;
	const hit = profileCache.get(key);
	if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.profile;
	const profile = await fetchVehicleProfile(token, uuid);
	profileCache.set(key, { at: Date.now(), profile });
	return profile;
}
