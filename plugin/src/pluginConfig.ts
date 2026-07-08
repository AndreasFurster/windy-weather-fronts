import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-weather-fronts',
    version: '1.0.0',
    icon: '🌀',
    title: 'Weather Fronts',
    description:
        'Shows weather fronts (cold, warm, occluded, stationary) from multiple sources: '
        + 'KNMI surface charts (vectorized from the published images), NOAA WPC coded '
        + 'bulletins and the Met Office IAC FLEET analysis. Requires the companion backend '
        + 'from the plugin repository.',
    author: 'Andreas Furster',
    repository: 'https://github.com/AndreasFurster/windy-weather-fronts',
    desktopUI: 'rhpane',
    mobileUI: 'fullscreen',
    routerPath: '/weather-fronts',
    private: false,
};

export default config;
