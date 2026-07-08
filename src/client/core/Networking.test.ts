import * as THREE from 'three';
import { Player, type PlayerData } from '../../shared/Player.ts';
import { Networking } from './Networking.ts';

Deno.test('forced position update clears stale movement velocity', () => {
	const localPlayer = new Player();
	localPlayer.inputVelocity.set(0, -48, 0);
	localPlayer.velocity.set(0, -48, 0);
	localPlayer.gravity = -30;

	const updateLocalPlayerState = (
		Networking.prototype as unknown as {
			updateLocalPlayerState(data: Partial<PlayerData>): void;
		}
	).updateLocalPlayerState;

	updateLocalPlayerState.call(
		{
			localPlayer,
			forcedZoomTriggered: false,
		},
		{
			forced: true,
			position: new THREE.Vector3(1, 0.5, 2),
			velocity: new THREE.Vector3(0, 0, 0),
			gravity: 0,
		},
	);

	if (!localPlayer.position.equals(new THREE.Vector3(1, 0.5, 2))) {
		throw new Error(`Expected forced position to be applied, got ${localPlayer.position.toArray().join(', ')}`);
	}
	if (!localPlayer.inputVelocity.equals(new THREE.Vector3(0, 0, 0))) {
		throw new Error(
			`Expected stale input velocity to be cleared, got ${localPlayer.inputVelocity.toArray().join(', ')}`,
		);
	}
	if (localPlayer.gravity !== 0) {
		throw new Error(`Expected gravity to be reset, got ${localPlayer.gravity}`);
	}
	if (!localPlayer.forcedAcknowledged) {
		throw new Error('Expected forced update to be acknowledged');
	}
});
