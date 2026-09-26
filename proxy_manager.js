// proxy_manager.js

class ProxyManager {
    static API_BASE = 'https://api.asocks.com/v2';

    /*
     * Keep the API key in the environment.
     *
     * PowerShell:
     *   $env:ASOCKS_API_KEY = "YOUR_KEY"
     *
     * Do NOT hard-code it here, especially if this project is pushed
     * to GitHub.
     */
    static API_KEY = process.env.ASOCKS_API_KEY;

    /*
     * Regions supported by the rest of the project.
     * These match IdentityFactory.REGIONAL_DATA.
     */
    static REGIONS = [
        'us',
        'gb',
        'de',
        'fr',
        'ca',
        'nl',
        'es',
        'it',
        'se',
        'ch',
        'au',
        'sg',
        'jp',
        'br',
        'kr',
        'in'
    ];

    /*
     * Number of proxies to ask ASocks for per request.
     */
    static SEARCH_LIMIT = 10;

    /*
     * Maximum amount of time to wait for the ASocks API.
     */
    static API_TIMEOUT_MS = 15000;

    /*
     * Internal counter only.
     *
     * This is NOT used to manufacture proxy credentials.
     */
    static SESSION_COUNTER = 0;


    // ================================================================
    // UTILITY METHODS
    // ================================================================

    static getRandomRegion() {
        return this.REGIONS[
            Math.floor(Math.random() * this.REGIONS.length)
        ];
    }


    static randomFrom(array) {
        return array[
            Math.floor(Math.random() * array.length)
        ];
    }


    static shuffle(array) {
        const copy = [...array];

        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));

            [copy[i], copy[j]] = [
                copy[j],
                copy[i]
            ];
        }

        return copy;
    }


    // ================================================================
    // ASOCKS API REQUEST
    // ================================================================

    static async requestJson(endpoint, params = {}) {
        if (!this.API_KEY) {
            throw new Error(
                'ASOCKS_API_KEY environment variable is not set'
            );
        }

        const url = new URL(
            `${this.API_BASE}${endpoint}`
        );

        /*
         * ASocks documentation specifies apiKey as a query parameter.
         */
        url.searchParams.set(
            'apiKey',
            this.API_KEY
        );

        for (const [key, value] of Object.entries(params)) {
            if (
                value !== undefined &&
                value !== null &&
                value !== ''
            ) {
                url.searchParams.set(
                    key,
                    String(value)
                );
            }
        }

        const controller = new AbortController();

        const timeout = setTimeout(
            () => controller.abort(),
            this.API_TIMEOUT_MS
        );

        try {
            const response = await fetch(
                url,
                {
                    method: 'GET',

                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },

                    signal: controller.signal
                }
            );

            const raw = await response.text();

            let data;

            try {
                data = JSON.parse(raw);
            } catch (error) {
                throw new Error(
                    `ASocks returned invalid JSON: ${raw.slice(0, 200)}`
                );
            }

            if (!response.ok) {
                const message =
                    data?.message ||
                    data?.error ||
                    `HTTP ${response.status}`;

                throw new Error(
                    `ASocks API error: ${message}`
                );
            }

            if (data?.success === false) {
                throw new Error(
                    `ASocks API rejected request: ${
                        data?.message ||
                        data?.error ||
                        'unknown error'
                    }`
                );
            }

            return data;

        } catch (error) {

            if (error.name === 'AbortError') {
                throw new Error(
                    `ASocks API timed out after ${this.API_TIMEOUT_MS}ms`
                );
            }

            throw error;

        } finally {
            clearTimeout(timeout);
        }
    }


    // ================================================================
    // BALANCE
    // ================================================================

    static async getBalance() {
        const data = await this.requestJson(
            '/user/balance'
        );

        /*
         * ASocks currently returns:
         *
         * {
         *   success: true,
         *   balance: "...",
         *   balance_traffic: "...",
         *   all_available_traffic: "...",
         *   ...
         * }
         */

        const balance = Number(
            data?.balance
        );

        if (!Number.isFinite(balance)) {
            throw new Error(
                'ASocks returned an invalid balance value'
            );
        }

        return balance;
    }


    // ================================================================
    // FIND PROXY STRINGS INSIDE ASOCKS RESPONSE
    // ================================================================

    static extractProxyCandidates(data) {
        const results = new Set();

        const inspect = (value) => {

            if (typeof value === 'string') {
                const candidate = value.trim();

                if (this.looksLikeProxy(candidate)) {
                    results.add(candidate);
                }

                return;
            }

            if (Array.isArray(value)) {
                for (const item of value) {
                    inspect(item);
                }

                return;
            }

            if (
                value &&
                typeof value === 'object'
            ) {
                for (
                    const [key, item] of Object.entries(value)
                ) {
                    /*
                     * Ignore obvious non-proxy metadata.
                     */
                    if (
                        key === 'success' ||
                        key === 'balance' ||
                        key === 'balance_traffic' ||
                        key === 'all_available_traffic' ||
                        key === 'prepared_traffic_balance' ||
                        key === 'balance_hold'
                    ) {
                        continue;
                    }

                    inspect(item);
                }
            }
        };

        inspect(data);

        return Array.from(results);
    }


    static looksLikeProxy(value) {
        if (
            !value ||
            typeof value !== 'string'
        ) {
            return false;
        }

        /*
         * ASocks may return:
         *
         * 185.100.xxx.xxx:9999
         *
         * OR
         *
         * http://username:password@185.100.xxx.xxx:9999
         */

        const valueWithProtocol =
            /^[a-z]+:\/\//i.test(value)
                ? value
                : `http://${value}`;

        try {
            const parsed = new URL(
                valueWithProtocol
            );

            return Boolean(
                parsed.hostname &&
                parsed.port
            );

        } catch (error) {
            return false;
        }
    }


    // ================================================================
    // NORMALISE ASOCKS PROXY
    // ================================================================

    static parseProxy(candidate) {
        if (!candidate) {
            return null;
        }

        let value = candidate.trim();

        /*
         * A bare:
         *
         *     1.2.3.4:9999
         *
         * is treated as HTTP.
         */
        if (!/^[a-z]+:\/\//i.test(value)) {
            value = `http://${value}`;
        }

        let parsed;

        try {
            parsed = new URL(value);
        } catch (error) {
            return null;
        }

        if (
            !parsed.hostname ||
            !parsed.port
        ) {
            return null;
        }

        /*
         * Preserve the proxy protocol returned by ASocks.
         */
        let protocol = parsed.protocol;

        if (!protocol) {
            protocol = 'http:';
        }

        const server =
            `${protocol}//${parsed.hostname}:${parsed.port}`;

        let username;

        let password;

        try {
            username = parsed.username
                ? decodeURIComponent(parsed.username)
                : undefined;

            password = parsed.password
                ? decodeURIComponent(parsed.password)
                : undefined;

        } catch (error) {
            username =
                parsed.username ||
                undefined;

            password =
                parsed.password ||
                undefined;
        }

        return {
            server,
            username,
            password
        };
    }


    // ================================================================
    // GET PROXY FOR WORKER
    // ================================================================

    static async getProxyConfig(sessionId) {
        if (!this.API_KEY) {
            console.log(
                '[ProxyManager] ASOCKS_API_KEY not set - proxy disabled'
            );

            return null;
        }

        const uniqueSessionId =
            ++this.SESSION_COUNTER;

        /*
         * Start with one random region, then try the remaining
         * configured regions if ASocks has no proxies available there.
         */
        const firstRegion =
            this.getRandomRegion();

        const remainingRegions =
            this.shuffle(
                this.REGIONS.filter(
                    region => region !== firstRegion
                )
            );

        const regionsToTry = [
            firstRegion,
            ...remainingRegions
        ];

        let lastError = null;

        /*
         * We don't need to try every country forever.
         * Five different regions gives us sensible fallback behaviour.
         */
        const maxRegionAttempts = Math.min(
            5,
            regionsToTry.length
        );

        for (
            let attempt = 0;
            attempt < maxRegionAttempts;
            attempt++
        ) {
            const region =
                regionsToTry[attempt];

            const country =
                region.toUpperCase();

            try {
                console.log(
                    `[ProxyManager] Requesting ${country} proxy from ASocks API...`
                );

                const response =
                    await this.requestJson(
                        '/proxy/search',
                        {
                            country,
                            limit: this.SEARCH_LIMIT
                        }
                    );

                const candidates =
                    this.extractProxyCandidates(
                        response
                    );

                if (candidates.length === 0) {
                    console.log(
                        `[ProxyManager] No ${country} proxies returned`
                    );

                    continue;
                }

                /*
                 * Randomise which returned proxy gets used.
                 */
                const candidate =
                    this.randomFrom(
                        candidates
                    );

                const parsed =
                    this.parseProxy(
                        candidate
                    );

                if (!parsed) {
                    console.log(
                        `[ProxyManager] Invalid ${country} proxy returned`
                    );

                    continue;
                }

                /*
                 * Do not print username/password into the console.
                 */
                console.log(
                    `[ProxyManager] ${country} proxy selected: ${parsed.server}`
                );

                if (parsed.username) {
                    console.log(
                        `[ProxyManager] Proxy authentication: YES`
                    );
                } else {
                    console.log(
                        `[ProxyManager] Proxy authentication: NO`
                    );
                }

                return {
                    server: parsed.server,

                    username: parsed.username,

                    password: parsed.password,

                    region,

                    uniqueSessionId,

                    workerSessionId: sessionId,

                    expiresAt:
                        Date.now() +
                        (15 * 60 * 1000)
                };

            } catch (error) {
                lastError = error;

                console.log(
                    `[ProxyManager] ${country} failed: ${error.message}`
                );
            }
        }

        /*
         * If ASocks is enabled but no proxy can be obtained,
         * throwing is preferable to silently sending traffic
         * through the machine's real connection.
         */
        throw new Error(
            `Unable to obtain ASocks proxy${
                lastError
                    ? `: ${lastError.message}`
                    : ''
            }`
        );
    }


    // ================================================================
    // OPTIONAL STRING FORMAT
    // ================================================================

    static async getProxyString(sessionId) {
        const proxy =
            await this.getProxyConfig(
                sessionId
            );

        if (!proxy) {
            return null;
        }

        const parsed =
            new URL(proxy.server);

        if (proxy.username) {
            parsed.username =
                encodeURIComponent(
                    proxy.username
                );
        }

        if (proxy.password) {
            parsed.password =
                encodeURIComponent(
                    proxy.password
                );
        }

        return parsed
            .toString()
            .replace(/\/$/, '');
    }


    // ================================================================
    // COMPATIBILITY METHODS
    // ================================================================

    static clearProxy(sessionId) {
        /*
         * ASocks search results do not require local cache cleanup.
         * Kept for compatibility with older project code.
         */
    }


    static clearAllProxies() {
        /*
         * Kept for compatibility with older project code.
         */
    }
}


module.exports = ProxyManager;