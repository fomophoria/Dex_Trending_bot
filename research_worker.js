// research_worker.js

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const config = require('./config');
const IdentityFactory = require('./identity_factory');
const ProxyManager = require('./proxy_manager');

chromium.use(stealth);

class ResearchWorker {
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.identity = null;

        /*
         * Proxy is retrieved asynchronously when the worker starts.
         */
        this.proxy = null;
    }

    async start() {

        console.log(
            `\n[Worker ${this.sessionId}] Requesting ASocks proxy...`
        );

        this.proxy =
            await ProxyManager.getProxyConfig(
                this.sessionId
            );

        // Generate identity AFTER we know the proxy region
        this.identity =
            IdentityFactory.generateForRegion(
                this.proxy.region
            );

        console.log(
            `[Worker ${this.sessionId}] ASocks proxy acquired successfully`
        );

        console.log(
            `[Worker ${this.sessionId}] Identity region: ${this.proxy.region}`
        );

        console.log(
            `[Worker ${this.sessionId}] UA: ${this.identity.userAgent}`
        );

        console.log(
            `[Worker ${this.sessionId}] Viewport: ` +
            `${this.identity.viewport.width}x${this.identity.viewport.height}`
        );

        console.log(
            `[Worker ${this.sessionId}] Timezone: ${this.identity.timezone}`
        );

        console.log(
            `[Worker ${this.sessionId}] Locale: ${this.identity.locale}`
        );

        console.log(
            `[Worker ${this.sessionId}] Platform: ${this.identity.platform}`
        );

        console.log(
            `[Worker ${this.sessionId}] Hardware Concurrency: ` +
            `${this.identity.hardwareConcurrency}`
        );

        const launchArgs = [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security', // Helps bypass cross-origin iframe issues
            '--disable-features=IsolateOrigins,site-per-process' // Critical for Cloudflare iframe interaction
        ];

        const launchOptions = {
            headless: !config.DEBUG_MODE,
            args: launchArgs,
            slowMo: config.DEBUG_MODE ? 35 : 0
        };

        if (this.proxy) {
            console.log(
                `[Worker ${this.sessionId}] Proxy: ` +
                `${this.proxy.region.toUpperCase()} via ${this.proxy.server}`
            );

            launchOptions.proxy = {
                server: this.proxy.server,
                username: this.proxy.username,
                password: this.proxy.password
            };
        } else {
            console.log(
                `[Worker ${this.sessionId}] No proxy configured - using local IP`
            );
        }

        const browser = await chromium.launch(launchOptions);

        // Correctly derive Client Hints based on the generated platform.
        let chPlatform = '"Windows"';
        if (this.identity.platform === 'MacIntel') chPlatform = '"macOS"';
        if (this.identity.platform === 'Linux x86_64') chPlatform = '"Linux"';

        const context = await browser.newContext({
            userAgent: this.identity.userAgent,
            viewport: this.identity.viewport,
            timezoneId: this.identity.timezone,
            locale: this.identity.locale,
            deviceScaleFactor: this.identity.deviceScaleFactor,
            permissions: ['geolocation'],

            // Keep Client Hints aligned with the generated browser identity.
            extraHTTPHeaders: {
                'sec-ch-ua-platform': chPlatform,
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua': '"Google Chrome";v="135", "Not=A?Brand";v="8", "Chromium";v="135"'
            }
        });

        await context.addInitScript(() => {
            Object.defineProperty(
                navigator,
                'webdriver',
                {
                    get: () => undefined
                }
            );

            window.chrome = { runtime: {} };

            const toBlob =
                HTMLCanvasElement.prototype.toBlob;

            HTMLCanvasElement.prototype.toBlob =
                function(...args) {
                    const ctx =
                        this.getContext('2d');

                    ctx.fillStyle =
                        'rgba(0,0,0,0.01)';

                    ctx.fillRect(
                        0,
                        0,
                        1,
                        1
                    );

                    return toBlob.apply(
                        this,
                        args
                    );
                };
        });

        const page =
            await context.newPage();

        page.setDefaultTimeout(10000);

        page.setDefaultNavigationTimeout(
            config.NAVIGATION_TIMEOUT_MS
        );

        try {
            await this.loadDexScreener(page);

            // --- CLOUDFLARE AUTO-SOLVE SECTION ---
            await this.handleCloudflare(page);

            await this.interactionLoop(page);

            await this.finalDwell(page);

        } catch (error) {

            console.error(
                `\n[Worker ${this.sessionId}] ERROR:`,
                error
            );

            /*
             * Only attempt a screenshot if the page
             * still exists.
             *
             * This prevents the screenshot operation
             * from throwing another error if Chromium
             * or the page has already closed.
             */

            if (!page.isClosed()) {
                try {
                    await page.screenshot({
                        path: `error-worker-${this.sessionId}.png`,
                        fullPage: false
                    });

                    console.log(
                        `[Worker ${this.sessionId}] Error screenshot saved`
                    );

                } catch (screenshotError) {

                    console.log(
                        `[Worker ${this.sessionId}] Could not save error screenshot: ` +
                        `${screenshotError.message}`
                    );
                }
            } else {
                console.log(
                    `[Worker ${this.sessionId}] Page already closed - skipping error screenshot`
                );
            }

        } finally {

            console.log(
                `[Worker ${this.sessionId}] Closing browser...`
            );

            try {
                await browser.close();
            } catch (error) {
                console.log(
                    `[Worker ${this.sessionId}] Browser was already closed`
                );
            }

            console.log(
                `[Worker ${this.sessionId}] Browser closed.`
            );
        }
    }

    /**
     * Detects and solves Cloudflare Turnstile automatically
     */
    async handleCloudflare(page) {
        console.log(
            `[Worker ${this.sessionId}] Checking for Cloudflare challenges...`
        );

        // Wait for potential challenge to appear
        await this.sleep(5000);

        const cloudflareSelectors = [
            'iframe[src*="cloudflare"]',
            '#cf-turnstile-wrapper',
            '.cf-browser-verification',
            '#challenge-form'
        ];

        let challengeFound = false;

        for (const selector of cloudflareSelectors) {
            if (await page.locator(selector).count() > 0) {
                challengeFound = true;
                break;
            }
        }

        if (challengeFound) {
            console.log(
                `[Worker ${this.sessionId}] Cloudflare challenge detected. Attempting solve...`
            );

            try {
                // Find the Turnstile checkbox iframe
                const frame = page.frames().find(
                    f =>
                        f.url().includes('turnstile') ||
                        f.url().includes('cloudflare')
                );

                if (frame) {
                    // We don't click the selector directly.
                    // Instead find its position and use the mouse.
                    const box =
                        await page
                            .locator('iframe[src*="cloudflare"]')
                            .boundingBox();

                    if (box) {
                        const clickX =
                            box.x +
                            (box.width / 2) +
                            (Math.random() * 10 - 5);

                        const clickY =
                            box.y +
                            (box.height / 2) +
                            (Math.random() * 10 - 5);

                        await page.mouse.move(
                            clickX,
                            clickY,
                            {
                                steps: 15
                            }
                        );

                        await page.mouse.down();

                        await this.sleep(
                            this.randomBetween(
                                100,
                                250
                            )
                        );

                        await page.mouse.up();

                        console.log(
                            `[Worker ${this.sessionId}] Bypassed Cloudflare checkbox.`
                        );
                    }
                }

            } catch (e) {
                console.log(
                    `[Worker ${this.sessionId}] Automated solve failed, waiting for auto-clear...`
                );
            }

            // Wait for the page to actually load after solve
            await page
                .waitForSelector(
                    'canvas',
                    {
                        timeout: 30000
                    }
                )
                .catch(() => {
                    console.log(
                        `[Worker ${this.sessionId}] Page did not load canvas after solve.`
                    );
                });

        } else {
            console.log(
                `[Worker ${this.sessionId}] No Cloudflare challenge visible.`
            );
        }
    }

        /**
     * Simulates natural human keyboard entry by introducing a random 
     * delay between every keypress.
     */
    async typeLikeHuman(page, selector, text) {
        const element = page.locator(selector).first();
        await element.click();
        
        // Brief pause after focusing the input box
        await this.sleep(this.randomBetween(250, 600)); 
        
        for (const character of text) {
            await element.type(character, { 
                delay: this.randomBetween(50, 150) // Variance in milliseconds per key
            });
        }
    }

        async loadDexScreener(page) {

    const referrer =
        this.randomFrom(
            config.REFERRERS
        );

    console.log(
        `\n[Worker ${this.sessionId}] ` +
        `Accessing DEX Screener homepage via: ${referrer}`
    );

    /*
     * STEP 1
     * Open DEX Screener homepage.
     */
    await page.goto(
        config.TARGET_URL,
        {
            waitUntil: 'domcontentloaded',
            timeout: config.NAVIGATION_TIMEOUT_MS,
            referer: referrer
        }
    );

    console.log(
        `[Worker ${this.sessionId}] Root landing view loaded.`
    );

    await this.sleep(
        config.INITIAL_LOAD_WAIT_MS
    );

    await page.bringToFront();

    try {

        console.log(
            `[Worker ${this.sessionId}] Initialising UI search workflow...`
        );

        /*
         * STEP 2
         * DEX Screener does NOT initially expose the search
         * textbox.
         *
         * "/" is the keyboard shortcut displayed by the
         * Search control on the website.
         */
        console.log(
            `[Worker ${this.sessionId}] Opening DEX Screener search...`
        );

        await page.keyboard.press('/');

        await this.sleep(
            this.randomBetween(
                400,
                900
            )
        );

        /*
         * STEP 3
         * Find the textbox that appears after opening Search.
         */
        const searchSelectors = [
            'input[placeholder="Search"]',
            'input[placeholder*="Search"]',
            'input[type="search"]',
            '[role="dialog"] input'
        ];

        let searchInput = null;

        for (
            const selector
            of searchSelectors
        ) {

            const matches =
                page.locator(
                    selector
                );

            const count =
                await matches.count();

            for (
                let i = 0;
                i < count;
                i++
            ) {

                const candidate =
                    matches.nth(i);

                try {

                    if (
                        await candidate.isVisible()
                    ) {

                        searchInput =
                            candidate;

                        break;
                    }

                } catch (error) {

                    // Ignore stale/non-visible candidates.
                }
            }

            if (searchInput) {
                break;
            }
        }

        /*
         * If "/" did not open Search for some reason,
         * explicitly click the visible Search control.
         */
        if (!searchInput) {

            console.log(
                `[Worker ${this.sessionId}] `/ +
                ` shortcut did not reveal input. Trying Search button...`
            );

            const searchTrigger =
                page
                    .getByText(
                        /^Search/i
                    )
                    .first();

            if (
                await searchTrigger.count() > 0 &&
                await searchTrigger.isVisible()
            ) {

                await searchTrigger.click();

                await this.sleep(
                    this.randomBetween(
                        400,
                        900
                    )
                );
            }

            /*
             * Search again for the now-visible input.
             */
            for (
                const selector
                of searchSelectors
            ) {

                const matches =
                    page.locator(
                        selector
                    );

                const count =
                    await matches.count();

                for (
                    let i = 0;
                    i < count;
                    i++
                ) {

                    const candidate =
                        matches.nth(i);

                    try {

                        if (
                            await candidate.isVisible()
                        ) {

                            searchInput =
                                candidate;

                            break;
                        }

                    } catch (error) {

                        // Ignore stale candidates.
                    }
                }

                if (searchInput) {
                    break;
                }
            }
        }

        /*
         * Search-only mode.
         *
         * Do NOT navigate directly to the token page.
         */
        if (!searchInput) {

            throw new Error(
                'DEX Screener search input could not be opened.'
            );
        }

        console.log(
            `[Worker ${this.sessionId}] Search box opened successfully.`
        );

        /*
         * STEP 4
         * Focus the actual DEX Screener search textbox.
         */
        await searchInput.click();

        await this.sleep(
            this.randomBetween(
                250,
                600
            )
        );

        /*
         * Make sure there is no existing text.
         */
        await searchInput.fill('');

        /*
         * STEP 5
         * Type the contract address through the actual UI.
         */
        console.log(
            `[Worker ${this.sessionId}] Typing contract address into search...`
        );

        for (
            const character
            of config.TOKEN_CONTRACT_ADDRESS
        ) {

            await searchInput.type(
                character,
                {
                    delay:
                        this.randomBetween(
                            45,
                            110
                        )
                }
            );
        }

        console.log(
            `[Worker ${this.sessionId}] Contract address entered into search.`
        );

        /*
         * Give DEX Screener time to populate its results.
         */
        await this.sleep(
            this.randomBetween(
                1500,
                3000
            )
        );

        /*
         * STEP 6
         * Look for a result whose link contains the exact
         * target address.
         */
        const targetAddress =
            config
                .TOKEN_CONTRACT_ADDRESS
                .toLowerCase();

        const links =
            page.locator(
                'a[href]'
            );

        const linkCount =
            await links.count();

        let resultClicked =
            false;

        for (
            let i = 0;
            i < linkCount;
            i++
        ) {

            const link =
                links.nth(i);

            let href =
                null;

            try {

                href =
                    await link.getAttribute(
                        'href'
                    );

            } catch (error) {

                continue;
            }

            if (
                href &&
                href
                    .toLowerCase()
                    .includes(
                        targetAddress
                    )
            ) {

                try {

                    if (
                        await link.isVisible()
                    ) {

                        console.log(
                            `[Worker ${this.sessionId}] ` +
                            `Matching search result found. Clicking...`
                        );

                        await link.click();

                        resultClicked =
                            true;

                        break;
                    }

                } catch (error) {

                    // Continue looking.
                }
            }
        }

        /*
         * Some DEX Screener search results don't expose the
         * complete address in the result link.
         *
         * In that case select the highlighted first result
         * with Enter.
         */
        if (!resultClicked) {

            console.log(
                `[Worker ${this.sessionId}] ` +
                `Exact result link not exposed. Selecting search result with Enter...`
            );

            await page.keyboard.press(
                'Enter'
            );
        }

        /*
         * STEP 7
         * Confirm that the search interaction actually took
         * us away from the homepage and into Robinhood.
         */
        await page.waitForURL(
            url => {

                return (
                    url.hostname.includes(
                        'dexscreener.com'
                    ) &&
                    url.pathname.includes(
                        '/robinhood/'
                    )
                );

            },
            {
                timeout: 25000
            }
        );

        console.log(
            `[Worker ${this.sessionId}] Search navigation successful.`
        );

        console.log(
            `[Worker ${this.sessionId}] Current URL: ${page.url()}`
        );

        console.log(
            `[Worker ${this.sessionId}] Page title: ${await page.title()}`
        );

    } catch (searchError) {

        console.error(
            `\n[Worker ${this.sessionId}] ` +
            `Search workflow failed: ${searchError.message}`
        );

        console.log(
            `[Worker ${this.sessionId}] ` +
            `Search-only mode enabled. Closing this worker.`
        );

        /*
         * IMPORTANT:
         * No direct URL fallback.
         */
        throw searchError;
    }
}

    async interactionLoop(page) {
        console.log(
            `\n[Worker ${this.sessionId}] =========================================`
        );

        console.log(
            `[Worker ${this.sessionId}] STARTING INTERACTION LOOP`
        );

        console.log(
            `[Worker ${this.sessionId}] =========================================`
        );

        for (
            let cycle = 1;
            cycle <= config.INTERACTION_CYCLES;
            cycle++
        ) {
            console.log(
                `\n[Worker ${this.sessionId}] --- Cycle ${cycle}/${config.INTERACTION_CYCLES} ---`
            );

            await this.moveMouse(page);

            await this.randomPause();

            await this.interactWithChart(
                page,
                cycle
            );

            await this.randomPause();

            const distance =
                this.randomBetween(
                    config.SCROLL_DISTANCE_RANGE[0],
                    config.SCROLL_DISTANCE_RANGE[1]
                );

            const direction =
                cycle === config.INTERACTION_CYCLES
                    ? -1
                    : 1;

            await this.scrollPage(
                page,
                distance * direction
            );

            await this.randomPause();

            await this.performSafeClick(
                page,
                cycle
            );

            await this.randomPause();
        }
    }

    async finalDwell(page) {
        const dwell =
            this.randomBetween(
                config.DWELL_TIME_RANGE[0],
                config.DWELL_TIME_RANGE[1]
            );

        console.log(
            `\n[Worker ${this.sessionId}] Interaction loop completed.`
        );

        console.log(
            `[Worker ${this.sessionId}] Keeping browser open for ${dwell}s`
        );

        await this.sleep(
            dwell * 1000
        );

        console.log(
            `[Worker ${this.sessionId}] Session completed successfully.`
        );
    }

    async moveMouse(page) {
        const width =
            this.identity.viewport.width;

        const height =
            this.identity.viewport.height;

        const x =
            this.randomBetween(
                Math.floor(
                    width * 0.20
                ),
                Math.floor(
                    width * 0.75
                )
            );

        const y =
            this.randomBetween(
                Math.floor(
                    height * 0.15
                ),
                Math.floor(
                    height * 0.75
                )
            );

        console.log(
            `[Worker ${this.sessionId}] Moving mouse -> ${x}, ${y}`
        );

        await page.mouse.move(
            x,
            y,
            {
                steps:
                    this.randomBetween(
                        12,
                        25
                    )
            }
        );

        console.log(
            `[Worker ${this.sessionId}] Mouse moved`
        );
    }

    async interactWithChart(
        page,
        cycle
    ) {
        console.log(
            `[Worker ${this.sessionId}] Locating chart...`
        );

        const chartBox =
            await this.findChartBox(page);

        if (!chartBox) {
            console.log(
                `[Worker ${this.sessionId}] Could not locate chart`
            );

            return false;
        }

        console.log(
            `[Worker ${this.sessionId}] Chart area: ` +
            `${Math.round(chartBox.width)}x${Math.round(chartBox.height)} ` +
            `at ${Math.round(chartBox.x)},${Math.round(chartBox.y)}`
        );

        const chartX =
            chartBox.x +
            chartBox.width *
            (
                this.randomBetween(
                    30,
                    75
                ) / 100
            );

        const chartY =
            chartBox.y +
            chartBox.height *
            (
                this.randomBetween(
                    30,
                    70
                ) / 100
            );

        await page.mouse.move(
            chartX,
            chartY,
            {
                steps:
                    this.randomBetween(
                        12,
                        22
                    )
            }
        );

        await this.sleep(
            this.randomBetween(
                300,
                700
            )
        );

        await page.mouse.click(
            chartX,
            chartY
        );

        console.log(
            `[Worker ${this.sessionId}] Clicked chart at ` +
            `${Math.round(chartX)},${Math.round(chartY)}`
        );

        await this.sleep(
            this.randomBetween(
                400,
                900
            )
        );

        await this.zoomChartOut(
            page,
            chartBox
        );

        await this.sleep(
            this.randomBetween(
                500,
                1000
            )
        );

        await this.changeChartTimeframe(
            page,
            cycle,
            chartBox
        );

        return true;
    }

    async findChartBox(page) {
        const result =
            await page.evaluate(() => {

                const canvases =
                    Array.from(
                        document.querySelectorAll(
                            'canvas'
                        )
                    );

                const viewportWidth =
                    window.innerWidth;

                const viewportHeight =
                    window.innerHeight;

                const candidates = [];

                for (
                    const canvas
                    of canvases
                ) {
                    const rect =
                        canvas.getBoundingClientRect();

                    const style =
                        window.getComputedStyle(
                            canvas
                        );

                    if (
                        style.display === 'none' ||
                        style.visibility === 'hidden'
                    ) {
                        continue;
                    }

                    if (
                        rect.width < 450 ||
                        rect.height < 200
                    ) {
                        continue;
                    }

                    if (
                        rect.right <= 0 ||
                        rect.bottom <= 0 ||
                        rect.left >= viewportWidth ||
                        rect.top >= viewportHeight
                    ) {
                        continue;
                    }

                    if (
                        rect.left >
                        viewportWidth * 0.80
                    ) {
                        continue;
                    }

                    candidates.push({
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height,
                        area:
                            rect.width *
                            rect.height
                    });
                }

                candidates.sort(
                    (a, b) =>
                        b.area -
                        a.area
                );

                if (
                    candidates.length > 0
                ) {
                    return candidates[0];
                }

                return {
                    x:
                        viewportWidth *
                        0.12,

                    y:
                        viewportHeight *
                        0.11,

                    width:
                        viewportWidth *
                        0.62,

                    height:
                        viewportHeight *
                        0.48,

                    area:
                        viewportWidth *
                        viewportHeight *
                        0.30
                };
            });

        return result;
    }

    async zoomChartOut(
        page,
        chartBox
    ) {
        const x =
            chartBox.x +
            chartBox.width *
            0.55;

        const y =
            chartBox.y +
            chartBox.height *
            0.55;

        await page.mouse.move(
            x,
            y,
            {
                steps: 15
            }
        );

        const steps =
            this.randomBetween(
                config.CHART_ZOOM_OUT_STEPS[0],
                config.CHART_ZOOM_OUT_STEPS[1]
            );

        console.log(
            `[Worker ${this.sessionId}] Zooming chart out (${steps} wheel steps)`
        );

        for (
            let i = 0;
            i < steps;
            i++
        ) {
            await page.mouse.wheel(
                0,
                config.CHART_ZOOM_DELTA
            );

            await this.sleep(
                this.randomBetween(
                    180,
                    350
                )
            );
        }

        console.log(
            `[Worker ${this.sessionId}] Chart zoom action complete`
        );
    }

    async changeChartTimeframe(
        page,
        cycle,
        chartBox
    ) {
        const timeframes =
            config.CHART_TIMEFRAMES;

        const timeframe =
            timeframes[
                (cycle - 1) %
                timeframes.length
            ];

        console.log(
            `[Worker ${this.sessionId}] Looking for chart timeframe "${timeframe}"`
        );

        try {
            const locator =
                page.getByText(
                    timeframe,
                    {
                        exact: true
                    }
                );

            const count =
                await locator.count();

            for (
                let i = 0;
                i < count;
                i++
            ) {
                const item =
                    locator.nth(i);

                const visible =
                    await item
                        .isVisible()
                        .catch(
                            () => false
                        );

                if (!visible) {
                    continue;
                }

                const box =
                    await item
                        .boundingBox()
                        .catch(
                            () => null
                        );

                if (!box) {
                    continue;
                }

                const insideChartWidth =
                    box.x >=
                    chartBox.x -
                    100 &&
                    box.x <=
                    chartBox.x +
                    chartBox.width;

                const nearChartTop =
                    box.y <
                    chartBox.y +
                    100;

                const reasonableSize =
                    box.width < 100 &&
                    box.height < 60;

                if (
                    !insideChartWidth ||
                    !nearChartTop ||
                    !reasonableSize
                ) {
                    continue;
                }

                await item.hover();

                await this.sleep(
                    this.randomBetween(
                        250,
                        550
                    )
                );

                await item.click({
                    timeout: 3000
                });

                console.log(
                    `[Worker ${this.sessionId}] Changed chart timeframe -> ${timeframe}`
                );

                return true;
            }

        } catch (error) {

            console.log(
                `[Worker ${this.sessionId}] Timeframe lookup error: ${error.message}`
            );
        }

        console.log(
            `[Worker ${this.sessionId}] Could not click timeframe "${timeframe}"`
        );

        return false;
    }

    async scrollPage(
        page,
        totalDelta
    ) {
        const direction =
            totalDelta > 0
                ? 'DOWN'
                : 'UP';

        console.log(
            `[Worker ${this.sessionId}] Scrolling ${direction} ${Math.abs(totalDelta)}px`
        );

        const result =
            await page.evaluate(
                async (delta) => {

                    function visibleArea(
                        element
                    ) {
                        const rect =
                            element
                                .getBoundingClientRect();

                        const width =
                            Math.max(
                                0,
                                Math.min(
                                    rect.right,
                                    window.innerWidth
                                ) -
                                Math.max(
                                    rect.left,
                                    0
                                )
                            );

                        const height =
                            Math.max(
                                0,
                                Math.min(
                                    rect.bottom,
                                    window.innerHeight
                                ) -
                                Math.max(
                                    rect.top,
                                    0
                                )
                            );

                        return {
                            area:
                                width *
                                height,

                            width,
                            height,
                            rect
                        };
                    }

                    function isScrollable(
                        element
                    ) {
                        const style =
                            window.getComputedStyle(
                                element
                            );

                        if (
                            style.display === 'none' ||
                            style.visibility === 'hidden'
                        ) {
                            return false;
                        }

                        const range =
                            element.scrollHeight -
                            element.clientHeight;

                        return (
                            range > 100 &&
                            (
                                style.overflowY === 'auto' ||
                                style.overflowY === 'scroll' ||
                                style.overflowY === 'overlay'
                            )
                        );
                    }

                    const candidates = [];

                    const elements =
                        Array.from(
                            document.querySelectorAll(
                                '*'
                            )
                        );

                    for (
                        const element
                        of elements
                    ) {
                        if (
                            !isScrollable(
                                element
                            )
                        ) {
                            continue;
                        }

                        const visibility =
                            visibleArea(
                                element
                            );

                        if (
                            visibility.width < 150 ||
                            visibility.height < 150
                        ) {
                            continue;
                        }

                        const rect =
                            visibility.rect;

                        const maxScroll =
                            element.scrollHeight -
                            element.clientHeight;

                        const centreX =
                            window.innerWidth /
                            2;

                        const centreY =
                            window.innerHeight /
                            2;

                        const containsCentre =
                            centreX >= rect.left &&
                            centreX <= rect.right &&
                            centreY >= rect.top &&
                            centreY <= rect.bottom;

                        let score =
                            visibility.area;

                        if (
                            containsCentre
                        ) {
                            score +=
                                1000000;
                        }

                        score +=
                            Math.min(
                                maxScroll,
                                10000
                            );

                        candidates.push({
                            element,
                            score,
                            maxScroll,
                            visibility
                        });
                    }

                    candidates.sort(
                        (a, b) =>
                            b.score -
                            a.score
                    );

                    if (
                        candidates.length === 0
                    ) {
                        return {
                            success: false,
                            candidatesFound: 0
                        };
                    }

                    const target =
                        candidates[0]
                            .element;

                    const before =
                        target.scrollTop;

                    const steps =
                        10;

                    const step =
                        delta /
                        steps;

                    for (
                        let i = 0;
                        i < steps;
                        i++
                    ) {
                        target.scrollTop +=
                            step;

                        await new Promise(
                            resolve =>
                                setTimeout(
                                    resolve,
                                    60
                                )
                        );
                    }

                    const after =
                        target.scrollTop;

                    const rect =
                        target
                            .getBoundingClientRect();

                    return {
                        success:
                            before !== after,

                        candidatesFound:
                            candidates.length,

                        before:
                            Math.round(
                                before
                            ),

                        after:
                            Math.round(
                                after
                            ),

                        maxScroll:
                            Math.round(
                                target.scrollHeight -
                                target.clientHeight
                            ),

                        width:
                            Math.round(
                                rect.width
                            ),

                        height:
                            Math.round(
                                rect.height
                            ),

                        x:
                            Math.round(
                                rect.x
                            ),

                        y:
                            Math.round(
                                rect.y
                            )
                    };
                },
                totalDelta
            );

        if (result.success) {

            console.log(
                `[Worker ${this.sessionId}] Panel scroll: ` +
                `${result.before} -> ${result.after} / ${result.maxScroll}`
            );

            console.log(
                `[Worker ${this.sessionId}] Panel: ` +
                `${result.width}x${result.height} at ${result.x},${result.y}`
            );

        } else {

            console.log(
                `[Worker ${this.sessionId}] No panel was scrolled`
            );
        }
    }

    async performSafeClick(
        page,
        cycle
    ) {
        const labels =
            config.SAFE_CLICK_TEXTS;

        if (
            !labels ||
            labels.length === 0
        ) {
            return false;
        }

        const text =
            labels[
                (cycle - 1) %
                labels.length
            ];

        console.log(
            `[Worker ${this.sessionId}] Looking for "${text}"`
        );

        const roles = [
            'tab',
            'button',
            'link'
        ];

        for (
            const role
            of roles
        ) {
            try {
                const locator =
                    page
                        .getByRole(
                            role,
                            {
                                name:
                                    text,

                                exact:
                                    true
                            }
                        )
                        .first();

                const visible =
                    await locator
                        .isVisible()
                        .catch(
                            () =>
                                false
                        );

                if (!visible) {
                    continue;
                }

                await locator
                    .scrollIntoViewIfNeeded();

                await locator.hover();

                await this.sleep(
                    this.randomBetween(
                        300,
                        700
                    )
                );

                await locator.click({
                    timeout:
                        3000
                });

                console.log(
                    `[Worker ${this.sessionId}] Clicked "${text}" (${role})`
                );

                return true;

            } catch (error) {

                // Try next role
            }
        }

        console.log(
            `[Worker ${this.sessionId}] Could not click "${text}"`
        );

        return false;
    }

    async randomPause() {
        const ms =
            this.randomBetween(
                config.PAUSE_BETWEEN_ACTIONS_RANGE_MS[0],
                config.PAUSE_BETWEEN_ACTIONS_RANGE_MS[1]
            );

        await this.sleep(ms);
    }

    randomBetween(
        min,
        max
    ) {
        return Math.floor(
            Math.random() *
            (
                max -
                min +
                1
            )
        ) + min;
    }

    randomFrom(array) {
        return array[
            Math.floor(
                Math.random() *
                array.length
            )
        ];
    }

    sleep(ms) {
        return new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    ms
                )
        );
    }
}

module.exports = ResearchWorker;