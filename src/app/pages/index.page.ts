import { Component } from '@angular/core';
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

	onPointerLockChange(isLocked: boolean) {
		this.showMenu = !isLocked;
	}
}
