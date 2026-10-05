/** Shapes returned by the server's Ather client to pages (ports of the Android domain models). */

export interface DiscoveredScooter {
	uuid: string;
	displayName: string;
	registration?: string;
	modelType?: string;
	colour?: string;
}

export interface TripRecord {
	id: string;
	startTimeMs: number;
	endTimeMs: number;
	distanceKm: number;
	/** Ather's rides API reports Wh/km; energy is derived from it, not measured. */
	efficiencyWhPerKm?: number;
	energyWh?: number;
}

export interface HealthTag {
	text?: string;
	textColor?: string;
	backgroundColor?: string;
}

export interface VehicleHealthReport {
	vehicle?: {
		id?: string;
		name?: string;
		registrationMasked?: string;
		ageYears?: string;
		odoKms?: number;
		odoFormatted?: string;
	};
	overall?: { score?: number; label?: string; maxScore?: number; colorCode?: string };
	components: { id?: string; name?: string; score?: number; maxScore?: number; tag?: HealthTag; displayType?: string }[];
	wearAndTear: {
		id?: string;
		name?: string;
		lifePercent?: number;
		currentKms?: number;
		remainingKms?: number;
		tag?: HealthTag;
		description?: HealthTag;
	}[];
	resale?: { currency?: string; disclaimer?: string; minValue?: number; maxValue?: number; displayText?: string };
	meta?: { lastUpdated?: string; refreshNote?: string };
}

export type ScorecardState =
	| { kind: 'available'; report: VehicleHealthReport }
	| { kind: 'unavailable'; reason: string }
	| { kind: 'error'; reason: string };

export interface ChargerLocation {
	name?: string;
	infraType?: string;
	address?: string;
	latitude: number;
	longitude: number;
	isOpenNow?: boolean;
	closingIn?: string;
	nextOpening?: string;
	locationTags: string[];
	dbsAvailable?: number;
	dbsInUse?: number;
	dbsUnderMaintenance?: number;
	dbsOutOfOperatingHours?: number;
	dbsTotal?: number;
	connectors: { displayText?: string; standard?: string }[];
	tariffLines: { displayText?: string; text?: string }[];
	partyId?: string;
	has6kwGrid?: boolean;
}

export interface WalletSnapshot {
	balance?: number;
	walletStatus?: string;
	credits?: number;
	transactions: {
		id?: string;
		title?: string;
		amount?: number;
		currency?: string;
		timestamp?: string;
		type?: string;
	}[];
}
