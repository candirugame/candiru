import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Networking } from '../../client/core/Networking.ts';
import { Peer } from '../../server/models/Peer.ts';
import { ServerListingComponent } from './server-listing.component.ts';

@Component({
	selector: 'app-browse',
	standalone: true,
	imports: [CommonModule, ServerListingComponent],
	template: `
		<div>
			<h2 class="text-xl text-gray-100">internet (for possum)</h2>
			<h3 class="text-gray-300 text-sm mb-4 ">connected
				to {{ networking?.getServerInfo()?.name ?? 'unknown server :(' }}</h3>

			<div class="space-y-2">
				<div *ngFor="let peer of peers" class="bg-gray-700/50 p-3 ">
						<app-server-listing [peer]="peer"></app-server-listing>
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

	peers: Peer[] = [];
	private refreshInterval: number | undefined; // Store the interval ID

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
			this.peers = servers;
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
