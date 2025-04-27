import { Component, Input, OnChanges, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Peer } from '../../server/models/Peer.ts';

@Component({
	selector: 'app-server-listing',
	standalone: true,
	imports: [CommonModule],
	template: `
		<div *ngIf="peer && peer.serverInfo">
			<div class="flex justify-between items-center">
				<div>
					<h3 class="text-gray-100">{{ peer.serverInfo.name }}</h3>
					<p class="text-sm text-gray-300">
						{{ peer.serverInfo.currentPlayers }}/{{ peer.serverInfo.maxPlayers }} ·
						{{ peer.serverInfo.gameMode }} · {{ peer.serverInfo.mapName }}
					</p>
				</div>
				<button class="btn-menu" (click)="join(peer.serverInfo.url)">join</button>
			</div>
			<div class="text-xs text-gray-400 mt-1">
				v{{ peer.serverInfo.version }} · {{ peer.serverInfo.tickRate }}Hz
			</div>
		</div>

	`,
	styleUrls: ['./menu-styles.css'],
})
export class ServerListingComponent implements OnChanges, OnInit, OnDestroy {
	@Input()
	peer: Peer | undefined;

	ngOnInit() {
	}

	ngOnDestroy() {
	}

	ngOnChanges() {
	}

	join(url: string) {
		globalThis.location.href = url;
	}
}
