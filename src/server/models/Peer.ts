import { ServerInfo } from './ServerInfo.ts';

export class Peer {
	public url: string;
	public serverInfo?: ServerInfo;
	public lastUpdate: number = 0;
	public failedAttempts: number = 0;
	public lastShare: number = 0;

	constructor(url: string) {
		this.url = url;
	}

	updateServerInfo(info: ServerInfo) {
		this.serverInfo = info;
		this.lastUpdate = Date.now() / 1000;
		this.failedAttempts = 0;
	}

	isStale(threshold: number) {
		return (Date.now() / 1000 - this.lastUpdate) > threshold;
	}

	hasExceededFailures(max: number) {
		return this.failedAttempts >= max;
	}
}
