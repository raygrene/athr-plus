<script lang="ts">
	import { live } from '$lib/live.svelte';
	import { isActivelyCharging, isPaused } from '$lib/telemetry';
	import { currentRange, type ScooterModel } from '$lib/vehicle';
	import { num, duration } from '$lib/format';

	let { model }: { model?: ScooterModel } = $props();

	let now = $state(Date.now());
	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 15_000);
		return () => clearInterval(id);
	});

	const t = $derived(live.state.telemetry);
	const soc = $derived(t?.batterySoc !== undefined && t.batterySoc >= 0 && t.batterySoc <= 100 ? t.batterySoc : undefined);
	const range = $derived(currentRange(t, model));
	const charging = $derived(isActivelyCharging(t));
	const readingAt = $derived(t?.sourceTimestampMs ?? live.state.batteryReceivedAt);
	const fresh = $derived(live.state.connection === 'connected' && readingAt !== undefined && now - readingAt <= 120_000 && now >= readingAt - 60_000);
	const status = $derived(
		charging && fresh
			? 'Charging'
			: charging
				? 'Charging · saved'
				: isPaused(t)
					? 'Paused'
					: soc === undefined
						? 'Waiting for data'
						: t?.chargingStatus || 'Ready to ride'
	);
</script>

<section class="card energy" aria-label="Battery and range">
	<div class="row between">
		<p class="eyebrow">Your energy</p>
		<span class="pill" class:on={charging}>{status}</span>
	</div>
	<div class="row between" style="align-items:flex-end">
		<div>
			<span class="big">{num(soc)}</span><span class="muted">%</span>
			<div class="bar" style="margin-top:10px;width:220px;max-width:60vw"><span style="width:{soc ?? 0}%"></span></div>
		</div>
		<div style="text-align:right">
			<p class="eyebrow">Range</p>
			<span class="value">{num(range)} km</span>
		</div>
	</div>
	{#if charging && (t?.timeToFullChargeMin !== undefined || t?.timeToEightyChargeMin !== undefined)}
		<p class="small muted" style="margin:0">
			{#if t?.timeToEightyChargeMin !== undefined && (soc ?? 0) < 80}To 80%: about {duration(t.timeToEightyChargeMin)} · {/if}
			{#if t?.timeToFullChargeMin !== undefined}To 100%: about {duration(t.timeToFullChargeMin)}{/if}
			· As reported by the scooter
		</p>
	{/if}
</section>

<style>
	.energy { display: grid; gap: 14px; }
	.pill { font-size: 0.8rem; padding: 4px 10px; border-radius: 999px; background: var(--surface-2); color: var(--muted); font-weight: 600; }
	.pill.on { background: var(--accent-soft); color: var(--accent); }
</style>
