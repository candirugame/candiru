import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
	selector: 'app-browse',
	standalone: true,
	imports: [CommonModule],
	template: `
    <div>
      <h2 class="text-xl text-gray-100 mb-4">Browse Servers</h2>
      <div class="space-y-4">
        <div class="server-item">
          Server 1
        </div>
        <button class="btn-menu" (click)="back.emit()">Back</button>
      </div>
    </div>
  `,
	styles: [`
    .server-item {
      @apply p-2 bg-gray-700/50 rounded-md text-gray-200 mb-2;
    }
  `],
})
export class BrowseComponent {
	@Output()
	back = new EventEmitter<void>();
}
