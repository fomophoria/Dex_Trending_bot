// index.js

const ResearchWorker = require('./research_worker');
const config = require('./config');
const ProxyManager = require('./proxy_manager');

async function runSimulation() {

    console.log('');
    console.log('========================================');
    console.log('       DEX BROWSER TEST STARTING        ');
    console.log('========================================');
    console.log('');

    console.log(`Target: ${config.TARGET_URL}`);
    console.log(`Worker pool size: ${config.MAX_CONCURRENT_SESSIONS}`);
    console.log(`Debug/browser visible: ${config.DEBUG_MODE}`);
    console.log('');

    /*
     * Proxy provider pre-flight check.
     *
     * ResearchWorker now obtains its proxy directly from ProxyManager,
     * so index.js no longer assigns proxies from config.PROXY_LIST.
     */

    console.log('[System] Checking ASocks proxy balance...');

    let balance;

    try {
        const balanceResult = await ProxyManager.getBalance();

        balance = Number.parseFloat(balanceResult);

        if (!Number.isFinite(balance)) {
            throw new Error(
                `Invalid balance returned by ProxyManager: ${balanceResult}`
            );
        }

        console.log(
            `[System] Current ASocks Balance: $${balance.toFixed(2)}`
        );

    } catch (error) {

        console.error(
            '[System] CRITICAL: Unable to retrieve ASocks balance:',
            error.message || error
        );

        process.exit(1);
    }

    if (balance < 1.00) {

        console.error(
            '[System] CRITICAL: Balance too low to sustain the configured worker pool.'
        );

        process.exit(1);
    }

    console.log(
        '[System] Proxy pre-flight check passed.'
    );

    console.log('');

    const WORKER_POOL_SIZE =
        Math.max(
            1,
            Number(config.MAX_CONCURRENT_SESSIONS) || 1
        );

    const MIN_ACTIVE_SESSIONS =
        Math.max(
            1,
            Math.min(
                Number(config.MIN_ACTIVE_SESSIONS) || 3,
                WORKER_POOL_SIZE
            )
        );

    const MAX_ACTIVE_SESSIONS =
        Math.max(
            MIN_ACTIVE_SESSIONS,
            Math.min(
                Number(config.MAX_ACTIVE_SESSIONS) || WORKER_POOL_SIZE,
                WORKER_POOL_SIZE
            )
        );

    const START_DELAY_RANGE =
        Array.isArray(config.WORKER_START_DELAY_RANGE_MS)
            ? config.WORKER_START_DELAY_RANGE_MS
            : [2000, 12000];

    const RESTART_DELAY_RANGE =
        Array.isArray(config.WORKER_RESTART_DELAY_RANGE_MS)
            ? config.WORKER_RESTART_DELAY_RANGE_MS
            : [3000, 15000];

    console.log(
        `Active session range: ${MIN_ACTIVE_SESSIONS}-${MAX_ACTIVE_SESSIONS}`
    );

    console.log(
        `Worker launch delay: ${START_DELAY_RANGE[0]}-${START_DELAY_RANGE[1]}ms`
    );

    console.log(
        `Worker restart delay: ${RESTART_DELAY_RANGE[0]}-${RESTART_DELAY_RANGE[1]}ms`
    );

    console.log('');
    console.log('========================================');
    console.log('        RANDOM SCHEDULER STARTED        ');
    console.log('========================================');
    console.log('');

    let nextWorkerId = 1;
    let activeWorkers = 0;
    let totalRuns = 0;
    let shuttingDown = false;

    /*
     * Keep references to currently executing workers.
     */
    const runningWorkers = new Set();

    /*
     * Utility functions.
     */

    const sleep = ms => {
        return new Promise(
            resolve => setTimeout(resolve, ms)
        );
    };

    const randomBetween = (min, max) => {

        min = Math.floor(
            Number(min)
        );

        max = Math.floor(
            Number(max)
        );

        if (!Number.isFinite(min)) {
            min = 0;
        }

        if (!Number.isFinite(max)) {
            max = min;
        }

        if (max < min) {
            [min, max] = [max, min];
        }

        return Math.floor(
            Math.random() *
            (max - min + 1)
        ) + min;
    };

    /*
     * Graceful shutdown.
     *
     * Ctrl+C prevents additional workers from being created.
     * Existing workers are allowed to finish and close normally.
     */

    process.on(
        'SIGINT',
        () => {

            if (shuttingDown) {
                return;
            }

            shuttingDown = true;

            console.log('');
            console.log('========================================');
            console.log('        SHUTDOWN REQUEST RECEIVED       ');
            console.log('========================================');
            console.log('');

            console.log(
                `[System] Waiting for ${activeWorkers} active worker(s) to finish...`
            );
        }
    );

    /*
     * Launch one worker.
     */

    async function spawnWorker() {

        if (shuttingDown) {
            return;
        }

        /*
         * Worker IDs rotate through the configured pool.
         *
         * Example with 30:
         *
         * 1,2,3 ... 29,30,1,2,3...
         */

        const workerId =
            nextWorkerId;

        nextWorkerId++;

        if (
            nextWorkerId >
            WORKER_POOL_SIZE
        ) {
            nextWorkerId = 1;
        }

        activeWorkers++;
        totalRuns++;

        const runNumber =
            totalRuns;

        console.log('');

        console.log(
            `[System] Spawning Worker ${workerId} ` +
            `(Run ${runNumber} | ${activeWorkers} active)`
        );

        /*
         * ResearchWorker now obtains its proxy directly
         * from ProxyManager using the worker/session ID.
         *
         * We therefore only pass workerId here.
         */

        const worker =
            new ResearchWorker(
                workerId
            );

        const workerPromise =
            (async () => {

                try {

                    await worker.start();

                } catch (error) {

                    console.error(
                        `[System] Worker ${workerId} failed:`,
                        error
                    );

                } finally {

                    activeWorkers--;

                    console.log(
                        `[System] Worker ${workerId} finished ` +
                        `(Run ${runNumber} | ${activeWorkers} active)`
                    );
                }

            })();

        runningWorkers.add(
            workerPromise
        );

        workerPromise.finally(
            () => {
                runningWorkers.delete(
                    workerPromise
                );
            }
        );
    }

    /*
     * Initial ramp-up.
     *
     * Rather than immediately opening every browser,
     * choose a random initial concurrency level
     * and stagger each launch.
     */

    const initialTarget =
        randomBetween(
            MIN_ACTIVE_SESSIONS,
            MAX_ACTIVE_SESSIONS
        );

    console.log(
        `[System] Initial target: ${initialTarget} active worker(s)`
    );

    for (
        let i = 0;
        i < initialTarget;
        i++
    ) {

        if (shuttingDown) {
            break;
        }

        const delay =
            randomBetween(
                START_DELAY_RANGE[0],
                START_DELAY_RANGE[1]
            );

        console.log(
            `[System] Worker launch scheduled in ` +
            `${(delay / 1000).toFixed(1)}s`
        );

        await sleep(
            delay
        );

        if (shuttingDown) {
            break;
        }

        spawnWorker();
    }

    /*
     * Continuous scheduler.
     *
     * After the initial ramp-up:
     *
     *  - choose a new random desired concurrency
     *  - compare it with currently active workers
     *  - gradually start additional workers where necessary
     *  - completed workers naturally reduce concurrency
     *  - repeat indefinitely
     */

    while (!shuttingDown) {

        const desiredWorkers =
            randomBetween(
                MIN_ACTIVE_SESSIONS,
                MAX_ACTIVE_SESSIONS
            );

        console.log('');

        console.log(
            `[Scheduler] Active: ${activeWorkers} | ` +
            `New random target: ${desiredWorkers}`
        );

        /*
         * Only add workers when below the randomly selected target.
         *
         * If the target drops below the current active count,
         * existing workers are NOT killed.
         *
         * They simply finish naturally.
         */

        if (
            activeWorkers <
            desiredWorkers
        ) {

            const requiredWorkers =
                desiredWorkers -
                activeWorkers;

            console.log(
                `[Scheduler] Need ${requiredWorkers} additional worker(s)`
            );

            for (
                let i = 0;
                i < requiredWorkers;
                i++
            ) {

                if (shuttingDown) {
                    break;
                }

                /*
                 * Recalculate available capacity
                 * before every spawn.
                 */

                if (
                    activeWorkers >=
                    MAX_ACTIVE_SESSIONS
                ) {
                    break;
                }

                const launchDelay =
                    randomBetween(
                        START_DELAY_RANGE[0],
                        START_DELAY_RANGE[1]
                    );

                console.log(
                    `[Scheduler] Next worker in ` +
                    `${(launchDelay / 1000).toFixed(1)}s`
                );

                await sleep(
                    launchDelay
                );

                if (shuttingDown) {
                    break;
                }

                if (
                    activeWorkers <
                    MAX_ACTIVE_SESSIONS
                ) {
                    spawnWorker();
                }
            }

        } else {

            console.log(
                '[Scheduler] No additional workers required.'
            );
        }

        /*
         * Random amount of time before concurrency
         * is reconsidered.
         */

        const schedulerDelay =
            randomBetween(
                RESTART_DELAY_RANGE[0],
                RESTART_DELAY_RANGE[1]
            );

        console.log(
            `[Scheduler] Re-evaluating in ` +
            `${(schedulerDelay / 1000).toFixed(1)}s`
        );

        await sleep(
            schedulerDelay
        );
    }

    /*
     * Shutdown.
     *
     * Stop creating workers and allow anything
     * already running to finish normally.
     */

    if (
        runningWorkers.size >
        0
    ) {

        console.log('');

        console.log(
            `[System] Waiting for ${runningWorkers.size} worker(s)...`
        );

        await Promise.allSettled(
            Array.from(
                runningWorkers
            )
        );
    }

    console.log('');
    console.log('========================================');
    console.log('         ALL SESSIONS FINISHED          ');
    console.log('========================================');
    console.log('');
}

/*
 * Global error handling.
 */

process.on(
    'unhandledRejection',
    error => {

        console.error(
            'Unhandled Promise Rejection:',
            error
        );
    }
);

process.on(
    'uncaughtException',
    error => {

        console.error(
            'Uncaught Exception:',
            error
        );

        process.exit(1);
    }
);

/*
 * Start application.
 */

runSimulation().catch(
    error => {

        console.error(
            'Critical Error:',
            error
        );

        process.exit(1);
    }
);