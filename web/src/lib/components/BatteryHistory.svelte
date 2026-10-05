<script lang="ts">
	import { clearHistory, loadHistory, type BatterySample } from '$lib/history';
	import { time } from '$lib/format';

	let samples = $state<BatterySample[]>([]);
	let hours = $state(24);
	$effect(() => {
		const reload = () => (samples = loadHistory());
		reload();
		window.addEventListener('athr-history', reload);
		return () => window.removeEventListener('athr-history', reload);
	});

	const W = 600;
	const H = 160;
	const end = $derived.by(() => {
		void samples;
		void hours;
		return Date.now();
	});
	const start = $derived(end - hours * 3600_000);
	const shown = $derived(samples.filter((s) => s.t >= start));
	const x = (t: number) => ((t - start) / (end - start)) * W;
	const y = (soc: number) => H - (soc / 100) * H;
	// Break the line where readings are more than 30 minutes apart, never interpolating gaps.
	const segments = $derived.by(() => {
		const out: BatterySample[][] = [];
		for (const s of shown) {
			const cur = out[out.length - 1];
			if (cur && s.t - cur[cur.length - 1].t <= 30 * 60_000) cur.push(s);
			else out.push([s]);
		}
		return out;
	});
</script>

<section class="card stack">
	<div class="row between">
		<h2>Battery history</h2>
		<div class="row" role="group" aria-label="Time window">
			{#each [6, 24, 72] as h}
				<button class={hours === h ? 'tonal' : 'outline'} onclick={() => (hours = h)} style="padding:4px 12px">{h}h</button>
			{/each}
		</div>
	</div>
	{#if shown.length < 2}
		<p class="small muted">History builds up while this site is open. Readings are stored only in this browser.</p>
	{:else}
		<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" style="width:100%;height:160px" role="img" aria-label="Battery level over the last {hours} hours">
			{#each [25, 50, 75] as g}<line x1="0" x2={W} y1={y(g)} y2={y(g)} stroke="var(--border)" stroke-dasharray="4 4" />{/each}
			{#each segments as seg}
				{#if seg.length === 1}
					<circle cx={x(seg[0].t)} cy={y(seg[0].soc)} r="3" fill="var(--accent)" />
				{:else}
					<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke" points={seg.map((s) => `${x(s.t)},${y(s.soc)}`).join(' ')} />
				{/if}
			{/each}
		</svg>
		<div class="row between small muted"><span>{time(start)}</span><span>{shown.length} readings · gaps are left blank</span><span>now</span></div>
	{/if}
	<button class="link small" style="justify-self:start" onclick={clearHistory}>Clear browser history</button>
</section>
