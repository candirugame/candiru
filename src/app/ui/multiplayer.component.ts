import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
	selector: 'app-multiplayer',
	standalone: true,
	imports: [CommonModule],
	template: `
		<div>
			<h2 class="text-xl text-gray-100 mb-4">splitscreen</h2>
				<button class="btn-menu space-y-2" (click)="selectGameCount(1)">1 player</button>
				<br>
				<button class="btn-menu space-y-2" (click)="selectGameCount(2)">2 players</button>
				<br>
				<button class="btn-menu space-y-2" (click)="selectGameCount(3)">3 players</button>
				<br>
				<button class="btn-menu space-y-2" (click)="selectGameCount(4)">4 players</button>
				<br>
				<button class="btn-menu space-y-2 top-6" (click)="back.emit()">back</button>
			
		</div>
	`,
	styleUrls: ['./menu-styles.css'],
})
export class MultiplayerComponent {
	@Output()
	back = new EventEmitter<void>();
	@Output()
	setGameCount = new EventEmitter<number>();

	selectGameCount(count: number) {
		this.setGameCount.emit(count);
	}
}
