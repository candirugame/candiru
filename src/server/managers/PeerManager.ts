import { Peer } from '../models/Peer.ts';
import { DataValidator } from '../DataValidator.ts';
import config from '../config.ts';

export class PeerManager {
	peers: Peer[] = [];
	private updateQueue: string[] = [];
	private shareQueue: string[] = [];
	private urlFailureCounts = new Map<string, number>();
	healthSecret: string;
	private serversFilePath = './servers.txt';

	constructor() {
		this.healthSecret = crypto.randomUUID();
		this.initialize();
	}

	private async initialize() {
		await this.healthCheck();
	}

	private async healthCheck() {
		const retries = config.peer.healthcheckRetries;
		const delay = config.peer.healthcheckInterval * 1000;

		for (let i = 0; i < retries; i++) {
			try {
				const response = await fetch(`${config.server.url}/api/healthcheck`, {
					headers: { 'X-Health-Secret': this.healthSecret },
				});
				if (response.ok) {
					console.log('healthcheck success!!');
					await this.loadServersFile();
					this.startQueueProcessors();
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
			this.updateQueue = content
				.split('\n')
				.filter((url) => url.trim() && url !== config.server.url);
		} catch {
			await Deno.writeTextFile(this.serversFilePath, 'https://bridge.candiru.xyz\n');
			this.updateQueue = ['https://bridge.candiru.xyz'];
		}
	}

	private startQueueProcessors() {
		setInterval(() => this.updateQueues(), config.peer.updateInterval * 1000);
	}

	private updateQueues() {
		this.processUpdateQueue();
		this.processShareQueue();
		this.checkStalePeers();
	}

	private async processUpdateQueue() {
		const url = this.updateQueue.shift();
		if (!url) return;

		try {
			const peer = this.peers.find((p) => p.url === url);
			const needsUpdate = !peer || (Date.now() / 1000 - peer.lastUpdate) > config.peer.staleThreshold;

			if (needsUpdate) {
				const response = await fetch(`${url}/api/getInfo`);
				const data = await response.json();
				const result = DataValidator.serverInfoSchema.safeParse(data);

				if (result.success) {
					if (!peer) {
						const newPeer = new Peer(url);
						this.peers.push(newPeer);
						console.log(`added peer: ${url}`);
						await this.addToServersFile(url);
					}
					peer?.updateServerInfo(result.data);
					console.log(`updated peer: ${url}`);
					this.urlFailureCounts.delete(url);
				} else {
					this.handleFailedUpdate(url);
				}
			}
		} catch {
			this.handleFailedUpdate(url);
		}
	}

	private async processShareQueue() {
		const url = this.shareQueue.shift();
		if (!url) return;

		try {
			const peer = this.peers.find((p) => p.url === url);
			const canShare = !peer || (Date.now() / 1000 - peer.lastShare) > config.peer.shareInterval;

			if (canShare) {
				const serverList = [
					config.server.url,
					...this.peers
						.filter((p) => p.serverInfo && p.url !== config.server.url)
						.map((p) => p.url),
				].slice(0, config.peer.maxServers);

				await fetch(`${url}/api/shareServerList`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(serverList),
				});

				if (peer) peer.lastShare = Date.now() / 1000;
				console.log(`shared server list with ${url}`);
			}
		} catch (err) {
			console.error(`Failed to share server list with ${url}:`, err);
		}
	}

	private checkStalePeers() {
		const now = Date.now() / 1000;
		this.peers.forEach((peer) => {
			if (now - peer.lastUpdate > config.peer.staleThreshold) {
				this.updateQueue.push(peer.url);
			}
			if (now - peer.lastShare > config.peer.shareInterval) {
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
				this.removeFailedPeer(url);
			}
		} else {
			const newCount = (this.urlFailureCounts.get(url) || 0) + 1;
			this.urlFailureCounts.set(url, newCount);

			if (newCount >= config.peer.maxFailedAttempts) {
				this.updateQueue = this.updateQueue.filter((u) => u !== url);
			}
		}
	}

	private removeFailedPeer(url: string) {
		this.peers = this.peers.filter((p) => p.url !== url);
		this.updateQueue = this.updateQueue.filter((u) => u !== url);
		console.log(`removed peer from active list: ${url}`);
	}

	private async addToServersFile(url: string) {
		if (url === config.server.url) return;

		const current = await Deno.readTextFile(this.serversFilePath);
		const urls = current.split('\n').filter((u) => u.trim());

		if (!urls.includes(url)) {
			urls.push(url);
			if (urls.length > config.peer.maxServers) urls.shift();
			await Deno.writeTextFile(this.serversFilePath, urls.join('\n'));
		}
	}

	public handleIncomingServers(urls: string[]) {
		console.log('Received server list:', urls);
		urls.forEach((url) => {
			if (url === config.server.url) return;

			if (
				!this.updateQueue.includes(url) &&
				!this.peers.some((p) => p.url === url)
			) {
				this.updateQueue.push(url);
			}
		});
	}
}
