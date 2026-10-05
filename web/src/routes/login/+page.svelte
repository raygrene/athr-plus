<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	let busy = $state(false);
	const step = $derived(form?.sent || data.pendingPhone ? 'otp' : 'phone');
	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

<svelte:head><title>Sign in · Athr+</title></svelte:head>

<section class="login card">
	<p class="eyebrow">ATHR+</p>
	<h1>Sign in with your Ather account</h1>
	{#if data.expired}<p class="notice">Your session expired. Please sign in again.</p>{/if}
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

	{#if step === 'phone'}
		<form method="POST" action="?/request" use:enhance={submit}>
			<label for="phone">Registered mobile number</label>
			<div class="phone">
				<span>+91</span>
				<input id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="10" required />
			</div>
			<button class="primary" disabled={busy}>{busy ? 'Sending…' : 'Send OTP'}</button>
		</form>
	{:else}
		<form method="POST" action="?/verify" use:enhance={submit}>
			<label for="otp">OTP sent to {data.pendingPhone ?? 'your phone'}</label>
			<input id="otp" name="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required />
			<button class="primary" disabled={busy}>{busy ? 'Verifying…' : 'Verify'}</button>
		</form>
		<form method="POST" action="?/restart" use:enhance>
			<button class="link">Use a different number</button>
		</form>
	{/if}
	<p class="muted small">
		Athr+ is an independent project, not affiliated with Ather Energy. Your token is kept in an encrypted,
		HTTP-only cookie on this browser.
	</p>
</section>

<style>
	.login { max-width: 420px; margin: 8vh auto 0; display: grid; gap: 14px; }
	h1 { font-size: 1.4rem; margin: 0; }
	form { display: grid; gap: 10px; }
	.phone { display: flex; align-items: center; gap: 8px; }
	.phone span { color: var(--muted); }
	.phone input { flex: 1; }
</style>
