// identity_factory.js
const crypto = require('crypto');

class IdentityFactory {
  // Chrome versions with realistic distribution
  static CHROME_VERSIONS = [
    { version: '135', probability: 0.32 },
    { version: '134', probability: 0.28 },
    { version: '133', probability: 0.20 },
    { version: '132', probability: 0.12 },
    { version: '131', probability: 0.06 },
    { version: '130', probability: 0.02 }
  ];

  static PLATFORMS = [
    { 
      os: 'Windows NT 10.0; Win64; x64', 
      platform: 'Win32',
      secPlatform: '"Windows"',
      probability: 0.58 
    },
    { 
      os: 'Macintosh; Intel Mac OS X 10_15_7', 
      platform: 'MacIntel',
      secPlatform: '"macOS"',
      probability: 0.30 
    },
    { 
      os: 'X11; Linux x86_64', 
      platform: 'Linux x86_64',
      secPlatform: '"Linux"',
      probability: 0.12 
    }
  ];

  static VIEWPORTS = [
    { width: 1920, height: 1080, probability: 0.20 },
    { width: 1366, height: 768, probability: 0.16 },
    { width: 1536, height: 864, probability: 0.14 },
    { width: 1440, height: 900, probability: 0.12 },
    { width: 1280, height: 720, probability: 0.10 },
    { width: 2560, height: 1440, probability: 0.08 },
    { width: 1680, height: 1050, probability: 0.07 },
    { width: 1600, height: 900, probability: 0.06 },
    { width: 1920, height: 1200, probability: 0.04 },
    { width: 2560, height: 1600, probability: 0.02 },
    { width: 3440, height: 1440, probability: 0.01 }
  ];

  // Complete regional mapping - MUST match ProxyManager.REGIONS
  static REGIONAL_DATA = {
    us: { timezone: 'America/New_York', locale: 'en-US', lang: 'en-US,en', secLang: '"en-US"' },
    gb: { timezone: 'Europe/London', locale: 'en-GB', lang: 'en-GB,en', secLang: '"en-GB"' },
    de: { timezone: 'Europe/Berlin', locale: 'de-DE', lang: 'de-DE,de', secLang: '"de-DE"' },
    fr: { timezone: 'Europe/Paris', locale: 'fr-FR', lang: 'fr-FR,fr', secLang: '"fr-FR"' },
    ca: { timezone: 'America/Toronto', locale: 'en-CA', lang: 'en-CA,en', secLang: '"en-CA"' },
    nl: { timezone: 'Europe/Amsterdam', locale: 'nl-NL', lang: 'nl-NL,nl', secLang: '"nl-NL"' },
    es: { timezone: 'Europe/Madrid', locale: 'es-ES', lang: 'es-ES,es', secLang: '"es-ES"' },
    it: { timezone: 'Europe/Rome', locale: 'it-IT', lang: 'it-IT,it', secLang: '"it-IT"' },
    se: { timezone: 'Europe/Stockholm', locale: 'sv-SE', lang: 'sv-SE,sv', secLang: '"sv-SE"' },
    ch: { timezone: 'Europe/Zurich', locale: 'de-CH', lang: 'de-CH,de', secLang: '"de-CH"' },
    au: { timezone: 'Australia/Sydney', locale: 'en-AU', lang: 'en-AU,en', secLang: '"en-AU"' },
    sg: { timezone: 'Asia/Singapore', locale: 'en-SG', lang: 'en-SG,en', secLang: '"en-SG"' },
    jp: { timezone: 'Asia/Tokyo', locale: 'ja-JP', lang: 'ja-JP,ja', secLang: '"ja-JP"' },
    br: { timezone: 'America/Sao_Paulo', locale: 'pt-BR', lang: 'pt-BR,pt', secLang: '"pt-BR"' },
    kr: { timezone: 'Asia/Seoul', locale: 'ko-KR', lang: 'ko-KR,ko', secLang: '"ko-KR"' },
    in: { timezone: 'Asia/Kolkata', locale: 'en-IN', lang: 'en-IN,en', secLang: '"en-IN"' }
  };

  static HARDWARE_PROFILES = [
    { cores: 4, memory: 8, probability: 0.22 },
    { cores: 8, memory: 16, probability: 0.35 },
    { cores: 6, memory: 16, probability: 0.18 },
    { cores: 12, memory: 32, probability: 0.12 },
    { cores: 16, memory: 32, probability: 0.08 },
    { cores: 8, memory: 8, probability: 0.05 }
  ];

  static WEBGL_VENDORS = [
    { vendor: 'Intel Inc.', renderer: 'Intel Iris Xe Graphics', probability: 0.25 },
    { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce GTX 1660', probability: 0.18 },
    { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 3060', probability: 0.15 },
    { vendor: 'AMD', renderer: 'AMD Radeon RX 580', probability: 0.12 },
    { vendor: 'Apple Inc.', renderer: 'Apple M1', probability: 0.12 },
    { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 3070', probability: 0.08 },
    { vendor: 'AMD', renderer: 'AMD Radeon RX 6700 XT', probability: 0.06 },
    { vendor: 'Intel Inc.', renderer: 'Intel UHD Graphics 630', probability: 0.04 }
  ];

  static weightedRandom(items) {
    const totalWeight = items.reduce((sum, item) => sum + (item.probability || 1), 0);
    let random = Math.random() * totalWeight;
    
    for (const item of items) {
      random -= (item.probability || 1);
      if (random <= 0) return item;
    }
    return items[items.length - 1];
  }

  static generateForRegion(region) {
    // Select consistent Chrome version
    const chromeVersion = this.weightedRandom(this.CHROME_VERSIONS);
    const platform = this.weightedRandom(this.PLATFORMS);
    const viewport = this.weightedRandom(this.VIEWPORTS);
    const hardware = this.weightedRandom(this.HARDWARE_PROFILES);
    const webgl = this.weightedRandom(this.WEBGL_VENDORS);
    
    // Validate region exists
    const normalizedRegion = (region || 'us').toLowerCase().trim();
    const regionData = this.REGIONAL_DATA[normalizedRegion] || this.REGIONAL_DATA.us;
    
    // Calculate screen dimensions
    const screenWidth = viewport.width + this.randomBetween(0, 200);
    const screenHeight = viewport.height + this.randomBetween(100, 400);
    const deviceScaleFactor = viewport.width >= 2560 ? 
      this.randomFrom([1.5, 2]) : 
      this.randomFrom([1, 1, 1.25]);

    // Build consistent user agent with selected version
    const userAgent = `Mozilla/5.0 (${platform.os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion.version}.0.0.0 Safari/537.36`;

    return {
      userAgent,
      chromeVersion: chromeVersion.version,
      viewport: { width: viewport.width, height: viewport.height },
      screen: {
        width: screenWidth,
        height: screenHeight,
        availWidth: screenWidth - this.randomBetween(0, 20),
        availHeight: screenHeight - this.randomBetween(40, 120),
        colorDepth: platform.platform === 'MacIntel' ? 30 : this.randomFrom([24, 32]),
        pixelDepth: platform.platform === 'MacIntel' ? 30 : 24
      },
      timezone: regionData.timezone,
      locale: regionData.locale,
      language: regionData.lang,
      secLanguage: regionData.secLang,
      platform: platform.platform,
      secPlatform: platform.secPlatform,
      hardwareConcurrency: hardware.cores,
      deviceMemory: hardware.memory,
      deviceScaleFactor,
      maxTouchPoints: 0,
      
      webgl: {
        vendor: webgl.vendor,
        renderer: webgl.renderer,
        unmaskedVendor: webgl.vendor,
        unmaskedRenderer: webgl.renderer
      },
      
      canvasNoise: crypto.randomBytes(8).toString('hex'),
      
      // Client hints MATCH the UA version
      clientHints: {
        platform: platform.secPlatform,
        mobile: '?0',
        architecture: platform.platform === 'MacIntel' ? '"arm"' : '"x86"',
        bitness: '"64"',
        fullVersionList: `"Google Chrome";v="${chromeVersion.version}.0.0.0", "Chromium";v="${chromeVersion.version}.0.0.0", "Not=A?Brand";v="24.0.0.0"`
      },
      
      sessionId: crypto.randomBytes(16).toString('hex'),
      behaviorSeed: Math.random()
    };
  }

  static randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static randomFrom(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  static generate(region = 'us') {
    return this.generateForRegion(region);
  }
}

module.exports = IdentityFactory;