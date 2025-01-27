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
			<h2 class="text-xl text-gray-100 mb-4">settings</h2>
			<div class="space-y-4">

				<div class="setting-item">
					<label class="mr-2">sens (mouse)</label>
					<div class="flex items-center min-w-[160px]">
						<input type="range" min="0.1" max="4" step="0.1"
							   [(ngModel)]="settings.sense" (change)="saveSettings()">
						<span class="w-8 text-left ml-2">{{ settings.sense | number:'1.1-1' }}</span>
					</div>
				</div>

				<div class="setting-item">
					<label class="mr-2">sens (stick)</label>
					<div class="flex items-center min-w-[160px]">
						<input type="range" min="0.1" max="4" step="0.1"
							   [(ngModel)]="settings.controllerSense" (change)="saveSettings()">
						<span class="w-8 text-left ml-2">{{ settings.controllerSense | number:'1.1-1' }}</span>
					</div>
				</div>

				<div class="setting-item">
					<label class="mr-2">crosshair color</label>
					<input type="color" [(ngModel)]="settings.crosshairColor" (change)="saveSettings()">
				</div>

				<div class="setting-item">
					<label class="mr-2">crosshair type</label>
					<select [(ngModel)]="settings.crosshairType" (change)="saveSettings()">
						<option [ngValue]="1">dot</option>
						<option [ngValue]="0">cross</option>
						<option [ngValue]="2">can't decide</option>
						<option [ngValue]="3">none</option>
					</select>
				</div>

				<div class="setting-item">
					<label class="mr-2">crosshair opacity</label>
					<div class="flex items-center min-w-[160px]">
						<input type="range" min="0" max="1" step="0.05"
							   [(ngModel)]="settings.crosshairOpacity" (change)="saveSettings()">
						<span class="w-8 text-left ml-2">{{ settings.crosshairOpacity | number:'1.1-1' }}</span>
					</div>
				</div>

				<div class="setting-item">
					<label class="mr-2">bobbing strength</label>
					<div class="flex items-center min-w-[160px]">
						<input type="range" min="0" max="2" step="0.1"
							   [(ngModel)]="settings.viewBobbingStrength" (change)="saveSettings()">
						<span class="w-8 text-left ml-2">{{ settings.viewBobbingStrength | number:'1.1-1' }}</span>
					</div>
				</div>

				<div class="setting-item">
					<label class="mr-2">pretty text</label>
					<input type="checkbox" [(ngModel)]="settings.doPrettyText" (change)="saveSettings()">
				</div>

				<div class="setting-item">
					<label class="mr-2">developer mode</label>
					<input type="checkbox" [(ngModel)]="settings.developerMode" (change)="saveSettings()">
				</div>

				<div class="setting-item">
					<button type="button" (click)="resetSettings()" class="btn-menu">reset all</button>
				</div>

				<button class="btn-menu" (click)="back.emit()">back</button>
			</div>
		</div>
	`,
	styleUrls: ['./menu-styles.css'],
})
export class SettingsComponent {
	@Output()
	back = new EventEmitter<void>();
	settings = { ...SettingsManager.settings };

	saveSettings() {
		SettingsManager.settings = this.settings;
		SettingsManager.write();
	}

	resetSettings() {
		SettingsManager.reset();
		this.settings = { ...SettingsManager.settings }; // Refresh local copy
		SettingsManager.write();
	}
}
