import {Player} from "./Player.ts";
import {PointerLockControls} from "../input/PointerLockControl.ts";
import {ChatOverlay} from "../ui/ChatOverlay.ts";

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
        this.commands.push(new Command('sensitivity', (args: string[]) => {
            const sense: number = Number(args[1]);
            if (sense > 0 && sense <= 1) {
                PointerLockControls.setSensitivity(sense);
                return "Sensitivity is now set to " + sense;
            } else {
                return "Sensitivity is not in the valid range of 0 to 1"
            }
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