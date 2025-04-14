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
		origin: THREE.Vector3,
		direction: THREE.Vector3,
		isLocal: boolean,
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
			origin,
			direction,
			isLocal,
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

	public emitParticles(renderer: Renderer, origin: THREE.Vector3, baseDirection: THREE.Vector3) {
		if (this.shotParticleType === ShotParticleType.None) return;

		// Calculate shot direction (same logic as before)
		const worldUp = new THREE.Vector3(0, 1, 0);
		let right = new THREE.Vector3().crossVectors(baseDirection, worldUp).normalize();
		if (right.lengthSq() < 0.001) right = new THREE.Vector3(1, 0, 0);
		const up = new THREE.Vector3().crossVectors(right, baseDirection).normalize();

		const yawQuat = new THREE.Quaternion().setFromAxisAngle(up, this.yawOffset);
		const pitchQuat = new THREE.Quaternion().setFromAxisAngle(right, this.pitchOffset);
		const finalQuat = new THREE.Quaternion().multiplyQuaternions(yawQuat, pitchQuat);
		const shotDirection = baseDirection.clone().applyQuaternion(finalQuat).normalize();

		// Emit particles immediately
		switch (this.shotParticleType) {
			case ShotParticleType.Shotgun:
				renderer.particleSystem.emit({
					position: origin,
					count: 1,
					velocity: shotDirection.clone().multiplyScalar(20),
					spread: 0.05,
					lifetime: 0.3,
					size: 0.2,
					color: new THREE.Color(25 / 255, 70 / 255, 25 / 255),
				});
				break;

			case ShotParticleType.Pistol:
				renderer.particleSystem.emit({
					position: origin.add(shotDirection.clone().multiplyScalar(0.15)),
					count: 8,
					velocity: shotDirection.clone().multiplyScalar(14),
					spread: 5,
					lifetime: 0.08,
					size: 0.06,
					color: new THREE.Color(230 / 255, 218 / 255, 140 / 255),
				});
				break;
		}
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
	private origin: THREE.Vector3;
	private direction: THREE.Vector3;
	private isLocal: boolean;

	constructor(
		damage: number,
		numberOfShots: number = 1,
		timeout: number = 150,
		yawOffsetRange: number = 0,
		pitchOffsetRange: number = 0,
		maxDistance: number = Infinity,
		onlyHitEachPlayerOnce: boolean = false,
		shotParticleType: ShotParticleType,
		origin: THREE.Vector3,
		direction: THREE.Vector3,
		isLocal: boolean,
	) {
		this.shots = [];
		this.timeout = timeout;
		this.damage = damage;
		this.onlyHitEachPlayerOnce = onlyHitEachPlayerOnce;
		this.origin = origin;
		this.direction = direction;
		this.isLocal = isLocal;

		for (let i = 0; i < numberOfShots; i++) {
			const shot = new Shot(
				(Math.random() - 0.5) * yawOffsetRange,
				(Math.random() - 0.5) * pitchOffsetRange,
				maxDistance,
				shotParticleType,
			);
			this.shots.push(shot);
		}
	}

	public processShots(renderer: Renderer, networking: Networking) {
		const hitPlayers: number[] = [];

		// Emit particles for all shots immediately
		for (const shot of this.shots) {
			shot.emitParticles(renderer, this.origin, this.direction);
		}

		const processShots = (deadline?: IdleDeadline) => {
			const timeRemaining = deadline ? deadline.timeRemaining() : 16;

			while (this.shots.length > 0 && timeRemaining > 0) {
				const shot = this.shots.pop();
				if (!shot) continue;

				// Process hits (particles already emitted)
				if (this.isLocal) {
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
