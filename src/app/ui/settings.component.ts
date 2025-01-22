import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsManager } from '../../client/core/SettingsManager.ts';

@Component({
	selector: 'app-settings',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
    <div>
      <h2 class="text-xl text-gray-100 mb-4">Settings</h2>
      <div class="space-y-4">
        <div class="setting-item">
          <label>Sensitivity</label>
          <input type="range" min="0.1" max="2" step="0.1" 
                 [(ngModel)]="settings.sense" (change)="saveSettings()">
        </div>
        <button class="btn-menu" (click)="back.emit()">Back</button>
      </div>
    </div>
  `,
	styles: [`
    .setting-item {
      @apply flex justify-between items-center mb-4 text-gray-200;
    }
  `],
})
export class SettingsComponent {
	@Output()
	back = new EventEmitter<void>();
	settings = { ...SettingsManager.settings };

	saveSettings() {
		SettingsManager.settings = this.settings;
		SettingsManager.write();
	}
}
