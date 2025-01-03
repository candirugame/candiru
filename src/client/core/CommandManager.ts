import { ChatOverlay } from '../ui/ChatOverlay.ts';
import { SettingsManager } from './SettingsManager.ts';
import { Player } from '../../shared/Player.ts';

export class CommandManager {
	private localPlayer: Player;
	private chatOverlay: ChatOverlay;
	private readonly commands: Command[];

	constructor(localPlayer: Player, chatOverlay: ChatOverlay) {
		this.localPlayer = localPlayer;
		this.chatOverlay = chatOverlay;
		this.commands = [];
		this.init();
	}

	public init() {
		this.commands.push(
			new Command('sense', (args: string[]): string => {
				if (args[1] == null) {
					return 'sensitivity is currently ' + (SettingsManager.settings.sense);
				}
				const sense: number = Number(args[1]);
				if (Number.isNaN(sense)) {
					return args[1] + ' is not a number';
				}
				if (sense > 10 || sense <= 0) {
					return 'sensitivity is not in the valid range of 0 to 10';
				}
				SettingsManager.settings.sense = sense;
				SettingsManager.write();
				return 'sensitivity is now set to ' + sense;
			}),
		);

		this.commands.push(
			new Command('resetSettings', (): string => {
				SettingsManager.reset();
				SettingsManager.write();
				return 'settings have been reverted to their default states';
			}),
		);

		this.commands.push(
			new Command('controllerSense', (args: string[]): string => {
				if (args[1] == null) {
					return 'controller sensitivity is currently ' + (SettingsManager.settings.controllerSense);
				}
				const sense = Number(args[1]);
				if (Number.isNaN(sense)) {
					return args[1] + ' is not a number';
				}
				if (sense > 10 || sense <= 0) {
					return 'controller sensitivity is not in the valid range of 0 to 10';
				}
				SettingsManager.settings.controllerSense = sense;
				SettingsManager.write();
				return 'controller sensitivity is now set to ' + sense;
			}),
		);

		this.commands.push(
			new Command('crosshairColor', (args: string[]): string => {
				if ((args[1] && args[2] && args[3])) {
					for (let i = 1; i < args.length; i++) {
						if (Number.isNaN(Number(args[i]))) return args[i] + ' is not a number';
						if (Number(args[i]) < 0 || Number(args[i]) > 255) {
							return args[i] + ' is not in range 0-255';
						}
					}
					SettingsManager.settings.crosshairColor = '#' + componentToHex(Number(args[1])) +
						componentToHex(Number(args[2])) + componentToHex(Number(args[3]));
				} else if (args[1]) {
					const color: string | null = cssToHex(args[1]);
					if (!color) {
						return args[1] + ' is not a valid color';
					}
					SettingsManager.settings.crosshairColor = color;
				} else {
					return 'invalid input';
				}
				SettingsManager.write();
				return 'crosshair color set to ' + SettingsManager.settings.crosshairColor;
			}),
		);

		this.commands.push(
			new Command('crosshairType', (args: string[]): string => {
				if (args[1] == 'cross') SettingsManager.settings.crosshairType = 0;
				else if (args[1] == 'dot') SettingsManager.settings.crosshairType = 1;
				else return 'not a valid type (dot or cross)';
				SettingsManager.write();
				return 'crosshair type set to ' + args[1];
			}),
		);

		this.commands.push(
			new Command('bobbing', (args: string[]): string => {
				const bobbing = Number(args[1]);
				if (Number.isNaN(bobbing)) {
					return args[1] + ' is not a number';
				}
				if (bobbing < 0 || bobbing > 2) {
					return args[1] + ' is not in range 0 to 2';
				}
				SettingsManager.settings.viewBobbingStrength = bobbing;
				SettingsManager.write();
				return 'view bobbing strength is now set to ' + args[1];
			}),
		);

		this.commands.push(
			new Command('prettyText', (args: string[]): string => {
				if (args[1] == null) return 'prettyText is currently ' + SettingsManager.settings.doPrettyText;
				if (args[1] == 'true') SettingsManager.settings.doPrettyText = true;
				else if (args[1] == 'false') SettingsManager.settings.doPrettyText = false;
				else return 'invalid input (true/false)';
				SettingsManager.write();
				return 'prettyText set to ' + args[1];
			}),
		);
	}

	public runCmd(cmd: string): boolean {
		let match: boolean = false;
		const args: string[] = cmd.substring(1).split(' ');
		for (let i = 0; i < this.commands.length; i++) {
			if (args[0].toLowerCase() === this.commands[i].getCmdName()) {
				match = true;
				const msg = this.commands[i].run(args);

				const chatMessage = {
					id: this.localPlayer.id,
					name: '',
					message: cmd + ' -> ' + msg,
				};

				this.chatOverlay.addChatMessage(chatMessage);
				break;
			}
		}
		return match;
	}
}

class Command {
	private readonly cmdName: string;
	private readonly func: (args: string[]) => string;
	constructor(cmd: string, func: (args: string[]) => string) {
		this.cmdName = cmd.toLowerCase();
		this.func = func;
	}
	public run(args: string[]): string {
		return this.func(args);
	}

	public getCmdName() {
		return this.cmdName;
	}
}

function componentToHex(c: number): string {
	const hex = c.toString(16);
	return hex.length === 1 ? '0' + hex : hex;
}

function cssToHex(color: string) {
	// Create a dummy div to get computed color style
	if (!isColor(color)) return null;
	const div = document.createElement('div');
	div.style.color = color;
	document.body.appendChild(div);
	const computedColor = getComputedStyle(div).color;
	document.body.removeChild(div);

	// Extract rgb values
	const rgbMatch = computedColor.match(/\d+/g);
	if (rgbMatch) {
		const [r, g, b] = rgbMatch.map(Number);
		return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
	}
	return null;
}

function isColor(strColor: string) {
	const s = new Option().style;
	s.color = strColor;
	// If the color is recognized, s.color won't be empty
	return s.color !== '';
}
