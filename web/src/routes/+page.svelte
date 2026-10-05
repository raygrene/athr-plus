<script lang="ts">
	import Freshness from '$lib/components/Freshness.svelte';
	import EnergySummary from '$lib/components/EnergySummary.svelte';
	import ModeRanges from '$lib/components/ModeRanges.svelte';
	import BatteryHistory from '$lib/components/BatteryHistory.svelte';
	import { live } from '$lib/live.svelte';
	import { effectiveModel } from '$lib/model';
	import { isPluggedIn } from '$lib/telemetry';
	import { num } from '$lib/format';

	let { data } = $props();
	const model = $derived(effectiveModel(data.profile));
	const t = $derived(live.state.telemetry);

	const connectivity = $derived.by(() => {
		const rows: [string, string][] = [];
		if (!t) return rows;
		if (t.connectivityStrength !== undefined) rows.push(['Connectivity', `CSQ ${t.connectivityStrength}`]);
		if (t.chargerType) rows.push(['Charger type', t.chargerType]);
		// Ather briefly reports chargerConnected=false while charging; trust the physical status.
		if (isPluggedIn(t)) rows.push(['Charger', 'Connected']);
		if (t.chargingStatus && !/disconnect/i.test(t.chargingStatus)) rows.push(['Charge status', t.chargingStatus]);
		if (t.softwareVersion) rows.push(['Firmware', t.softwareVersion]);
		if (t.vehicleState) rows.push(['Vehicle state', t.vehicleState]);
		return rows;
	});
	const antiTheft = $derived(t?.featureFlags.anti_theft ?? t?.featureFlags.theft_protection);
	const vacation = $derived(t?.featureFlags.vacation_mode ?? (/vacation/i.test(t?.vehicleState ?? '') ? true : undefined));
</script>

<svelte:head><title>Athr+</title></svelte:head>

<Freshness />
<EnergySummary {model} />
<div class="row">
	<a class="button tonal" href="/charging">Manage charging</a>
	<a class="button outline" href="/map">Find scooter</a>
</div>
<ModeRanges {model} />
<BatteryHistory />

<section class="card row between">
	<div><p class="eyebrow">Odometer</p><span class="value">{num(t?.odoKm, 1)} km</span></div>
	<div style="text-align:right"><p class="eyebrow">Fuel savings</p><span class="value">₹{num(t?.savingsInr)}</span></div>
</section>

<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
	<section class="card stack">
		<h2>Battery health</h2>
		{#if t?.reportedSohPercent !== undefined}
			<span class="value">{num(t.reportedSohPercent, 1)}%</span>
			<p class="small muted" style="margin:0">State of health reported by the battery management system.</p>
		{:else}
			<p class="small muted" style="margin:0">
				Your scooter has not reported battery state of health. The vehicle-health scorecard on the Health tab is a
				separate score, not battery SoH.
			</p>
		{/if}
	</section>

	{#if connectivity.length}
		<section class="card stack">
			<h2>Connectivity & charger</h2>
			<dl class="kv">
				{#each connectivity as [k, v]}<dt>{k}</dt><dd>{v}</dd>{/each}
			</dl>
			<p class="small muted" style="margin:0">Shown only when the vehicle reports the field.</p>
		</section>
	{/if}

	{#if t?.tpms && (t.tpms.frontPressurePsi !== undefined || t.tpms.rearPressurePsi !== undefined)}
		<section class="card stack">
			<h2>Tyres</h2>
			<dl class="kv">
				<dt>Front</dt><dd>{num(t.tpms.frontPressurePsi, 1)} psi{t.tpms.frontTemperatureC !== undefined ? ` · ${num(t.tpms.frontTemperatureC)} °C` : ''}</dd>
				<dt>Rear</dt><dd>{num(t.tpms.rearPressurePsi, 1)} psi{t.tpms.rearTemperatureC !== undefined ? ` · ${num(t.tpms.rearTemperatureC)} °C` : ''}</dd>
			</dl>
		</section>
	{/if}

	{#if antiTheft !== undefined || vacation !== undefined || Object.keys(t?.featureFlags ?? {}).length}
		<section class="card stack">
			<h2>Security & features</h2>
			<dl class="kv">
				{#if antiTheft !== undefined}<dt>Anti-theft</dt><dd>{antiTheft ? 'Armed' : 'Off'}</dd>{/if}
				{#if vacation !== undefined}<dt>Vacation mode</dt><dd>{vacation ? 'On' : 'Off'}</dd>{/if}
				{#each Object.entries(t?.featureFlags ?? {}).filter(([k]) => !['anti_theft', 'theft_protection', 'vacation_mode'].includes(k)) as [k, v]}
					<dt>{k.replace(/_/g, ' ')}</dt><dd>{v ? 'On' : 'Off'}</dd>
				{/each}
			</dl>
		</section>
	{/if}
</div>
