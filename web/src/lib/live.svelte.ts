import { browser } from '$app/environment';
import type { ScooterTelemetry } from './telemetry';
import { recordBattery } from './history';

export interface LiveState {
	connection: 'connecting' | 'connected' | 'disconnected' | 'error';
	telemetry: ScooterTelemetry | null;
	lastReceivedAt?: number;
	batteryReceivedAt?: number;
	gpsReceivedAt?: number;
	error?: string;
}

/** Browser view of the server's shared Cerberus socket, delivered over SSE. */
class Live {
	state = $state<LiveState>({ connection: 'connecting', telemetry: null });
	/** The SSE link itself (browser ↔ this server). */
	linked = $state(false);
	private source: EventSource | null = null;
	private users = 0;

	start() {
		if (!browser) return () => {};
		this.users++;
		if (!this.source) {
			this.source = new EventSource('/api/live');
			this.source.onopen = () => (this.linked = true);
			this.source.onerror = () => (this.linked = false);
			this.source.onmessage = (e) => {
				try {
					const next = JSON.parse(e.data) as LiveState;
					this.state = next;
					// Chart only readings carrying the scooter's own timestamp, so cached
					// snapshots and repeated reports never become new samples.
					const soc = next.telemetry?.batterySoc;
					const at = next.telemetry?.sourceTimestampMs;
					if (soc !== undefined && at !== undefined) recordBattery(soc, at);
				} catch {
					/* ignore malformed frame */
				}
			};
		}
		return () => {
			this.users--;
			if (this.users <= 0) {
				this.source?.close();
				this.source = null;
				this.linked = false;
			}
		};
	}

	async refresh() {
		await fetch('/api/refresh', { method: 'POST' });
	}
}

export const live = new Live();
