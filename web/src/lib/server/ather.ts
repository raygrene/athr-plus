/**
 * Server-only client for Ather's Cerberus cloud. Mirrors the Android app's
 * request formats (AtherAuthApi.kt, AtherApiClient.kt, VehicleHealthReportClient.kt,
 * ChargingMapApi.kt). Runs on the server because the browser can neither send
 * these headers on a WebSocket nor pass Cerberus' CORS policy.
 */
import type {
	ChargerLocation,
	DiscoveredScooter,
	HealthTag,
	ScorecardState,
	TripRecord,
	VehicleHealthReport,
	WalletSnapshot
} from '$lib/types';
import type { VehicleProfile } from '$lib/vehicle';

export const BASE = 'https://cerberus.ather.io';
export const WS_URL = 'wss://cerberus.ather.io/api/v1/ws/devices/shadows/onchange';

export const ENDPOINTS = {
	generateOtp: '/auth/v2/generate-login-otp',
	verifyOtp: '/auth/v2/verify-login-otp',
	me: '/api/v1/me',
	firebaseScooters: '/api/v2/auth/user/scooters/firebase-dbs',
	scooterProperties: '/api/v1/devices/shadows/scooters/properties',
	scooterShadow: '/api/v1/devices/shadows/scooters',
	rides: '/api/v1/rides',
	vehicleHealth: '/api/v1/vehicle-health/report',
	locations: '/api/v2/locations',
	wallet: '/api/v1/wallet'
} as const;

/** Shadow paths the app subscribes to after the socket opens. */
export const SUBSCRIPTION_PATHS = [
	'telemetry.bike',
	'telemetry.charging',
	'telemetry.tpms',
	'scooters.remote_charging',
	'scooters.properties',
	'scooters.bike',
	'app.ather_stack_features'
];

export const APP_HEADERS = {
	Source: 'ATHER_APP/13.2.0',
	'X-Platform': 'Android',
	'X-Platform-Version': '14',
	'Accept-Charset': 'UTF-8'
};

export const WS_HEADERS = {
	...APP_HEADERS,
	'X-Device-Info': 'Google Pixel 8 Pro',
	'User-Agent': 'Ather/13.2.0 android/14 (Google Pixel 8 Pro)'
};

export class AuthExpiredError extends Error {
	constructor(message = 'Session expired. Please sign in again.') {
		super(message);
	}
}

export class AtherHttpError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function text(o: unknown, ...keys: string[]): string | undefined {
	if (!isObj(o)) return undefined;
	for (const k of keys) {
		const v = o[k];
		if ((typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') && String(v).trim()) return String(v);
	}
	return undefined;
}

function num(o: unknown, ...keys: string[]): number | undefined {
	if (!isObj(o)) return undefined;
	for (const k of keys) {
		const v = o[k];
		const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
		if (Number.isFinite(n)) return n;
	}
	return undefined;
}

function int(o: unknown, ...keys: string[]): number | undefined {
	const n = num(o, ...keys);
	return n === undefined ? undefined : Math.trunc(n);
}

function bool(o: unknown, ...keys: string[]): boolean | undefined {
	if (!isObj(o)) return undefined;
	for (const k of keys) {
		const v = o[k];
		if (typeof v === 'boolean') return v;
		if (typeof v === 'number') return v !== 0;
		if (typeof v === 'string') {
			const s = v.toLowerCase();
			if (['true', '1', 'yes', 'on'].includes(s)) return true;
			if (['false', '0', 'no', 'off'].includes(s)) return false;
		}
	}
	return undefined;
}

const obj = (o: unknown, key: string): Json | undefined => (isObj(o) && isObj(o[key]) ? (o[key] as Json) : undefined);
const arr = (o: unknown, key: string): unknown[] | undefined =>
	isObj(o) && Array.isArray(o[key]) ? (o[key] as unknown[]) : undefined;

interface RequestOptions {
	token?: string;
	method?: 'GET' | 'POST';
	query?: Record<string, string | number | undefined>;
	body?: unknown;
	headers?: Record<string, string>;
}

async function request(path: string, opts: RequestOptions = {}): Promise<{ status: number; body: unknown }> {
	const url = new URL(BASE + path);
	for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
	const headers: Record<string, string> = {
		...APP_HEADERS,
		Accept: 'application/json',
		'Content-Type': 'application/json; charset=utf-8',
		'User-Agent': 'ktor-client',
		...opts.headers
	};
	if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
	const res = await fetch(url, {
		method: opts.method ?? 'GET',
		headers,
		body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
		signal: AbortSignal.timeout(30_000)
	});
	const raw = await res.text();
	let body: unknown = {};
	if (raw.trim()) {
		try {
			body = JSON.parse(raw);
		} catch {
			body = {};
		}
	}
	if (opts.token && (res.status === 401 || res.status === 403)) throw new AuthExpiredError();
	if (!res.ok) {
		throw new AtherHttpError(res.status, text(body, 'message', 'error', 'msg') ?? `HTTP ${res.status}`);
	}
	return { status: res.status, body };
}

// --- Auth ---

export async function requestOtp(phone: string, countryCode = 'IN'): Promise<void> {
	await request(ENDPOINTS.generateOtp, {
		method: 'POST',
		body: { email: '', contact_no: phone, country_code: countryCode }
	});
}

export async function verifyOtp(phone: string, otp: string, countryCode = 'IN'): Promise<string> {
	const { body } = await request(ENDPOINTS.verifyOtp, {
		method: 'POST',
		body: { email: '', contact_no: phone, userOtp: otp, is_mobile_login: 'true', country_code: countryCode }
	});
	const token = text(body, 'token') ?? text(obj(body, 'token'), 'token', 'access_token') ?? text(obj(body, 'data'), 'token', 'access_token');
	if (!token) throw new Error('Login succeeded but token was missing');
	return token;
}

/** /me often returns vehicles: [] even when scooters exist, so fall back to firebase-dbs + properties. */
export async function fetchScooters(token: string): Promise<DiscoveredScooter[]> {
	try {
		const { body } = await request(ENDPOINTS.me, { token });
		const list = arr(body, 'vehicles') ?? arr(obj(body, 'data'), 'vehicles') ?? arr(body, 'scooters') ?? [];
		const fromMe = list.flatMap((v): DiscoveredScooter[] => {
			const uuid = text(v, 'uuid', 'vehicle_uuid', 'scooter_uuid', 'id');
			if (!uuid) return [];
			return [
				{
					uuid,
					displayName: text(v, 'display_name', 'name', 'nickname', 'registration') ?? 'Scooter',
					registration: text(v, 'registration', 'reg_no'),
					modelType: text(v, 'model_type', 'model', 'bike_type', 'type'),
					colour: text(v, 'colour', 'color')
				}
			];
		});
		if (fromMe.length) return fromMe;
	} catch (e) {
		if (e instanceof AuthExpiredError) throw e;
	}
	const { body } = await request(ENDPOINTS.firebaseScooters, { token });
	const shards = arr(body, 'shardDetails') ?? arr(obj(body, 'data'), 'shardDetails') ?? [];
	const stubs = shards.flatMap((s): DiscoveredScooter[] => {
		const uuid = text(s, 'scooter_uuid', 'uuid', 'vehicle_uuid');
		return uuid ? [{ uuid, displayName: text(s, 'scooter', 'display_name', 'name') ?? 'Scooter' }] : [];
	});
	return Promise.all(
		stubs.map(async (stub) => {
			try {
				const data = await fetchScooterProperties(token, stub.uuid);
				return {
					uuid: text(data, 'uuid') ?? stub.uuid,
					displayName: text(data, 'display_name', 'registration', 'bike_id') ?? 'Scooter',
					registration: text(data, 'registration'),
					modelType: text(data, 'model_type', 'model', 'bike_type'),
					colour: text(data, 'colour')
				};
			} catch (e) {
				if (e instanceof AuthExpiredError) throw e;
				return stub;
			}
		})
	);
}

// --- Scooter ---

async function fetchScooterProperties(token: string, uuid: string): Promise<Json> {
	const { body } = await request(ENDPOINTS.scooterProperties, { token, query: { uuid, state: 'reported' } });
	const data = obj(body, 'data');
	if (!data) throw new Error('Scooter properties data missing');
	return data;
}

export async function fetchVehicleProfile(token: string, uuid: string): Promise<VehicleProfile> {
	const data = await fetchScooterProperties(token, uuid);
	return {
		scooterId: text(data, 'bike_id'),
		modelType: text(data, 'model_type'),
		modelCode: text(data, 'model'),
		generation: text(data, 'generation'),
		bikeType: text(data, 'bike_type'),
		platform: text(data, 'platform'),
		colour: text(data, 'colour')
	};
}

/** `scooterId` is the profile's bike_id, not the shadow UUID. */
export async function fetchRides(token: string, scooterId: string): Promise<TripRecord[]> {
	const { body } = await request(ENDPOINTS.rides, {
		token,
		query: { scooterid: scooterId, limit: 100, page: 1 },
		headers: { 'X-Request-Source': 'ATHER_APP' }
	});
	const trips = arr(body, 'trips') ?? arr(obj(body, 'data'), 'trips') ?? [];
	return trips.flatMap((ride): TripRecord[] => {
		const id = text(ride, 'ride_id');
		const start = int(ride, 'ride_start_time');
		const distanceM = num(ride, 'distance_m');
		if (!id || start === undefined || distanceM === undefined || distanceM <= 0) return [];
		const distanceKm = distanceM / 1000;
		const eff = num(ride, 'efficiency_wh_km');
		const efficiency = eff !== undefined && eff > 0 ? eff : undefined;
		return [
			{
				id: `ather-${id}`,
				startTimeMs: start,
				endTimeMs: int(ride, 'ride_end_time') ?? start,
				distanceKm,
				efficiencyWhPerKm: efficiency,
				energyWh: efficiency !== undefined ? efficiency * distanceKm : undefined
			}
		];
	});
}

/**
 * Remote charging is an HTTP desired-shadow mutation. A 2xx only means Ather
 * accepted the request; the scooter's charging telemetry is the confirmation.
 * Field names/values are the exact verified payload; do not alter them.
 */
export function remoteChargingPayload(uuid: string, start: boolean, timestampMs = Date.now()) {
	return {
		state: {
			desired: {
				remote_charging: { state: 1, action: start ? 'start' : 'stop', error: '0', timestamp: timestampMs }
			}
		},
		request_id: `ma_${uuid}`
	};
}

export async function setRemoteCharging(token: string, uuid: string, start: boolean): Promise<void> {
	await request(ENDPOINTS.scooterShadow, {
		token,
		method: 'POST',
		query: { uuid },
		body: remoteChargingPayload(uuid, start)
	});
}

// --- Vehicle health scorecard ---

const tag = (o: Json | undefined): HealthTag | undefined =>
	o && { text: text(o, 'text'), textColor: text(o, 'text_color'), backgroundColor: text(o, 'background_color') };

export function parseHealthReport(root: unknown): VehicleHealthReport | null {
	const data = obj(root, 'data') ?? (isObj(root) ? root : undefined);
	const health = obj(data, 'health');
	const overallObj = obj(health, 'overall');
	const overall = overallObj && {
		score: num(overallObj, 'score'),
		label: text(overallObj, 'label'),
		maxScore: int(overallObj, 'max_score'),
		colorCode: text(overallObj, 'color_code')
	};
	const components = (arr(health, 'components') ?? []).filter(isObj).map((c) => ({
		id: text(c, 'id'),
		name: text(c, 'name'),
		score: num(c, 'score'),
		maxScore: int(c, 'max_score'),
		tag: tag(obj(c, 'tag')),
		displayType: text(c, 'display_type')
	}));
	const wearAndTear = (arr(health, 'wear_and_tear_components') ?? []).filter(isObj).map((w) => ({
		id: text(w, 'id'),
		name: text(w, 'name'),
		lifePercent: int(w, 'life_percent'),
		currentKms: int(w, 'current_kms'),
		remainingKms: int(w, 'remaining_kms'),
		tag: tag(obj(w, 'tag')),
		description: tag(obj(w, 'description'))
	}));
	const v = obj(data, 'vehicle');
	const vehicle = v && {
		id: text(v, 'id'),
		name: text(v, 'name'),
		registrationMasked: text(v, 'registration_number_masked') ?? text(v, 'registration_number'),
		ageYears: text(v, 'age_years'),
		odoKms: int(v, 'odo_kms'),
		odoFormatted: text(v, 'odo_formatted')
	};
	const m = obj(data, 'meta');
	const r = obj(data, 'resale_estimation');
	const resale = r && {
		currency: text(r, 'currency'),
		disclaimer: text(r, 'disclaimer'),
		minValue: int(r, 'min_value'),
		maxValue: int(r, 'max_value'),
		displayText: text(r, 'display_text')
	};
	if (!overall && !components.length && !wearAndTear.length && !vehicle && !resale) return null;
	return {
		vehicle,
		overall,
		components,
		wearAndTear,
		resale,
		meta: m && { lastUpdated: text(m, 'last_updated'), refreshNote: text(m, 'refresh_note') }
	};
}

/** 404 / empty body means no scorecard. Never invents scores; this is not battery SoH. */
export async function fetchVehicleHealth(token: string, uuid: string): Promise<ScorecardState> {
	const res = await fetch(`${BASE}${ENDPOINTS.vehicleHealth}?uuid=${encodeURIComponent(uuid)}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			'X-Request-Source': 'ATHER_APP',
			Accept: 'application/json',
			'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36'
		},
		signal: AbortSignal.timeout(15_000)
	});
	if (res.status === 401 || res.status === 403) throw new AuthExpiredError();
	if (res.status === 404) return { kind: 'unavailable', reason: 'No scorecard supplied (HTTP 404). This is not battery SoH.' };
	if (!res.ok) return { kind: 'error', reason: `HTTP ${res.status}` };
	const raw = await res.text();
	if (!raw.trim()) return { kind: 'unavailable', reason: 'Empty vehicle-health body returned. This is not battery SoH.' };
	let report: VehicleHealthReport | null = null;
	try {
		report = parseHealthReport(JSON.parse(raw));
	} catch {
		/* fall through */
	}
	return report
		? { kind: 'available', report }
		: { kind: 'unavailable', reason: 'Response could not be parsed as a vehicle-health report. This is not battery SoH.' };
}

// --- Public chargers & wallet ---

export function parseLocations(root: unknown): ChargerLocation[] {
	const list = Array.isArray(root) ? root : (arr(root, 'data') ?? arr(root, 'locations') ?? arr(root, 'results') ?? []);
	return list.filter(isObj).flatMap((o): ChargerLocation[] => {
		const lat = num(o, 'latitude', 'lat');
		const lng = num(o, 'longitude', 'lng', 'lon');
		if (lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
		return [
			{
				name: text(o, 'name'),
				infraType: text(o, 'infra_type', 'infraType'),
				address: text(o, 'address_1', 'address', 'address1'),
				latitude: lat,
				longitude: lng,
				isOpenNow: bool(o, 'is_open_now', 'isOpenNow'),
				closingIn: text(o, 'closing_in', 'closingIn'),
				nextOpening: text(o, 'next_opening', 'nextOpening'),
				locationTags: (arr(o, 'location_tags') ?? []).filter((t): t is string => typeof t === 'string' && !!t.trim()),
				dbsAvailable: int(o, 'dbs_available', 'dbsAvailable'),
				dbsInUse: int(o, 'dbs_in_use', 'dbsInUse'),
				dbsUnderMaintenance: int(o, 'dbs_under_maintenance', 'dbsUnderMaintenance'),
				dbsOutOfOperatingHours: int(o, 'dbs_out_of_operating_hours', 'dbsOutOfOperatingHours'),
				dbsTotal: int(o, 'dbs_total', 'dbsTotal'),
				connectors: (arr(o, 'connector_type') ?? arr(o, 'connectors') ?? []).filter(isObj).map((c) => ({
					displayText: text(c, 'display_text', 'displayText', 'name'),
					standard: text(c, 'standard', 'type')
				})),
				tariffLines: (arr(obj(o, 'tariff_details'), 'line_items') ?? []).filter(isObj).map((t) => ({
					displayText: text(t, 'display_text', 'displayText'),
					text: text(t, 'text', 'value')
				})),
				partyId: text(o, 'party_id', 'partyId'),
				has6kwGrid: bool(o, 'has_6kW_grid', 'has_6kw_grid', 'has6kwGrid')
			}
		];
	});
}

export async function fetchLocations(
	token: string,
	q: { lat: number; lng: number; radiusKm?: number; limit?: number; parkingType?: string }
): Promise<ChargerLocation[]> {
	if (Math.abs(q.lat) > 90 || Math.abs(q.lng) > 180) throw new Error('Invalid map center');
	const parking = q.parkingType?.trim();
	const { body } = await request(ENDPOINTS.locations, {
		token,
		headers: { 'X-Request-Source': 'ATHER_APP' },
		query: {
			lat: q.lat,
			lng: q.lng,
			radius: Math.min(50, Math.max(1, Math.round(q.radiusKm ?? 5))),
			limit: Math.min(200, Math.max(1, Math.round(q.limit ?? 50))),
			type: 'public',
			parking_type: parking && parking.toUpperCase() !== 'ALL' ? parking : undefined
		}
	});
	return parseLocations(body);
}

export function parseWallet(root: unknown): WalletSnapshot {
	const data = obj(root, 'data') ?? root;
	const txns = arr(data, 'transactions') ?? arr(data, 'recent_transactions') ?? arr(root, 'transactions') ?? [];
	return {
		balance: num(data, 'balance', 'wallet_balance', 'available_balance'),
		walletStatus: text(data, 'wallet_status', 'status', 'walletStatus'),
		credits: num(data, 'credits', 'charging_credits', 'available_credits'),
		transactions: txns.filter(isObj).map((t) => ({
			id: text(t, 'id', 'transaction_id', 'txn_id'),
			title: text(t, 'title', 'description', 'narration', 'name'),
			amount: num(t, 'amount', 'value'),
			currency: text(t, 'currency', 'currency_code'),
			timestamp: text(t, 'timestamp', 'created_at', 'time', 'date'),
			type: text(t, 'type', 'txn_type', 'direction')
		}))
	};
}

export async function fetchWallet(token: string): Promise<WalletSnapshot> {
	const { body } = await request(ENDPOINTS.wallet, { token, headers: { 'X-Request-Source': 'ATHER_APP' } });
	return parseWallet(body);
}
