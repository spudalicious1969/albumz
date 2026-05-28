import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 3200,
		// Allow requests proxied through Apache from albumz.spudalicio.us
		allowedHosts: ['albumz.spudalicio.us', 'localhost']
	}
});
