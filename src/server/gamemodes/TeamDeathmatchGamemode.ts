import { FFAGamemode } from './FFAGamemode.ts';
import { Player } from '../../shared/Player.ts';
import config from '../config.ts';
import * as THREE from 'three';

type RoundState = 'waiting' | 'in_progress' | 'post_round';

export class TeamDeathmatchGamemode extends FFAGamemode {
	private readonly TEAM_COLORS: [string, string] = ['&c', '&9'];
	private readonly TEAM_NAMES: [string, string] = ['red', 'blue'];
	private readonly TEAM_HEALTH_INDICATOR_BASE_COLORS: [
		[number, number, number],
		[number, number, number],
	] = [
		[220, 40, 40],
		[40, 90, 220],
	];
	private teamScores: [number, number] = [0, 0];
	private state: RoundState = 'waiting';
	private roundEndTimestamp: number | null = null;
	private postRoundResetTimestamp: number | null = null;

	override init(): void {
		super.init();
		console.log('🔫 team Deathmatch gamemode initialized');
	}

	override tick(): void {
		super.tick();
		this.checkRoundTimers();
	}

	override onPeriodicCleanup(): void {
		super.onPeriodicCleanup();
		this.ensureTeamsAssigned();
		this.updateRosterState();
		this.updateGameMessages();
	}

	override onPlayerConnect(player: Player): void {
		super.onPlayerConnect(player);
		this.assignTeam(player);
		this.updateRosterState();
		this.updateGameMessages();
	}

	override onPlayerDisconnect(player: Player): void {
		super.onPlayerDisconnect(player);
		const extras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
		if (extras) extras.team = -1;
		this.updateRosterState();
		this.updateGameMessages();
	}

	override onPlayerDeath(player: Player): void {
		if (this.state === 'post_round') return; //ignore deaths during post-round

		const killer = this.findValidKiller(player);
		super.onPlayerDeath(player, true);
		const playerExtras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
		if (playerExtras && playerExtras.team == 1) {
			this.gameEngine.playerManager.doDeathParticles(player, new THREE.Color(0, 0, 1));
		} else this.gameEngine.playerManager.doDeathParticles(player, new THREE.Color(1, 0, 0));

		if (!killer || this.state !== 'in_progress') return;

		const killerExtras = this.gameEngine.playerManager.getPlayerExtrasById(killer.id);
		const victimExtras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
		if (!killerExtras || !victimExtras) return;
		if (killerExtras.team === victimExtras.team) return;
		if (killerExtras.team !== 0 && killerExtras.team !== 1) return;

		this.teamScores[killerExtras.team] += 1;
		this.gameEngine.playerUpdateSinceLastEmit = true;
		this.updateGameMessages();
	}

	private findValidKiller(victim: Player): Player | null {
		if (!victim.lastDamageTime || victim.idLastDamagedBy == null || victim.idLastDamagedBy < 0) return null;
		if (Date.now() / 1000 - victim.lastDamageTime > 5) return null;
		return this.gameEngine.playerManager.getPlayerById(victim.idLastDamagedBy) ?? null;
	}

	private assignTeam(player: Player): void {
		const extras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
		if (!extras) return;

		const counts = this.getTeamCounts();
		const targetTeam = counts[0] <= counts[1] ? 0 : 1;
		extras.team = targetTeam;
		const nameUpdated = this.ensurePlayerNameHasTeamColor(player, targetTeam);
		const colorUpdated = this.ensureHealthIndicatorColor(player, targetTeam);
		if (nameUpdated || colorUpdated) this.gameEngine.playerUpdateSinceLastEmit = true;
	}

	private ensurePlayerNameHasTeamColor(player: Player, team: number): boolean {
		const teamColor = this.TEAM_COLORS[team];
		if (player.name.startsWith(teamColor)) return false;

		for (const color of this.TEAM_COLORS) {
			if (color !== teamColor && player.name.startsWith(color)) {
				player.name = player.name.slice(color.length);
				break;
			}
		}

		player.name = teamColor + player.name;
		player.forced = true;
		return true;
	}

	private ensureTeamsAssigned(): void {
		let didUpdate = false;
		for (const player of this.gameEngine.playerManager.getAllPlayers()) {
			const extras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
			if (!extras) continue;

			if (extras.team !== 0 && extras.team !== 1) {
				this.assignTeam(player);
				didUpdate = true;
			} else {
				if (this.ensurePlayerNameHasTeamColor(player, extras.team)) didUpdate = true;
				if (this.ensureHealthIndicatorColor(player, extras.team)) didUpdate = true;
			}
		}
		if (didUpdate) this.gameEngine.playerUpdateSinceLastEmit = true;
	}

	private ensureHealthIndicatorColor(player: Player, team: number): boolean {
		if (team !== 0 && team !== 1) return false;
		const desiredColor = this.mixWithWhite(this.TEAM_HEALTH_INDICATOR_BASE_COLORS[team], 0.35);
		const current = player.healthIndicatorColor;
		if (
			current[0] === desiredColor[0] &&
			current[1] === desiredColor[1] &&
			current[2] === desiredColor[2]
		) {
			return false;
		}
		player.healthIndicatorColor = desiredColor;
		return true;
	}

	private mixWithWhite(color: [number, number, number], whiteRatio: number): [number, number, number] {
		const ratio = Math.min(Math.max(whiteRatio, 0), 1);
		const blended: [number, number, number] = [0, 0, 0];
		for (let i = 0; i < 3; i++) {
			blended[i] = Math.round(color[i] * (1 - ratio) + 255 * ratio);
		}
		return blended;
	}

	private getTeamCounts(): [number, number] {
		let red = 0;
		let blue = 0;
		for (const player of this.gameEngine.playerManager.getAllPlayers()) {
			const extras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
			if (!extras) continue;
			if (extras.team === 0) red++;
			if (extras.team === 1) blue++;
		}
		return [red, blue];
	}

	private hasEnoughPlayersToStart(): boolean {
		const [red, blue] = this.getTeamCounts();
		const total = red + blue;
		return total >= config.game.minPlayersToStart && red > 0 && blue > 0;
	}

	private updateRosterState(): void {
		if (this.state === 'in_progress' && !this.hasEnoughPlayersToStart()) {
			this.endRound('insufficient');
			return;
		}

		if (this.state === 'waiting') {
			this.tryStartRound();
		}
	}

	private tryStartRound(): void {
		if (!this.hasEnoughPlayersToStart()) return;
		this.startRound();
	}

	private startRound(): void {
		this.teamScores = [0, 0];
		this.state = 'in_progress';
		this.postRoundResetTimestamp = null;
		this.roundEndTimestamp = Date.now() / 1000 + config.game.pointsToWin;
		this.gameEngine.chatManager.broadcastEventMessage('&bteam Deathmatch starting!');
		this.updateGameMessages();
	}

	private endRound(reason: 'completed' | 'insufficient'): void {
		if (this.state !== 'in_progress') return;

		if (reason === 'insufficient') {
			this.state = 'waiting';
			this.roundEndTimestamp = null;
			this.postRoundResetTimestamp = null;
			this.teamScores = [0, 0];
			this.updateGameMessages();
			return;
		}

		this.state = 'post_round';
		this.roundEndTimestamp = null;
		this.postRoundResetTimestamp = Date.now() / 1000 + config.game.respawnDelay;

		const leader = this.getLeadingTeam();
		if (leader === null) {
			this.gameEngine.chatManager.broadcastEventMessage('&eteam deathmatch round ended in a draw');

			for (const player of this.gameEngine.playerManager.getAllPlayers()) { //explode everyone
				const playerExtras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
				const color = playerExtras && playerExtras.team == 1 ? new THREE.Color(0, 0, 1) : new THREE.Color(1, 0, 0);
				this.gameEngine.playerManager.doDeathParticles(player, color);
				player.health = -50;
				player.playerSpectating = -2; //not a player ID, just watch yourself die
				player.inventory = []; //lose your items
				player.forced = true;
			}
		} else {
			const winnerName = this.TEAM_NAMES[leader];
			const winnerColor = this.TEAM_COLORS[leader];
			this.gameEngine.chatManager.broadcastEventMessage(
				`${winnerColor}${winnerName} &7team wins the round!`,
			);

			for (const player of this.gameEngine.playerManager.getAllPlayers()) { //explode losers
				const playerExtras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
				const playerWon = playerExtras && playerExtras.team === leader;
				if (playerWon) {
					this.gameEngine.serverInfo.skyColor = '#FFFFFF';
					// Schedule to unset the win announcement flag after the respawn delay and reset the game
					player.doPhysics = false;
					player.gravity = 4;
					player.forced = true;
				} else {
					const color = playerExtras && playerExtras.team == 1 ? new THREE.Color(0, 0, 1) : new THREE.Color(1, 0, 0);
					this.gameEngine.playerManager.doDeathParticles(player, color);
					player.health = -50;
					player.playerSpectating = -2; //not a player ID, just watch yourself die
					player.inventory = []; //lose your items
					player.forced = true;
				}
			}
		}

		this.updateGameMessages();
	}

	private checkRoundTimers(): void {
		const now = Date.now() / 1000;
		if (this.state === 'in_progress' && this.roundEndTimestamp && now >= this.roundEndTimestamp) {
			this.endRound('completed');
		}

		if (this.state === 'post_round' && this.postRoundResetTimestamp && now >= this.postRoundResetTimestamp) {
			this.resetForNextRound();
		}
	}

	private resetForNextRound(): void {
		this.teamScores = [0, 0];
		this.state = 'waiting';
		this.roundEndTimestamp = null;
		this.postRoundResetTimestamp = null;
		this.resetAfterWin();
		this.updateGameMessages();
		this.updateRosterState();
		this.gameEngine.serverInfo.skyColor = '#000000';
		for (const player of this.gameEngine.playerManager.getAllPlayers()) {
			player.thirdPerson = 0;
		}
	}

	private getLeadingTeam(): 0 | 1 | null {
		if (this.teamScores[0] === this.teamScores[1]) return null;
		return this.teamScores[0] > this.teamScores[1] ? 0 : 1;
	}

	private updateGameMessages(): void {
		const players = this.gameEngine.playerManager.getAllPlayers();
		if (players.length === 0) return;

		const now = Date.now() / 1000;
		const countdown = this.roundEndTimestamp ? Math.max(0, Math.ceil(this.roundEndTimestamp - now)) : 0;

		const [redScore, blueScore] = this.teamScores;
		const leadingTeam = this.getLeadingTeam();
		const scoreboardLine = `${this.TEAM_COLORS[0]}${this.TEAM_NAMES[0]} &f${redScore} &7vs ${this.TEAM_COLORS[1]}${
			this.TEAM_NAMES[1]
		} &f${blueScore}`;
		let headerMessage: string;

		let didChange = false;
		for (const player of players) {
			if (player.playerSpectating !== -1 && player.playerSpectating !== -2) continue; // don't show to spectators

			const playerTeam = this.getPlayerTeam(player);
			let color = '&7';
			let winningText = ['tied', 'tied'];
			if (leadingTeam == playerTeam) {
				color = '&a';
				winningText = ['winning', 'won'];
			} else if (leadingTeam !== null && playerTeam !== -1) {
				color = '&c';
				winningText = ['losing', 'lost'];
			}

			const roundResultMessage = leadingTeam !== null
				? `${this.TEAM_COLORS[leadingTeam]}${this.TEAM_NAMES[leadingTeam]}${color} wins the round`
				: '&eround ended in a draw';

			if (this.state === 'in_progress') {
				//headerMessage = `&eteam deathmatch: ${countdown}s remaining`;
				headerMessage = scoreboardLine;
			} else if (this.state === 'post_round' && roundResultMessage) {
				headerMessage = roundResultMessage;
			} else if (!this.hasEnoughPlayersToStart()) {
				const [red, blue] = this.getTeamCounts();
				const total = red + blue;
				headerMessage = `&6waiting for enough players to start (${total}/${config.game.minPlayersToStart})`;
			} else {
				headerMessage = '&esomething broke.';
			}

			this.gameEngine.setGameMessage(player, headerMessage, 0);
			//&7 - gray, &a - green, &c - red
			let secondLine = `${color}${countdown}s remain. (you're ${winningText[0]})`;
			if (this.state !== 'in_progress') secondLine = '';
			if (this.state == 'post_round') secondLine = `${color}your team ${winningText[1]}.`;
			this.gameEngine.setGameMessage(player, secondLine, 1);
			didChange = true;
		}

		if (didChange) this.gameEngine.playerUpdateSinceLastEmit = true;
	}

	private getPlayerTeam(player: Player) {
		const extras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
		return extras ? extras.team : -1;
	}
}
