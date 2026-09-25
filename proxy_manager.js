// proxy_manager.js

class ProxyManager {

    /*
     * Keep the API key outside source control.
     *
     * PowerShell example:
     *
     * $env:ASOCKS_API_KEY="YOUR_NEW_KEY"
     *
     * Then:
     *
     * npm start
     */

    static API_KEY = process.env.ASOCKS_API_KEY;

    /*
     * ASocks API endpoints.
     */

    static API_BASE_URL =
        'https://api.asocks.com/v2';

    /*
     * Region rotation.
     *
     * Worker 1 -> US
     * Worker 2 -> GB
     * Worker 3 -> DE
     * etc.
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
        'jp'
    ];

    /*
     * Sticky proxy lifetime metadata.
     *
     * ASocks now supplies the actual proxy/session credentials
     * dynamically through the API.
     *
     * We cache one returned proxy per worker so that the worker
     * continues using the same proxy throughout its session.
     */

    static SESSION_LIFETIME_MINUTES = 15;

    /*
     * Proxy cache.
     *
     * worker 1 -> proxy A
     * worker 2 -> proxy B
     * etc.
     */

    static PROXY_CACHE =
        new Map();

    static ensureConfigured() {

        if (
            !this.API_KEY ||
            typeof this.API_KEY !== 'string' ||
            this.API_KEY.trim().length === 0
        ) {
            throw new Error(
                'ASOCKS_API_KEY environment variable is not configured.'
            );
        }
    }

    /*
     * Retrieve the current ASocks account balance.
     */

    static async getBalance() {

        this.ensureConfigured();

        const url =
            `${this.API_BASE_URL}/user/balance` +
            `?apiKey=${encodeURIComponent(this.API_KEY)}`;

        const response =
            await fetch(
                url,
                {
                    method: 'GET',

                    headers: {
                        accept:
                            'application/json'
                    }
                }
            );

        if (!response.ok) {

            throw new Error(
                `ASocks balance request failed: ` +
                `${response.status} ${response.statusText}`
            );
        }

        const data =
            await response.json();

        const balance =
            Number(
                data.balance
            );

        if (
            !Number.isFinite(
                balance
            )
        ) {

            throw new Error(
                'ASocks returned an invalid balance response.'
            );
        }

        return balance;
    }

    /*
     * Pick a region for a worker.
     *
     * Worker 1 -> first region
     * Worker 2 -> second region
     * etc.
     */

    static getRegion(sessionId) {

        const numericSessionId =
            Number(
                sessionId
            );

        if (
            !Number.isInteger(
                numericSessionId
            ) ||
            numericSessionId < 1
        ) {

            throw new Error(
                `Invalid proxy session ID: ${sessionId}`
            );
        }

        const index =
            (
                numericSessionId -
                1
            ) %
            this.REGIONS.length;

        return this.REGIONS[
            index
        ];
    }

    /*
     * Recursively search an ASocks API response for
     * authenticated HTTP proxy URLs.
     *
     * This deliberately supports several possible response
     * structures instead of assuming that ASocks always
     * returns the array under one particular property name.
     */

    static extractProxyUrls(value) {

        const proxies =
            [];

        const walk =
            item => {

                if (
                    typeof item ===
                    'string'
                ) {

                    if (
                        item.startsWith(
                            'http://'
                        ) ||
                        item.startsWith(
                            'https://'
                        )
                    ) {

                        try {

                            const parsed =
                                new URL(
                                    item
                                );

                            if (
                                parsed.hostname &&
                                parsed.port
                            ) {

                                proxies.push(
                                    item
                                );
                            }

                        } catch (error) {

                            // Ignore non-URL strings.
                        }
                    }

                    return;
                }

                if (
                    Array.isArray(
                        item
                    )
                ) {

                    for (
                        const child
                        of item
                    ) {

                        walk(
                            child
                        );
                    }

                    return;
                }

                if (
                    item &&
                    typeof item ===
                    'object'
                ) {

                    for (
                        const child
                        of Object.values(
                            item
                        )
                    ) {

                        walk(
                            child
                        );
                    }
                }
            };

        walk(
            value
        );

        return proxies;
    }

    /*
     * Request a proxy from ASocks.
     */

    static async requestProxy(
        sessionId
    ) {

        this.ensureConfigured();

        const region =
            this.getRegion(
                sessionId
            );

        /*
         * ASocks accepts normal uppercase country codes
         * such as US, GB, DE, etc.
         */

        const country =
            region.toUpperCase();

        const url =
            `${this.API_BASE_URL}/proxy/search` +
            `?apiKey=${encodeURIComponent(this.API_KEY)}` +
            `&country=${encodeURIComponent(country)}` +
            `&limit=1`;

        const response =
            await fetch(
                url,
                {
                    method:
                        'GET',

                    headers: {
                        accept:
                            'application/json'
                    }
                }
            );

        if (
            !response.ok
        ) {

            throw new Error(
                `ASocks proxy search failed for ${country}: ` +
                `${response.status} ${response.statusText}`
            );
        }

        const data =
            await response.json();

        /*
         * ASocks responses contain:
         *
         * success: true
         * authenticated proxy URL(s)
         *
         * Example structure returned by the API ultimately
         * contains strings in this form:
         *
         * http://username:password@ip:port
         */

        if (
            data &&
            Object.prototype.hasOwnProperty.call(
                data,
                'success'
            ) &&
            data.success === false
        ) {

            throw new Error(
                `ASocks proxy search reported failure for ${country}.`
            );
        }

        const proxyUrls =
            this.extractProxyUrls(
                data
            );

        if (
            proxyUrls.length ===
            0
        ) {

            throw new Error(
                `ASocks returned no usable proxy for ${country}.`
            );
        }

        /*
         * limit=1 means normally only one proxy will be
         * returned, but use the first valid one regardless.
         */

        const proxyUrl =
            proxyUrls[0];

        let parsed;

        try {

            parsed =
                new URL(
                    proxyUrl
                );

        } catch (error) {

            throw new Error(
                `ASocks returned an invalid proxy URL for ${country}.`
            );
        }

        if (
            !parsed.hostname ||
            !parsed.port
        ) {

            throw new Error(
                `ASocks proxy is missing host or port for ${country}.`
            );
        }

        const username =
            decodeURIComponent(
                parsed.username ||
                ''
            );

        const password =
            decodeURIComponent(
                parsed.password ||
                ''
            );

        if (
            !username ||
            !password
        ) {

            throw new Error(
                `ASocks proxy is missing authentication credentials for ${country}.`
            );
        }

        const sessionID =
            `worker${sessionId}`;

        const lifetime =
            this.SESSION_LIFETIME_MINUTES;

        const protocol =
            parsed.protocol ===
            'https:'
                ? 'https:'
                : 'http:';

        return {

            /*
             * Playwright wants the proxy server without
             * username/password embedded.
             */

            server:
                `${protocol}//${parsed.hostname}:${parsed.port}`,

            /*
             * Authentication is supplied separately.
             */

            username:
                username,

            password:
                password,

            /*
             * Metadata used only for logging/debugging.
             *
             * Never log username/password.
             */

            region:
                region,

            sessionID:
                sessionID,

            lifetime:
                lifetime
        };
    }

    /*
     * Build the Playwright proxy configuration.
     *
     * One proxy is cached for each worker ID so repeated calls
     * from the same worker don't constantly request a different
     * ASocks proxy.
     */

    static async getProxyConfig(
        sessionId
    ) {

        const numericSessionId =
            Number(
                sessionId
            );

        /*
         * Validate before checking the cache.
         */

        this.getRegion(
            numericSessionId
        );

        if (
            this.PROXY_CACHE.has(
                numericSessionId
            )
        ) {

            return this.PROXY_CACHE.get(
                numericSessionId
            );
        }

        const proxy =
            await this.requestProxy(
                numericSessionId
            );

        this.PROXY_CACHE.set(
            numericSessionId,
            proxy
        );

        return proxy;
    }

    /*
     * Clear one cached worker proxy.
     *
     * This can be used later if we deliberately want
     * to rotate a worker onto a fresh ASocks endpoint.
     */

    static clearProxy(
        sessionId
    ) {

        const numericSessionId =
            Number(
                sessionId
            );

        this.PROXY_CACHE.delete(
            numericSessionId
        );
    }

    /*
     * Clear every cached proxy.
     */

    static clearAllProxies() {

        this.PROXY_CACHE.clear();
    }

    /*
     * Optional compatibility/helper function.
     *
     * Because proxies are now obtained through the ASocks API,
     * this method is asynchronous.
     *
     * Avoid logging the result because it contains the
     * proxy username/password.
     */

    static async getProxyString(
        sessionId
    ) {

        const proxy =
            await this.getProxyConfig(
                sessionId
            );

        const parsedServer =
            new URL(
                proxy.server
            );

        return (
            `${parsedServer.protocol}//` +
            `${encodeURIComponent(proxy.username)}:` +
            `${encodeURIComponent(proxy.password)}@` +
            `${parsedServer.hostname}:` +
            `${parsedServer.port}`
        );
    }
}

module.exports = ProxyManager;