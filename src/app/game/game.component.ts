import { AfterViewInit, Component, ElementRef, EventEmitter, Output, ViewChild } from '@angular/core';
import { Game } from '../../client/core/Game.ts';

@Component({
	selector: 'app-game',
	templateUrl: './game.component.html',
	standalone: true,
})
export class GameComponent implements AfterViewInit {
	@ViewChild('rendererContainer')
	rendererContainer!: ElementRef;
	@Output()
	pointerLockChange = new EventEmitter<boolean>();
	private game?: Game;

	// Expose the Networking instance
	get networking() {
		return this.game?.networking;
	}

	ngAfterViewInit() {
		this.game = new Game(this.rendererContainer.nativeElement);
		this.game.start();

		document.addEventListener('pointerlockchange', () => {
			const isLocked = document.pointerLockElement === document.body;
			this.pointerLockChange.emit(isLocked);
		});
	}

	// Method to update the game about menu visibility
	onMenuVisibilityChange(isMenuOpen: boolean) {
		if (this.game) {
			this.game.setMenuOpen(isMenuOpen);
		}
	}
}
