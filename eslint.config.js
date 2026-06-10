import prettier from 'eslint-config-prettier';
import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		rules: {
			// No base path configured, so plain hrefs resolve fine; resolve()
			// everywhere would be ceremony with no payoff.
			'svelte/no-navigation-without-resolve': 'off',
			// Our each blocks render static display lists (tracklists, tag chips,
			// search results) that never reorder in place. Svelte 5 errors hard on
			// duplicate keys — a multi-disc tracklist with per-disc positions
			// crashed hydration in June 2026 — so unkeyed is the safer default
			// here, not an oversight.
			'svelte/require-each-key': 'off',
			// Flags transient function-local Set/URLSearchParams instances that
			// never participate in reactivity. State that should be reactive in
			// this app flows through $state/$derived + invalidateAll, not
			// long-lived mutable collections.
			'svelte/prefer-svelte-reactivity': 'off'
		}
	}
);
