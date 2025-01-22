import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SettingsComponent } from './settings.component.ts';
import { BrowseComponent } from './browse.component.ts';

@Component({
	selector: 'app-menu',
	standalone: true,
	imports: [CommonModule, SettingsComponent, BrowseComponent],
	template: `
		<div *ngIf="visible" class="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50"
			 (click)="onBackdropClick($event)">
			<div class="absolute top-4 left-4 bg-gray-800/90 p-4 w-64 max-h-[calc(100vh-2rem)] overflow-y-auto"
				 style="z-index: 60;"
				 (click)="$event.stopPropagation()">
				<div *ngIf="activePage === 'main'">
					<button class="btn-menu" (click)="navigate('play')">play</button>
					<button class="btn-menu" (click)="navigate('settings')">settings</button>
					<button class="btn-menu" (click)="navigate('browse')">possum net</button>
				</div>

				<app-settings *ngIf="activePage === 'settings'"
							  class="h-full overflow-y-auto"
							  (back)="activePage = 'main'"></app-settings>
				<app-browse *ngIf="activePage === 'browse'"
							class="h-full overflow-y-auto"
							(back)="activePage = 'main'"></app-browse>
			</div>
		</div>
	`,
	styles: [`
		:host {
			@apply contents;
		}
		.fixed {
			@apply overflow-hidden;
		}
		.btn-menu {
			@apply w-full text-left px-4 py-2 text-gray-100 hover:bg-gray-700/50 transition-colors mb-2;
			border-radius: 0;
		}
	`],
})
export class MenuComponent {
	@Input()
	visible = false;
	@Output()
	close = new EventEmitter<void>();
	activePage: 'main' | 'settings' | 'browse' = 'main';

	onBackdropClick(event: MouseEvent) {
		if ((event.target as HTMLElement).classList.contains('fixed')) {
			this.close.emit();
			this.activePage = 'main';
		}
	}

	navigate(page: 'settings' | 'browse' | 'play') {
		if (page === 'play') {
			this.close.emit();
			document.body.requestPointerLock();
			return;
		}
		this.activePage = page;
	}
}
