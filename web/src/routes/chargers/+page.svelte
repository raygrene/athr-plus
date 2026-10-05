<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import { goto } from '$app/navigation';
	import { live } from '$lib/live.svelte';
	import { num } from '$lib/format';
	import type { Map as LeafletMap, LayerGroup } from 'leaflet';

	let { data } = $props();
	let radius = $state(5);
	$effect(() => {
		if (data.center) radius = data.center.radius;
	});
	let locating = $state(false);
	let geoError = $state<string | null>(null);

	const gps = $derived(live.state.telemetry?.gps);
	const scooterFix = $derived(gps?.latitude !== undefined && gps?.longitude !== undefined && !(gps.latitude === 0 && gps.longitude === 0));

	function search(lat: number, lng: number) {
		goto(`?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}&radius=${radius}`, { keepFocus: true, noScroll: true });
	}
	function nearScooter() {
		if (scooterFix) search(gps!.latitude!, gps!.longitude!);
	}
	function nearMe() {
		geoError = null;
		if (!navigator.geolocation) {
			geoError = 'This browser cannot share its location.';
			return;
		}
		locating = true;
		navigator.geolocation.getCurrentPosition(
			(p) => {
				locating = false;
				search(p.coords.latitude, p.coords.longitude);
			},
			(e) => {
				locating = false;
				geoError = e.message || 'Location unavailable';
			},
			{ timeout: 15_000 }
		);
	}

	const locations = $derived(data.locations.value ?? []);

	let el: HTMLDivElement | undefined = $state();
	let map: LeafletMap | null = null;
	let layer: LayerGroup | null = null;
	let L: typeof import('leaflet') | null = $state(null);

	$effect(() => {
		if (!el) return;
		let disposed = false;
		import('leaflet').then((mod) => {
			if (disposed || !el) return;
			L = mod.default ?? mod;
			map = L.map(el).setView([20.6, 78.9], 4);
			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
			layer = L.layerGroup().addTo(map);
		});
		return () => {
			disposed = true;
			map?.remove();
			map = null;
			layer = null;
			L = null;
		};
	});

	$effect(() => {
		if (!L || !map || !layer || !data.center) return;
		layer.clearLayers();
		const c: [number, number] = [data.center.lat, data.center.lng];
		L.circle(c, { radius: data.center.radius * 1000, color: '#0b7a5c', weight: 1, fillOpacity: 0.05 }).addTo(layer);
		for (const loc of locations) {
			const available = (loc.dbsAvailable ?? 0) > 0;
			const m = L.circleMarker([loc.latitude, loc.longitude], {
				radius: 8, color: '#fff', weight: 2, fillOpacity: 1,
				fillColor: loc.isOpenNow === false ? '#888' : available ? '#0b7a5c' : '#c77700'
			});
			// Leaflet renders string tooltips as HTML; pass a text node so API text cannot inject markup.
			const label = document.createElement('span');
			label.textContent = loc.name ?? 'Charger';
			m.bindTooltip(label);
			m.addTo(layer);
		}
		map.invalidateSize();
		map.setView(c, data.center.radius <= 5 ? 13 : data.center.radius <= 15 ? 11 : 9);
	});
</script>

<svelte:head><title>Chargers · Athr+</title></svelte:head>

<section class="card stack">
	<h2>Ather wallet</h2>
	{#if data.wallet.error}
		<p class="error small">Wallet unavailable: {data.wallet.error}</p>
	{:else if data.wallet.value}
		{@const w = data.wallet.value}
		<div class="grid">
			<div class="tile"><div class="small muted">Balance</div><div class="value">₹{num(w.balance, 2)}</div></div>
			{#if w.credits !== undefined}<div class="tile"><div class="small muted">Credits</div><div class="value">{num(w.credits, 2)}</div></div>{/if}
			{#if w.walletStatus}<div class="tile"><div class="small muted">Status</div><div class="value">{w.walletStatus}</div></div>{/if}
		</div>
		{#if w.transactions.length}
			<table>
				<thead><tr><th>Transaction</th><th>When</th><th class="num">Amount</th></tr></thead>
				<tbody>
					{#each w.transactions as tx (tx.id ?? tx.timestamp)}
						<tr>
							<td>{tx.title ?? tx.type ?? '--'}</td>
							<td class="small muted">{tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '--'}</td>
							<td class="num">{tx.amount !== undefined ? `${tx.amount < 0 ? '−' : '+'}${tx.currency === 'INR' || !tx.currency ? '₹' : tx.currency + ' '}${num(Math.abs(tx.amount), 2)}` : '--'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	{/if}
</section>

<section class="card stack">
	<div class="row between">
		<h2>Public chargers</h2>
		<label class="row small">Radius
			<select bind:value={radius} onchange={() => data.center && search(data.center.lat, data.center.lng)}>
				{#each [2, 5, 10, 25, 50] as r}<option value={r}>{r} km</option>{/each}
			</select>
		</label>
	</div>
	<div class="row">
		<button class="tonal" disabled={!scooterFix} onclick={nearScooter}>Near my scooter</button>
		<button class="outline" disabled={locating} onclick={nearMe}>{locating ? 'Locating…' : 'Near me'}</button>
	</div>
	{#if geoError}<p class="error small">{geoError}</p>{/if}
	{#if data.locations.error}<p class="error small">Chargers unavailable: {data.locations.error}</p>{/if}
	<div bind:this={el} class="map" class:hidden={!data.center}></div>
	{#if !data.center}
		<p class="small muted" style="margin:0">Choose a starting point to search Ather Grid and public chargers.</p>
	{:else if locations.length === 0 && !data.locations.error}
		<p class="small muted" style="margin:0">No chargers found within {data.center.radius} km.</p>
	{/if}
	{#each locations as loc}
		<article class="tile stack" style="gap:6px">
			<div class="row between">
				<strong>{loc.name ?? 'Charger'}</strong>
				<span class="small {loc.isOpenNow ? 'live' : 'muted'}">
					{loc.isOpenNow === true ? `Open${loc.closingIn ? ` · closes in ${loc.closingIn}` : ''}` : loc.isOpenNow === false ? `Closed${loc.nextOpening ? ` · opens ${loc.nextOpening}` : ''}` : ''}
				</span>
			</div>
			{#if loc.address}<div class="small muted">{loc.address}</div>{/if}
			<div class="small">
				{[loc.infraType, loc.dbsTotal !== undefined && `${loc.dbsAvailable ?? 0}/${loc.dbsTotal} available`, loc.dbsInUse && `${loc.dbsInUse} in use`, loc.dbsUnderMaintenance && `${loc.dbsUnderMaintenance} under maintenance`, loc.has6kwGrid && '6 kW Grid'].filter(Boolean).join(' · ')}
			</div>
			{#if loc.connectors.length}<div class="small muted">{loc.connectors.map((c) => c.displayText ?? c.standard).filter(Boolean).join(', ')}</div>{/if}
			{#if loc.tariffLines.length}<div class="small">{loc.tariffLines.map((t) => [t.displayText, t.text].filter(Boolean).join(': ')).join(' · ')}</div>{/if}
			<a class="small" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&destination={loc.latitude},{loc.longitude}">Directions</a>
		</article>
	{/each}
</section>

<style>
	.map { height: 360px; border-radius: 14px; overflow: hidden; z-index: 0; }
	.hidden { display: none; }
</style>
