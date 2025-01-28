import { Peer } from '../models/Peer.ts';
import { DataValidator } from '../DataValidator.ts';
import config from '../config.ts';
import { ServerInfo } from '../models/ServerInfo.ts';

export class PeerManager {
	private peers: Peer[] = [];
	private updateQueue: string[] = [];
	private shareQueue: string[] = [];
	healthSecret: string;
	private serversFilePath = './servers.txt';

	constructor() {
		this.healthSecret = crypto.randomUUID();
		this.initialize();
	}

	private async initialize() {
		await this.healthCheck();
		await this.loadServersFile();
		this.startQueueProcessors();
	}

	private async healthCheck() {
		const retries = config.peer.healthcheckRetries;
		const delay = config.server.cleanupInterval;

		for (let i = 0; i < retries; i++) {
			try {
				const response = await fetch(`${config.server.url}/api/healthcheck`, {
					headers: { 'X-Health-Secret': this.healthSecret },
				});
				if (response.ok) {
					console.log('healthcheck success!!');
					return;
				}
			} catch {
				console.error('Healthcheck failed');
			}

			if (i < retries - 1) await new Promise((r) => setTimeout(r, delay));
		}

		console.error('Failed healthcheck after retries');
	}

	private async loadServersFile() {
		try {
			const content = await Deno.readTextFile(this.serversFilePath);
			this.updateQueue = content.split('\n').filter((url) => url.trim());
		} catch {
			await Deno.writeTextFile(this.serversFilePath, 'https://bridge.candiru.xyz\n');
			this.updateQueue = ['https://bridge.candiru.xyz'];
		}
	}

	private startQueueProcessors() {
		setInterval(() => this.processUpdateQueue(), config.peer.updateInterval * 1000);
		setInterval(() => this.processShareQueue(), config.peer.shareInterval * 1000);
		setInterval(() => this.checkStalePeers(), config.server.cleanupInterval);
	}

	private async processUpdateQueue() {
		const url = this.updateQueue.shift();
		if (!url) return;

		try {
			const response = await fetch(`${url}/api/getInfo`);
			const data = await response.json();
			const result = DataValidator.serverInfoSchema.safeParse(data);

			if (result.success) {
				let peer = this.peers.find((p) => p.url === url);
				if (!peer) {
					peer = new Peer(url);
					this.peers.push(peer);
					console.log(`Added peer: ${url}`);
					await this.addToServersFile(url);
				}
				peer.updateServerInfo(result.data);
			} else {
				console.log(`failed to add peer ${url}`);

				this.handleFailedUpdate(url);
			}
		} catch {
			this.handleFailedUpdate(url);
		} finally {
			this.updateQueue.push(url);
		}
	}

	private async processShareQueue() {
		const url = this.shareQueue.shift();
		if (!url) return;

		try {
			const serverList = this.peers
				.filter((p) => p.serverInfo)
				.map((p) => p.url)
				.slice(0, config.peer.maxServers);

			await fetch(`${url}/api/shareServerList`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(serverList),
			});
		} finally {
			this.shareQueue.push(url);
		}
	}

	private checkStalePeers() {
		const stalePeers = this.peers.filter((p) =>
			p.isStale(config.peer.staleThreshold) ||
			(Date.now() / 1000 - p.lastShare) > config.peer.shareInterval * 1000
		);

		stalePeers.forEach((peer) => {
			if (peer.isStale(config.peer.staleThreshold)) {
				this.updateQueue.push(peer.url);
			}
			if ((Date.now() / 1000 - peer.lastShare) > config.peer.shareInterval * 1000) {
				this.shareQueue.push(peer.url);
			}
		});

		this.peers = this.peers.filter((p) => !p.hasExceededFailures(config.peer.maxFailedAttempts));
	}

	private handleFailedUpdate(url: string) {
		const peer = this.peers.find((p) => p.url === url);
		if (peer) {
			peer.failedAttempts++;
			if (peer.hasExceededFailures(config.peer.maxFailedAttempts)) {
				this.peers = this.peers.filter((p) => p.url !== url);
			}
		}
	}

	private async addToServersFile(url: string) {
		const current = await Deno.readTextFile(this.serversFilePath);
		const urls = current.split('\n').filter((u) => u.trim());

		if (!urls.includes(url)) {
			urls.push(url);
			if (urls.length > config.peer.maxServers) urls.shift();
			await Deno.writeTextFile(this.serversFilePath, urls.join('\n'));
		}
	}

	public handleIncomingServers(urls: string[]) {
		urls.forEach((url) => {
			if (
				!this.updateQueue.includes(url) &&
				!this.peers.some((p) => p.url === url)
			) {
				this.updateQueue.push(url);
			}
		});
	}
}
