// config.js
module.exports = {
  // Target configuration
  TARGET_URL: 'https://dexscreener.com/robinhood/0xc7b8d8176ec8bd0658e4c2b6f8e269bcd7b1b444bc2b1e68b653e128481f6454',
  TOKEN_CONTRACT_ADDRESS: '0xc7b8d8176ec8bd0658e4c2b6f8e269bcd7b1b444bc2b1e68b653e128481f6454',
  
  // Alternative token names for varied search behavior
  TOKEN_NAMES: ['PEPE', 'DOGE', 'SHIB', 'BONK', 'WIF', 'FLOKI', 'MEME'],
  
  // Direct pair URL if available (for direct navigation path)
  TARGET_PAIR_URL: null,

  // Session management - realistic concurrent users
  MAX_CONCURRENT_SESSIONS: 10,
  MIN_ACTIVE_SESSIONS: 3,
  MAX_ACTIVE_SESSIONS: 8,
  
  // Realistic staggered starts (humans arrive organically)
  WORKER_START_DELAY_RANGE_MS: [3000, 35000],
  WORKER_RESTART_DELAY_RANGE_MS: [15000, 90000],
  
  // Session duration with realistic variance
  SESSION_DURATION_RANGE_MS: [25000, 240000],
  
  // Debug mode
  DEBUG_MODE: false,
  
  // Timeouts
  NAVIGATION_TIMEOUT_MS: 90000,
  INITIAL_LOAD_WAIT_MS: [1500, 8000],
  
  // Variable interaction cycles
  INTERACTION_CYCLES_RANGE: [1, 6],
  
  // Dwell time after interactions
  DWELL_TIME_RANGE: [8, 40],
  
  // Human-like pauses (log-normal distributed base)
  PAUSE_BETWEEN_ACTIONS_RANGE_MS: [800, 3500],
  
  // Scroll behavior
  SCROLL_DISTANCE_RANGE: [150, 1200],
  SCROLL_STEPS_RANGE: [5, 25],
  
  // Chart interactions
  CHART_TIMEFRAMES: ['5m', '15m', '1h', '4h', '1d', '1w'],
  CHART_ZOOM_OUT_STEPS_RANGE: [1, 5],
  CHART_ZOOM_DELTA: [100, 400],
  
  // Safe UI elements
  SAFE_CLICK_TEXTS: ['Transactions', 'Top Traders', 'Holders', 'Socials', 'Info'],
  
  // Expanded realistic referrers
  REFERRERS: [
    'https://twitter.com/',
    'https://t.me/',
    'https://www.google.com/',
    'https://docs.dexscreener.com/',
    'https://coinmarketcap.com/',
    'https://coingecko.com/',
    'https://www.reddit.com/',
    'https://discord.com/',
    'https://www.geckoterminal.com/',
    'https://birdeye.so/',
    'https://jup.ag/',
    'https://raydium.io/',
    'https://uniswap.org/',
    'https://app.1inch.io/',
    'https://metamask.io/',
    'https://phantom.app/',
    'https://solflare.com/',
    'https://www.youtube.com/',
    'https://medium.com/',
    'https://github.com/',
    null, // Direct traffic
    null,
    null
  ],
  
  // Proxy configuration
  PROXY_ENABLED: true,
  
  // Session persistence
  ENABLE_COOKIES: true,
  RETURNING_VISITOR_CHANCE: 0.35,
  
  // Anti-detection
  DISABLE_WEBRTC: true
};