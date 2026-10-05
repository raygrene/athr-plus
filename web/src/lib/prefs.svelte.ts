import { browser } from '$app/environment';
import type { ScooterModel } from './vehicle';

export interface Prefs {
	/** Overrides the model detected from the scooter's properties. */
	modelOverride: ScooterModel | null;
	tariffRatePerKWh: number;
	chargeTarget: number;
}

const KEY = 'athr.prefs.v1';
const DEFAULTS: Prefs = { modelOverride: null, tariffRatePerKWh: 8, chargeTarget: 80 };

function load(): Prefs {
	if (!browser) return { ...DEFAULTS };
	try {
		return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
	} catch {
		return { ...DEFAULTS };
	}
}

class PrefsStore {
	value = $state<Prefs>(load());
	set(patch: Partial<Prefs>) {
		this.value = { ...this.value, ...patch };
		try {
			localStorage.setItem(KEY, JSON.stringify(this.value));
		} catch {
			/* storage unavailable */
		}
	}
}

export const prefs = new PrefsStore();
