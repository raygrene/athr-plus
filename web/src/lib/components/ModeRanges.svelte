<script lang="ts">
	import { live } from '$lib/live.svelte';
	import { modeRanges, type ScooterModel } from '$lib/vehicle';
	import { num } from '$lib/format';

	let { model }: { model?: ScooterModel } = $props();
	const ranges = $derived(modeRanges(live.state.telemetry, model));
</script>

<section class="card stack">
	<h2>Range by ride mode</h2>
	{#if ranges.length === 0}
		<p class="small muted">Mode ranges appear when reported by your scooter.</p>
	{:else}
		<div class="grid">
			{#each ranges as m (m.name)}
				<div class="tile" class:active={m.active}>
					<div class="small muted">{m.name}{m.active ? ' · current' : ''}</div>
					<div class="value">{num(m.km)} km</div>
				</div>
			{/each}
		</div>
		<p class="small muted" style="margin:0">Estimated remaining kilometres. Changes with riding conditions.</p>
	{/if}
</section>
