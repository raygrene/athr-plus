/** Scooter models, ride-mode support and range/charge estimates (port of ScooterDashboard.kt, RideMode.kt, RangeEstimator.kt and rust/ather-math). */
import { RIDE_MODES, canonicalMode, type RideModeApi, type ScooterTelemetry } from './telemetry';

export const SCOOTER_MODELS = {
	ATHER_450X_3_7: { displayName: '450X (3.7 kWh)', nominalWh: 3700, usableWh: 3240 },
	ATHER_450X_2_9: { displayName: '450X (2.9 kWh)', nominalWh: 2900, usableWh: 2610 },
	ATHER_APEX: { displayName: '450 Apex (3.7 kWh)', nominalWh: 3700, usableWh: 3240 },
	ATHER_RIZTA_3_7: { displayName: 'Rizta (3.7 kWh)', nominalWh: 3700, usableWh: 3240 },
	ATHER_RIZTA_2_9: { displayName: 'Rizta (2.9 kWh)', nominalWh: 2900, usableWh: 2610 },
	ATHER_450S: { displayName: '450S (2.9 kWh)', nominalWh: 2900, usableWh: 2610 }
} as const;
export type ScooterModel = keyof typeof SCOOTER_MODELS;
export const DEFAULT_MODEL: ScooterModel = 'ATHER_450X_3_7';

export interface VehicleProfile {
	scooterId?: string; // bike_id, used by the rides API
	modelType?: string;
	modelCode?: string;
	generation?: string;
	bikeType?: string;
	platform?: string;
	colour?: string;
}

export function resolveModel(p: VehicleProfile | null | undefined): ScooterModel | undefined {
	if (!p) return undefined;
	const type = (p.modelType ?? '').toLowerCase();
	const code = (p.modelCode ?? '').toLowerCase();
	const bike = (p.bikeType ?? '').toLowerCase();
	if ([type, code, bike].some((s) => s.includes('apex'))) return 'ATHER_APEX';
	if ([type, code, bike].some((s) => s.includes('rizta')))
		return code.includes('lr') || bike.includes('lr') ? 'ATHER_RIZTA_2_9' : 'ATHER_RIZTA_3_7';
	if (type === '450s' || code === '450s' || bike.includes('450s')) return 'ATHER_450S';
	if (code === 'xhr' || bike.includes('xhr')) return 'ATHER_450X_3_7';
	if (code === 'xlr' || bike.includes('xlr')) return 'ATHER_450X_2_9';
	return undefined;
}

export function profileDisplayName(p: VehicleProfile | null | undefined): string {
	if (!p) return 'Scooter';
	const types: Record<string, string> = { '450x': '450X', '450s': '450S', apex: '450 Apex', '450 apex': '450 Apex', rizta: 'Rizta' };
	const base = types[(p.modelType ?? '').toLowerCase()] ?? (p.modelType?.trim() ? p.modelType.toUpperCase() : 'Scooter');
	const range = { xhr: 'HR', xlr: 'LR' }[(p.modelCode ?? '').toLowerCase()];
	const gen = p.generation?.trim() ? `Gen ${p.generation}` : undefined;
	return [base, range, gen].filter(Boolean).join(' · ');
}

export function modeSupported(mode: RideModeApi, model: ScooterModel | undefined): boolean {
	switch (model) {
		case 'ATHER_APEX':
			return mode !== 'Warp' && mode !== 'Zip';
		case 'ATHER_450X_3_7':
		case 'ATHER_450X_2_9':
			return mode !== 'WarpPlus' && mode !== 'Zip';
		case 'ATHER_450S':
			return ['SmartEco', 'Eco', 'Ride', 'Sport'].includes(mode);
		case 'ATHER_RIZTA_3_7':
		case 'ATHER_RIZTA_2_9':
			return ['SmartEco', 'Eco', 'Zip'].includes(mode);
		default:
			return mode !== 'WarpPlus'; // Never imply Apex support without a known model.
	}
}

const valid = (v: number | undefined | null) => (v !== undefined && v !== null && Number.isFinite(v) && v >= 0 ? v : undefined);

export interface RideModeRange {
	name: string;
	km: number;
	active: boolean;
}

/** Anchors each mode's ratio to the current range so every tile refers to the same battery reading. */
export function modeRanges(t: ScooterTelemetry | null | undefined, model?: ScooterModel): RideModeRange[] {
	const active = canonicalMode(t?.mode);
	const ranges: RideModeRange[] = [];
	for (const m of RIDE_MODES) {
		if (!modeSupported(m.api, model)) continue;
		const r = t?.modeRanges?.[m.api];
		const km = valid(r?.predictedRangeKm) ?? valid(r?.rawRangeKm);
		if (km !== undefined) ranges.push({ name: m.display, km, active: m.api === active });
	}
	const current = valid(t?.rangeKm);
	const activeRange = ranges.find((r) => r.active)?.km;
	if (current !== undefined && active && modeSupported(active, model) && !(activeRange && activeRange > 0)) {
		const display = RIDE_MODES.find((m) => m.api === active)!.display;
		return [{ name: display, km: current, active: true }];
	}
	if (current !== undefined && activeRange && activeRange > 0) {
		return ranges.flatMap((r) => {
			const km = valid((current * r.km) / activeRange);
			return km === undefined ? [] : [{ ...r, km }];
		});
	}
	return ranges;
}

export function currentRange(t: ScooterTelemetry | null | undefined, model?: ScooterModel): number | undefined {
	return valid(t?.rangeKm) ?? modeRanges(t, model).find((r) => r.active)?.km;
}

export interface ChargeTargetEstimate {
	remainingPercent: number;
	energyKWh: number;
	costInr: number;
	rangeAtTargetKm?: number;
	minutesToTarget?: number;
}

/** Port of RustTelemetryMath.chargeEstimate. */
export function chargeEstimate(
	t: ScooterTelemetry | null | undefined,
	target: number,
	capacityWh: number,
	tariff: number,
	model?: ScooterModel
): ChargeTargetEstimate | undefined {
	const soc = t?.batterySoc;
	if (soc === undefined || !Number.isFinite(soc) || soc < 0 || soc > 100) return undefined;
	if (!(capacityWh > 0) || !(tariff >= 0)) return undefined;
	const tgt = Math.min(100, Math.max(0, Math.round(target)));
	const remaining = Math.max(0, tgt - soc);
	const energy = (capacityWh * remaining) / 100_000;
	const eta80 = t?.timeToEightyChargeMin;
	const eta100 = t?.timeToFullChargeMin;
	let eta: number | undefined;
	if (remaining === 0) eta = 0;
	else if (tgt <= 80 && soc < 80 && eta80 !== undefined && eta80 >= 0) eta = (eta80 * remaining) / (80 - soc);
	else if (soc < 100 && eta100 !== undefined && eta100 >= 0) eta = (eta100 * remaining) / (100 - soc);
	const range = currentRange(t, model);
	const projected = soc >= 5 && range !== undefined ? (range * tgt) / soc : undefined;
	return {
		remainingPercent: remaining,
		energyKWh: energy,
		costInr: energy * tariff,
		rangeAtTargetKm: valid(projected),
		minutesToTarget: valid(eta)
	};
}
