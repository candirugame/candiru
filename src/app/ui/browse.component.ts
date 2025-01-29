import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Networking, ServerInfo } from '../../client/core/Networking.ts';

@Component({
	selector: 'app-browse',
	standalone: true,
	imports: [CommonModule],
	template: `
		<div>
			<h2 class="text-xl text-gray-100">internet (for possum)</h2>
			<h3 class="text-gray-300 text-sm mb-4 ">connected to {{ networking?.getServerInfo()?.name ?? 'unknown server :(' }}</h3>

			<div class="space-y-2">
				<div *ngFor="let server of servers" class="bg-gray-700/50 p-3 ">
					<div class="flex justify-between items-center">
						<div>
							<h3 class="text-gray-100">{{ server.info.name }}</h3>
							<p class="text-sm text-gray-300">
								{{ server.info.currentPlayers }}/{{ server.info.maxPlayers }} ·
								{{ server.info.gameMode }} · {{ server.info.mapName }}
							</p>
						</div>
						<button class="btn-menu" (click)="join(server.url)">join</button>
					</div>
					<div class="text-xs text-gray-400 mt-1">
						v{{ server.info.version }} · {{ server.info.tickRate }}Hz
					</div>
				</div>
			</div>

			<button class="btn-menu mt-4 mr-2" (click)="back.emit()">back</button>
			<button class="btn-menu mb-4" (click)="refresh()">refresh</button>

		</div>
	`,
	styleUrls: ['./menu-styles.css'],
})
export class BrowseComponent implements OnChanges, OnInit, OnDestroy {
	@Output()
	back = new EventEmitter<void>();
	@Input() // Accept Networking as an input
	networking: Networking | undefined;

	servers: Array<{ url: string; info: ServerInfo }> = [];
	private refreshInterval: any; // Store the interval ID

	ngOnInit() {
		// Start the auto-refresh timer when the component is initialized
		this.startAutoRefresh();
	}

	ngOnDestroy() {
		// Clear the interval when the component is destroyed
		this.stopAutoRefresh();
	}

	ngOnChanges(changes: SimpleChanges) {
		if (changes['networking'] && this.networking) {
			this.refresh();
		}
	}

	refresh() {
		if (!this.networking) {
			console.log('no networking');
			return;
		}

		this.networking.fetchServerList((servers) => {
			this.servers = servers;
		});
	}

	join(url: string) {
		globalThis.location.href = url;
	}

	private startAutoRefresh() {
		// Refresh every 30 seconds (30000 milliseconds)
		this.refreshInterval = setInterval(() => {
			this.refresh();
		}, 30000);
	}

	private stopAutoRefresh() {
		// Clear the interval to stop auto-refreshing
		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
		}
	}
}
