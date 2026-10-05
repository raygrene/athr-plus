<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>Choose scooter · Athr+</title></svelte:head>

<section class="card stack">
	<h1>Choose your scooter</h1>
	{#if form?.error}<p class="error">{form.error}</p>{/if}
	{#if data.scooters === null}
		<p class="error">Could not load scooters from Ather. Refresh to try again.</p>
	{:else if data.scooters.length === 0}
		<p>No scooters were found on this account.</p>
	{:else}
		{#each data.scooters as s (s.uuid)}
			<form method="POST" class="row between">
				<input type="hidden" name="uuid" value={s.uuid} />
				<div>
					<strong>{s.displayName}</strong>
					<div class="muted small">{[s.registration, s.modelType, s.colour].filter(Boolean).join(' · ')}</div>
				</div>
				<button class={data.current === s.uuid ? 'tonal' : 'primary'}>{data.current === s.uuid ? 'Selected' : 'Select'}</button>
			</form>
		{/each}
	{/if}
	<form method="POST" action="/logout"><button class="link">Sign out</button></form>
</section>
