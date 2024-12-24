import config from "../config.ts";

export class ServerInfo {
    public name: string;
    public maxPlayers: number;
    public currentPlayers: number;
    public mapName: string;
    public tickRate: number;
    public version: string;
    public gameMode: string;
    constructor() {
        this.name = config.server.name;
        this.maxPlayers = config.game.maxPlayers;
        this.currentPlayers = 0;
        this.mapName = config.server.defaultMap;
        this.tickRate = config.server.tickRate;
        this.version = '';
        this.gameMode = config.game.mode;
    }
}