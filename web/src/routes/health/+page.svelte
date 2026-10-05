<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { num, safeColor } from '$lib/format';
	import type { HealthTag } from '$lib/types';

	let { data } = $props();
	let loading = $state(false);
	const report = $derived(data.scorecard.kind === 'available' ? data.scorecard.report : null);
	const pct = (score?: number, max?: number) => (score !== undefined && max ? Math.max(0, Math.min(100, (score / max) * 100)) : undefined);
	async function reload() {
		loading = true;
		await invalidateAll();
		loading = false;
	}
</script>

{#snippet tagPill(tag: HealthTag | undefined)}
	{#if tag?.text}
		<span class="tag" style:color={safeColor(tag.textColor)} style:background={safeColor(tag.backgroundColor)}>{tag.text}</span>
	{/if}
{/snippet}

<svelte:head><title>Vehicle health · Athr+</title></svelte:head>

{#if !report}
	<section class="card stack">
		<h2>Vehicle health scorecard</h2>
		<p class={data.scorecard.kind === 'error' ? 'error' : 'notice'}>{data.scorecard.kind === 'available' ? '' : data.scorecard.reason}</p>
		<button class="tonal" style="justify-self:start" disabled={loading} onclick={reload}>{loading ? 'Loading…' : 'Retry scorecard'}</button>
	</section>
{:else}
	<section class="card stack">
		<div class="row between">
			<div>
				<p class="eyebrow">True Health scorecard</p>
				<h2>{report.vehicle?.name ?? 'Your scooter'}</h2>
				<p class="small muted" style="margin:0">
					{[report.vehicle?.registrationMasked, report.vehicle?.ageYears && `${report.vehicle.ageYears} years`, report.vehicle?.odoFormatted ?? (report.vehicle?.odoKms !== undefined ? `${num(report.vehicle.odoKms)} km` : undefined)].filter(Boolean).join(' · ')}
				</p>
			</div>
			{#if report.overall}
				<div style="text-align:right">
					<span class="big" style:color={safeColor(report.overall.colorCode)}>{num(report.overall.score)}</span>
					<span class="muted">/ {report.overall.maxScore ?? 100}</span>
					{#if report.overall.label}<div class="small">{report.overall.label}</div>{/if}
				</div>
			{/if}
		</div>
		<p class="small muted" style="margin:0">Ather's scorecard. It is not battery state of health.</p>
	</section>

	{#if report.components.length}
		<section class="card stack">
			<h2>Components</h2>
			{#each report.components as c}
				<div class="stack" style="gap:6px">
					<div class="row between"><span>{c.name ?? c.id}</span><span class="row">{@render tagPill(c.tag)}<strong>{num(c.score)}{c.maxScore ? ` / ${c.maxScore}` : ''}</strong></span></div>
					{#if pct(c.score, c.maxScore) !== undefined}<div class="bar"><span style="width:{pct(c.score, c.maxScore)}%"></span></div>{/if}
				</div>
			{/each}
		</section>
	{/if}

	{#if report.wearAndTear.length}
		<section class="card stack">
			<h2>Wear and tear</h2>
			{#each report.wearAndTear as w}
				<div class="stack" style="gap:6px">
					<div class="row between"><span>{w.name ?? w.id}</span><span class="row">{@render tagPill(w.tag)}{#if w.lifePercent !== undefined}<strong>{w.lifePercent}% life</strong>{/if}</span></div>
					{#if w.lifePercent !== undefined}<div class="bar"><span style="width:{Math.max(0, Math.min(100, w.lifePercent))}%"></span></div>{/if}
					<div class="small muted">
						{[w.currentKms !== undefined && `${num(w.currentKms)} km used`, w.remainingKms !== undefined && `about ${num(w.remainingKms)} km left`, w.description?.text].filter(Boolean).join(' · ')}
					</div>
				</div>
			{/each}
		</section>
	{/if}

	{#if report.resale}
		<section class="card stack">
			<h2>Resale estimate</h2>
			<span class="value">{report.resale.displayText ?? (report.resale.minValue !== undefined && report.resale.maxValue !== undefined ? `₹${num(report.resale.minValue)} – ₹${num(report.resale.maxValue)}` : '--')}</span>
			{#if report.resale.disclaimer}<p class="small muted" style="margin:0">{report.resale.disclaimer}</p>{/if}
		</section>
	{/if}

	<div class="row between small muted">
		<span>{[report.meta?.lastUpdated && `Updated ${report.meta.lastUpdated}`, report.meta?.refreshNote].filter(Boolean).join(' · ')}</span>
		<button class="link" disabled={loading} onclick={reload}>{loading ? 'Loading…' : 'Refresh scorecard'}</button>
	</div>
{/if}

<style>
	.tag { font-size: 0.75rem; padding: 2px 8px; border-radius: 999px; background: var(--surface-2); }
</style>
