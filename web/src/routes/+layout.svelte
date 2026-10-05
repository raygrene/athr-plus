<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { live } from '$lib/live.svelte';
	import { profileDisplayName } from '$lib/vehicle';

	let { data, children } = $props();

	const tabs = [
		{ href: '/', label: 'Home' },
		{ href: '/charging', label: 'Charging' },
		{ href: '/map', label: 'Map' },
		{ href: '/rides', label: 'Rides' },
		{ href: '/health', label: 'Health' },
		{ href: '/chargers', label: 'Chargers' },
		{ href: '/settings', label: 'Settings' }
	];

	$effect(() => {
		if (data.signedIn) return live.start();
	});
</script>

{#if data.signedIn}
	<header class="top">
		<div>
			<p class="eyebrow">ATHR+</p>
			<h1 class="title">{profileDisplayName(data.profile)}</h1>
		</div>
		<button class="icon" onclick={() => live.refresh()} aria-label="Refresh scooter data" title="Refresh">⟳</button>
	</header>
	<nav aria-label="Sections">
		{#each tabs as t}
			<a href={t.href} aria-current={page.url.pathname === t.href ? 'page' : undefined}>{t.label}</a>
		{/each}
	</nav>
{/if}

<main>{@render children()}</main>
