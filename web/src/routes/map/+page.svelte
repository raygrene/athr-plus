<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import Freshness from '$lib/components/Freshness.svelte';
	import { live } from '$lib/live.svelte';
	import { num, dateTime } from '$lib/format';
	import type { Map as LeafletMap, CircleMarker, Circle } from 'leaflet';

	const gps = $derived(live.state.telemetry?.gps);
	const lat = $derived(gps?.latitude);
	const lng = $derived(gps?.longitude);
	const hasFix = $derived(lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0));

	let el: HTMLDivElement;
	let map: LeafletMap | null = null;
	let marker: CircleMarker | null = null;
	let accuracy: Circle | null = null;
	let L: typeof import('leaflet') | null = $state(null);
	let follow = $state(true);

	$effect(() => {
		let disposed = false;
		import('leaflet').then((mod) => {
			if (disposed) return;
			L = mod.default ?? mod;
			map = L.map(el, { zoomControl: true }).setView([20.6, 78.9], 4);
			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 19,
				attribution: '&copy; OpenStreetMap contributors'
			}).addTo(map);
			map.on('dragstart', () => (follow = false));
		});
		return () => {
			disposed = true;
			map?.remove();
			map = null;
			marker = null;
			accuracy = null;
		};
	});

	$effect(() => {
		if (!L || !map || !hasFix) return;
		const pos: [number, number] = [lat!, lng!];
		if (!marker) {
			marker = L.circleMarker(pos, { radius: 9, color: '#fff', weight: 3, fillColor: '#0b7a5c', fillOpacity: 1 }).addTo(map);
			map.setView(pos, 16);
		} else marker.setLatLng(pos);
		if (gps?.accuracyMeters) {
			if (!accuracy) accuracy = L.circle(pos, { radius: gps.accuracyMeters, color: '#0b7a5c', weight: 1, fillOpacity: 0.12 }).addTo(map);
			else accuracy.setLatLng(pos).setRadius(gps.accuracyMeters);
		}
		if (follow) map.panTo(pos);
	});
</script>

<svelte:head><title>Map · Athr+</title></svelte:head>

<Freshness />
<section class="card stack">
	<div class="row between">
		<h2>Scooter location</h2>
		{#if hasFix}
			<div class="row">
				<button class="outline" onclick={() => { follow = true; map?.setView([lat!, lng!], 16); }}>Centre</button>
				<a class="button tonal" target="_blank" rel="noopener noreferrer"
					href="https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=walking">Directions</a>
			</div>
		{/if}
	</div>
	<div bind:this={el} class="map" role="region" aria-label="Map showing the scooter's last reported location"></div>
	{#if hasFix}
		<dl class="kv">
			<dt>Coordinates</dt><dd>{lat!.toFixed(5)}, {lng!.toFixed(5)}</dd>
			{#if gps?.accuracyMeters !== undefined}<dt>Accuracy</dt><dd>± {num(gps.accuracyMeters)} m</dd>{/if}
			{#if gps?.speed !== undefined}<dt>GPS speed</dt><dd>{num(gps.speed, 1)} km/h</dd>{/if}
			{#if gps?.heading !== undefined}<dt>Heading</dt><dd>{num(gps.heading)}°</dd>{/if}
			{#if gps?.altitudeMeters !== undefined}<dt>Altitude</dt><dd>{num(gps.altitudeMeters)} m</dd>{/if}
			<dt>Location received</dt><dd>{dateTime(live.state.gpsReceivedAt)}</dd>
		</dl>
	{:else}
		<p class="small muted" style="margin:0">Waiting for the scooter to report a GPS location.</p>
	{/if}
</section>

<style>
	.map { height: min(60vh, 520px); border-radius: 14px; overflow: hidden; z-index: 0; }
</style>
