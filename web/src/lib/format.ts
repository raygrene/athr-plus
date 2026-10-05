export function num(v: number | undefined | null, digits = 0): string {
	if (v === undefined || v === null || !Number.isFinite(v)) return '--';
	return v.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function time(ms: number | undefined): string {
	if (!ms) return '--';
	return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function dateTime(ms: number | undefined): string {
	if (!ms) return '--';
	return new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function duration(minutes: number | undefined): string {
	if (minutes === undefined || !Number.isFinite(minutes)) return '--';
	const m = Math.round(minutes);
	return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

export function ago(ms: number | undefined, now: number): string {
	if (!ms) return '--';
	const s = Math.max(0, Math.round((now - ms) / 1000));
	if (s < 60) return `${s}s ago`;
	if (s < 3600) return `${Math.round(s / 60)} min ago`;
	return dateTime(ms);
}

/** Only allow plain hex colours from the API into inline styles. */
export function safeColor(c: string | undefined): string | undefined {
	return c && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : undefined;
}
