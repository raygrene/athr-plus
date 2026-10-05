<script lang="ts">
	import { prefs } from '$lib/prefs.svelte';
	import { SCOOTER_MODELS, resolveModel, profileDisplayName, type ScooterModel } from '$lib/vehicle';

	let { data } = $props();
	const detected = $derived(resolveModel(data.profile));
	const p = $derived(data.profile);
</script>

<svelte:head><title>Settings · Athr+</title></svelte:head>

<section class="card stack">
	<h2>Scooter</h2>
	<dl class="kv">
		<dt>Model</dt><dd>{profileDisplayName(p)}</dd>
		{#if p?.scooterId}<dt>Scooter ID</dt><dd>{p.scooterId}</dd>{/if}
		{#if p?.colour}<dt>Colour</dt><dd>{p.colour}</dd>{/if}
		{#if p?.platform}<dt>Platform</dt><dd>{p.platform}</dd>{/if}
		{#if p?.bikeType}<dt>Bike type</dt><dd>{p.bikeType}</dd>{/if}
	</dl>
	<a class="button outline" style="justify-self:start" href="/select">Switch scooter</a>
</section>

<section class="card stack">
	<h2>Estimates</h2>
	<label class="stack" style="gap:6px">
		<span>Battery size</span>
		<select
			value={prefs.value.modelOverride ?? ''}
			onchange={(e) => prefs.set({ modelOverride: (e.currentTarget.value || null) as ScooterModel | null })}
		>
			<option value="">Detect automatically{detected ? ` (${SCOOTER_MODELS[detected].displayName})` : ' (not detected; 3.7 kWh assumed)'}</option>
			{#each Object.entries(SCOOTER_MODELS) as [key, m]}<option value={key}>{m.displayName}</option>{/each}
		</select>
	</label>
	<label class="stack" style="gap:6px">
		<span>Electricity tariff (₹ per kWh)</span>
		<input
			type="number" min="0" max="100" step="0.1" value={prefs.value.tariffRatePerKWh}
			onchange={(e) => {
				const v = Number(e.currentTarget.value);
				if (Number.isFinite(v) && v >= 0 && v <= 100) prefs.set({ tariffRatePerKWh: v });
			}}
		/>
	</label>
	<p class="small muted" style="margin:0">These preferences are stored in this browser only.</p>
</section>

<section class="card stack">
	<h2>Account</h2>
	<p class="small muted" style="margin:0">Signing out forgets the token in this browser. It does not revoke it on Ather's server.</p>
	<form method="POST" action="/logout"><button class="outline">Sign out</button></form>
</section>
