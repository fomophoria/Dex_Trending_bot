// research_worker.js

const { chromium } = require('playwright-extra');

const stealth =
    require('puppeteer-extra-plugin-stealth')();

const config =
    require('./config');

const IdentityFactory =
    require('./identity_factory');


chromium.use(stealth);


class ResearchWorker {

    constructor(sessionId) {

        this.sessionId =
            sessionId;

        this.identity =
            IdentityFactory.generate();


        if (
            Array.isArray(config.PROXY_LIST) &&
            config.PROXY_LIST.length > 0
        ) {

            this.proxy =
                config.PROXY_LIST[
                    (sessionId - 1) %
                    config.PROXY_LIST.length
                ];

        } else {

            this.proxy = null;
        }
    }


    /*
    ================================================================
    START
    ================================================================
    */

    async start() {

        console.log('');

        console.log(
            `[Worker ${this.sessionId}] Initialising identity...`
        );

        console.log(
            `[Worker ${this.sessionId}] UA: ` +
            this.identity.userAgent
        );

        console.log(
            `[Worker ${this.sessionId}] Viewport: ` +
            `${this.identity.viewport.width}x` +
            `${this.identity.viewport.height}`
        );

        console.log(
            `[Worker ${this.sessionId}] Timezone: ` +
            this.identity.timezone
        );

        console.log(
            `[Worker ${this.sessionId}] Locale: ` +
            this.identity.locale
        );


        const launchArgs = [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ];


        if (this.proxy) {

            console.log(
                `[Worker ${this.sessionId}] Proxy configured`
            );

            launchArgs.push(
                `--proxy-server=${this.proxy}`
            );
        }


        const browser =
            await chromium.launch({

                headless:
                    !config.DEBUG_MODE,

                args:
                    launchArgs,

                slowMo:
                    config.DEBUG_MODE
                        ? 35
                        : 0
            });


        const context =
            await browser.newContext({

                userAgent:
                    this.identity.userAgent,

                viewport:
                    this.identity.viewport,

                timezoneId:
                    this.identity.timezone,

                locale:
                    this.identity.locale
            });


        const page =
            await context.newPage();


        page.setDefaultTimeout(
            10000
        );


        page.setDefaultNavigationTimeout(
            config.NAVIGATION_TIMEOUT_MS
        );


        try {

            /*
            ========================================================
            LOAD DEX SCREENER
            ========================================================
            */

            const referrer =
                this.randomFrom(
                    config.REFERRERS
                );


            console.log('');

            console.log(
                `[Worker ${this.sessionId}] ` +
                `Opening DEX Screener...`
            );


            await page.goto(
                config.TARGET_URL,
                {
                    waitUntil:
                        'domcontentloaded',

                    timeout:
                        config.NAVIGATION_TIMEOUT_MS,

                    referer:
                        referrer
                }
            );


            console.log(
                `[Worker ${this.sessionId}] DOM loaded`
            );


            await this.sleep(
                config.INITIAL_LOAD_WAIT_MS
            );


            await page.bringToFront();


            console.log(
                `[Worker ${this.sessionId}] ` +
                `Page title: ${await page.title()}`
            );


            console.log(
                `[Worker ${this.sessionId}] ` +
                `Current URL: ${page.url()}`
            );


            /*
            ========================================================
            INTERACTION LOOP
            ========================================================
            */

            console.log('');
            console.log(
                `[Worker ${this.sessionId}] ` +
                `=========================================`
            );

            console.log(
                `[Worker ${this.sessionId}] ` +
                `STARTING INTERACTION LOOP`
            );

            console.log(
                `[Worker ${this.sessionId}] ` +
                `=========================================`
            );


            for (
                let cycle = 1;
                cycle <= config.INTERACTION_CYCLES;
                cycle++
            ) {

                console.log('');

                console.log(
                    `[Worker ${this.sessionId}] ` +
                    `--- Cycle ${cycle}/` +
                    `${config.INTERACTION_CYCLES} ---`
                );


                /*
                 * 1. General mouse movement.
                 */

                await this.moveMouse(
                    page
                );


                await this.randomPause();


                /*
                 * 2. Interact with chart.
                 */

                await this.interactWithChart(
                    page,
                    cycle
                );


                await this.randomPause();


                /*
                 * 3. Scroll one of DEX Screener's internal panels.
                 */

                const distance =
                    this.randomBetween(

                        config
                            .SCROLL_DISTANCE_RANGE[0],

                        config
                            .SCROLL_DISTANCE_RANGE[1]
                    );


                const direction =
                    cycle ===
                    config.INTERACTION_CYCLES

                        ? -1
                        : 1;


                await this.scrollPage(
                    page,
                    distance * direction
                );


                await this.randomPause();


                /*
                 * 4. Table controls.
                 */

                await this.performSafeClick(
                    page,
                    cycle
                );


                await this.randomPause();
            }


            /*
            ========================================================
            FINAL WAIT
            ========================================================
            */

            const dwell =
                this.randomBetween(

                    config.DWELL_TIME_RANGE[0],

                    config.DWELL_TIME_RANGE[1]
                );


            console.log('');

            console.log(
                `[Worker ${this.sessionId}] ` +
                `Interaction loop completed.`
            );


            console.log(
                `[Worker ${this.sessionId}] ` +
                `Keeping browser open for ${dwell}s`
            );


            await this.sleep(
                dwell * 1000
            );


            console.log(
                `[Worker ${this.sessionId}] ` +
                `Session completed successfully.`
            );


        } catch (error) {

            console.error('');

            console.error(
                `[Worker ${this.sessionId}] ERROR:`
            );

            console.error(
                error
            );


            try {

                const filename =
                    `error-worker-${this.sessionId}.png`;


                await page.screenshot({
                    path:
                        filename,

                    fullPage:
                        false
                });


                console.log(
                    `[Worker ${this.sessionId}] ` +
                    `Error screenshot saved: ${filename}`
                );


            } catch (screenshotError) {

                console.error(
                    `[Worker ${this.sessionId}] ` +
                    `Could not save screenshot`
                );
            }


        } finally {

            console.log(
                `[Worker ${this.sessionId}] ` +
                `Closing browser...`
            );


            await browser.close();


            console.log(
                `[Worker ${this.sessionId}] ` +
                `Browser closed.`
            );
        }
    }


    /*
    ================================================================
    GENERAL MOUSE MOVEMENT
    ================================================================
    */

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
            `[Worker ${this.sessionId}] ` +
            `Moving mouse -> ${x}, ${y}`
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


    /*
    ================================================================
    CHART INTERACTION
    ================================================================
    */

    async interactWithChart(
        page,
        cycle
    ) {

        console.log(
            `[Worker ${this.sessionId}] ` +
            `Locating chart...`
        );


        const chartBox =
            await this.findChartBox(
                page
            );


        if (!chartBox) {

            console.log(
                `[Worker ${this.sessionId}] ` +
                `Could not locate chart`
            );

            return false;
        }


        console.log(
            `[Worker ${this.sessionId}] ` +
            `Chart area: ` +
            `${Math.round(chartBox.width)}x` +
            `${Math.round(chartBox.height)} ` +
            `at ` +
            `${Math.round(chartBox.x)},` +
            `${Math.round(chartBox.y)}`
        );


        /*
        ------------------------------------------------------------
        CLICK INSIDE CHART
        ------------------------------------------------------------
        */

        const chartX =
            chartBox.x +
            chartBox.width *
            (
                this.randomBetween(
                    30,
                    75
                ) /
                100
            );


        const chartY =
            chartBox.y +
            chartBox.height *
            (
                this.randomBetween(
                    30,
                    70
                ) /
                100
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
            `[Worker ${this.sessionId}] ` +
            `Clicked chart at ` +
            `${Math.round(chartX)},` +
            `${Math.round(chartY)}`
        );


        await this.sleep(
            this.randomBetween(
                400,
                900
            )
        );


        /*
        ------------------------------------------------------------
        ZOOM CHART OUT
        ------------------------------------------------------------
        */

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


        /*
        ------------------------------------------------------------
        CHANGE TIMEFRAME
        ------------------------------------------------------------
        */

        await this.changeChartTimeframe(
            page,
            cycle,
            chartBox
        );


        return true;
    }


    /*
    ================================================================
    FIND CHART
    ================================================================

    DEX Screener / TradingView uses large canvas elements.

    We find visible canvas elements and select the largest one in
    the main page area.

    If no suitable canvas is found, a viewport-based fallback is used.
    */

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


                const candidates =
                    [];


                for (
                    const canvas of canvases
                ) {

                    const rect =
                        canvas
                            .getBoundingClientRect();


                    const style =
                        window
                            .getComputedStyle(
                                canvas
                            );


                    if (
                        style.display === 'none' ||
                        style.visibility === 'hidden'
                    ) {

                        continue;
                    }


                    /*
                     * Ignore small canvases.
                     */

                    if (
                        rect.width < 450 ||
                        rect.height < 200
                    ) {

                        continue;
                    }


                    /*
                     * Ignore canvases mostly outside the screen.
                     */

                    if (
                        rect.right <= 0 ||
                        rect.bottom <= 0 ||
                        rect.left >= viewportWidth ||
                        rect.top >= viewportHeight
                    ) {

                        continue;
                    }


                    /*
                     * Main chart should not live in the far-right
                     * token information panel.
                     */

                    if (
                        rect.left >
                        viewportWidth * 0.80
                    ) {

                        continue;
                    }


                    candidates.push({

                        x:
                            rect.x,

                        y:
                            rect.y,

                        width:
                            rect.width,

                        height:
                            rect.height,

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


                /*
                 * Fallback based on DEX Screener layout.
                 *
                 * Left navigation is approximately 10%.
                 * Right information panel approximately 25%.
                 */

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


    /*
    ================================================================
    ZOOM CHART OUT
    ================================================================
    */

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

                config
                    .CHART_ZOOM_OUT_STEPS[0],

                config
                    .CHART_ZOOM_OUT_STEPS[1]
            );


        console.log(
            `[Worker ${this.sessionId}] ` +
            `Zooming chart out ` +
            `(${steps} wheel steps)`
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
            `[Worker ${this.sessionId}] ` +
            `Chart zoom action complete`
        );
    }


    /*
    ================================================================
    CHANGE CHART TIMEFRAME
    ================================================================
    */

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
            `[Worker ${this.sessionId}] ` +
            `Looking for chart timeframe "${timeframe}"`
        );


        try {

            /*
             * Generic text locator because DEX Screener's timeframe
             * controls aren't guaranteed to use <button>.
             */

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


                /*
                 * The timeframe toolbar sits above the chart.
                 *
                 * Only accept small controls near the top of the
                 * chart so we don't accidentally click unrelated text.
                 */

                const insideChartWidth =
                    box.x >=
                    chartBox.x - 100 &&

                    box.x <=
                    chartBox.x +
                    chartBox.width;


                const nearChartTop =
                    box.y <
                    chartBox.y + 100;


                const reasonableSize =
                    box.width <
                    100 &&
                    box.height <
                    60;


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
                    timeout:
                        3000
                });


                console.log(
                    `[Worker ${this.sessionId}] ` +
                    `Changed chart timeframe -> ` +
                    `${timeframe}`
                );


                return true;
            }


        } catch (error) {

            console.log(
                `[Worker ${this.sessionId}] ` +
                `Timeframe lookup error: ` +
                `${error.message}`
            );
        }


        console.log(
            `[Worker ${this.sessionId}] ` +
            `Could not click timeframe "${timeframe}"`
        );


        return false;
    }


    /*
    ================================================================
    INTERNAL PANEL SCROLLING
    ================================================================
    */

    async scrollPage(
        page,
        totalDelta
    ) {

        const direction =
            totalDelta > 0
                ? 'DOWN'
                : 'UP';


        console.log(
            `[Worker ${this.sessionId}] ` +
            `Scrolling ${direction} ` +
            `${Math.abs(totalDelta)}px`
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
                                style.overflowY ===
                                    'auto' ||

                                style.overflowY ===
                                    'scroll' ||

                                style.overflowY ===
                                    'overlay'
                            )
                        );
                    }


                    const candidates =
                        [];


                    const elements =
                        Array.from(
                            document.querySelectorAll(
                                '*'
                            )
                        );


                    for (
                        const element of
                        elements
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
                            window.innerWidth / 2;


                        const centreY =
                            window.innerHeight / 2;


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
                        candidates.length ===
                        0
                    ) {

                        return {
                            success:
                                false,

                            candidatesFound:
                                0
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
                            before !==
                            after,

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


        if (
            result.success
        ) {

            console.log(
                `[Worker ${this.sessionId}] ` +
                `Panel scroll: ` +
                `${result.before} -> ` +
                `${result.after} / ` +
                `${result.maxScroll}`
            );


            console.log(
                `[Worker ${this.sessionId}] ` +
                `Panel: ` +
                `${result.width}x` +
                `${result.height} at ` +
                `${result.x},${result.y}`
            );

        } else {

            console.log(
                `[Worker ${this.sessionId}] ` +
                `No panel was scrolled`
            );
        }
    }


    /*
    ================================================================
    TABLE BUTTONS
    ================================================================
    */

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
            `[Worker ${this.sessionId}] ` +
            `Looking for "${text}"`
        );


        const roles = [
            'tab',
            'button',
            'link'
        ];


        for (
            const role of roles
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
                            () => false
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
                    `[Worker ${this.sessionId}] ` +
                    `Clicked "${text}" (${role})`
                );


                return true;


            } catch (error) {

                /*
                 * Try next role.
                 */
            }
        }


        console.log(
            `[Worker ${this.sessionId}] ` +
            `Could not click "${text}"`
        );


        return false;
    }


    /*
    ================================================================
    HELPERS
    ================================================================
    */

    async randomPause() {

        const ms =
            this.randomBetween(

                config
                    .PAUSE_BETWEEN_ACTIONS_RANGE_MS[0],

                config
                    .PAUSE_BETWEEN_ACTIONS_RANGE_MS[1]
            );


        await this.sleep(
            ms
        );
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


    randomFrom(
        array
    ) {

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


module.exports =
    ResearchWorker;