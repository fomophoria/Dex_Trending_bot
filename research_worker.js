// research_worker.js
// Functional DEX Screener research worker.
// Uses the configured proxy, waits for the real DEX page, and does not attempt
// to bypass verification/interstitial challenges.

const { chromium } = require('playwright-extra');
const config = require('./config');
const ProxyManager = require('./proxy_manager');
const fs = require('fs');
const path = require('path');

const SESSION_STORAGE_DIR = path.join(__dirname, 'session_data');

const REGION_SETTINGS = {
  us: { timezoneId: 'America/New_York', locale: 'en-US' },
  gb: { timezoneId: 'Europe/London', locale: 'en-GB' },
  de: { timezoneId: 'Europe/Berlin', locale: 'de-DE' },
  fr: { timezoneId: 'Europe/Paris', locale: 'fr-FR' },
  ca: { timezoneId: 'America/Toronto', locale: 'en-CA' },
  nl: { timezoneId: 'Europe/Amsterdam', locale: 'nl-NL' },
  es: { timezoneId: 'Europe/Madrid', locale: 'es-ES' },
  it: { timezoneId: 'Europe/Rome', locale: 'it-IT' },
  se: { timezoneId: 'Europe/Stockholm', locale: 'sv-SE' },
  ch: { timezoneId: 'Europe/Zurich', locale: 'de-CH' },
  au: { timezoneId: 'Australia/Sydney', locale: 'en-AU' },
  sg: { timezoneId: 'Asia/Singapore', locale: 'en-SG' },
  jp: { timezoneId: 'Asia/Tokyo', locale: 'ja-JP' },
  br: { timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' },
  kr: { timezoneId: 'Asia/Seoul', locale: 'ko-KR' },
  in: { timezoneId: 'Asia/Kolkata', locale: 'en-IN' }
};

class ResearchWorker {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.proxy = null;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.storageState = null;
    this.regionSettings = REGION_SETTINGS.us;
  }

  async start() {
    console.log(`\n[Worker ${this.sessionId}] Starting`);

    try {
      if (config.PROXY_ENABLED) {
        this.proxy = await ProxyManager.getProxyConfig(this.sessionId);
      }

      this.regionSettings =
        REGION_SETTINGS[(this.proxy?.region || 'us').toLowerCase()] ||
        REGION_SETTINGS.us;

      await this.loadSessionState();

      this.logSession();

      await this.launchBrowser();
      await this.createContext();

      this.page = await this.context.newPage();

      this.page.setDefaultTimeout(15000);

      this.page.setDefaultNavigationTimeout(
        config.NAVIGATION_TIMEOUT_MS || 90000
      );

      await this.runResearchFlow();

      await this.saveSessionState();

    } catch (error) {
      console.error(
        `[Worker ${this.sessionId}] ERROR: ${error.message}`
      );

      await this.saveErrorScreenshot();

      throw error;

    } finally {
      await this.cleanup();
    }
  }

  logSession() {
    console.log(
      `[Worker ${this.sessionId}] Region: ${this.proxy?.region || 'local'} / ` +
      `${this.regionSettings.timezoneId}`
    );

    if (this.proxy) {
      console.log(
        `[Worker ${this.sessionId}] Proxy: ${this.proxy.server}`
      );
    }

    if (this.storageState) {
      console.log(
        `[Worker ${this.sessionId}] Returning session state loaded`
      );
    }
  }

  async launchBrowser() {
    const launchOptions = {
      headless: !config.DEBUG_MODE
    };

    if (this.proxy) {
      launchOptions.proxy = {
        server: this.proxy.server,
        username: this.proxy.username,
        password: this.proxy.password
      };
    }

    this.browser = await chromium.launch(
      launchOptions
    );
  }

  async createContext() {
    const contextOptions = {
      locale: this.regionSettings.locale,
      timezoneId: this.regionSettings.timezoneId
    };

    if (this.storageState) {
      contextOptions.storageState =
        this.storageState;
    }

    this.context =
      await this.browser.newContext(
        contextOptions
      );
  }

  async runResearchFlow() {
    if (config.TARGET_PAIR_URL) {
      await this.navigate(
        config.TARGET_PAIR_URL
      );

      await this.waitForNormalDexPage(
        30000
      );

      console.log(
        `[Worker ${this.sessionId}] Pair page loaded`
      );

      return;
    }

    await this.navigate(
      config.TARGET_URL
    );

    await this.waitForNormalDexPage(
      30000
    );

    const searchText =
      config.TOKEN_CONTRACT_ADDRESS;

    if (!searchText) {
      console.log(
        `[Worker ${this.sessionId}] Homepage loaded; no token configured`
      );

      return;
    }

    await this.performSearch(
      searchText
    );
  }

  async navigate(url) {
    console.log(
      `[Worker ${this.sessionId}] Opening ${url}`
    );

    await this.page.goto(
      url,
      {
        waitUntil: 'domcontentloaded',

        timeout:
          config.NAVIGATION_TIMEOUT_MS ||
          90000
      }
    );
  }

  async waitForNormalDexPage(
    timeoutMs = 30000
  ) {
    const started =
      Date.now();

    let verificationLogged =
      false;

    while (
      Date.now() - started <
      timeoutMs
    ) {
      if (
        !this.page ||
        this.page.isClosed()
      ) {
        throw new Error(
          'Page closed while waiting for DEX Screener'
        );
      }

      const title =
        (
          await this.page
            .title()
            .catch(() => '')
        ).toLowerCase();

      const challengeVisible =
        await this.hasVerificationInterstitial();

      if (
        challengeVisible ||
        title.includes(
          'just a moment'
        ) ||
        title.includes(
          'attention required'
        ) ||
        title.includes(
          'verify you are human'
        )
      ) {
        if (
          !verificationLogged
        ) {
          console.log(
            `[Worker ${this.sessionId}] Verification/interstitial detected; ` +
            `waiting for it to clear normally`
          );

          verificationLogged =
            true;
        }

        await this.sleep(1000);

        continue;
      }

      const url =
        this.page.url();

      const bodyText =
        await this.page
          .locator('body')
          .innerText({
            timeout: 1500
          })
          .catch(
            () => ''
          );

      if (
        url.includes(
          'dexscreener.com'
        ) &&
        bodyText
          .trim()
          .length > 50
      ) {
        return;
      }

      await this.sleep(400);
    }

    if (
      await this.hasVerificationInterstitial()
    ) {
      throw new Error(
        'Verification/interstitial did not clear'
      );
    }

    throw new Error(
      'DEX Screener did not become ready before timeout'
    );
  }

  async hasVerificationInterstitial() {
    const selectors = [
      'iframe[src*="cloudflare"]',
      '#cf-turnstile-wrapper',
      '.cf-browser-verification',
      'input[name="cf-turnstile-response"]'
    ];

    for (
      const selector of selectors
    ) {
      const count =
        await this.page
          .locator(selector)
          .count()
          .catch(
            () => 0
          );

      if (
        count > 0
      ) {
        return true;
      }
    }

    return false;
  }

  async performSearch(
    searchText
  ) {
    console.log(
      `[Worker ${this.sessionId}] Opening search`
    );

    /*
     * DEX Screener may not render the
     * search input until the search UI
     * has been opened.
     */
    await this.page
      .keyboard
      .press('/')
      .catch(
        () => {}
      );

    let searchInput =
      await this.waitForSearchInput(
        8000
      );

    /*
     * If the "/" shortcut did not
     * open search, try visible Search
     * controls instead.
     */
    if (!searchInput) {
      const opened =
        await this.tryOpenSearchButton();

      if (opened) {
        searchInput =
          await this.waitForSearchInput(
            6000
          );
      }
    }

    /*
     * Final fallback:
     * use DEX Screener's normal search
     * URL rather than failing just
     * because the modal/button changed.
     */
    if (!searchInput) {
      const searchUrl =
        `https://dexscreener.com/search?q=` +
        encodeURIComponent(
          searchText
        );

      console.log(
        `[Worker ${this.sessionId}] Search UI unavailable; opening search results URL`
      );

      await this.navigate(
        searchUrl
      );

      await this.waitForNormalDexPage(
        30000
      );

      await this.openExactContractResult(
        searchText
      );

      if (
        !this.isPairPage()
      ) {
        throw new Error(
          'Search completed but target pair page was not reached'
        );
      }

      console.log(
        `[Worker ${this.sessionId}] Target pair page loaded`
      );

      return;
    }

    await searchInput.fill('');

    await searchInput.fill(
      searchText
    );

    await this.sleep(
      1200
    );

    const clicked =
      await this.openExactContractResult(
        searchText
      );

    if (!clicked) {
      await searchInput
        .press('Enter')
        .catch(
          () => {}
        );

      await this.waitForSearchResultPage(
        20000
      );

      if (
        !this.isPairPage()
      ) {
        await this.openExactContractResult(
          searchText
        );
      }
    }

    if (
      !this.isPairPage()
    ) {
      throw new Error(
        'Search completed but target pair page was not reached'
      );
    }

    console.log(
      `[Worker ${this.sessionId}] Target pair page loaded`
    );
  }

  async waitForSearchInput(
    timeoutMs
  ) {
    const started =
      Date.now();

    while (
      Date.now() - started <
      timeoutMs
    ) {
      if (
        await this.hasVerificationInterstitial()
      ) {
        throw new Error(
          'Verification/interstitial appeared while opening search'
        );
      }

      const input =
        await this.findSearchInput();

      if (input) {
        return input;
      }

      await this.sleep(
        250
      );
    }

    return null;
  }

  async findSearchInput() {
    const selectors = [
      'input[placeholder*="Search" i]',
      'input[type="search"]',
      '[role="dialog"] input'
    ];

    for (
      const selector of selectors
    ) {
      const locators =
        this.page.locator(
          selector
        );

      const count =
        await locators
          .count()
          .catch(
            () => 0
          );

      for (
        let i = 0;
        i < count;
        i++
      ) {
        const input =
          locators.nth(i);

        const visible =
          await input
            .isVisible()
            .catch(
              () => false
            );

        const enabled =
          await input
            .isEnabled()
            .catch(
              () => false
            );

        if (
          visible &&
          enabled
        ) {
          return input;
        }
      }
    }

    return null;
  }

  async tryOpenSearchButton() {
    const candidates = [
      this.page
        .getByRole(
          'button',
          {
            name: /search/i
          }
        )
        .first(),

      this.page
        .getByText(
          'Search',
          {
            exact: true
          }
        )
        .first()
    ];

    for (
      const candidate of candidates
    ) {
      try {
        if (
          await candidate.isVisible()
        ) {
          await candidate.click();

          return true;
        }

      } catch (_) {}
    }

    return false;
  }

  async openExactContractResult(
    searchText
  ) {
    const deadline =
      Date.now() +
      12000;

    const needle =
      String(
        searchText
      ).toLowerCase();

    while (
      Date.now() <
      deadline
    ) {
      if (
        this.isPairPage()
      ) {
        return true;
      }

      const links =
        this.page.locator(
          'a[href]'
        );

      const count =
        await links
          .count()
          .catch(
            () => 0
          );

      for (
        let i = 0;
        i < Math.min(
          count,
          100
        );
        i++
      ) {
        const link =
          links.nth(i);

        const href =
          await link
            .getAttribute(
              'href'
            )
            .catch(
              () => null
            );

        if (
          !href ||
          !href
            .toLowerCase()
            .includes(
              needle
            )
        ) {
          continue;
        }

        if (
          !await link
            .isVisible()
            .catch(
              () => false
            )
        ) {
          continue;
        }

        await Promise.allSettled(
          [
            this.page
              .waitForLoadState(
                'domcontentloaded',
                {
                  timeout: 15000
                }
              ),

            link.click()
          ]
        );

        await this.waitForNormalDexPage(
          20000
        );

        return this.isPairPage();
      }

      await this.sleep(
        500
      );
    }

    return false;
  }

  async waitForSearchResultPage(
    timeoutMs
  ) {
    const started =
      Date.now();

    while (
      Date.now() - started <
      timeoutMs
    ) {
      if (
        await this.hasVerificationInterstitial()
      ) {
        throw new Error(
          'Verification/interstitial appeared during search'
        );
      }

      const url =
        this.page.url();

      if (
        this.isPairPage() ||
        url.includes(
          '/search'
        )
      ) {
        return;
      }

      await this.sleep(
        400
      );
    }

    throw new Error(
      'Timed out waiting for search results'
    );
  }

  isPairPage() {
    if (
      !this.page ||
      this.page.isClosed()
    ) {
      return false;
    }

    try {
      const url =
        new URL(
          this.page.url()
        );

      if (
        !url.hostname.includes(
          'dexscreener.com'
        )
      ) {
        return false;
      }

      return [
        '/solana/',
        '/ethereum/',
        '/bsc/',
        '/robinhood/'
      ].some(
        prefix =>
          url.pathname.includes(
            prefix
          )
      );

    } catch (_) {
      return false;
    }
  }

  async loadSessionState() {
    if (
      !config.ENABLE_COOKIES
    ) {
      return;
    }

    if (
      Math.random() >
      (
        config.RETURNING_VISITOR_CHANCE ||
        0
      )
    ) {
      return;
    }

    const region =
      this.proxy?.region ||
      'default';

    const stateFile =
      path.join(
        SESSION_STORAGE_DIR,
        `session_${region}.json`
      );

    try {
      if (
        fs.existsSync(
          stateFile
        )
      ) {
        this.storageState =
          JSON.parse(
            fs.readFileSync(
              stateFile,
              'utf8'
            )
          );
      }

    } catch (_) {
      this.storageState =
        null;
    }
  }

  async saveSessionState() {
    if (
      !config.ENABLE_COOKIES ||
      !this.context
    ) {
      return;
    }

    try {
      fs.mkdirSync(
        SESSION_STORAGE_DIR,
        {
          recursive: true
        }
      );

      const state =
        await this.context.storageState();

      const region =
        this.proxy?.region ||
        'default';

      const stateFile =
        path.join(
          SESSION_STORAGE_DIR,
          `session_${region}.json`
        );

      fs.writeFileSync(
        stateFile,
        JSON.stringify(
          state,
          null,
          2
        )
      );

    } catch (error) {
      console.log(
        `[Worker ${this.sessionId}] Could not save session state: ${error.message}`
      );
    }
  }

  async saveErrorScreenshot() {
    if (
      !this.page ||
      this.page.isClosed()
    ) {
      return;
    }

    try {
      await this.page.screenshot({
        path:
          `error-worker-` +
          `${this.sessionId}-` +
          `${Date.now()}.png`,

        fullPage:
          false
      });

    } catch (_) {}
  }

  async cleanup() {
    try {
      if (
        this.context
      ) {
        await this.context.close();
      }

    } catch (_) {}

    try {
      if (
        this.browser
      ) {
        await this.browser.close();
      }

    } catch (_) {}

    this.page =
      null;

    this.context =
      null;

    this.browser =
      null;
  }

  sleep(ms) {
    return new Promise(
      resolve =>
        setTimeout(
          resolve,
          Math.max(
            0,
            ms
          )
        )
    );
  }
}

module.exports = ResearchWorker;