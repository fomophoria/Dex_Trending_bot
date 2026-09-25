// config.js

module.exports = {

    TARGET_URL:
        'https://dexscreener.com/robinhood/0xc7b8d8176ec8bd0658e4c2b6f8e269bcd7b1b444bc2b1e68b653e128481f6454',

    MAX_CONCURRENT_SESSIONS: 1,

    DEBUG_MODE: true,

    NAVIGATION_TIMEOUT_MS: 60000,

    INITIAL_LOAD_WAIT_MS: 5000,

    INTERACTION_CYCLES: 4,

    DWELL_TIME_RANGE: [15, 25],

    PAUSE_BETWEEN_ACTIONS_RANGE_MS: [
        800,
        1800
    ],

    SCROLL_DISTANCE_RANGE: [
        300,
        700
    ],

    /*
     * Chart intervals the bot is allowed to select.
     */
    CHART_TIMEFRAMES: [
        '5m',
        '15m',
        '1h',
        '4h'
    ],

    /*
     * Number of mouse-wheel actions over the chart.
     */
    CHART_ZOOM_OUT_STEPS: [
        2,
        5
    ],

    /*
     * Positive wheel movement should zoom the TradingView chart out.
     *
     * If you see it zoom IN instead, simply change this to -300.
     */
    CHART_ZOOM_DELTA: 300,

    SAFE_CLICK_TEXTS: [
        'Transactions',
        'Top Traders'
    ],

    PROXY_LIST: [
        // 'http://username:password@host:port'
    ],

    REFERRERS: [
        'https://twitter.com/',
        'https://t.me/',
        'https://www.google.com/',
        'https://docs.dexscreener.com/'
    ]
};