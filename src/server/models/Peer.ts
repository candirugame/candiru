import { ServerInfo } from './ServerInfo.ts';

export class Peer {
	public url: string;
	public serverInfo?: ServerInfo;
	public lastUpdate: number = 0;
	public failedAttempts: number = 0;
	public lastShare: number = 0;
	public verificationLevel: 'candiru-official' | 'verified-community-server' | 'unverified' = 'unverified';

	constructor(url: string) {
		this.url = url;
		this.updateVerificationLevel();
	}

	updateServerInfo(info: ServerInfo) {
		this.serverInfo = info;
		this.lastUpdate = Date.now() / 1000;
		this.failedAttempts = 0;
	}

	updateVerificationLevel() {
		const hostname = new URL(this.url).hostname;
		if (hostname.endsWith('candiru.xyz')) {
			this.verificationLevel = 'candiru-official';
		}
	}

	isStale(threshold: number) {
		return (Date.now() / 1000 - this.lastUpdate) > threshold;
	}

	hasExceededFailures(max: number) {
		return this.failedAttempts >= max;
	}
	toJSON() {
		return {
			...this,
		};
	}
}
