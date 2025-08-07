import * as THREE from 'three';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
import { ChatMessage } from './models/ChatMessage.ts';
import { DamageRequest } from './models/DamageRequest.ts';
import { Player, PlayerData } from '../shared/Player.ts';
import { ServerInfo } from './models/ServerInfo.ts';
import { Prop } from '../shared/Prop.ts';

export class DataValidator {
	private static SERVER_VERSION = '';

	public static async updateServerVersion() {
		const versionFile = await Deno.readTextFile(new URL('../../dist/gameVersion.json', import.meta.url));
		const versionData = JSON.parse(versionFile);
		this.SERVER_VERSION = versionData.version;
		return this.SERVER_VERSION;
	}

	public static getServerVersion() {
		return this.SERVER_VERSION;
	}

	static vector3Schema = z
		.object({
			x: z.number(),
			y: z.number(),
			z: z.number(),
		})
		.transform(({ x, y, z }) => new THREE.Vector3(x, y, z));

	static quaternionSchema = z
		.object({
			x: z.number(),
			y: z.number(),
			z: z.number(),
			w: z.number(),
		})
		.transform(({ x, y, z, w }) => new THREE.Quaternion(x, y, z, w));

	static playerDataSchema = z.object({
		id: z.number(),
		speed: z.number(),
		acceleration: z.number(),
		name: z.string().max(42),
		gameVersion: z.string().refine((val) => val === this.SERVER_VERSION, {
			message: `Game version must be ${this.SERVER_VERSION}`,
		}),
		position: this.vector3Schema,
		velocity: this.vector3Schema,
		inputVelocity: this.vector3Schema,
		gravity: z.number(),
		lookQuaternion: this.quaternionSchema,
		chatActive: z.boolean(),
		chatMsg: z.string().max(300),
		latency: z.number(),
		health: z.number(),
		protection: z.number(),
		forced: z.boolean(),
		forcedAcknowledged: z.boolean(),
		updateTimestamp: z.number().optional(),
		lastDamageTime: z.number().optional(),
		inventory: z.array(z.number()),
		heldItemIndex: z.number(),
		shooting: z.boolean(),
		rightClickHeld: z.boolean(),
		idLastDamagedBy: z.number().optional(),
		playerSpectating: z.number(),
		gameMsgs: z.array(z.string()),
		gameMsgs2: z.array(z.string()),
		directionIndicatorVector: this.vector3Schema.nullable().optional(),
		doPhysics: z.boolean(),
		thirdPerson: z.number().optional().default(0),
	}).strict().transform((data) => Player.fromObject(data as Player));

	static propDataSchema = z.object({ //used for message types
		url: z.string(),
		position: this.vector3Schema,
		velocity: this.vector3Schema,
		quaternion: this.quaternionSchema,
		scale: this.vector3Schema,
		id: z.number(),
		name: z.string().max(42),
		doPhysics: z.boolean(),
		playersCollide: z.boolean(),
	}).strict().transform((data) => Prop.fromObject(data as Prop));

	static chatMsgSchema = z.object({
		id: z.number(),
		name: z.string().max(42),
		message: z.string().max(300),
	}).strict();

	static damageRequestSchema = z.object({
		localPlayer: DataValidator.playerDataSchema,
		targetPlayer: DataValidator.playerDataSchema,
		damage: z.number(),
		wasHeadshot: z.boolean(),
	}).strict();

	static serverInfoSchema = z.object({
		name: z.string().max(24),
		maxPlayers: z.number(),
		currentPlayers: z.number(),
		mapName: z.string().min(1).max(24),
		tickRate: z.number(),
		version: z.string(),
		gameMode: z.string(),
		playerMaxHealth: z.number(),
		skyColor: z.string(),
		tickComputeTime: z.number(),
		cleanupComputeTime: z.number(),
		url: z.string(),
		memUsageRss: z.number(),
		memUsageHeapUsed: z.number(),
		memUsageHeapTotal: z.number(),
		memUsageExternal: z.number(),
		idleKickTime: z.number(),
	}).strict().transform((data) => Object.assign(new ServerInfo(), data));

	static validatePlayerData(data: PlayerData) {
		return DataValidator.playerDataSchema.safeParse(data);
	}

	static validateChatMessage(data: ChatMessage) {
		return DataValidator.chatMsgSchema.safeParse(data);
	}

	static validateDamageRequest(data: DamageRequest) {
		return DataValidator.damageRequestSchema.safeParse(data);
	}
}
