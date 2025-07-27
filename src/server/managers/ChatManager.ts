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

		switch (command) {
			case 'help':
				this.whisperChatMessage(message + ` -> nah i'm good`, socket);
				break;
			case 'kill': {
				const player = this.playerManager.getPlayerById(playerId);
				if (player) {
					this.playerManager.respawnPlayer(player);
				}
				this.broadcastChat(`${this.playerManager.getPlayerById(playerId)?.name} killed himself`);
				break;
			}
			case 'thumbsup':
				this.broadcastChat(`${this.playerManager.getPlayerById(playerId)?.name}: 👍`);
				break;
			case 'thumbsdown':
				this.broadcastChat(`${this.playerManager.getPlayerById(playerId)?.name}: 👎`);
				break;
			case 'octopus':
				this.broadcastChat(`${this.playerManager.getPlayerById(playerId)?.name}: 🐙`);
				break;
			case 'ping':
				this.whisperChatMessage(message + ' -> pong!', socket);
				break;
			case 'version':
				this.whisperChatMessage(message + ` -> candiru ${DataValidator.getServerVersion()}`, socket);
				break;
			case 'clear':
				for (let i = 0; i < 25; i++) {
					this.whisperChatMessage(' ', socket);
				}
				this.whisperChatMessage(message + ' -> cleared chat', socket);
				break;
			default:
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

	whisperChatMessage(message: string, socket: CustomSocket) {
		const chatMessage: ChatMessage = {
			id: -1,
			name: '',
			message,
		};
		socket.emit('chatMsg', chatMessage);
	}
}
