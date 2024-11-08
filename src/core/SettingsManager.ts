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
            sense: .002,
            controllerSense: 4,
            name: null,
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
}