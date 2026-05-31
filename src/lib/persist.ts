// Tiny localStorage helpers for remembering UI preferences across visits.
// Validates against an allowed-values list so a renamed/removed sort option
// gracefully falls back instead of returning a stale string.

export function loadSort<T extends string>(
	key: string,
	allowed: readonly T[],
	fallback: T
): T {
	if (typeof localStorage === 'undefined') return fallback;
	const stored = localStorage.getItem(key);
	if (stored && (allowed as readonly string[]).includes(stored)) return stored as T;
	return fallback;
}

export function saveSort(key: string, value: string): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(key, value);
	} catch {
		// Storage quota or private-mode failure — silently ignore
	}
}

export function loadReversed(key: string): boolean {
	if (typeof localStorage === 'undefined') return false;
	return localStorage.getItem(key) === '1';
}

export function saveReversed(key: string, value: boolean): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(key, value ? '1' : '0');
	} catch {
		// Storage quota or private-mode failure — silently ignore
	}
}
