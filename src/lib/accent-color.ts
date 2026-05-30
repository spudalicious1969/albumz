// Client-side dominant color extraction via Canvas API.
// Called after cover art loads; result is PATCHed back to update albums.accent_color.

export function extractAccentColorFromImg(img: HTMLImageElement): string {
	const size = 64;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(img, 0, 0, size, size);

	const data = ctx.getImageData(0, 0, size, size).data;
	let rSum = 0, gSum = 0, bSum = 0, count = 0;

	for (let i = 0; i < data.length; i += 4) {
		const r = data[i], g = data[i + 1], b = data[i + 2];
		// Weight toward saturated pixels — greys won't skew the accent
		const max = Math.max(r, g, b), min = Math.min(r, g, b);
		const saturation = max === 0 ? 0 : (max - min) / max;
		if (saturation > 0.15) {
			rSum += r; gSum += g; bSum += b; count++;
		}
	}

	if (count === 0) {
		// Fallback: plain average
		for (let i = 0; i < data.length; i += 4) {
			rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; count++;
		}
	}

	const r = Math.round(rSum / count);
	const g = Math.round(gSum / count);
	const b = Math.round(bSum / count);

	return rgbToOklch(r, g, b);
}

function rgbToOklch(r: number, g: number, b: number): string {
	const toLinear = (c: number) => {
		const n = c / 255;
		return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
	};
	const rl = toLinear(r), gl = toLinear(g), bl = toLinear(b);

	const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
	const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
	const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

	const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);

	const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
	const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
	const bk = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

	const C = Math.sqrt(a * a + bk * bk);
	const H = (Math.atan2(bk, a) * 180) / Math.PI;

	// Floor lightness + chroma so the accent stays legible as a UI tint
	// even when the album is near-black or near-grey. Hue is preserved.
	const lPct = Math.max(62, Math.round(L * 100));
	const cFixed = Math.max(0.08, Math.round(C * 1000) / 1000);
	const hDeg = Math.round(((H % 360) + 360) % 360);

	return `oklch(${lPct}% ${cFixed} ${hDeg})`;
}
