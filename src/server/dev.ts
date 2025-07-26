import { crypto } from 'https://deno.land/std@0.207.0/crypto/mod.ts';
import { walk } from 'https://deno.land/std@0.207.0/fs/walk.ts';
import { Buffer } from 'https://deno.land/std@0.207.0/io/buffer.ts';

async function getDirectoryHash(path: string): Promise<string> {
	const filePaths: string[] = [];
	for await (const entry of walk(path)) {
		if (entry.isFile) {
			filePaths.push(entry.path);
		}
	}
	filePaths.sort();

	let combinedData = new Uint8Array();
	for (const filePath of filePaths) {
		const fileData = await Deno.readFile(filePath);
		const newData = new Uint8Array(combinedData.length + fileData.length);
		newData.set(combinedData);
		newData.set(fileData, combinedData.length);
		combinedData = newData;
	}

	const digest = await crypto.subtle.digest('SHA-1', combinedData);
	const hashArray = Array.from(new Uint8Array(digest));
	const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

	return hex.slice(0, 8);
}

export async function setupDevClientVersion() {
	try {
		const distPath = new URL('../../dist', import.meta.url).pathname;
		const clientHash = await getDirectoryHash(distPath);

		const gameVersionPath = new URL('../../public/gameVersion.json', import.meta.url).pathname;
		const gameVersionJson = await Deno.readTextFile(gameVersionPath);
		const gameVersion = JSON.parse(gameVersionJson);

		const originalVersion = gameVersion.version.split('-')[0];
		gameVersion.version = `${originalVersion}-${clientHash}`;

		const distGameVersionPath = new URL('../../dist/gameVersion.json', import.meta.url).pathname;
		await Deno.writeTextFile(distGameVersionPath, JSON.stringify(gameVersion, null, 2));

		console.log(`DEV: Client version set to ${gameVersion.version}`);
	} catch (error) {
		console.error('Error setting up dev client version:', error);
	}
}
