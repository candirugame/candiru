import * as THREE from 'three';
import { Player } from '../../shared/Player.ts';
import { RespawnPoint } from '../models/RespawnPoint.ts';
import { MapData } from '../models/MapData.ts';
import { ItemManager } from './ItemManager.ts';
import { PlayerManager } from './PlayerManager.ts';

Deno.test('new player spawn clears movement inherited from pre-spawn client state', () => {
	const manager = new PlayerManager(
		new MapData('test', [
			new RespawnPoint(new THREE.Vector3(1, 0.5, 2), new THREE.Quaternion(0, 0, 0, 1)),
		], []),
	);
	manager.setItemManager({
		triggerUpdateFlag() {},
	} as unknown as ItemManager);

	const player = new Player();
	player.inputVelocity.set(0, -80, 0);
	player.velocity.set(0, -80, 0);
	player.gravity = -30;

	const result = manager.addOrUpdatePlayer(player.toJSON());
	if (!result.isNew) {
		throw new Error('Expected player to be added');
	}

	if (!result.player.position.equals(new THREE.Vector3(1, 0.5, 2))) {
		throw new Error(`Expected spawn position, got ${result.player.position.toArray().join(', ')}`);
	}
	if (!result.player.inputVelocity.equals(new THREE.Vector3(0, 0, 0))) {
		throw new Error(`Expected input velocity reset, got ${result.player.inputVelocity.toArray().join(', ')}`);
	}
	if (!result.player.velocity.equals(new THREE.Vector3(0, 0, 0))) {
		throw new Error(`Expected velocity reset, got ${result.player.velocity.toArray().join(', ')}`);
	}
	if (result.player.gravity !== 0) {
		throw new Error(`Expected gravity reset, got ${result.player.gravity}`);
	}
});
