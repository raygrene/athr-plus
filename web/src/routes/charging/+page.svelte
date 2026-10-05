<script lang="ts">
	import Freshness from '$lib/components/Freshness.svelte';
	import EnergySummary from '$lib/components/EnergySummary.svelte';
	import { live } from '$lib/live.svelte';
	import { prefs } from '$lib/prefs.svelte';
	import { effectiveModel } from '$lib/model';
	import { chargeEstimate, SCOOTER_MODELS, DEFAULT_MODEL } from '$lib/vehicle';
	import { isActivelyCharging, isPaused, isPluggedIn } from '$lib/telemetry';
	import { num, duration, time } from '$lib/format';

	let { data } = $props();
	const model = $derived(effectiveModel(data.profile));
	const capacityWh = $derived(SCOOTER_MODELS[model ?? DEFAULT_MODEL].usableWh);
	const t = $derived(live.state.telemetry);
	const target = $derived(prefs.value.chargeTarget);
	const estimate = $derived(chargeEstimate(t, target, capacityWh, prefs.value.tariffRatePerKWh, model));

	const plugged = $derived(isPluggedIn(t));
	const charging = $derived(isActivelyCharging(t));
	const paused = $derived(isPaused(t));

	// Command lifecycle: HTTP acceptance is not confirmation; telemetry is.
	type Phase = 'idle' | 'sending' | 'accepted' | 'confirmed' | 'unconfirmed' | 'error';
	let phase = $state<Phase>('idle');
	let action = $state<'start' | 'stop' | null>(null);
	let message = $state<string | null>(null);
	let requestedAt = $state<number | null>(null);
	const CONFIRM_TIMEOUT_MS = 45_000;

	async function send(next: 'start' | 'stop') {
		const verb = next === 'stop' ? 'pause' : 'resume';
		if (!confirm(`Send a ${verb} charging request to your scooter?`)) return;
		phase = 'sending';
		action = next;
		message = null;
		try {
			const res = await fetch('/api/charging', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: next })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok || !body.accepted) {
				phase = 'error';
				message = body.message ?? `Request failed (HTTP ${res.status})`;
				return;
			}
			phase = 'accepted';
			requestedAt = body.requestedAt ?? Date.now();
		} catch (e) {
			phase = 'error';
			message = e instanceof Error ? e.message : 'Network error';
		}
	}

	$effect(() => {
		if (phase !== 'accepted') return;
		if (action === 'stop' && !charging && plugged) phase = 'confirmed';
		if (action === 'start' && charging) phase = 'confirmed';
	});
	$effect(() => {
		if (phase !== 'accepted' || requestedAt === null) return;
		const left = requestedAt + CONFIRM_TIMEOUT_MS - Date.now();
		const id = setTimeout(() => {
			if (phase === 'accepted') phase = 'unconfirmed';
		}, Math.max(0, left));
		return () => clearTimeout(id);
	});

	const pending = $derived(phase === 'sending' || phase === 'accepted');
</script>

<svelte:head><title>Charging · Athr+</title></svelte:head>

<Freshness />
<EnergySummary {model} />

<section class="card stack">
	<div class="row between">
		<h2>Charge to {target}%</h2>
		<input
			type="range" min="50" max="100" step="1" value={target} aria-label="Charge target percentage"
			oninput={(e) => prefs.set({ chargeTarget: Number(e.currentTarget.value) })}
			style="flex:1;max-width:320px"
		/>
	</div>
	{#if !estimate}
		<p class="muted" style="margin:0">Waiting for a battery reading to estimate your charge.</p>
	{:else}
		<p style="margin:0">{num(t?.batterySoc)}% reported · {num(estimate.remainingPercent)}% to go</p>
		<div class="grid">
			<div class="tile"><div class="small muted">Energy</div><div class="value">≈ {num(estimate.energyKWh, 2)} kWh</div></div>
			<div class="tile"><div class="small muted">Cost</div><div class="value">≈ ₹{num(estimate.costInr, 2)}</div></div>
			{#if estimate.rangeAtTargetKm !== undefined}
				<div class="tile"><div class="small muted">Range at {target}%</div><div class="value">≈ {num(estimate.rangeAtTargetKm)} km</div></div>
			{/if}
			{#if estimate.minutesToTarget !== undefined && estimate.remainingPercent > 0}
				<div class="tile"><div class="small muted">Time to target</div><div class="value">≈ {duration(estimate.minutesToTarget)}</div></div>
			{/if}
		</div>
	{/if}
	<p class="small muted" style="margin:0">
		Estimates use your scooter’s range, its reported time-to-charge and the selected battery size
		({SCOOTER_MODELS[model ?? DEFAULT_MODEL].displayName}) at ₹{prefs.value.tariffRatePerKWh}/kWh. Cost excludes charging losses.
	</p>
</section>

<section class="card stack">
	<h2>Remote charging</h2>
	<dl class="kv">
		<dt>Charger</dt><dd>{plugged ? 'Plugged in' : 'Not plugged in'}</dd>
		<dt>Status</dt><dd>{charging ? 'Charging' : paused ? 'Paused' : (t?.chargingStatus ?? '--')}</dd>
		{#if t?.remoteChargingAction}<dt>Last requested action</dt><dd>{t.remoteChargingAction}</dd>{/if}
	</dl>
	<div class="row">
		<button class="primary" disabled={!charging || pending} onclick={() => send('stop')}>Pause charging</button>
		<button class="tonal" disabled={!paused || pending} onclick={() => send('start')}>Resume charging</button>
	</div>
	{#if phase === 'sending'}
		<p class="small muted" style="margin:0">Sending request…</p>
	{:else if phase === 'accepted'}
		<p class="notice small">Ather accepted the {action === 'stop' ? 'pause' : 'resume'} request at {time(requestedAt ?? undefined)}. Waiting for the scooter to confirm…</p>
	{:else if phase === 'confirmed'}
		<p class="small live" style="margin:0">Charging telemetry confirms the scooter {action === 'stop' ? 'paused' : 'resumed'}.</p>
	{:else if phase === 'unconfirmed'}
		<p class="notice small">Not confirmed: Ather accepted the request but the scooter has not reported the change within 45 seconds. Check before relying on it.</p>
	{:else if phase === 'error'}
		<p class="error small">{message}</p>
	{/if}
	{#if !plugged}<p class="small muted" style="margin:0">Pause and resume are available while the charger is connected.</p>{/if}
	<p class="small muted" style="margin:0">
		The Android app's automatic charge limiter runs in the background on your phone; this website does not stop charging
		on its own.
	</p>
</section>
