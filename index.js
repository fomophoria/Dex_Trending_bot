// index.js
// Stable worker-pool manager.
// Scheduled workers count toward the pool immediately,
// preventing the previous over-spawn problem during staggered startup delays.

const ResearchWorker =
  require('./research_worker');

const config =
  require('./config');

const ProxyManager =
  require('./proxy_manager');


async function runSimulation() {
  console.log('');
  console.log('========================================');
  console.log('   DEX SCREENER RESEARCH RUNNER         ');
  console.log('========================================');
  console.log('');

  console.log(
    `Target: ${config.TARGET_URL}`
  );

  console.log(
    `Pool size: ${config.MAX_CONCURRENT_SESSIONS}`
  );

  console.log(
    `Debug: ${config.DEBUG_MODE}`
  );

  console.log('');


  /*
   * Proxy balance check
   */

  if (
    config.PROXY_ENABLED
  ) {
    console.log(
      '[System] Checking proxy balance...'
    );

    try {
      const balance =
        await ProxyManager.getBalance();

      console.log(
        `[System] Balance: $${balance.toFixed(2)}`
      );

      if (
        balance < 1.0
      ) {
        console.error(
          '[System] Insufficient proxy balance'
        );

        process.exit(1);
      }

    } catch (error) {
      console.error(
        '[System] Proxy check failed:',
        error.message
      );

      process.exit(1);
    }
  }


  /*
   * Pool limits
   */

  const POOL_SIZE =
    Math.max(
      1,
      Number(
        config.MAX_CONCURRENT_SESSIONS
      ) || 1
    );


  const MIN_ACTIVE =
    Math.max(
      1,

      Math.min(
        Number(
          config.MIN_ACTIVE_SESSIONS
        ) || 1,

        POOL_SIZE
      )
    );


  const MAX_ACTIVE =
    Math.max(
      MIN_ACTIVE,

      Math.min(
        Number(
          config.MAX_ACTIVE_SESSIONS
        ) || POOL_SIZE,

        POOL_SIZE
      )
    );


  const START_DELAY =
    Array.isArray(
      config.WORKER_START_DELAY_RANGE_MS
    )
      ? config.WORKER_START_DELAY_RANGE_MS
      : [3000, 35000];


  const RESTART_DELAY =
    Array.isArray(
      config.WORKER_RESTART_DELAY_RANGE_MS
    )
      ? config.WORKER_RESTART_DELAY_RANGE_MS
      : [15000, 90000];


  const targetSlots =
    randomBetween(
      MIN_ACTIVE,
      MAX_ACTIVE
    );


  console.log(
    `Active target: ${targetSlots}`
  );

  console.log(
    `Start delay: ` +
    `${START_DELAY[0]}-` +
    `${START_DELAY[1]}ms`
  );

  console.log(
    `Restart delay: ` +
    `${RESTART_DELAY[0]}-` +
    `${RESTART_DELAY[1]}ms`
  );


  console.log('');

  console.log('========================================');
  console.log('   POOL MANAGER STARTED                 ');
  console.log('========================================');

  console.log('');


  /*
   * Worker state
   */

  let shuttingDown =
    false;

  let totalRuns =
    0;

  let nextRunId =
    1;


  const slotPromises =
    new Set();


  const liveWorkers =
    new Set();


  function randomBetween(
    min,
    max
  ) {
    const low =
      Math.ceil(
        Number(min)
      );

    const high =
      Math.floor(
        Number(max)
      );


    if (
      !Number.isFinite(low) ||
      !Number.isFinite(high)
    ) {
      throw new Error(
        `Invalid random range: ${min}-${max}`
      );
    }


    if (
      high <= low
    ) {
      return low;
    }


    return Math.floor(
      Math.random() *
      (
        high -
        low +
        1
      )
    ) + low;
  }


  const sleep =
    ms =>
      new Promise(
        resolve =>
          setTimeout(
            resolve,

            Math.max(
              0,
              Math.floor(ms)
            )
          )
      );


  /*
   * Sleep that exits quickly when
   * Ctrl+C / SIGTERM is received.
   */

  async function interruptibleSleep(
    ms
  ) {
    const end =
      Date.now() +
      ms;


    while (
      !shuttingDown &&
      Date.now() < end
    ) {
      await sleep(
        Math.min(
          250,
          end -
          Date.now()
        )
      );
    }
  }


  /*
   * Execute one worker instance.
   */

  async function runOneWorker(
    slotId
  ) {
    const runId =
      nextRunId++;


    totalRuns++;


    console.log(
      `\n[System] === Slot ` +
      `${slotId} / ` +
      `Run #${runId} ===`
    );


    const worker =
      new ResearchWorker(
        runId
      );


    liveWorkers.add(
      worker
    );


    try {
      await worker.start();


      console.log(
        `[System] Run #${runId} completed`
      );

    } catch (error) {
      console.error(
        `[System] Run #${runId} error: ${error.message}`
      );

    } finally {
      liveWorkers.delete(
        worker
      );
    }
  }


  /*
   * One permanent slot.
   *
   * Each slot:
   * - starts after a staggered delay
   * - runs one worker
   * - waits for restart delay
   * - runs another worker
   *
   * This avoids the old pool maintenance
   * race condition entirely.
   */

  async function runSlot(
    slotId
  ) {
    const firstDelay =
      randomBetween(
        START_DELAY[0],
        START_DELAY[1]
      );


    console.log(
      `[System] Slot ` +
      `${slotId} ` +
      `starting in ` +
      `${firstDelay}ms`
    );


    await interruptibleSleep(
      firstDelay
    );


    while (
      !shuttingDown
    ) {
      await runOneWorker(
        slotId
      );


      if (
        shuttingDown
      ) {
        break;
      }


      const restartDelay =
        randomBetween(
          RESTART_DELAY[0],
          RESTART_DELAY[1]
        );


      console.log(
        `[System] Slot ` +
        `${slotId} ` +
        `restarting in ` +
        `${restartDelay}ms`
      );


      await interruptibleSleep(
        restartDelay
      );
    }
  }


  /*
   * Shutdown handling
   */

  function beginShutdown(
    signalName
  ) {
    if (
      shuttingDown
    ) {
      return;
    }


    shuttingDown =
      true;


    console.log(
      `\n[System] ${signalName} received...`
    );
  }


  process.once(
    'SIGINT',

    () =>
      beginShutdown(
        'Shutdown signal'
      )
  );


  process.once(
    'SIGTERM',

    () =>
      beginShutdown(
        'Termination signal'
      )
  );


  /*
   * Start fixed worker slots.
   */

  console.log(
    `[System] Starting ` +
    `${targetSlots} ` +
    `worker slot(s)...`
  );


  for (
    let slotId = 1;
    slotId <= targetSlots;
    slotId++
  ) {
    const promise =
      runSlot(
        slotId
      );


    slotPromises.add(
      promise
    );


    promise.finally(
      () =>
        slotPromises.delete(
          promise
        )
    );
  }


  /*
   * Keep main process alive.
   */

  while (
    !shuttingDown
  ) {
    await sleep(
      250
    );
  }


  /*
   * Wait for all slot loops to stop.
   */

  if (
    slotPromises.size > 0
  ) {
    console.log(
      `[System] Waiting for ` +
      `${slotPromises.size} ` +
      `slot(s) to stop...`
    );


    await Promise.allSettled(
      Array.from(
        slotPromises
      )
    );
  }


  console.log('');

  console.log('========================================');
  console.log('   ALL SESSIONS COMPLETED               ');

  console.log(
    `   Total runs: ${totalRuns}`
  );

  console.log('========================================');

  console.log('');
}


/*
 * Global error handlers
 */

process.on(
  'unhandledRejection',

  error => {
    console.error(
      'Unhandled rejection:',
      error
    );
  }
);


process.on(
  'uncaughtException',

  error => {
    console.error(
      'Uncaught exception:',
      error
    );

    process.exit(1);
  }
);


runSimulation()
  .catch(
    error => {
      console.error(
        'Critical error:',
        error
      );

      process.exit(1);
    }
  );