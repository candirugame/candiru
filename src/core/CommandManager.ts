import {Player} from "./Player.ts";
import {ChatOverlay} from "../ui/ChatOverlay.ts";
import {SettingsManager} from "./SettingsManager.ts";

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
        this.commands.push(new Command('sense', (args: string[]): string => {
            if (args[1] == null) {
                return "Sensitivity is currently " + (SettingsManager.settings.sense * 500);
            }
            const sense: number = Number(args[1]);
            if (sense > 0 && sense <= 10) {
                SettingsManager.settings.sense = sense / 500;
                SettingsManager.write();
                return "Sensitivity is now set to " + (sense);
            } else {
                return "Sensitivity is not in the valid range of 0 to 10";
            }
        }));

        this.commands.push(new Command('resetSettings', (): string => {
            SettingsManager.reset();
            SettingsManager.write();
            return "Settings have been reverted to their default states";
        }));

        this.commands.push(new Command('crosshairColor', (args: string[]): string => {
            if (!(args[1] && args[2] && args[3])) {
                return 'Not an rgb value'
            }

            for (let i = 1; i < args.length; i++) {
                if(Number(args[i]) < 0 || Number(args[i]) > 255) {
                    return args[i] + ' is not in range 0-255';
                }
            }

            SettingsManager.settings.crosshairColor = '#' + componentToHex(Number(args[1])) + componentToHex(Number(args[2])) + componentToHex(Number(args[3]));
            SettingsManager.settings.crosshairColorFlashing = invertRGB(Number(args[1]), Number(args[2]), Number(args[3]));
            SettingsManager.write();
            return 'Crosshair color set'
        }));

        this.commands.push(new Command('crosshairType', (args: string[]): string => {
            if (args[1] == 'cross') SettingsManager.settings.crosshairType = 0;
            else if (args[1] == 'dot') SettingsManager.settings.crosshairType = 1;
            else return 'not a valid type (dot or cross)';
            SettingsManager.write();
            return 'Crosshair type set'
        } ));
    }

    public runCmd(cmd: string): boolean {
        let match: boolean = false;
        const args: string[] = cmd.substring(1).split(" ")
        for (let i = 0; i < this.commands.length; i++) {
            if (args[0].toLowerCase() === this.commands[i].getCmdName()) {
                match = true;
                const msg = this.commands[i].run(args);

                const chatMessage = {
                    id: this.localPlayer.id,
                    name: '',
                    message: cmd + " -> " + msg
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
    return hex.length === 1 ? "0" + hex : hex;
}

function rgbToHex(r: number, g: number, b: number): string {
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

function invertRGB(r: number, g: number, b: number, a?: number): string {
    const rgb = [r, g, b, a].map((value, index) => {
        return index === 3 ? (a !== undefined ? 1 - Number(value) : 1) : 255 - Number(value);
    });
    return rgbToHex(rgb[0], rgb[1], rgb[2]);
}