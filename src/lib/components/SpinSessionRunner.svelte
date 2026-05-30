<script lang="ts">
	// Invisible runner: lives in the root layout so it survives navigation.
	// While spin.active is true, captures 10-second mic chunks via MediaRecorder
	// and posts each one to /api/spins/identify. Identified matches push into
	// the shared spin store.
	//
	// Strategy: each chunk is its own complete recording (start → 10s → stop →
	// send → start again) so the resulting WebM blob is independently decodable
	// upstream by the sidecar. Slight gap between chunks is acceptable.

	import { onDestroy } from 'svelte';
	import { spin } from '$lib/spin-state.svelte';

	const CHUNK_MS = 10000;

	let stream: MediaStream | null = null;
	let recorder: MediaRecorder | null = null;
	let chunkTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (spin.active) startSession();
		else stopSession();
	});

	async function startSession() {
		if (stream) return; // already running
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Microphone access denied';
			spin.setError(message);
			stream = null;
			return;
		}
		recordOneChunk();
	}

	function recordOneChunk() {
		if (!stream || !spin.active) return;

		const chunks: Blob[] = [];
		let stopped = false;

		try {
			recorder = new MediaRecorder(stream);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Recorder failed to start';
			spin.setError(message);
			return;
		}

		recorder.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) chunks.push(e.data);
		};

		recorder.onstop = async () => {
			if (stopped) return;
			stopped = true;
			const blob = new Blob(chunks, { type: recorder?.mimeType ?? 'audio/webm' });
			spin.runnerStatus = 'identifying';
			await sendChunk(blob);
			if (spin.active) {
				spin.runnerStatus = 'recording';
				recordOneChunk();
			}
		};

		spin.runnerStatus = 'recording';
		recorder.start();

		chunkTimer = setTimeout(() => {
			if (recorder && recorder.state === 'recording') recorder.stop();
		}, CHUNK_MS);
	}

	async function sendChunk(blob: Blob) {
		try {
			const res = await fetch('/api/spins/identify', {
				method: 'POST',
				body: blob,
				headers: { 'content-type': blob.type || 'audio/webm' }
			});
			if (!res.ok) return; // Sidecar not ready or transient error — keep listening.
			const data = await res.json();
			if (data?.matched && data.spin) {
				spin.recordSpin({
					id: data.spin.id,
					artist: data.spin.artist,
					track: data.spin.track,
					album: data.spin.album ?? null,
					identifiedAt: data.spin.identified_at,
					confidence: data.spin.confidence ?? null,
					source: data.spin.source === 'streamed' ? 'streamed' : 'spun'
				});
			}
		} catch {
			// Network blip — swallow, the next chunk will try again.
		}
	}

	function stopSession() {
		if (chunkTimer) {
			clearTimeout(chunkTimer);
			chunkTimer = null;
		}
		if (recorder && recorder.state === 'recording') {
			try { recorder.stop(); } catch { /* ignore */ }
		}
		recorder = null;
		if (stream) {
			stream.getTracks().forEach((t) => t.stop());
			stream = null;
		}
		spin.runnerStatus = 'idle';
	}

	onDestroy(() => {
		// Guard SSR — onDestroy fires during SSR teardown too on Svelte 5.
		if (typeof window === 'undefined') return;
		stopSession();
	});
</script>
