import { Peer } from '../models/Peer.ts';
import { DataValidator } from '../DataValidator.ts';
import config from '../config.ts';

// Constants for API paths and headers
const API_HEALTHCHECK = '/api/healthcheck';
const API_GET_INFO = '/api/getInfo';
const API_SHARE_LIST = '/api/shareServerList';
const HEADER_HEALTH_SECRET = 'X-Health-Secret';
const HEADER_CONTENT_TYPE = 'Content-Type';
const CONTENT_TYPE_JSON = 'application/json';

export class PeerManager {
	peers: Peer[] = [];
	private updateQueue: string[] = [];
	private shareQueue: string[] = [];
	healthSecret: string;
	private serversFilePath = './servers.txt';
	private isOperational = false; // Flag to indicate if the manager is running
	private updateTimer: number | undefined = undefined; // Timer ID for setTimeout

	constructor() {
		this.healthSecret = crypto.randomUUID();
		this.initialize();
	}

	private async initialize() {
		const success = await this.healthCheck();
		if (success) {
			console.log('PeerManager operational.');
			this.isOperational = true;
			await this.loadServersFile();
			this.startQueueProcessor(); // Start the recursive processor
		} else {
			console.log(
				'PeerManager failed initial health check and will not start processing peers.',
			);
			this.isOperational = false;
			// Manager remains non-operational, no queues are processed.
		}
	}

	/**
	 * Performs the initial health check against the configured server URL.
	 * @returns {Promise<boolean>} True if the health check succeeds, false otherwise.
	 */
	private async healthCheck(): Promise<boolean> {
		const retries = config.peer.healthcheckRetries;
		const delay = config.peer.healthcheckInterval * 1000; // Convert seconds to ms

		for (let i = 0; i < retries; i++) {
			try {
				const response = await fetch(`${config.server.url}${API_HEALTHCHECK}`, {
					headers: { [HEADER_HEALTH_SECRET]: this.healthSecret },
				});
				if (response.ok) {
					console.log('Initial healthcheck successful.');
					return true; // Health check passed
				} else {
					console.log(
						`Healthcheck attempt ${i + 1} failed with status: ${response.status}`,
					);
				}
			} catch (error) {
				console.log(`Healthcheck attempt ${i + 1} failed with error:`, error);
			}

			if (i < retries - 1) {
				console.log(`Retrying healthcheck in ${delay / 1000} seconds...`);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}

		console.log(
			`Failed initial healthcheck after ${retries} attempts. PeerManager will not initialize fully.`,
		);
		return false; // Health check failed after all retries
	}

	private async loadServersFile() {
		try {
			const content = await Deno.readTextFile(this.serversFilePath);
			const urls = content
				.split('\n')
				.map((url) => url.trim())
				.filter((url) => url && url !== config.server.url); // Filter empty lines and self
			this.updateQueue = [...new Set(urls)]; // Ensure uniqueness
			console.log(`Loaded ${this.updateQueue.length} initial peers from ${this.serversFilePath}`);
		} catch (error) {
			if (error instanceof Deno.errors.NotFound) {
				console.log(`${this.serversFilePath} not found. Creating with default.`);
				const defaultUrl = 'https://candiru.xyz'; // Example default
				try {
					await Deno.writeTextFile(this.serversFilePath, `${defaultUrl}\n`);
					if (defaultUrl !== config.server.url) {
						this.updateQueue = [defaultUrl];
					} else {
						this.updateQueue = [];
					}
				} catch (writeError) {
					console.error(`Failed to create ${this.serversFilePath}:`, writeError);
					// Still use the default URL even if file write fails
					if (defaultUrl !== config.server.url) {
						this.updateQueue = [defaultUrl];
						console.log(`Using in-memory default peer: ${defaultUrl}`);
					} else {
						this.updateQueue = [];
					}
				}
			} else {
				console.error(`Failed to read ${this.serversFilePath}:`, error);
				this.updateQueue = []; // Start with empty queue on other read errors
			}
		}
	}

	/**
	 * Starts the main processing loop using a recursive setTimeout.
	 */
	private startQueueProcessor() {
		// Clear existing timer if any (e.g., during a restart scenario, though not strictly needed with current structure)
		if (this.updateTimer !== undefined) {
			clearTimeout(this.updateTimer);
		}
		console.log(`Starting queue processing cycle. Interval: ${config.peer.updateInterval}s`);
		this.runUpdateCycle(); // Start the first cycle immediately
	}

	/**
	 * The core recursive function for processing queues.
	 * It performs the updates and schedules the next run.
	 */
	private async runUpdateCycle() {
		if (!this.isOperational) {
			console.log('PeerManager is not operational. Skipping update cycle.');
			return; // Do not run if not operational
		}

		// Process a single item from each queue per cycle to avoid long blocks
		await this.processUpdateQueueItem();
		await this.processShareQueueItem();

		// Perform periodic checks
		this.checkStalePeers();
		// Removed call: this.clearFailedUrlCounts();

		// Schedule the next run
		this.updateTimer = setTimeout(
			() => this.runUpdateCycle(),
			config.peer.updateInterval * 1000, // Convert seconds to ms
		);
	}

	/**
	 * Processes a single URL from the update queue.
	 */
	private async processUpdateQueueItem() {
		const url = this.updateQueue.shift(); // Take one URL from the front
		if (!url) return; // Queue is empty

		try {
			const peer = this.peers.find((p) => p.url === url);
			const needsUpdate = !peer || (Date.now() / 1000 - peer.lastUpdate) > config.peer.staleThreshold;

			if (needsUpdate) {
				const response = await fetch(`${url}${API_GET_INFO}`);
				if (!response.ok) {
					throw new Error(`Failed to fetch info from ${url}, status: ${response.status}`);
				}
				const data = await response.json();
				const result = DataValidator.serverInfoSchema.safeParse(data);

				if (result.success) {
					let existingPeer = this.peers.find((p) => p.url === url);
					if (!existingPeer) {
						existingPeer = new Peer(url);
						this.peers.push(existingPeer);
						console.log(`Added new peer: ${url}`);
						await this.addToServersFile(url); // Persist new peer
					}
					existingPeer.updateServerInfo(result.data);
					// Reset failure count for the *peer* on success
					existingPeer.failedAttempts = 0;
				} else {
					console.log(`Invalid data received from ${url}:`, result.error.issues);
					this.handleFailedUpdate(url); // Treat invalid data as a failure
				}
			} else {
				// Peer exists and is not stale, put it back at the end of the queue for later processing
				this.updateQueue.push(url);
			}
		} catch (error) {
			console.log(`Error processing update queue item ${url}:`, error);
			this.handleFailedUpdate(url);
		}
	}

	/**
	 * Processes a single URL from the share queue.
	 */
	private async processShareQueueItem() {
		const url = this.shareQueue.shift(); // Take one URL from the front
		if (!url) return; // Queue is empty

		try {
			const peer = this.peers.find((p) => p.url === url);
			// Ensure peer exists and is ready for sharing
			const canShare = peer && (Date.now() / 1000 - peer.lastShare) > config.peer.shareInterval;

			if (canShare) {
				const serverList = [
					config.server.url, // Include self
					...this.peers
						.filter((p) => p.serverInfo && p.url !== url) // Filter valid peers, exclude target
						.map((p) => p.url),
				].slice(0, config.peer.maxServers); // Limit list size

				const response = await fetch(`${url}${API_SHARE_LIST}`, {
					method: 'POST',
					headers: { [HEADER_CONTENT_TYPE]: CONTENT_TYPE_JSON },
					body: JSON.stringify(serverList),
				});

				if (response.ok) {
					peer.lastShare = Date.now() / 1000; // Update last share time on success
				} else {
					console.log(`Failed to share server list with ${url}, status: ${response.status}`);
					// Note: No specific failure handling for sharing attempts currently
				}
			} else {
				// Peer not ready or doesn't exist, put back at the end for later check
				this.shareQueue.push(url);
			}
		} catch (error) {
			console.error(`Error processing share queue item ${url}:`, error);
			// Note: No specific failure handling for sharing attempts currently
		}
	}

	/**
	 * Checks all known peers and adds them to the appropriate queues if they are stale
	 * or haven't been shared with recently. Also removes peers that have failed too many times.
	 */
	private checkStalePeers() {
		const now = Date.now() / 1000; // Current time in seconds
		let removedCount = 0;

		// Filter out peers that have exceeded max failures first
		this.peers = this.peers.filter((peer) => {
			if (peer.hasExceededFailures(config.peer.maxFailedAttempts)) {
				console.log(
					`Removing peer ${peer.url} due to exceeding max failed attempts (${config.peer.maxFailedAttempts}).`,
				);
				//this.removeFromServersFile(peer.url); // Attempt to remove from persisted list
				// Also remove from queues if present
				this.updateQueue = this.updateQueue.filter((u) => u !== peer.url);
				this.shareQueue = this.shareQueue.filter((u) => u !== peer.url);
				removedCount++;
				return false; // Filter out
			}
			return true; // Keep
		});

		if (removedCount > 0) {
			console.log(`Removed ${removedCount} peers due to excessive failures.`);
		}

		// Check remaining peers for staleness and add to queues if needed
		this.peers.forEach((peer) => {
			// If stale and not already in update queue, add it
			if (
				now - peer.lastUpdate > config.peer.staleThreshold &&
				!this.updateQueue.includes(peer.url)
			) {
				this.updateQueue.push(peer.url);
			}
			// If sharing interval passed and not already in share queue, add it
			if (
				now - peer.lastShare > config.peer.shareInterval &&
				!this.shareQueue.includes(peer.url)
			) {
				this.shareQueue.push(peer.url);
			}
		});
	}

	/**
	 * Handles a failed update attempt for a URL.
	 * Increments the failure count only if it's an existing peer.
	 * @param url The URL that failed the update process.
	 */
	private handleFailedUpdate(url: string) {
		const peer = this.peers.find((p) => p.url === url);
		if (peer) {
			// Only track failures for established peers now
			peer.failedAttempts++;
			console.log(`Peer ${url} failed update. Attempt ${peer.failedAttempts}/${config.peer.maxFailedAttempts}`);
			// Removal of the peer happens in checkStalePeers based on this count.
		} else {
			// Failure occurred for a URL not currently in the active peers list.
			// No separate tracking (urlFailureCounts removed). It might be retried if still in updateQueue.
			console.log(`Update failed for URL ${url} (not an active peer).`);
		}
	}

	/**
	 * Adds a URL to the servers file, ensuring it's not the local server URL
	 * and respecting the maximum number of servers. Writes the file only if changed.
	 * @param url The URL to add.
	 */
	private async addToServersFile(url: string) {
		if (url === config.server.url) return; // Don't add self

		try {
			let content = '';
			try {
				content = await Deno.readTextFile(this.serversFilePath);
			} catch (error) {
				if (!(error instanceof Deno.errors.NotFound)) {
					throw error; // Rethrow unexpected errors
				}
				// File doesn't exist, will be created
			}

			const urls = content
				.split('\n')
				.map((u) => u.trim())
				.filter((u) => u); // Get existing, trimmed, non-empty URLs

			if (!urls.includes(url)) {
				urls.push(url); // Add the new URL

				// Ensure the list doesn't exceed the maximum size
				while (urls.length > config.peer.maxServers) {
					urls.shift(); // Remove the oldest entry (FIFO)
				}

				const newContent = urls.join('\n') + '\n'; // Add trailing newline for consistency

				// Only write if content has actually changed
				if (newContent !== content + (content.endsWith('\n') ? '' : '\n')) {
					await Deno.writeTextFile(this.serversFilePath, newContent);
					console.log(`Added ${url} to ${this.serversFilePath}`);
				}
			}
		} catch (error) {
			console.log(`Failed to add ${url} to ${this.serversFilePath}:`, error);
		}
	}

	/**
	 * Removes a URL from the servers file. Writes the file only if changed.
	 * @param url The URL to remove.
	 */
	private async removeFromServersFile(url: string) {
		if (url === config.server.url) return; // Should not happen, but safeguard

		try {
			let content = '';
			try {
				content = await Deno.readTextFile(this.serversFilePath);
			} catch (error) {
				if (error instanceof Deno.errors.NotFound) {
					console.log(`Tried to remove ${url} from non-existent ${this.serversFilePath}`);
					return; // File doesn't exist, nothing to remove
				}
				throw error; // Rethrow unexpected errors
			}

			const initialUrls = content
				.split('\n')
				.map((u) => u.trim())
				.filter((u) => u); // Get existing, trimmed, non-empty URLs

			const finalUrls = initialUrls.filter((u) => u !== url);

			// Only write if the list actually changed
			if (finalUrls.length !== initialUrls.length) {
				const newContent = finalUrls.join('\n') + '\n'; // Add trailing newline
				await Deno.writeTextFile(this.serversFilePath, newContent);
				console.log(`Removed ${url} from ${this.serversFilePath}`);
			}
		} catch (error) {
			console.error(`Failed to remove ${url} from ${this.serversFilePath}:`, error);
		}
	}

	/**
	 * Handles a list of server URLs received from another peer.
	 * Adds unknown URLs to the update queue without checking recent failures.
	 * @param urls The list of URLs received.
	 */
	public handleIncomingServers(urls: string[]) {
		if (!this.isOperational) return; // Don't process if not operational

		console.log(`Received ${urls.length} server URLs.`);
		let addedToQueue = 0;
		urls.forEach((url) => {
			// Basic validation
			if (!url || typeof url !== 'string' || !url.startsWith('http')) {
				console.log(`Received invalid URL format: ${url}`);
				return;
			}

			const trimmedUrl = url.trim();
			if (trimmedUrl === config.server.url) return; // Ignore self

			// Check if it's already known (in peers list or update queue)
			const isKnown = this.peers.some((p) => p.url === trimmedUrl) ||
				this.updateQueue.includes(trimmedUrl);

			if (!isKnown) {
				// Removed check for urlFailureCounts. Add directly if unknown.
				this.updateQueue.push(trimmedUrl);
				addedToQueue++;
			}
		});
		if (addedToQueue > 0) {
			console.log(`Added ${addedToQueue} new unique URLs to the update queue.`);
		}
	}

	/**
	 * Gracefully shuts down the PeerManager, clearing timers.
	 */
	public shutdown() {
		console.log('Shutting down PeerManager...');
		this.isOperational = false;
		if (this.updateTimer !== undefined) {
			clearTimeout(this.updateTimer);
			this.updateTimer = undefined;
		}
		// Potentially add saving state here if needed
		console.log('PeerManager shutdown complete.');
	}
}
