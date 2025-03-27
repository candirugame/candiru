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
		shotParticleType: ShotParticleType = ShotParticleType.None,
	) {
		const shotGroup = new ShotGroup(
			damage,
			numberOfShots,
			timeout,
			yawOffsetRange,
			pitchOffsetRange,
			maxDistance,
			onlyHitEachPlayerOnce,
			shotParticleType,
		);
		shotGroup.processShots(this.renderer, this.networking);
	}
}

class Shot {
	public readonly pitchOffset: number;
	public readonly yawOffset: number;
	private readonly maxDistance: number;
	public readonly shotParticleType: ShotParticleType;

	constructor(
		yawOffset: number = 0,
		pitchOffset: number = 0,
		maxDistance: number = Infinity,
		shotParticleType: ShotParticleType = ShotParticleType.None,
	) {
		this.pitchOffset = pitchOffset;
		this.yawOffset = yawOffset;
		this.maxDistance = maxDistance;
		this.shotParticleType = shotParticleType;
	}

	public shoot(renderer: Renderer): { playerID: number; vector: THREE.Vector3; hitPoint: THREE.Vector3 }[] {
		return renderer.getShotVectorsToPlayersWithOffset(this.yawOffset, this.pitchOffset, this.maxDistance);
	}
}

export enum ShotParticleType {
	None,
	Shotgun,
	Pistol,
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
		particleType: ShotParticleType,
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
				particleType,
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

				// Get muzzle position and base direction
				const muzzlePos = renderer.getMuzzlePosition();
				const baseMuzzleDir = renderer.getMuzzleDirection().clone().normalize();

				// Create stable coordinate system
				const worldUp = new THREE.Vector3(0, 1, 0);
				let right = new THREE.Vector3().crossVectors(baseMuzzleDir, worldUp).normalize();

				// Fallback for when looking straight up/down
				if (right.lengthSq() < 0.001) {
					right = new THREE.Vector3(1, 0, 0);
				}

				const up = new THREE.Vector3().crossVectors(right, baseMuzzleDir).normalize();

				// Convert angular offsets to direction vector
				const yawAngle = shot.yawOffset;
				const pitchAngle = shot.pitchOffset;

				// Create rotation quaternions
				const yawQuat = new THREE.Quaternion().setFromAxisAngle(up, yawAngle);
				const pitchQuat = new THREE.Quaternion().setFromAxisAngle(right, pitchAngle);

				// Combine rotations (yaw first, then pitch)
				const finalQuat = new THREE.Quaternion().multiplyQuaternions(yawQuat, pitchQuat);

				// Apply to base direction
				const shotDirection = baseMuzzleDir.clone().applyQuaternion(finalQuat).normalize();

				// Emit particles
				switch (shot.shotParticleType) {
					case ShotParticleType.Shotgun:
						renderer.particleSystem.emit({
							position: muzzlePos,
							count: 1,
							velocity: shotDirection.clone().multiplyScalar(20),
							spread: 0.05,
							lifetime: 0.3,
							size: 0.2,
							color: new THREE.Color(25 / 255, 70 / 255, 25 / 255),
						});
						break;

					case ShotParticleType.Pistol:
						// renderer.particleSystem.emit({
						// 	position: muzzlePos,
						// 	count: 1,
						// 	velocity: shotDirection.clone().multiplyScalar(128),
						// 	spread: 0.1,
						// 	lifetime: 2,
						// 	size: 0.12,
						// 	color: new THREE.Color(25 / 255, 25 / 255, 25 / 255),
						// });
						renderer.particleSystem.emit({
							position: muzzlePos.add(shotDirection.clone().multiplyScalar(0.15)),
							count: 12,
							velocity: shotDirection.clone().multiplyScalar(9),
							spread: 5,
							lifetime: 0.1,
							size: 0.06,
							color: new THREE.Color(250 / 255, 185 / 255, 0 / 255),
						});
						break;
					default:
						break;
				}

				// Process hits
				const shotVectors = shot.shoot(renderer);
				if (shotVectors?.length > 0) {
					for (const { playerID, hitPoint, vector } of shotVectors) {
						if (!hitPlayers.includes(playerID) || !this.onlyHitEachPlayerOnce) {
							hitPlayers.push(playerID);
							networking.applyDamage(playerID, this.damage);

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
