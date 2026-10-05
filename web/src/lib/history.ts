/**
 * Battery-level history kept in this browser only. Each point is a reported
 * reading with the scooter's own timestamp; repeated timestamps are ignored and
 * gaps are never filled.
 */
export interface BatterySample {
	t: number;
	soc: number;
}

const KEY = 'athr.batteryHistory.v1';
const KEEP_MS = 7 * 24 * 3600_000;

export function loadHistory(): BatterySample[] {
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		return Array.isArray(raw) ? raw.filter((s) => typeof s?.t === 'number' && typeof s?.soc === 'number') : [];
	} catch {
		return [];
	}
}

export function recordBattery(soc: number, t: number) {
	if (!Number.isFinite(soc) || soc < 0 || soc > 100) return;
	try {
		const list = loadHistory();
		const last = list[list.length - 1];
		if (last && t <= last.t) return;
		list.push({ t, soc });
		const cutoff = Date.now() - KEEP_MS;
		localStorage.setItem(KEY, JSON.stringify(list.filter((s) => s.t >= cutoff)));
		window.dispatchEvent(new Event('athr-history'));
	} catch {
		/* storage unavailable */
	}
}

export function clearHistory() {
	try {
		localStorage.removeItem(KEY);
		window.dispatchEvent(new Event('athr-history'));
	} catch {
		/* ignore */
	}
}
