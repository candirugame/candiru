import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { SettingsComponent } from './settings.component.ts';
import { BrowseComponent } from './browse.component.ts';
import { MultiplayerComponent } from './multiplayer.component.ts';
import { Networking } from '../../client/core/Networking.ts';
import { Game } from '../../client/core/Game.ts';

@Component({
	selector: 'app-menu',
	standalone: true,
	imports: [CommonModule, SettingsComponent, BrowseComponent, MultiplayerComponent, NgOptimizedImage],
	template: `
		<div *ngIf="visible" class="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50"
			 (click)="onBackdropClick($event)">
			<div class="absolute top-4 left-4 bg-gray-800/90 p-4 max-h-[calc(100vh-2rem)] overflow-y-auto"
				 [class.w-64]="activePage !== 'settings'"
				 [class.w-80]="activePage === 'settings'"
				 style="z-index: 60;"
				 (click)="$event.stopPropagation()">
				<div *ngIf="activePage === 'main'">
					<h2 class="text-xl text-gray-100 mb-4">candiru</h2>

					<button class="btn-menu" (click)="navigate('play')">play</button>
					<br>
					<button class="btn-menu" (click)="navigate('settings')">settings</button>
					<br>
					<button class="btn-menu" (click)="navigate('browse')">servers</button>
					<br>
					<button class="btn-menu" (click)="navigate('multiplayer')">splitscreen</button>


					<div class="mt-4 flex gap-0">

						<a href="https://github.com/candirugame/candiru" target="_blank" rel="noopener noreferrer"
						   class="p-1.5 inline-flex items-center opacity-75 hover:opacity-100 transition-opacity hover:bg-gray-700/50 rounded-md">
							<img ngSrc="/icons/github-mark-white.svg" class="h-6 w-6" width="24" height="24" alt="GitHub">
						</a>
						<a href="https://candiru.xyz" target="_blank" rel="noopener noreferrer"
						   class="p-1.5 inline-flex items-center opacity-75 hover:opacity-100 transition-opacity hover:bg-gray-700/50 rounded-md">
							<img ngSrc="/icons/link-solid.svg" class="h-6 w-6" width="24" height="24"
								 alt="Candiru">
						</a>
						<a href="https://discord.gg/7tjBDYaBVn" target="_blank" rel="noopener noreferrer"
						   class="p-1.5 inline-flex items-center opacity-75 hover:opacity-100 transition-opacity hover:bg-gray-700/50 rounded-md">
							<img ngSrc="/icons/discord-mark-white.svg" class="h-6 w-6" width="24" height="24"
								 alt="Discord">
						</a>
						<a href="mailto:team@candiru.xyz" target="_blank" rel="noopener noreferrer"
						   class="p-1.5 inline-flex items-center opacity-75 hover:opacity-100 transition-opacity hover:bg-gray-700/50 rounded-md">
							<img ngSrc="/icons/envelope-solid.svg" class="h-6 w-6" width="24" height="24"
								 alt="Email">
						</a>

					</div>

				</div>

				<app-settings *ngIf="activePage === 'settings'"
							  class="h-full overflow-y-auto"
							  (back)="activePage = 'main'"></app-settings>
				<app-browse *ngIf="activePage === 'browse'"
							class="h-full overflow-y-auto"
							[networking]="networking"
							(back)="activePage = 'main'"></app-browse>
				<app-multiplayer *ngIf="activePage === 'multiplayer'"
							class="h-full overflow-y-auto"
							(back)="activePage = 'main'"
							(setGameCount)="setGameCount($event)"></app-multiplayer>

			</div>
		</div>
	`,
	styleUrls: ['./menu-styles.css'],
})
export class MenuComponent {
	@Input()
	visible = false;
	@Input()
	networking: Networking | undefined;
	@Output()
	close = new EventEmitter<void>();
	@Output()
	menuVisibilityChange = new EventEmitter<boolean>();
	@Output()
	resetGameRequest = new EventEmitter<void>();
	@Output()
	changeGameCount = new EventEmitter<number>();

	activePage: 'main' | 'settings' | 'browse' | 'multiplayer' = 'main';
	gameCount = 1;

	ngOnChanges() {
		this.menuVisibilityChange.emit(this.visible);
	}

	onBackdropClick(event: MouseEvent) {
		if ((event.target as HTMLElement).classList.contains('fixed')) {
			this.close.emit();
			this.activePage = 'main';
		}
	}

	navigate(page: 'settings' | 'browse' | 'play' | 'multiplayer') {
		if (page === 'play') {
			this.close.emit();
			document.body.requestPointerLock();
			return;
		}
		this.activePage = page;
	}

	setGameCount(count: number) {
		Game.nextGameIndex = 0;
		this.gameCount = count;
		this.changeGameCount.emit(this.gameCount);
		this.close.emit();
		this.activePage = 'main';
	}
}
