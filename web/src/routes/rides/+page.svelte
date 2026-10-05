<script lang="ts">
	import { prefs } from '$lib/prefs.svelte';
	import { num, dateTime, duration } from '$lib/format';

	let { data } = $props();
	const rides = $derived([...(data.rides ?? [])].sort((a, b) => b.startTimeMs - a.startTimeMs));
	const tariff = $derived(prefs.value.tariffRatePerKWh);

	const summary = $derived.by(() => {
		const distance = rides.reduce((s, r) => s + r.distanceKm, 0);
		const withEnergy = rides.filter((r) => r.energyWh !== undefined);
		const energyWh = withEnergy.reduce((s, r) => s + (r.energyWh ?? 0), 0);
		const energyKm = withEnergy.reduce((s, r) => s + r.distanceKm, 0);
		return {
			count: rides.length,
			distance,
			avgWhKm: energyKm > 0 ? energyWh / energyKm : undefined,
			kmPerKWh: energyWh > 0 ? energyKm / (energyWh / 1000) : undefined,
			cost: (energyWh / 1000) * tariff
		};
	});
</script>

<svelte:head><title>Rides · Athr+</title></svelte:head>

{#if data.error}
	<p class="error">{data.error}</p>
{:else}
	<section class="card stack">
		<h2>Last {summary.count} rides</h2>
		<div class="grid">
			<div class="tile"><div class="small muted">Distance</div><div class="value">{num(summary.distance, 1)} km</div></div>
			<div class="tile"><div class="small muted">Avg consumption</div><div class="value">{num(summary.avgWhKm, 1)} Wh/km</div></div>
			<div class="tile"><div class="small muted">Efficiency</div><div class="value">{num(summary.kmPerKWh, 1)} km/kWh</div></div>
			<div class="tile"><div class="small muted">Electricity cost</div><div class="value">≈ ₹{num(summary.cost, 0)}</div></div>
		</div>
		<p class="small muted" style="margin:0">From Ather's rides API. Energy is derived from reported Wh/km × distance; cost uses ₹{tariff}/kWh and excludes charging losses.</p>
	</section>

	<section class="card" style="overflow-x:auto">
		{#if rides.length === 0}
			<p class="muted">No rides reported.</p>
		{:else}
			<table>
				<thead>
					<tr><th>Started</th><th class="num">Duration</th><th class="num">Distance</th><th class="num">Wh/km</th><th class="num">Energy</th><th class="num">Cost</th></tr>
				</thead>
				<tbody>
					{#each rides as r (r.id)}
						<tr>
							<td>{dateTime(r.startTimeMs)}</td>
							<td class="num">{r.endTimeMs > r.startTimeMs ? duration((r.endTimeMs - r.startTimeMs) / 60_000) : '--'}</td>
							<td class="num">{num(r.distanceKm, 2)} km</td>
							<td class="num">{num(r.efficiencyWhPerKm, 1)}</td>
							<td class="num">{r.energyWh !== undefined ? `≈ ${num(r.energyWh)} Wh` : '--'}</td>
							<td class="num">{r.energyWh !== undefined ? `≈ ₹${num((r.energyWh / 1000) * tariff, 2)}` : '--'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
{/if}
