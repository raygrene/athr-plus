<script lang="ts">
	import { live } from '$lib/live.svelte';
	import { time } from '$lib/format';

	let now = $state(Date.now());
	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 5_000);
		return () => clearInterval(id);
	});

	const s = $derived(live.state);
	const readingAt = $derived(s.telemetry?.sourceTimestampMs ?? s.batteryReceivedAt ?? s.lastReceivedAt);
	const age = $derived(readingAt ? Math.max(0, Math.round((now - readingAt) / 1000)) : undefined);
	const fresh = $derived(s.connection === 'connected' && age !== undefined && age < 60);
	const label = $derived(
		fresh
			? `Live · Updated ${age}s ago`
			: age !== undefined
				? `Last received ${time(readingAt)} · ${s.connection === 'connected' ? 'Waiting for scooter' : 'Reconnecting'}`
				: s.connection === 'connecting'
					? 'Connecting to your scooter…'
					: 'Waiting for scooter data · Use refresh to retry'
	);
</script>

<p class="small {fresh ? 'live' : 'muted'}" style="margin:0" aria-live="polite">{label}</p>
{#if s.error && s.connection !== 'connected'}<p class="error small">{s.error}</p>{/if}
