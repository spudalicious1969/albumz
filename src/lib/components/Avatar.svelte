<script lang="ts">
	type AvatarProfile = {
		username: string;
		display_name?: string | null;
		avatar_url?: string | null;
		email_hash?: string | null;
	};

	let {
		profile,
		size = 80,
		title = ''
	}: { profile: AvatarProfile; size?: number; title?: string } = $props();

	let gravatarFailed = $state(false);

	const initial = $derived(
		((profile.display_name ?? profile.username ?? '?').trim()[0] ?? '?').toUpperCase()
	);

	const hue = $derived.by(() => {
		const s = profile.username ?? '';
		let h = 0;
		for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * 37) % 360;
		return h;
	});

	const gravatarSrc = $derived.by(() => {
		if (!profile.email_hash) return null;
		const px = Math.min(Math.round(size * 2), 512);
		return `https://www.gravatar.com/avatar/${profile.email_hash}?s=${px}&d=404`;
	});

	$effect(() => {
		// Touch email_hash so this effect re-runs (resetting the failure flag)
		// whenever it changes — the bare read is the dependency registration.
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		profile.email_hash;
		gravatarFailed = false;
	});
</script>

<span class="avatar" style:--avatar-size="{size}px" style:--avatar-hue={hue} {title}>
	{#if profile.avatar_url}
		<img src={profile.avatar_url} alt="" loading="lazy" />
	{:else if gravatarSrc && !gravatarFailed}
		<img
			src={gravatarSrc}
			alt=""
			loading="lazy"
			onerror={() => {
				gravatarFailed = true;
			}}
		/>
	{:else}
		<span class="initial">{initial}</span>
	{/if}
</span>

<style>
	.avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--avatar-size);
		height: var(--avatar-size);
		border-radius: 50%;
		overflow: hidden;
		background: oklch(60% 0.13 var(--avatar-hue));
		color: oklch(98% 0.02 var(--avatar-hue));
		font-weight: 800;
		font-size: calc(var(--avatar-size) * 0.42);
		flex-shrink: 0;
		user-select: none;
		line-height: 1;
	}
	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.initial {
		line-height: 1;
	}
</style>
