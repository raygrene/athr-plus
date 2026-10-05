import { isRedirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { fetchLocations, fetchWallet } from '$lib/server/ather';
import { requireScooter, withAuth } from '$lib/server/guard';
import type { ChargerLocation, WalletSnapshot } from '$lib/types';

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Request failed');

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const { token } = requireScooter(locals.session);
	const lat = Number(url.searchParams.get('lat'));
	const lng = Number(url.searchParams.get('lng'));
	const radius = Number(url.searchParams.get('radius') ?? 5);
	const hasCenter = url.searchParams.has('lat') && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

	const run = async <T>(fn: () => Promise<T>): Promise<{ value: T | null; error: string | null }> => {
		try {
			return { value: await withAuth(cookies, fn), error: null };
		} catch (e) {
			if (isRedirect(e)) throw e;
			return { value: null, error: errorText(e) };
		}
	};

	const [locations, wallet] = await Promise.all([
		hasCenter
			? run<ChargerLocation[]>(() => fetchLocations(token, { lat, lng, radiusKm: Number.isFinite(radius) ? radius : 5 }))
			: Promise.resolve({ value: null, error: null }),
		run<WalletSnapshot>(() => fetchWallet(token))
	]);
	return { center: hasCenter ? { lat, lng, radius } : null, locations, wallet };
};
