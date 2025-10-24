export function lerp(start: number, end: number, t: number): number {
	return start + (end - start) * t;
}

export function seededRandom(seed: number): number {
	const x = Math.sin(seed++) * 100000;
	return x - Math.floor(x);
}
