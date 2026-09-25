// index.js

const ResearchWorker =
    require('./research_worker');

const config =
    require('./config');


async function runSimulation() {

    console.log('');
    console.log(
        '========================================'
    );

    console.log(
        '       DEX BROWSER TEST STARTING        '
    );

    console.log(
        '========================================'
    );

    console.log('');

    console.log(
        `Target: ${config.TARGET_URL}`
    );

    console.log(
        `Sessions: ` +
        `${config.MAX_CONCURRENT_SESSIONS}`
    );

    console.log(
        `Debug/browser visible: ` +
        `${config.DEBUG_MODE}`
    );

    console.log('');


    const sessions = [];


    for (
        let i = 1;
        i <=
        config.MAX_CONCURRENT_SESSIONS;
        i++
    ) {

        console.log(
            `[System] Spawning Worker ${i}...`
        );


        const worker =
            new ResearchWorker(i);


        sessions.push(
            worker.start()
        );
    }


    await Promise.all(
        sessions
    );


    console.log('');
    console.log(
        '========================================'
    );

    console.log(
        '         ALL SESSIONS FINISHED          '
    );

    console.log(
        '========================================'
    );

    console.log('');
}


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


runSimulation()
    .catch(
        error => {

            console.error(
                'Critical Error:',
                error
            );

            process.exit(1);
        }
    );