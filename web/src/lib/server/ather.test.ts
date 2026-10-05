import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseHealthReport, parseLocations, parseWallet, remoteChargingPayload } from './ather';

const fixture = (name: string) =>
	JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../android/app/src/test/resources/${name}`, import.meta.url)), 'utf8'));

describe('Ather response parsers', () => {
	it('parses the vehicle-health scorecard', () => {
		const r = parseHealthReport(fixture('analytics_fixtures/vehicle_health_report.json'))!;
		expect(r.overall).toMatchObject({ score: 86, label: 'Good', maxScore: 100 });
		expect(r.components[0]).toMatchObject({ id: 'battery', score: 90, tag: { text: 'Healthy' } });
		expect(r.wearAndTear[0]).toMatchObject({ id: 'tyre_front', lifePercent: 64, remainingKms: 4500 });
		expect(r.vehicle?.registrationMasked).toBe('KA01****34');
		expect(parseHealthReport({})).toBeNull();
	});

	it('parses charger locations', () => {
		const list = parseLocations(fixture('chargingmap_fixtures/locations_sample.json'));
		expect(list[0]).toMatchObject({ name: 'Indiranagar Grid Hub', dbsAvailable: 2, dbsTotal: 3, has6kwGrid: true, isOpenNow: true });
		expect(list[0].connectors).toHaveLength(2);
		expect(list[0].tariffLines[0]).toEqual({ displayText: 'Energy', text: '₹8.5 / kWh' });
		expect(parseLocations(fixture('chargingmap_fixtures/locations_empty.json'))).toEqual([]);
	});

	it('parses the wallet', () => {
		const w = parseWallet(fixture('chargingmap_fixtures/wallet_sample.json'));
		expect(w).toMatchObject({ balance: 247.5, walletStatus: 'ACTIVE', credits: 12 });
		expect(w.transactions[0]).toMatchObject({ id: 'txn_1001', amount: -42.75 });
		expect(parseWallet(fixture('chargingmap_fixtures/wallet_balance_only.json')).transactions).toEqual([]);
	});

	it('builds the exact remote-charging shadow payload', () => {
		expect(remoteChargingPayload('abc', false, 123)).toEqual({
			state: { desired: { remote_charging: { state: 1, action: 'stop', error: '0', timestamp: 123 } } },
			request_id: 'ma_abc'
		});
	});
});
