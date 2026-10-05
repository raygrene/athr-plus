import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mergeTelemetry, parseTelemetry, isActivelyCharging, isPluggedIn, isPaused } from './telemetry';
import { chargeEstimate, modeRanges, resolveModel } from './vehicle';

// Reuse the Android app's fixtures so both parsers stay in step.
const fixture = (name: string) =>
	readFileSync(fileURLToPath(new URL(`../../../android/app/src/test/resources/${name}`, import.meta.url)), 'utf8');
const parse = (name: string) => {
	const t = parseTelemetry(fixture(`telemetry_fixtures/${name}`));
	expect(t).not.toBeNull();
	return t!;
};

describe('parseTelemetry', () => {
	it('reads nested telemetry', () => {
		const t = parse('direct_nested.json');
		expect(t.batterySoc).toBeCloseTo(84.07);
		expect(t.rangeKm).toBeCloseTo(120.5);
		expect(t.odoKm).toBeCloseTo(27659.418);
		expect(t.vehicleState).toBe('parked');
		expect(t.mode).toBe('Ride');
		expect(t.savingsInr).toBeCloseTo(68423.6);
		expect(t.softwareVersion).toBe('6.2.1');
		expect(t.connectivityStrength).toBe(18);
		expect(t.charging).toBe(false);
		expect(t.chargerConnected).toBe(true);
		expect(t.chargingStatus).toBe('Completed');
		expect(t.chargerType).toBe('home');
		expect(t.remoteChargingAction).toBe('stop');
		expect(t.gps).toMatchObject({ latitude: 12.9716, longitude: 77.5946, altitudeMeters: 920, accuracyMeters: 6.4, heading: 45, speed: 0 });
		expect(t.modeRanges.SmartEco.rawRangeKm).toBe(140);
		expect(t.modeRanges.Eco.rawRangeKm).toBe(130);
		expect(t.modeRanges.Ride).toEqual({ rawRangeKm: 120, predictedRangeKm: 127.78 });
		expect(t.modeRanges.WarpPlus.rawRangeKm).toBe(70);
		expect(t.tpms).toMatchObject({ frontPressurePsi: 32, rearPressurePsi: 36, frontTemperatureC: 28.5 });
		expect(t.featureFlags).toMatchObject({ anti_theft: true, vacation_mode: false, coasting_regen: true });
	});

	it('unwraps state.reported envelopes and converts seconds to minutes', () => {
		const t = parse('enveloped_reported.json');
		expect(t.batterySoc).toBeCloseTo(72.5);
		expect(t.mode).toBe('SmartEco');
		expect(t.connectivityStrength).toBe(22);
		expect(t.charging).toBe(true);
		expect(t.chargingStatus).toBe('Charging');
		// time2FullCharge is in seconds (docs/NATIVE-COMPUTATION.md).
		expect(t.timeToFullChargeMin).toBeCloseTo(95 / 60);
		expect(t.chargerType).toBe('public');
		expect(t.remoteChargingAction).toBe('start');
		expect(t.gps?.heading).toBe(180);
		expect(t.modeRanges.SmartEco.rawRangeKm).toBe(145);
		expect(t.tpms).toMatchObject({ frontPressurePsi: 31.5, rearPressurePsi: 35 });
		expect(t.featureFlags).toMatchObject({ anti_theft: true, skid_control: true });
	});

	it('assembles flattened dotted keys', () => {
		const t = parse('flattened_dotted.json');
		expect(t.batterySoc).toBe(55);
		expect(t.mode).toBe('Sport');
		expect(t.connectivityStrength).toBe(12);
		expect(t.charging).toBe(false);
		expect(t.chargerConnected).toBe(false);
		expect(t.chargingStatus).toBe('Initializing');
		expect(t.chargerType).toBe('portable');
		expect(t.gps).toMatchObject({ latitude: 19.076, longitude: 72.8777, speed: 32.5 });
		expect(t.modeRanges.Ride).toEqual({ rawRangeKm: 85, predictedRangeKm: 82 });
		expect(t.tpms).toMatchObject({ frontPressurePsi: 30, rearPressurePsi: 34 });
		expect(t.featureFlags).toMatchObject({ vacation_mode: false, anti_theft: true });
	});

	it('merges partial deltas without inventing values', () => {
		const base = parse('direct_nested.json');
		const charging = parse('partial_delta_charging.json');
		const modes = parse('partial_delta_modes.json');
		expect(charging.batterySoc).toBeUndefined();
		expect(charging.charging).toBe(true);
		expect(charging.chargerConnected).toBe(true);
		expect(modes.charging).toBeUndefined();
		expect(modes.rangeKm).toBe(88);

		const afterCharge = mergeTelemetry(base, charging);
		expect(afterCharge.batterySoc).toBeCloseTo(84.07);
		expect(afterCharge.charging).toBe(true);
		expect(afterCharge.chargingStatus).toBe('Charging');
		expect(afterCharge.timeToFullChargeMin).toBeCloseTo(1);
		expect(afterCharge.tpms?.frontPressurePsi).toBe(32);

		const afterModes = mergeTelemetry(afterCharge, modes);
		expect(afterModes.rangeKm).toBe(88);
		expect(afterModes.charging).toBe(true);
		expect(afterModes.modeRanges.Ride).toEqual({ rawRangeKm: 88, predictedRangeKm: 91.5 });
		expect(afterModes.modeRanges.SmartEco.rawRangeKm).toBe(140);
		expect(afterModes.modeRanges.Sport.rawRangeKm).toBe(95);
	});

	it('returns null for noise', () => {
		expect(parseTelemetry('{}')).toBeNull();
		expect(parseTelemetry('{"state":{"reported":{}}}')).toBeNull();
		expect(parseTelemetry('{"foo":"bar"}')).toBeNull();
		expect(parseTelemetry('not json')).toBeNull();
	});

	it('lets an active status override chargerConnected=Off', () => {
		const t = parseTelemetry({ 'telemetry.charging': { chargingStatus: 'Charging', chargingHeartBeat: 'On', chargerConnected: 'Off' } })!;
		expect(isActivelyCharging(t)).toBe(true);
		expect(isPluggedIn(t)).toBe(true);
		const paused = parseTelemetry({ 'telemetry.charging': { chargingStatus: 'Paused', chargerConnected: 'On' } })!;
		expect(isPaused(paused)).toBe(true);
	});
});

describe('estimates', () => {
	it('anchors mode ranges to the current range', () => {
		const t = parse('direct_nested.json');
		const ranges = modeRanges(t, 'ATHER_450X_3_7');
		const ride = ranges.find((r) => r.name === 'Ride')!;
		expect(ride.active).toBe(true);
		expect(ride.km).toBeCloseTo(120.5);
		expect(ranges.find((r) => r.name === 'Warp+')).toBeUndefined();
	});

	it('estimates energy, cost and time to target', () => {
		const t = { ...parse('enveloped_reported.json'), timeToEightyChargeMin: 30 };
		const e = chargeEstimate(t, 80, 3240, 8, 'ATHER_450X_3_7')!;
		expect(e.remainingPercent).toBeCloseTo(7.5);
		expect(e.energyKWh).toBeCloseTo(0.243);
		expect(e.costInr).toBeCloseTo(1.944);
		expect(e.minutesToTarget).toBeCloseTo(30);
		expect(chargeEstimate({ modeRanges: {}, featureFlags: {} }, 80, 3240, 8)).toBeUndefined();
	});

	it('resolves models from scooter properties', () => {
		expect(resolveModel({ modelType: '450x', modelCode: 'xhr' })).toBe('ATHER_450X_3_7');
		expect(resolveModel({ modelType: 'rizta', modelCode: 'rizta_lr' })).toBe('ATHER_RIZTA_2_9');
		expect(resolveModel({ modelType: '450x' })).toBeUndefined();
	});
});
