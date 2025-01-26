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
	private readonly pitchOffset: number;
	private readonly yawOffset: number;
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
				const shotVectors = this.shots.pop()?.shoot(renderer);
				if (shotVectors && shotVectors?.length > 0) {
					for (const shot of shotVectors) {
						const { playerID, hitPoint } = shot;
						if (!hitPlayers.includes(playerID) || !this.onlyHitEachPlayerOnce) {
							hitPlayers.push(playerID);
							networking.applyDamage(playerID, this.damage);
							renderer.hitMarkerQueue.push({
								hitPoint: hitPoint,
								shotVector: shot.vector,
								timestamp: -1,
							});
							renderer.lastShotSomeoneTimestamp = Date.now() / 1000;
						}
					}
				}
			}

			// If we still have shots to process, schedule the next batch
			console.log(this.shots.length);
			if (this.shots.length > 0) {
				if (typeof requestIdleCallback === 'function') {
					const idleCallbackId = requestIdleCallback(processShots, { timeout: this.timeout });

					// Ensure completion within timeout
					setTimeout(() => {
						cancelIdleCallback(idleCallbackId);
						processShots();
					}, this.timeout);
				} else {
					setTimeout(() => processShots(), 0);
				}
			}
		};

		// Initial call
		if (typeof requestIdleCallback === 'function') {
			const idleCallbackId = requestIdleCallback(processShots, { timeout: this.timeout });

			// Ensure first batch starts within timeout
			setTimeout(() => {
				cancelIdleCallback(idleCallbackId);
				processShots();
			}, this.timeout);
		} else {
			setTimeout(() => processShots(), 0);
		}
	}
}
