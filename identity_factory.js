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

// Region -> timezone / locale mapping.
// Keep the keys lowercase because proxy region values
// are normalised before lookup.
const REGIONAL_DATA = {
    us: {
        timezone: 'America/New_York',
        locale: 'en-US'
    },

    gb: {
        timezone: 'Europe/London',
        locale: 'en-GB'
    },

    uk: {
        timezone: 'Europe/London',
        locale: 'en-GB'
    },

    de: {
        timezone: 'Europe/Berlin',
        locale: 'de-DE'
    },

    fr: {
        timezone: 'Europe/Paris',
        locale: 'fr-FR'
    },

    ca: {
        timezone: 'America/Toronto',
        locale: 'en-CA'
    },

    es: {
        timezone: 'Europe/Madrid',
        locale: 'es-ES'
    },

    sg: {
        timezone: 'Asia/Singapore',
        locale: 'en-SG'
    },

    jp: {
        timezone: 'Asia/Tokyo',
        locale: 'ja-JP'
    },

    ae: {
        timezone: 'Asia/Dubai',
        locale: 'en-AE'
    },

    au: {
        timezone: 'Australia/Sydney',
        locale: 'en-AU'
    }
};

// Added hardware/platform entropy
const HARDWARE_CONCURRENCY = [
    4,
    6,
    8,
    12,
    16
];

class IdentityFactory {

    static randomFrom(array) {
        return array[
            Math.floor(
                Math.random() * array.length
            )
        ];
    }

    /**
     * Generate a browser identity for a specific region.
     *
     * @param {string} region
     * Two-letter region/country code, e.g.:
     * us, gb, de, fr, ca.
     */
    static generateForRegion(region) {

        const ua =
            this.randomFrom(
                USER_AGENTS
            );

        /*
         * Determine platform from UA so the two values
         * remain internally consistent.
         */
        let platform = 'Win32';

        if (
            ua.includes('Macintosh')
        ) {
            platform = 'MacIntel';
        }

        if (
            ua.includes('Linux')
        ) {
            platform = 'Linux x86_64';
        }

        /*
         * Normalise values such as:
         *
         * US -> us
         * GB -> gb
         * gb -> gb
         */
        const normalizedRegion =
            typeof region === 'string'
                ? region.trim().toLowerCase()
                : '';

        /*
         * Fall back to US regional settings if the supplied
         * region is missing or unsupported.
         */
        const geo =
            REGIONAL_DATA[
                normalizedRegion
            ] || {
                timezone: 'America/New_York',
                locale: 'en-US'
            };

        return {
            userAgent: ua,

            viewport:
                this.randomFrom(
                    VIEWPORTS
                ),

            timezone:
                geo.timezone,

            locale:
                geo.locale,

            platform:
                platform,

            hardwareConcurrency:
                this.randomFrom(
                    HARDWARE_CONCURRENCY
                ),

            deviceScaleFactor:
                Math.random() > 0.5
                    ? 1
                    : 2
        };
    }

    /**
     * Retain generate() for compatibility with any existing
     * code that still calls IdentityFactory.generate().
     *
     * A region can optionally be supplied.
     */
    static generate(region = 'us') {
        return this.generateForRegion(
            region
        );
    }
}

module.exports = IdentityFactory;