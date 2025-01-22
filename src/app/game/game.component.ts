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

	ngAfterViewInit() {
		this.game = new Game(this.rendererContainer.nativeElement);
		this.game.start();

		// Listen to pointer lock changes
		document.addEventListener('pointerlockchange', () => {
			this.pointerLockChange.emit(document.pointerLockElement === document.body);
		});
	}
}
