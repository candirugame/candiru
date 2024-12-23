export class SettingsManager {
    static settings: Settings;

    static {
        SettingsManager.reset()
        const settingsJson = localStorage.getItem('settings');
        if (settingsJson) SettingsManager.settings = JSON.parse(settingsJson);
    }

    public static write(): void {
        localStorage.setItem('settings', JSON.stringify(SettingsManager.settings));
    }

    public static reset() {
        SettingsManager.settings = {
            sense: 1,
            controllerSense: 1,
            name: null,
            crosshairColor: 'rgb(0,255,255)',
            crosshairType: 1,
            viewBobbingStrength: 1,
            doPrettyText: false,
        };
    }

    constructor() {
        throw Error('Settings class is static.');
    }
}

interface Settings {
    sense: number;
    controllerSense: number;
    name: null | string;
    crosshairColor: string;
    crosshairType: number;
    viewBobbingStrength: number;
    doPrettyText: boolean;
}