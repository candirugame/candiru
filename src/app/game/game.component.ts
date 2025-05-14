import { Component, ElementRef, EventEmitter, HostListener, Output, ViewChild } from '@angular/core';
import { Game } from '../../client/core/Game.ts';

@Component({
	selector: 'app-game',
	templateUrl: './game.component.html',
	standalone: true,
})
export class GameComponent {
	@ViewChild('rendererContainer')
	rendererContainer!: ElementRef;
	@Output()
	pointerLockChange = new EventEmitter<boolean>();
	private game?: Game;
	private initialized = false;

	// Expose the Networking instance
	get networking() {
		return this.game?.networking;
	}

	ngAfterViewInit() {
		if (!this.initialized && this.rendererContainer) {
			this.startGame(this.rendererContainer.nativeElement);
		}
	}

	ngOnDestroy() {
		this.destroy();
	}

	// Method to initialize the game with a container element
	init(containerElement: HTMLElement) {
		this.startGame(containerElement);
		this.initialized = true;
	}

	// Start game with the provided container
	private startGame(container: HTMLElement) {
		this.game = new Game(container);
		this.game.start();

		document.addEventListener('pointerlockchange', () => {
			const isLocked = document.pointerLockElement === document.body;
			this.pointerLockChange.emit(isLocked);
		});
	}

	// Method to destroy and clean up the game
	destroy() {
		if (this.game) {
			this.game.destroy();
			this.game = undefined;
		}
	}

	// Method to update the game about menu visibility
	onMenuVisibilityChange(isMenuOpen: boolean) {
		if (this.game) {
			this.game.setMenuOpen(isMenuOpen);
		}
	}

	// Public method to trigger a resize that can be called from parent components
	public onResize() {
		if (this.game) {
			this.game.resizeRenderer();
		}
	}

	// Private method for the window resize listener
	@HostListener('window:resize')
	private handleWindowResize() {
		this.onResize();
	}
}
