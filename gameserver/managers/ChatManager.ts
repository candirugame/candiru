// src/managers/ChatManager.ts
import { Server } from "https://deno.land/x/socket_io@0.2.0/mod.ts";
import { DataValidator } from "../DataValidator.ts";
import { ChatMessage } from '../models/ChatMessage.ts';
import { Socket } from 'socket.io';
import config from "../config.ts";



export class ChatManager {
    constructor(private io: Server) {}

    handleChatMessage(data: ChatMessage, socket) {
        const { error } = DataValidator.validateChatMessage(data);
        if (error) {
            console.warn(`Invalid chat message: ${error.message}`);
            return;
        }

        const isCommand = this.parseCommand(data.message, socket, data.id);
        if (!isCommand) {
            console.log(`💬 ${data.name}: ${data.message}`);
            this.io.emit('chatMsg', data);
        }
    }

    private parseCommand(message: string, socket: Socket, playerId: number): boolean {
        if (message.charAt(0) !== '/') return false;

        const args = message.slice(1).split(' ');
        const command = args.shift()?.toLowerCase();

        switch (command) {
            case 'help':
                this.whisperChatMessage('Here are the available commands: /help, /kill, /ping, /version', socket);
                break;
            case 'kill':
                // Implement kill logic by emitting an event or calling DamageSystem
                break;
            case 'thumbsup':
                this.broadcastChat(`${playerId}: 👍`);
                break;
            case 'thumbsdown':
                this.broadcastChat(`${playerId}: 👎`);
                break;
            case 'ping':
                this.whisperChatMessage('Pong!', socket);
                break;
            case 'version':
                this.whisperChatMessage(`Server Version: implement this pls :)`, socket);
                break;
            case 'bee':
                this.whisperChatMessage(
                    "🐝 According to all known laws of aviation, there is no way a bee should be able to fly...",
                    socket
                );
                break;
            case 'clear':
                // Implement chat clear logic
                break;
            default:
                this.whisperChatMessage('Unknown command.', socket);
        }

        return true;
    }

    broadcastChat(message: string) {
        const chatMessage: ChatMessage = {
            id: -1,
            name: '',
            message,
        };
        this.io.emit('chatMsg', chatMessage);
    }

    whisperChatMessage(message: string, socket: Socket) {
        const chatMessage: ChatMessage = {
            id: -1,
            name: '',
            message,
        };
        socket.emit('chatMsg', chatMessage);
    }
}