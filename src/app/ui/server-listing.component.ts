import { Component, Input, OnChanges, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { Peer } from '../../server/models/Peer.ts';

@Component({
	selector: 'app-server-listing',
	standalone: true,
	imports: [CommonModule, NgOptimizedImage],
	template: `
		<div *ngIf="peer && peer.serverInfo">
			<div class="flex justify-between items-center">
				<div>
					<h3 class="text-gray-100 flex items-center">
						<span>{{ peer.serverInfo.name }}</span>
						<img *ngIf="peer.verificationLevel === 'candiru-official'" ngSrc="/redguy.webp" class="h-5 w-5 ml-1" title='candiru official server' alt="candiru official server" width="60" height="60">
						<img *ngIf="peer.verificationLevel === 'verified-community-server'" ngSrc="/yellowguy.webp" class="h-5 w-5 ml-1" title='verified community server' alt="verified community server" width="60" height="60">

					</h3>
					<p class="text-sm text-gray-300">
						{{ peer.serverInfo.currentPlayers }}/{{ peer.serverInfo.maxPlayers }} ·
						{{ peer.serverInfo.gameMode }} · {{ peer.serverInfo.mapName }}
					</p>
				</div>
				<button class="btn-menu" [title]="peer.serverInfo.url" (click)="join(peer.serverInfo.url)">join</button>
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
