import { prefs } from './prefs.svelte';
import { resolveModel, type ScooterModel, type VehicleProfile } from './vehicle';

/** The user's override wins; otherwise the model detected from scooter properties. */
export function effectiveModel(profile: VehicleProfile | null | undefined): ScooterModel | undefined {
	return prefs.value.modelOverride ?? resolveModel(profile);
}
