import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { Player } from "./models/Player.ts";
import { ChatMessage } from "./models/ChatMessage.ts";
import { DamageRequest } from "./models/DamageRequest.ts";



export class DataValidator {
    private static SERVER_VERSION = "v1.7.3";
    //TODO: add server version

    private static vector3Schema = z.object({
        x: z.number(),
        y: z.number(),
        z: z.number(),
    });

    private static playerDataSchema = z.object({
        id: z.number(),
        speed: z.number(),
        acceleration: z.number(),
        name: z.string().max(42),
        gameVersion: z.string().refine(val => val === this.SERVER_VERSION, {
            message: `Game version must be ${this.SERVER_VERSION}`,
        }),
        position: DataValidator.vector3Schema,
        velocity: DataValidator.vector3Schema,
        inputVelocity: DataValidator.vector3Schema,
        gravity: z.number(),
        lookQuaternion: z.array(z.number()).length(4),
        quaternion: z.array(z.number()).length(4),
        chatActive: z.boolean(),
        chatMsg: z.string().max(300),
        latency: z.number(),
        health: z.number(),
        forced: z.boolean(),
        forcedAcknowledged: z.boolean(),
        updateTimestamp: z.number().optional(),
        lastDamageTime: z.number().optional(),
        inventory: z.array(z.number()),
        idLastDamagedBy: z.number().optional(),
    });

    private static chatMsgSchema = z.object({
        id: z.number(),
        name: z.string().max(42),
        message: z.string().max(300),
    });

    private static damageRequestSchema = z.object({
        localPlayer: DataValidator.playerDataSchema,
        targetPlayer: DataValidator.playerDataSchema,
        damage: z.number(),
    });

    static validatePlayerData(data: Player) {
        return DataValidator.playerDataSchema.safeParse(data);
    }

    static validateChatMessage(data: ChatMessage) {
        return DataValidator.chatMsgSchema.safeParse(data);
    }

    static validateDamageRequest(data: DamageRequest) {
        return DataValidator.damageRequestSchema.safeParse(data);
    }
}
