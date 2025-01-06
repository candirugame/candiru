// game.component.ts
import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { Game } from '../../client/core/Game.ts';

@Component({
	selector: 'app-game',
	templateUrl: './game.component.html',
	standalone: true,
})
export class GameComponent implements AfterViewInit {
	@ViewChild('rendererContainer')
	rendererContainer!: ElementRef;
	private game?: Game;

	ngAfterViewInit() {
		this.game = new Game(this.rendererContainer.nativeElement);
		this.game.start();
	}

	ngOnDestroy() {
		// Add cleanup if needed
	}
}
