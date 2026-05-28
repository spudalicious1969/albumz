// Shared Spotify client-credentials token cache. Single module-level cache
// lets every server module reuse the same token without redundant calls.

import { env } from '$env/dynamic/private';

let token: { value: string; expires: number } | null = null;

export async function getSpotifyToken(): Promise<string | null> {
	const id = env.SPOTIFY_CLIENT_ID;
	const secret = env.SPOTIFY_CLIENT_SECRET;
	if (!id || !secret) return null;
	if (token && token.expires > Date.now()) return token.value;

	try {
		const auth = Buffer.from(`${id}:${secret}`).toString('base64');
		const res = await fetch('https://accounts.spotify.com/api/token', {
			method: 'POST',
			headers: {
				Authorization: `Basic ${auth}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: 'grant_type=client_credentials'
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { access_token: string; expires_in: number };
		token = {
			value: data.access_token,
			expires: Date.now() + data.expires_in * 1000 - 60_000
		};
		return data.access_token;
	} catch {
		return null;
	}
}
