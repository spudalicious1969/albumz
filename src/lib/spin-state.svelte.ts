// Global spin-session state. Lives outside any page so it survives navigation —
// flipping `active` from anywhere in the app starts/stops the mic loop mounted
// in the root layout via SpinSessionRunner.

export type SpinSource = 'spun' | 'streamed';

export type SpinEvent = {
	id: string;
	artist: string;
	track: string;
	album: string | null;
	identifiedAt: string; // ISO
	confidence: number | null;
	source: SpinSource;
};

export type RunnerStatus = 'idle' | 'recording' | 'identifying';

class SpinState {
	active = $state(false);
	startedAt = $state<Date | null>(null);
	runnerStatus = $state<RunnerStatus>('idle');
	spins = $state<SpinEvent[]>([]);
	error = $state<string | null>(null);

	start() {
		if (this.active) return;
		this.active = true;
		this.startedAt = new Date();
		this.spins = [];
		this.error = null;
	}

	stop() {
		this.active = false;
		this.runnerStatus = 'idle';
	}

	toggle() {
		if (this.active) this.stop();
		else this.start();
	}

	recordSpin(event: SpinEvent) {
		// Dedupe consecutive identifications of the same track — Shazam often
		// re-matches the same song across overlapping chunks.
		const last = this.spins[0];
		if (last && last.artist === event.artist && last.track === event.track) return;
		this.spins = [event, ...this.spins];
	}

	setError(message: string) {
		this.error = message;
		this.active = false;
		this.runnerStatus = 'idle';
	}
}

export const spin = new SpinState();
