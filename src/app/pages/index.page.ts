import { Component, HostListener } from '@angular/core';
import { GameComponent } from '../game/game.component.ts';
import { MenuComponent } from '../ui/menu.component.ts';

@Component({
	selector: 'app-home',
	standalone: true,
	template: `
		<app-game (pointerLockChange)="onPointerLockChange($event)"></app-game>
		<app-menu [visible]="showMenu" (close)="showMenu = false"></app-menu>
	`,
	styles: ``,
	imports: [GameComponent, MenuComponent],
})
export default class HomeComponent {
	showMenu = false;

	// Add to class
	@HostListener('document:keydown', ['$event'])
	handleKeyboardEvent(event: KeyboardEvent) {
		// Escape key shows menu
		if (event.key === 'Escape') {
			this.showMenu = true;
			document.exitPointerLock();
		}

		// WASD locks pointer if menu is visible
		if (['w', 'a', 's', 'd'].includes(event.key.toLowerCase()) && this.showMenu) {
			this.showMenu = false;
			document.body.requestPointerLock();
		}
	}

	// Update pointer lock handler
	onPointerLockChange(isLocked: boolean) {
		this.showMenu = !isLocked;
		if (!isLocked) {
			document.exitPointerLock();
		}
	}
}
