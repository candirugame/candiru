import { DataValidator } from '../DataValidator.ts';
import { ChatMessage } from '../models/ChatMessage.ts';
import { PlayerManager } from './PlayerManager.ts';
import { CustomServer, CustomSocket } from '../../shared/messages.ts';

export class ChatManager {
	constructor(private io: CustomServer, private playerManager: PlayerManager) {}

	handleChatMessage(unparsedData: ChatMessage, socket: CustomSocket) {
		const result = DataValidator.validateChatMessage(unparsedData);
		if (!result.success) {
			console.warn(`Invalid chat message: ${result.error.message}`);
			return;
		}
		const data = result.data;

		const isCommand = this.parseCommand(data.message, socket, data.id);
		if (!isCommand) {
			if (data.message.startsWith('>')) data.message = '&2' + data.message;
			console.log(`💬 ${data.name}: ${data.message}`);
			this.io.emit('chatMsg', { id: data.id, name: data.name, message: data.message });
		}
	}

	private parseCommand(message: string, socket: CustomSocket, playerId: number): boolean {
		if (message.charAt(0) !== '/') return false;

		const args = message.slice(1).split(' ');
		const command = args.shift()?.toLowerCase();

		const commandHandlers: Record<string, () => void> = {
			help: () => {
				this.whisperChatMessage(message + ` -> nah i'm good`, socket);
			},
			kill: () => {
				const player = this.playerManager.getPlayerById(playerId);
				if (player) {
					this.playerManager.respawnPlayer(player);
				}
				this.broadcastEventMessage(`&c${player?.name} ^b ${player?.name}`);
			},
			thumbsup: () => {
				this.broadcastChat(`${this.playerManager.getPlayerById(playerId)?.name}: 👍`);
			},
			thumbsdown: () => {
				this.broadcastChat(`${this.playerManager.getPlayerById(playerId)?.name}: 👎`);
			},
			octopus: () => {
				this.broadcastChat(`${this.playerManager.getPlayerById(playerId)?.name}: 🐙`);
			},
			goblin: () => {
				let goblin = '';
				for (let i = 0; i < 50; i++) goblin += '^a';
				for (let i = 0; i < 50; i++) this.whisperChatMessage(goblin, socket);
			},
			ping: () => {
				this.whisperChatMessage(message + ' -> pong!', socket);
			},
			version: () => {
				this.whisperChatMessage(message + ` -> candiru ${DataValidator.getServerVersion()}`, socket);
			},
			clear: () => {
				for (let i = 0; i < 25; i++) {
					this.whisperChatMessage(' ', socket);
					this.whisperEventMessage(' ', socket);
				}
				//this.whisperChatMessage(message + ' -> cleared chat', socket);
			},
			playercount: () => {
				const players = this.playerManager.getAllPlayers();
				this.whisperChatMessage(message + ` -> ${players.length} players online`, socket);
			},
		};

		if (command && commandHandlers[command]) {
			commandHandlers[command]();
		} else {
			this.whisperChatMessage(message + ' -> unknown command', socket);
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

	broadcastEventMessage(message: string) {
		this.io.emit('eventMsg', message);
	}

	whisperChatMessage(message: string, socket: CustomSocket) {
		const chatMessage: ChatMessage = {
			id: -1,
			name: '',
			message,
		};
		socket.emit('chatMsg', chatMessage);
	}

	whisperEventMessage(message: string, socket: CustomSocket) {
		socket.emit('eventMsg', message);
	}
}
