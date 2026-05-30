// Loads the weekly-digest prompt markdown and parses out the two fenced code
// blocks (system + user template). Vite's ?raw import bundles the file content
// into the server build, so there's no runtime filesystem dependency. The same
// markdown is the source of truth for the test harness in scripts/test-digest.mjs.

import promptDoc from '../../prompts/weekly-digest.md?raw';

const fenceMatches = [...promptDoc.matchAll(/```\n([\s\S]+?)\n```/g)].map((m) => m[1]);

if (fenceMatches.length < 2) {
	throw new Error(
		'weekly-digest.md must contain at least two fenced code blocks (system, then user template)'
	);
}

export const SYSTEM_PROMPT = fenceMatches[0];
export const USER_TEMPLATE = fenceMatches[1];

export type DigestInputs = {
	display_name: string;
	week_ending: string;
	listening_log: string;
	top_tags: string;
	patterns_observed: string;
	rediscovery_pick: string;
	rediscovery_hook: string;
	discovery_pick: string;
	discovery_hook: string;
};

export function fillUserTemplate(inputs: DigestInputs): string {
	return USER_TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_, key) => {
		const value = inputs[key as keyof DigestInputs];
		if (value === undefined) {
			throw new Error(`Missing digest input key: ${key}`);
		}
		return value;
	});
}
