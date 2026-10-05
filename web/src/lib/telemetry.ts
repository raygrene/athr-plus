/**
 * Port of AtherApiClient.parseTelemetry / ScooterTelemetry.mergeWith from the
 * Android app. Cerberus frames arrive in several shapes (state.reported
 * envelopes, nested objects, flattened "a.b.c" keys and partial deltas), so
 * every lookup tries each shape. Pure and shared by server and browser.
 */

type Json = Record<string, unknown>;

export interface GpsData {
	latitude?: number;
	longitude?: number;
	altitudeMeters?: number;
	accuracyMeters?: number;
	heading?: number;
	speed?: number;
}

export interface TpmsData {
	frontPressurePsi?: number;
	rearPressurePsi?: number;
	frontTemperatureC?: number;
	rearTemperatureC?: number;
}

export interface ModeRange {
	rawRangeKm?: number;
	predictedRangeKm?: number;
}

export interface ScooterTelemetry {
	batterySoc?: number;
	rangeKm?: number;
	odoKm?: number;
	vehicleState?: string;
	mode?: string;
	charging?: boolean;
	chargerConnected?: boolean;
	chargingStatus?: string;
	timeToFullChargeMin?: number;
	timeToEightyChargeMin?: number;
	savingsInr?: number;
	gps?: GpsData;
	modeRanges: Record<string, ModeRange>;
	reportedSohPercent?: number;
	tpms?: TpmsData;
	chargerType?: string;
	softwareVersion?: string;
	connectivityStrength?: number;
	featureFlags: Record<string, boolean>;
	remoteChargingAction?: string;
	/** Scooter/cloud source time, distinct from when we received the frame. */
	sourceTimestampMs?: number;
}

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function objectOrNull(o: Json | undefined, key: string): Json | undefined {
	const v = o?.[key];
	return isObj(v) ? v : undefined;
}

function nestedObject(o: Json, path: string): Json | undefined {
	const parts = path.split('.');
	if (parts.length < 2) return undefined;
	let cur: Json | undefined = o;
	for (const p of parts) {
		cur = objectOrNull(cur, p);
		if (!cur) return undefined;
	}
	return cur;
}

function putDotted(target: Json, path: string, value: unknown) {
	const parts = path.split('.');
	let cur = target;
	for (let i = 0; i < parts.length - 1; i++) {
		const existing = cur[parts[i]];
		if (isObj(existing)) cur = existing;
		else {
			const next: Json = {};
			cur[parts[i]] = next;
			cur = next;
		}
	}
	cur[parts[parts.length - 1]] = value;
}

function prefixedObject(o: Json, prefix: string): Json | undefined {
	const needle = prefix + '.';
	const out: Json = {};
	let found = false;
	for (const [k, v] of Object.entries(o)) {
		if (!k.startsWith(needle)) continue;
		found = true;
		putDotted(out, k.slice(needle.length), v);
	}
	return found ? out : undefined;
}

/** Literal key, nested dotted path, or an object assembled from flattened "prefix.field" keys. */
function resolveObject(o: Json | undefined, ...keys: string[]): Json | undefined {
	if (!o) return undefined;
	for (const key of keys) {
		const hit = objectOrNull(o, key) ?? nestedObject(o, key) ?? prefixedObject(o, key);
		if (hit) return hit;
	}
	return undefined;
}

function primitive(o: Json | undefined, key: string): string | number | boolean | undefined {
	const v = o?.[key];
	return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : undefined;
}

function toNumber(v: unknown): number | undefined {
	if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
	if (typeof v === 'string') {
		const cleaned = v.trim().replace(/[^0-9.+-]/g, '');
		if (!cleaned) return undefined;
		const n = Number(cleaned);
		return Number.isFinite(n) ? n : undefined;
	}
	return undefined;
}

function decimal(o: Json | undefined, ...keys: string[]): number | undefined {
	for (const k of keys) {
		const n = toNumber(primitive(o, k));
		if (n !== undefined) return n;
	}
	return undefined;
}

function integer(o: Json | undefined, ...keys: string[]): number | undefined {
	for (const k of keys) {
		const v = primitive(o, k);
		if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
		if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return parseInt(v, 10);
	}
	return undefined;
}

function text(o: Json | undefined, ...keys: string[]): string | undefined {
	for (const k of keys) {
		const v = primitive(o, k);
		if (v === undefined) continue;
		const s = String(v);
		if (s.trim()) return s;
	}
	return undefined;
}

function booleanLike(o: Json | undefined, key: string): boolean | undefined {
	const v = primitive(o, key);
	if (typeof v === 'boolean') return v;
	if (v === undefined) return undefined;
	switch (String(v).toLowerCase()) {
		case 'on':
		case 'true':
		case '1':
		case 'connected':
			return true;
		case 'off':
		case 'false':
		case '0':
		case 'disconnected':
			return false;
	}
	return undefined;
}

function epochMillis(o: Json | undefined, key: string): number | undefined {
	const v = o?.[key];
	if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
	if (typeof v === 'string' && /^\d+$/.test(v.trim())) return parseInt(v, 10);
	return undefined;
}

function mergeObjects(base: Json, overlay: Json): Json {
	const out: Json = structuredClone(base);
	for (const [k, v] of Object.entries(overlay)) {
		const existing = out[k];
		out[k] = isObj(existing) && isObj(v) ? mergeObjects(existing, v) : v;
	}
	return out;
}

/** Prefer state.reported, merge state.delta when both exist; else the raw root. */
function unwrapShadowRoot(root: Json): Json {
	const state = objectOrNull(root, 'state');
	const reported = objectOrNull(state, 'reported') ?? resolveObject(root, 'state.reported');
	const delta = objectOrNull(state, 'delta') ?? resolveObject(root, 'state.delta');
	if (reported && delta) return mergeObjects(reported, delta);
	return reported ?? delta ?? root;
}

export const RIDE_MODES = [
	{ api: 'SmartEco', display: 'SmartEco' },
	{ api: 'Eco', display: 'Eco' },
	{ api: 'Ride', display: 'Ride' },
	{ api: 'Sport', display: 'Sport' },
	{ api: 'Warp', display: 'Warp' },
	{ api: 'WarpPlus', display: 'Warp+' },
	{ api: 'Zip', display: 'Zip' }
] as const;
export type RideModeApi = (typeof RIDE_MODES)[number]['api'];

export function canonicalMode(value: string | undefined | null): RideModeApi | undefined {
	const key = (value ?? '').toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, '');
	const map: Record<string, RideModeApi> = {
		smarteco: 'SmartEco',
		eco: 'Eco',
		ride: 'Ride',
		sport: 'Sport',
		warp: 'Warp',
		warpplus: 'WarpPlus',
		zip: 'Zip'
	};
	return map[key];
}

export function isActiveStatus(status?: string): boolean {
	return (status ?? '').trim().toLowerCase() === 'charging';
}

const STOPPED = new Set([
	'paused',
	'pause',
	'stopped',
	'stop',
	'completed',
	'complete',
	'disconnected',
	'idle',
	'not charging'
]);
export function isStoppedStatus(status?: string): boolean {
	return status !== undefined && STOPPED.has(status.trim().toLowerCase());
}

/** Parses one Cerberus shadow/telemetry JSON frame. Returns null when it carries nothing useful. */
export function parseTelemetry(raw: string | Json): ScooterTelemetry | null {
	let parsed: unknown;
	try {
		parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
	} catch {
		return null;
	}
	if (!isObj(parsed)) return null;
	const root = unwrapShadowRoot(parsed);

	const bike = resolveObject(root, 'telemetry.bike', 'bike');
	const charging = resolveObject(root, 'telemetry.charging', 'charging');
	const appFeatures = resolveObject(root, 'app.ather_stack_features', 'ather_stack_features', 'stack_features');
	const remoteCharging = resolveObject(root, 'scooters.remote_charging', 'remote_charging');

	const battery =
		decimal(bike, 'battery_soc', 'soc', 'shortSOC') ??
		decimal(root, 'telemetry.bike.battery_soc', 'battery_soc', 'soc', 'shortSOC');
	const range = decimal(bike, 'range') ?? decimal(root, 'telemetry.bike.range', 'range');
	const odo = decimal(bike, 'odo') ?? decimal(root, 'telemetry.bike.odo', 'odo');
	const vehicleState = text(bike, 'vehicle_state') ?? text(root, 'telemetry.bike.vehicle_state', 'vehicle_state');
	const mode = text(bike, 'mode') ?? text(root, 'telemetry.bike.mode', 'mode');
	const savings =
		decimal(bike, 'savings') ?? decimal(root, 'telemetry.bike.savings', 'savings') ?? decimal(appFeatures, 'savings');
	const remoteChargingAction =
		text(remoteCharging, 'action') ?? text(root, 'scooters.remote_charging.action', 'remote_charging.action');

	const chargingStatus =
		text(charging, 'chargingStatus') ?? text(root, 'telemetry.charging.chargingStatus', 'chargingStatus');
	const heartbeat =
		text(charging, 'chargingHeartBeat') ?? text(root, 'telemetry.charging.chargingHeartBeat', 'chargingHeartBeat');
	const chargerConnected =
		booleanLike(charging, 'chargerConnected') ??
		booleanLike(root, 'telemetry.charging.chargerConnected') ??
		booleanLike(root, 'chargerConnected');
	// Cerberus remaining-time counters are in seconds.
	const time2Full =
		decimal(charging, 'time2FullCharge') ?? decimal(root, 'telemetry.charging.time2FullCharge', 'time2FullCharge');
	const time2Eighty =
		decimal(charging, 'time2EightyCharge') ??
		decimal(root, 'telemetry.charging.time2EightyCharge', 'time2EightyCharge');
	const chargerType =
		text(charging, 'chargerType', 'charger_type', 'type') ??
		text(root, 'telemetry.charging.chargerType', 'telemetry.charging.charger_type', 'chargerType', 'charger_type', 'type');

	// Live snapshots can say Charging + heartbeat On while chargerConnected is Off.
	// The physical charging status takes precedence.
	let isCharging: boolean | undefined;
	if (isStoppedStatus(chargingStatus)) isCharging = false;
	else if (isActiveStatus(chargingStatus)) isCharging = true;
	else if (heartbeat?.toLowerCase() === 'on') isCharging = true;
	else if (heartbeat?.toLowerCase() === 'off') isCharging = false;
	else if (chargerConnected === false) isCharging = false;
	else if (vehicleState?.toLowerCase() === 'charging') isCharging = true;

	const gpsObj = resolveObject(bike, 'gps_location') ?? resolveObject(root, 'telemetry.bike.gps_location', 'gps_location');
	let gps: GpsData | undefined;
	if (gpsObj) {
		const g: GpsData = {
			latitude: decimal(gpsObj, 'lat', 'latitude'),
			longitude: decimal(gpsObj, 'lng', 'lon', 'longitude'),
			altitudeMeters: decimal(gpsObj, 'ALT_M', 'altitude'),
			accuracyMeters: decimal(gpsObj, 'Accuracy', 'accuracy'),
			heading: decimal(gpsObj, 'heading', 'bearing'),
			speed: decimal(gpsObj, 'speed', 'gps_speed')
		};
		if (Object.values(g).some((v) => v !== undefined)) gps = stripUndefined(g);
	}

	const modeRanges: Record<string, ModeRange> = {};
	const modeRangeObj = resolveObject(bike, 'mode_range') ?? resolveObject(root, 'telemetry.bike.mode_range', 'mode_range');
	const predictedObj =
		resolveObject(bike, 'predicted_mode_range') ??
		resolveObject(root, 'telemetry.bike.predicted_mode_range', 'predicted_mode_range');
	for (const [k, v] of Object.entries(modeRangeObj ?? {})) {
		const m = canonicalMode(k);
		const n = toNumber(v);
		if (m && n !== undefined) modeRanges[m] = { rawRangeKm: n };
	}
	for (const [k, v] of Object.entries(predictedObj ?? {})) {
		const m = canonicalMode(k);
		const n = toNumber(v);
		if (m && n !== undefined) modeRanges[m] = { ...modeRanges[m], predictedRangeKm: n };
	}

	const tpmsObj = resolveObject(root, 'telemetry.tpms', 'tpms') ?? resolveObject(bike, 'tpms');
	let tpms: TpmsData | undefined;
	if (tpmsObj) {
		const t: TpmsData = {
			frontPressurePsi: decimal(tpmsObj, 'front_pressure', 'front', 'front_tire_pressure', 'frontTyrePressure', 'front_psi'),
			rearPressurePsi: decimal(tpmsObj, 'rear_pressure', 'rear', 'rear_tire_pressure', 'rearTyrePressure', 'rear_psi'),
			frontTemperatureC: decimal(tpmsObj, 'front_temperature', 'front_temp', 'frontTemperature'),
			rearTemperatureC: decimal(tpmsObj, 'rear_temperature', 'rear_temp', 'rearTemperature')
		};
		if (Object.values(t).some((v) => v !== undefined)) tpms = stripUndefined(t);
	}

	const softwareVersion =
		text(bike, 'user_facing_software_version', 'vehicle_software_version', 'software_version', 'ota_version', 'stack_version') ??
		text(root, 'telemetry.bike.software_version', 'telemetry.bike.user_facing_software_version', 'software_version', 'ota_version', 'stack_version');

	const connectivityStrength =
		integer(bike, 'gsm_signal', 'csq', 'network_strength') ??
		integer(root, 'telemetry.bike.gsm_signal', 'telemetry.bike.csq', 'gsm_signal', 'csq', 'network_strength');

	const featureFlags: Record<string, boolean> = {};
	for (const [k, v] of Object.entries(appFeatures ?? {})) {
		let flag: boolean | undefined;
		if (typeof v === 'boolean') flag = v;
		else if (typeof v === 'number') flag = v === 1;
		else if (typeof v === 'string') {
			const s = v.toLowerCase();
			if (['on', 'true', '1', 'enabled'].includes(s)) flag = true;
			else if (['off', 'false', '0', 'disabled'].includes(s)) flag = false;
		}
		if (flag !== undefined) featureFlags[k] = flag;
	}

	// Only explicit percentage fields qualify. A health score, capacity or age is not SoH.
	const bms = resolveObject(root, 'telemetry.bms', 'bms');
	const soh =
		decimal(bike, 'soh_percent', 'battery_soh_percent') ??
		decimal(bms, 'soh_percent', 'state_of_health_percent') ??
		decimal(root, 'telemetry.bike.soh_percent', 'telemetry.bike.battery_soh_percent');
	const reportedSohPercent = soh !== undefined && soh >= 0 && soh <= 100 ? soh : undefined;

	const t: ScooterTelemetry = stripUndefined({
		batterySoc: battery,
		sourceTimestampMs:
			epochMillis(bike, 'last_synced_time') ??
			epochMillis(root, 'telemetry.bike.last_synced_time') ??
			epochMillis(root, 'last_synced_time'),
		reportedSohPercent,
		rangeKm: range,
		odoKm: odo,
		vehicleState,
		mode,
		charging: isCharging,
		chargerConnected,
		chargingStatus,
		timeToFullChargeMin: time2Full !== undefined && time2Full >= 0 ? time2Full / 60 : undefined,
		timeToEightyChargeMin: time2Eighty !== undefined && time2Eighty >= 0 ? time2Eighty / 60 : undefined,
		savingsInr: savings,
		gps,
		modeRanges,
		tpms,
		chargerType,
		softwareVersion,
		connectivityStrength,
		featureFlags,
		remoteChargingAction
	});

	const meaningful =
		Object.entries(t).some(
			([k, v]) => k !== 'modeRanges' && k !== 'featureFlags' && k !== 'sourceTimestampMs' && v !== undefined
		) ||
		Object.keys(modeRanges).length > 0 ||
		Object.keys(featureFlags).length > 0;
	return meaningful ? t : null;
}

function stripUndefined<T extends object>(o: T): T {
	for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
	return o;
}

/** Merge a partial delta into the current state; port of ScooterTelemetry.mergeWith + ChargingControl.mergeChargingFields. */
export function mergeTelemetry(existing: ScooterTelemetry | null, delta: ScooterTelemetry): ScooterTelemetry {
	if (!existing) return delta;
	const modeRanges = { ...existing.modeRanges };
	for (const [k, v] of Object.entries(delta.modeRanges)) modeRanges[k] = { ...modeRanges[k], ...v };

	const status = delta.chargingStatus ?? existing.chargingStatus;
	const connected =
		delta.chargerConnected ??
		(delta.charging === true || isActiveStatus(delta.chargingStatus) ? true : existing.chargerConnected);
	const pausedStatus = (status ?? '').toLowerCase().includes('pause');
	let charging: boolean | undefined;
	if (isStoppedStatus(delta.chargingStatus)) charging = false;
	else if (isActiveStatus(delta.chargingStatus) || delta.charging === true) charging = true;
	else if (delta.charging !== undefined) charging = delta.charging;
	else if (delta.chargerConnected === false) charging = false;
	else if (pausedStatus) charging = false;
	else charging = existing.charging;

	let resolvedStatus: string | undefined;
	if (delta.chargingStatus !== undefined) resolvedStatus = delta.chargingStatus;
	else if (delta.charging === true) resolvedStatus = 'Charging';
	else if (delta.chargerConnected === false) resolvedStatus = 'Disconnected';
	else if (delta.charging === false) resolvedStatus = connected === true ? 'Paused' : 'Idle';
	else resolvedStatus = status;

	return stripUndefined({
		...existing,
		...delta,
		gps: existing.gps || delta.gps ? { ...existing.gps, ...delta.gps } : undefined,
		tpms: existing.tpms || delta.tpms ? { ...existing.tpms, ...delta.tpms } : undefined,
		modeRanges,
		featureFlags: { ...existing.featureFlags, ...delta.featureFlags },
		charging,
		chargerConnected: connected,
		chargingStatus: resolvedStatus,
		timeToFullChargeMin: delta.timeToFullChargeMin ?? existing.timeToFullChargeMin,
		timeToEightyChargeMin: delta.timeToEightyChargeMin ?? existing.timeToEightyChargeMin,
		chargerType: delta.chargerType ?? existing.chargerType,
		remoteChargingAction: delta.remoteChargingAction ?? existing.remoteChargingAction,
		sourceTimestampMs: delta.sourceTimestampMs ?? existing.sourceTimestampMs
	});
}

// --- ChargingControl ---

export function isActivelyCharging(t: ScooterTelemetry | null | undefined): boolean {
	if (!t) return false;
	if (isStoppedStatus(t.chargingStatus)) return false;
	return isActiveStatus(t.chargingStatus) || t.charging === true;
}

export function isPluggedIn(t: ScooterTelemetry | null | undefined): boolean {
	if (!t) return false;
	if (isActivelyCharging(t)) return true;
	if (t.chargerConnected === false) return false;
	if (t.chargerConnected === true) return true;
	const s = (t.chargingStatus ?? '').toLowerCase();
	if (s.includes('pause') || s === 'charging' || s.includes('connected')) return true;
	return s.includes('charging') && !s.includes('complete');
}

export function isPaused(t: ScooterTelemetry | null | undefined): boolean {
	if (!t || !isPluggedIn(t) || isActivelyCharging(t)) return false;
	if ((t.chargingStatus ?? '').toLowerCase().includes('pause')) return true;
	return t.chargerConnected === true;
}
