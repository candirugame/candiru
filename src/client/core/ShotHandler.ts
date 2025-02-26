import * as THREE from 'three';
import { Networking } from './Networking.ts';
import { Renderer } from './Renderer.ts';

export class ShotHandler {
	private readonly renderer: Renderer;
	private readonly networking: Networking;

	constructor(renderer: Renderer, networking: Networking) {
		this.renderer = renderer;
		this.networking = networking;
	}

	public onFrame() {
		this.renderer.crosshairIsFlashing = Date.now() / 1000 - this.renderer.lastShotSomeoneTimestamp < 0.05;
	}

	public addShotGroup(
		damage: number,
		numberOfShots: number = 1,
		timeout: number = 150,
		yawOffsetRange: number = 0,
		pitchOffsetRange: number = 0,
		maxDistance: number = Infinity,
		onlyHitEachPlayerOnce: boolean = false,
	) {
		const shotGroup = new ShotGroup(
			damage,
			numberOfShots,
			timeout,
			yawOffsetRange,
			pitchOffsetRange,
			maxDistance,
			onlyHitEachPlayerOnce,
		);
		shotGroup.processShots(this.renderer, this.networking);
	}
}

class Shot {
	public readonly pitchOffset: number;
	public readonly yawOffset: number;
	private readonly maxDistance: number;

	constructor(yawOffset: number = 0, pitchOffset: number = 0, maxDistance: number = Infinity) {
		this.pitchOffset = pitchOffset;
		this.yawOffset = yawOffset;
		this.maxDistance = maxDistance;
	}

	public shoot(renderer: Renderer): { playerID: number; vector: THREE.Vector3; hitPoint: THREE.Vector3 }[] {
		return renderer.getShotVectorsToPlayersWithOffset(this.yawOffset, this.pitchOffset, this.maxDistance);
	}
}

export class ShotGroup {
	private shots: Shot[];
	private timeout: number;
	private damage: number;
	private onlyHitEachPlayerOnce: boolean;

	constructor(
		damage: number,
		numberOfShots: number = 1,
		timeout: number = 150,
		yawOffsetRange: number = 0,
		pitchOffsetRange: number = 0,
		maxDistance: number = Infinity,
		onlyHitEachPlayerOnce: boolean = false,
	) {
		this.shots = [];
		this.timeout = timeout;
		this.damage = damage;
		this.onlyHitEachPlayerOnce = onlyHitEachPlayerOnce;
		for (let i = 0; i < numberOfShots; i++) {
			const shot = new Shot(
				(Math.random() - 0.5) * yawOffsetRange,
				(Math.random() - 0.5) * pitchOffsetRange,
				maxDistance,
			);
			this.shots.push(shot);
		}
	}

	public processShots(renderer: Renderer, networking: Networking) {
		const hitPlayers: number[] = [];

		const processShots = (deadline?: IdleDeadline) => {
			const timeRemaining = deadline ? deadline.timeRemaining() : 16;

			while (this.shots.length > 0 && timeRemaining > 0) {
				const shot = this.shots.pop();
				if (!shot) continue;

				// Calculate the shot direction based on the muzzle direction plus the shot's offset
				const muzzlePos = renderer.getMuzzlePosition();
				const baseMuzzleDir = renderer.getMuzzleDirection().clone().normalize();

				// Compute local right vector (cross product of baseMuzzleDir and world up)
				const worldUp = new THREE.Vector3(0, 1, 0);
				let right = new THREE.Vector3().crossVectors(baseMuzzleDir, worldUp).normalize();
				// Fallback in case baseMuzzleDir is parallel to worldUp
				if (right.lengthSq() === 0) {
					right = new THREE.Vector3(1, 0, 0);
				}

				// Create quaternions for yaw (around worldUp) and pitch (around right) based on local axes
				const yawQuat = new THREE.Quaternion().setFromAxisAngle(worldUp, shot.yawOffset);
				const pitchQuat = new THREE.Quaternion().setFromAxisAngle(right, shot.pitchOffset);

				// Apply the rotations: yaw followed by pitch
				const finalQuat = new THREE.Quaternion().multiplyQuaternions(yawQuat, pitchQuat);
				// Generate the new shot direction in local space
				const shotDirection = baseMuzzleDir.clone().applyQuaternion(finalQuat).normalize();

				// Emit muzzle flash with shot direction
				renderer.particleSystem.emit({
					position: muzzlePos,
					count: 1,
					velocity: shotDirection.multiplyScalar(20),
					spread: 0.1,
					lifetime: 0.25,
					size: 0.2,
					color: new THREE.Color(1, 0.7, 0),
				});

				// Process raycast shot info
				const shotVectors = shot.shoot(renderer);
				if (shotVectors?.length > 0) {
					for (const { playerID, hitPoint, vector } of shotVectors) {
						if (!hitPlayers.includes(playerID) || !this.onlyHitEachPlayerOnce) {
							hitPlayers.push(playerID);
							networking.applyDamage(playerID, this.damage);

							// renderer.particleSystem.emit({
							// 	position: hitPoint,
							// 	count: 16,
							// 	velocity: new THREE.Vector3(0, 0, 0),
							// 	spread: 8,
							// 	lifetime: 2.5,
							// 	size: 0.1,
							// 	color: new THREE.Color(0.8, 0, 0),
							// });

							renderer.hitMarkerQueue.push({
								hitPoint: hitPoint,
								shotVector: vector,
								timestamp: -1,
							});
							renderer.lastShotSomeoneTimestamp = Date.now() / 1000;
						}
					}
				}
			}

			if (this.shots.length > 0) {
				if (typeof requestIdleCallback === 'function') {
					const idleCallbackId = requestIdleCallback(processShots, { timeout: this.timeout });
					setTimeout(() => {
						cancelIdleCallback(idleCallbackId);
						processShots();
					}, this.timeout);
				} else {
					setTimeout(() => processShots(), 0);
				}
			}
		};

		if (typeof requestIdleCallback === 'function') {
			const idleCallbackId = requestIdleCallback(processShots, { timeout: this.timeout });
			setTimeout(() => {
				cancelIdleCallback(idleCallbackId);
				processShots();
			}, this.timeout);
		} else {
			setTimeout(() => processShots(), 0);
		}
	}
}
