// identity_factory.js

// Expanded list of modern Chrome User Agents (Chrome 128-135)
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
];

const VIEWPORTS = [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
    { width: 2560, height: 1440 }
];

const TIMEZONES = [
    'America/New_York', 'America/Los_Angeles', 'America/Chicago',
    'Europe/London', 'Europe/Berlin', 'Europe/Paris',
    'Asia/Singapore', 'Asia/Tokyo', 'Asia/Dubai', 'Australia/Sydney'
];

const LOCALES = ['en-US', 'en-GB', 'en-CA', 'de-DE', 'fr-FR', 'es-ES'];

// Added hardware/platform entropy
const HARDWARE_CONCURRENCY = [4, 6, 8, 12, 16];
const PLATFORMS = ['Win32', 'MacIntel', 'Linux x86_64'];

class IdentityFactory {

    static randomFrom(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    static generate() {
        const ua = this.randomFrom(USER_AGENTS);
        
        // Determine platform based on UA string to ensure consistency
        let platform = 'Win32';
        if (ua.includes('Macintosh')) platform = 'MacIntel';
        if (ua.includes('Linux')) platform = 'Linux x86_64';

        return {
            userAgent: ua,
            viewport: this.randomFrom(VIEWPORTS),
            timezone: this.randomFrom(TIMEZONES),
            locale: this.randomFrom(LOCALES),
            // These properties are checked by advanced bot detectors
            platform: platform,
            hardwareConcurrency: this.randomFrom(HARDWARE_CONCURRENCY),
            deviceScaleFactor: Math.random() > 0.5 ? 1 : 2 // Retina vs Non-Retina
        };
    }
}

module.exports = IdentityFactory;