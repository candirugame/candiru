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
        this.commands.push(new Command('controllerSense', (args: string[]): string => {
            if (args[1] == null) {
                return "Controller sensitivity is currently " + (SettingsManager.settings.controllerSense);
            }
            const sense = Number(args[1]);
            if (Number.isNaN(sense)) {
                return args[1] + " is not a number";
            }
            if (sense > 10 || sense <= 0) {
                return "Controller sensitivity is not in the valid range of 0 to 10";
            }
            SettingsManager.settings.controllerSense = sense;
            SettingsManager.write();
            return "Controller sensitivity is now set to " + (sense);
        }));
    }

    public runCmd(cmd: string): boolean {
        let match: boolean = false;
        const args: string[] = cmd.substring(1).split(" ")
        for (let i = 0; i < this.commands.length; i++) {
            if (args[0] === this.commands[i].getCmdName()) {
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
        this.cmdName = cmd;
        this.func = func;
    }
    public run(args: string[]): string {
        return this.func(args);
    }

    public getCmdName() {
        return this.cmdName;
    }
}