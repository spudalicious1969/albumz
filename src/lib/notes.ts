// Render user-written album notes as HTML, with support for markdown-style
// `[text](url)` links. Everything else is escaped — no other markdown is
// parsed and no raw HTML is allowed through. Only http(s) URLs are linkified;
// any other scheme (javascript:, data:, etc.) renders as plain text so a
// malicious note can't produce a clickable script trigger.

const HTML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// `[link text](url)` — text and URL can be any non-bracket / non-paren chars.
const LINK_RE = /\[([^\]\n]+?)\]\(([^)\s]+)\)/g;

function isSafeUrl(url: string): boolean {
	const trimmed = url.trim();
	return /^https?:\/\//i.test(trimmed);
}

/**
 * Convert a notes string into safe HTML. Newlines aren't converted to <br> —
 * the consuming element uses `white-space: pre-wrap`, which preserves them
 * already.
 */
export function notesToHtml(text: string | null | undefined): string {
	if (!text) return '';
	// Escape FIRST so user-typed HTML never makes it through. Link substitution
	// then operates on already-escaped text — we rebuild only the anchor tag.
	const escaped = escapeHtml(text);
	return escaped.replace(LINK_RE, (match, label: string, url: string) => {
		// `escaped` already turned `&` in URLs into `&amp;`. We use the escaped
		// form directly inside the href so it survives unchanged.
		const decodedForCheck = url.replace(/&amp;/g, '&');
		if (!isSafeUrl(decodedForCheck)) return match;
		return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
	});
}
