// identity_factory.js

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',

    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',

    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',

    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
];

const VIEWPORTS = [
    {
        width: 1366,
        height: 768
    },
    {
        width: 1440,
        height: 900
    },
    {
        width: 1536,
        height: 864
    },
    {
        width: 1920,
        height: 1080
    }
];

const TIMEZONES = [
    'America/New_York',
    'Europe/London',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Europe/Berlin'
];

const LOCALES = [
    'en-US',
    'en-GB'
];

class IdentityFactory {

    static randomFrom(array) {
        return array[
            Math.floor(Math.random() * array.length)
        ];
    }

    static generate() {

        return {
            userAgent:
                this.randomFrom(USER_AGENTS),

            viewport:
                this.randomFrom(VIEWPORTS),

            timezone:
                this.randomFrom(TIMEZONES),

            locale:
                this.randomFrom(LOCALES)
        };
    }
}

module.exports = IdentityFactory;