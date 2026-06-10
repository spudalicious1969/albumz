// Global spin-session state. Lives outside any page so it survives navigation,
// and mirrors to sessionStorage so a "set" is bounded by the tab lifetime, not
// by visits to the Headliner. Closing the tab ends the set; everything else
// (route changes, reloads) keeps it intact.

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

const STORAGE_KEY = 'albumz:spin-session-v1';

type Snapshot = {
	startedAt: string | null;
	spins: SpinEvent[];
};

class SpinState {
	active = $state(false);
	startedAt = $state<Date | null>(null);
	runnerStatus = $state<RunnerStatus>('idle');
	spins = $state<SpinEvent[]>([]);
	error = $state<string | null>(null);

	constructor() {
		if (typeof window === 'undefined') return;
		try {
			const raw = sessionStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const snap = JSON.parse(raw) as Snapshot;
			this.startedAt = snap.startedAt ? new Date(snap.startedAt) : null;
			this.spins = Array.isArray(snap.spins) ? snap.spins : [];
		} catch {
			// Corrupt snapshot — start fresh.
		}
	}

	private persist() {
		if (typeof window === 'undefined') return;
		try {
			const snap: Snapshot = {
				startedAt: this.startedAt?.toISOString() ?? null,
				spins: this.spins
			};
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
		} catch {
			// Storage full or blocked — drop silently.
		}
	}

	start() {
		if (this.active) return;
		this.active = true;
		if (!this.startedAt) this.startedAt = new Date();
		this.error = null;
		this.persist();
	}

	stop() {
		// Mic state intentionally NOT persisted — reload kills the recorder, so
		// we don't want to leave a stale "active" flag in storage.
		this.active = false;
		this.runnerStatus = 'idle';
	}

	toggle() {
		if (this.active) this.stop();
		else this.start();
	}

	clearSet() {
		this.active = false;
		this.runnerStatus = 'idle';
		this.spins = [];
		this.startedAt = null;
		this.error = null;
		if (typeof window !== 'undefined') {
			try {
				sessionStorage.removeItem(STORAGE_KEY);
			} catch {
				/* ignore */
			}
		}
	}

	recordSpin(event: SpinEvent) {
		// Dedupe consecutive identifications of the same track — Shazam often
		// re-matches the same song across overlapping chunks.
		const last = this.spins[0];
		if (last && last.artist === event.artist && last.track === event.track) return;
		if (!this.startedAt) this.startedAt = new Date();
		this.spins = [event, ...this.spins];
		this.persist();
	}

	setError(message: string) {
		this.error = message;
		this.active = false;
		this.runnerStatus = 'idle';
	}
}

export const spin = new SpinState();
