/**
 * Server-side equivalent of AtherRepository's connection handling.
 *
 * One upstream Cerberus WebSocket per (token, scooter), shared by every open
 * browser tab. After the socket opens we send the shadow-path subscription and
 * the first frame is a full snapshot; later frames are partial deltas merged
 * into the current state. Like the app, a fresh connection is made every
 * 5 seconds so a quiet socket still yields a current cloud snapshot, and
 * incoming packets do not postpone that refresh.
 */
import WebSocket from 'ws';
import { createHash } from 'node:crypto';
import { SUBSCRIPTION_PATHS, WS_HEADERS, WS_URL } from './ather';
import { mergeTelemetry, parseTelemetry, type ScooterTelemetry } from '$lib/telemetry';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface LiveState {
	connection: ConnectionStatus;
	telemetry: ScooterTelemetry | null;
	/** When this server last received a frame (ms). */
	lastReceivedAt?: number;
	/** When a battery value was last received (ms); used when the frame has no source timestamp. */
	batteryReceivedAt?: number;
	gpsReceivedAt?: number;
	error?: string;
}

type Listener = (state: LiveState) => void;

const SNAPSHOT_INTERVAL_MS = 5_000;
const IDLE_CLOSE_MS = 30_000;
const MAX_BACKOFF_MS = 60_000;

class LiveHub {
	state: LiveState = { connection: 'connecting', telemetry: null };
	private listeners = new Set<Listener>();
	private socket: WebSocket | null = null;
	private refreshTimer: NodeJS.Timeout | null = null;
	private idleTimer: NodeJS.Timeout | null = null;
	private retryTimer: NodeJS.Timeout | null = null;
	private backoff = 2_000;
	private generation = 0;
	private stopped = false;

	constructor(
		private token: string,
		private uuid: string,
		private onDispose: () => void
	) {}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = null;
		if (!this.socket && !this.retryTimer) this.connect();
		if (!this.refreshTimer) {
			this.refreshTimer = setInterval(() => {
				if (this.state.connection === 'connected') this.connect();
			}, SNAPSHOT_INTERVAL_MS);
		}
		listener(this.state);
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0) this.idleTimer = setTimeout(() => this.dispose(), IDLE_CLOSE_MS);
		};
	}

	/** Force a reconnect (the app's refresh button). */
	refresh() {
		this.connect();
	}

	private emit(patch: Partial<LiveState>) {
		this.state = { ...this.state, ...patch };
		for (const l of this.listeners) l(this.state);
	}

	private connect() {
		if (this.stopped) return;
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.retryTimer = null;
		const generation = ++this.generation;
		const previous = this.socket;
		if (this.state.connection !== 'connected') this.emit({ connection: 'connecting' });

		const ws = new WebSocket(`${WS_URL}?uuid=${encodeURIComponent(this.uuid)}`, {
			headers: { ...WS_HEADERS, Authorization: `Bearer ${this.token}` },
			handshakeTimeout: 15_000
		});
		this.socket = ws;
		let closedOld = false;
		const closeOld = () => {
			if (closedOld) return;
			closedOld = true;
			if (previous && previous !== ws) previous.terminate();
		};

		ws.on('open', () => {
			ws.send(JSON.stringify({ paths: SUBSCRIPTION_PATHS }));
		});
		ws.on('message', (data) => {
			if (generation !== this.generation) return;
			closeOld();
			const telemetry = parseTelemetry(data.toString());
			const now = Date.now();
			this.backoff = 2_000;
			if (!telemetry) {
				this.emit({ connection: 'connected', lastReceivedAt: now, error: undefined });
				return;
			}
			this.emit({
				connection: 'connected',
				telemetry: mergeTelemetry(this.state.telemetry, telemetry),
				lastReceivedAt: now,
				batteryReceivedAt: telemetry.batterySoc !== undefined ? now : this.state.batteryReceivedAt,
				gpsReceivedAt: telemetry.gps?.latitude !== undefined ? now : this.state.gpsReceivedAt,
				error: undefined
			});
		});
		ws.on('unexpected-response', (_req, res) => {
			if (generation !== this.generation) return;
			const expired = res.statusCode === 401 || res.statusCode === 403;
			this.emit({
				connection: 'error',
				error: expired ? 'Session expired. Please sign in again.' : `Connection failed (HTTP ${res.statusCode})`
			});
			if (expired) this.stopped = true;
			else this.scheduleRetry();
			ws.terminate();
		});
		ws.on('error', (err) => {
			if (generation !== this.generation) return;
			this.emit({ connection: 'error', error: err.message || 'Connection failed' });
			this.scheduleRetry();
		});
		ws.on('close', (code, reason) => {
			if (generation !== this.generation || this.stopped) return;
			if (this.state.connection !== 'error')
				this.emit({ connection: 'disconnected', error: reason.toString() || `Connection closed (${code})` });
			this.scheduleRetry();
		});
		// If the new socket never produces a frame, still drop the previous one eventually.
		setTimeout(closeOld, 10_000);
	}

	private scheduleRetry() {
		if (this.stopped || this.retryTimer || this.listeners.size === 0) return;
		this.socket = null;
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			this.connect();
		}, this.backoff);
		this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
	}

	dispose() {
		this.stopped = true;
		for (const t of [this.refreshTimer, this.idleTimer, this.retryTimer]) if (t) clearTimeout(t);
		this.socket?.terminate();
		this.socket = null;
		this.onDispose();
	}
}

const hubs = new Map<string, LiveHub>();

const hubKey = (token: string, uuid: string) => createHash('sha256').update(`${token}\n${uuid}`).digest('hex');

export function getHub(token: string, uuid: string): LiveHub {
	const k = hubKey(token, uuid);
	let hub = hubs.get(k);
	if (!hub) {
		hub = new LiveHub(token, uuid, () => hubs.delete(k));
		hubs.set(k, hub);
	}
	return hub;
}

export function peekHub(token: string, uuid: string): LiveHub | undefined {
	return hubs.get(hubKey(token, uuid));
}
