# DEX Trending Bot

A browser-automation project built with **Node.js**, **Playwright**, and **playwright-extra** for interacting with a configured DEX Screener pair page.

The bot launches a Chromium browser, loads a target market page, creates a browser identity, performs chart and page interactions, logs everything to the terminal, and can optionally run through configured proxies for authorised testing or network-location checks.

---

## What the bot is

DEX Trending Bot is a configurable browser worker designed to simulate a normal interactive research session on a DEX Screener token page.

Each worker can:

- Open a specific DEX Screener pair.
- Launch Chromium in visible or headless mode.
- Create a browser identity with a randomised:
  - user agent
  - viewport
  - timezone
  - locale
- Use `playwright-extra`.
- Load the `puppeteer-extra-plugin-stealth` plugin.
- Optionally launch through a configured proxy.
- Wait for the DEX Screener interface to render.
- Move the mouse around the page.
- Locate the chart area.
- Click inside the chart.
- Zoom the chart in or out using mouse-wheel events.
- Change the chart timeframe.
- Scroll internal DEX Screener panels.
- Click selected non-trading UI controls such as:
  - Transactions
  - Top Traders
- Pause between actions.
- Remain on the page for a configurable dwell period.
- Log every major action.
- Save an error screenshot if a worker fails.

The project is intentionally split into separate files so the runtime configuration, identity generation, browser logic, and launcher remain easy to maintain.

---

## How it works

The bot follows this flow:

```text
Start project
    ↓
Read config.js
    ↓
Create ResearchWorker
    ↓
Generate browser identity
    ↓
Launch Chromium
    ↓
Create Playwright browser context
    ↓
Apply viewport / locale / timezone / user agent
    ↓
Open configured DEX Screener pair
    ↓
Wait for the interface to render
    ↓
Begin interaction loop
    ↓
Move mouse
    ↓
Locate chart
    ↓
Click chart
    ↓
Zoom chart
    ↓
Change timeframe
    ↓
Scroll a DEX Screener panel
    ↓
Click configured UI control
    ↓
Repeat interaction cycle
    ↓
Final dwell period
    ↓
Close browser
```

---

# Project structure

```text
dex-lab-project/
│
├── config.js
├── identity_factory.js
├── index.js
├── research_worker.js
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

---

# File overview

## `index.js`

`index.js` is the application entry point.

It is responsible for:

- loading `config.js`
- reading `MAX_CONCURRENT_SESSIONS`
- creating one `ResearchWorker` per session
- starting all configured workers
- waiting for them to finish
- printing final completion output

When you run:

```bash
npm start
```

the project executes:

```bash
node index.js
```

---

## `config.js`

`config.js` controls the bot's runtime behaviour.

Typical settings include:

```js
TARGET_URL
MAX_CONCURRENT_SESSIONS
DEBUG_MODE
NAVIGATION_TIMEOUT_MS
INITIAL_LOAD_WAIT_MS
INTERACTION_CYCLES
DWELL_TIME_RANGE
PAUSE_BETWEEN_ACTIONS_RANGE_MS
SCROLL_DISTANCE_RANGE
CHART_TIMEFRAMES
CHART_ZOOM_OUT_STEPS
CHART_ZOOM_DELTA
SAFE_CLICK_TEXTS
PROXY_LIST
REFERRERS
```

### Example target

```js
TARGET_URL:
    'https://dexscreener.com/robinhood/...'
```

This is the market page opened by each worker.

### Debug mode

```js
DEBUG_MODE: true
```

When enabled, Chromium is visible.

This is useful while developing because you can physically watch the chart interactions, scrolling, clicks, and mouse movement.

When disabled, Chromium runs headlessly.

### Interaction cycles

```js
INTERACTION_CYCLES: 4
```

This determines how many complete interaction rounds are performed before the final dwell period.

### Dwell time

```js
DWELL_TIME_RANGE: [15, 25]
```

The bot selects a value from the configured range and keeps the page open for that period after the interaction loop finishes.

---

# Browser identity generation

## `identity_factory.js`

The identity factory creates the browser profile used for a worker session.

Each generated identity contains values such as:

```text
userAgent
viewport
timezone
locale
```

Example output:

```text
UA: Mozilla/5.0 ...
Viewport: 1536x864
Timezone: Asia/Tokyo
Locale: en-GB
```

The generated values are then supplied to the Playwright browser context.

The factory is separate from the worker so additional browser profiles can be added without changing the interaction logic.

---

# Browser automation

## `research_worker.js`

This contains the main automation logic.

A `ResearchWorker` represents one browser session.

The worker is responsible for:

- generating its identity
- selecting an optional proxy
- launching Chromium
- creating the browser context
- navigating to DEX Screener
- interacting with the chart
- scrolling DEX Screener containers
- clicking selected controls
- handling delays
- logging activity
- handling errors
- closing the browser cleanly

---

# Chromium launch

The project uses:

```js
const { chromium } = require('playwright-extra');
```

and loads:

```js
puppeteer-extra-plugin-stealth
```

before Chromium is launched.

The worker then creates an isolated browser context using its generated identity.

---

# Page loading

DEX Screener is a dynamic application that continuously loads live market data.

For that reason, the worker waits for:

```js
domcontentloaded
```

rather than relying on `networkidle`.

After the DOM loads, an additional configurable delay gives the page's JavaScript interface time to finish rendering.

---

# Mouse movement

The bot chooses coordinates inside the current viewport and moves the mouse using multiple Playwright movement steps.

Example console output:

```text
[Worker 1] Moving mouse -> 632, 495
[Worker 1] Mouse moved
```

This also provides a visible way to confirm that the browser worker is active while debugging.

---

# Chart detection

DEX Screener's chart is rendered through canvas-based chart elements.

The worker searches for large, visible `<canvas>` elements in the main content region.

It ignores:

- tiny canvases
- hidden elements
- canvases outside the viewport
- elements that are likely to belong to the far-right information panel

If a suitable chart canvas is found, its screen position and size are used for the following interactions.

---

# Chart clicking

Once the chart area is known, the worker calculates a point inside the chart and moves the cursor there.

It then performs a mouse click.

Example:

```text
[Worker 1] Chart area: 970x410 at 180,110
[Worker 1] Clicked chart at 650,302
```

This verifies that the chart area is interactive and gives later wheel events the correct pointer location.

---

# Chart zooming

The worker can issue mouse-wheel events while the pointer is over the chart.

The number of zoom steps is controlled by:

```js
CHART_ZOOM_OUT_STEPS
```

and the wheel direction / strength is controlled by:

```js
CHART_ZOOM_DELTA
```

Example configuration:

```js
CHART_ZOOM_OUT_STEPS: [2, 5],
CHART_ZOOM_DELTA: 300,
```

Example output:

```text
[Worker 1] Zooming chart out (4 wheel steps)
[Worker 1] Chart zoom action complete
```

---

# Chart timeframes

The bot can rotate through configured chart intervals.

Example:

```js
CHART_TIMEFRAMES: [
    '5m',
    '15m',
    '1h',
    '4h'
]
```

A four-cycle run may therefore use:

```text
Cycle 1 → 5m
Cycle 2 → 15m
Cycle 3 → 1h
Cycle 4 → 4h
```

The worker searches for the visible timeframe label near the top of the chart and clicks it.

Example output:

```text
[Worker 1] Looking for chart timeframe "15m"
[Worker 1] Changed chart timeframe -> 15m
```

---

# DEX Screener scrolling

DEX Screener does not behave like a simple webpage with one document scrollbar.

Different areas of the interface have their own scroll containers.

The worker therefore:

1. Searches the DOM for vertically scrollable elements.
2. Checks whether each candidate is visible.
3. Ignores small or hidden areas.
4. Measures the candidate's visible dimensions.
5. Scores likely active panels.
6. Selects a target container.
7. Changes that container's `scrollTop`.
8. Logs the position before and after scrolling.

Example:

```text
[Worker 1] Scrolling DOWN 524px
[Worker 1] Panel scroll: 0 -> 520 / 1383
[Worker 1] Panel: 334x818 at 1202,46
```

This was added because generic mouse-wheel scrolling can fail when the pointer is not positioned above the specific DEX Screener panel that owns the scroll state.

---

# UI controls

The worker can be restricted to selected text-labelled interface controls.

Example:

```js
SAFE_CLICK_TEXTS: [
    'Transactions',
    'Top Traders'
]
```

The worker searches for matching visible:

```text
tabs
buttons
links
```

and clicks only a configured match.

Example:

```text
[Worker 1] Looking for "Transactions"
[Worker 1] Clicked "Transactions" (button)
```

Trading controls are intentionally not part of the configured click list.

---

# Proxies

`config.js` contains optional proxy support.

Example:

```js
PROXY_LIST: [
    // 'http://username:password@host:port'
]
```

A configured worker can select a proxy before launching Chromium.

Use this only for testing or access you are authorised to perform, such as network-path testing, geographic rendering checks, or your own approved automation workloads.

## Important security note

Do **not** commit real proxy credentials to a public GitHub repository.

Avoid putting any of the following directly into committed source files:

```text
proxy passwords
API keys
wallet private keys
seed phrases
authentication tokens
service credentials
```

Use environment variables or another ignored local configuration file for secrets.

---

# Referrers

The bot can also use configured referrer values when navigating.

Example:

```js
REFERRERS: [
    'https://twitter.com/',
    'https://t.me/',
    'https://www.google.com/',
    'https://docs.dexscreener.com/'
]
```

These are configured in `config.js`.

---

# Error handling

The worker wraps the browser session in error handling.

If a worker encounters an exception, it attempts to save a screenshot:

```text
error-worker-1.png
```

These screenshots are useful when:

- DEX Screener changes its layout
- a selector stops matching
- the chart cannot be located
- the browser loads an unexpected page
- a UI interaction times out

The screenshot files are ignored by Git by default.

---

# Console diagnostics

The bot logs its current activity in real time.

A typical run looks like:

```text
========================================
       DEX BROWSER TEST STARTING
========================================

Target: https://dexscreener.com/...
Sessions: 1
Debug/browser visible: true

[System] Spawning Worker 1...

[Worker 1] Initialising identity...
[Worker 1] UA: Mozilla/5.0 ...
[Worker 1] Viewport: 1536x864
[Worker 1] Timezone: Asia/Tokyo
[Worker 1] Locale: en-GB

[Worker 1] Opening DEX Screener...
[Worker 1] DOM loaded
[Worker 1] STARTING INTERACTION LOOP

[Worker 1] Moving mouse -> 632,495
[Worker 1] Locating chart...
[Worker 1] Clicked chart
[Worker 1] Zooming chart out
[Worker 1] Changed chart timeframe -> 15m
[Worker 1] Panel scroll: 0 -> 520 / 1383
[Worker 1] Clicked "Transactions" (button)

[Worker 1] Session completed successfully.
[Worker 1] Browser closed.
```

The logging is intentionally verbose so browser behaviour can be debugged without stepping through every line of JavaScript.

---

# Requirements

You need:

- Windows, macOS, or Linux
- Node.js 20+
- npm
- Playwright Chromium browser files

---

# Installation

Clone the repository:

```bash
git clone https://github.com/fomophoria/Dex_Trending_bot.git
```

Enter the project:

```bash
cd Dex_Trending_bot
```

Install Node dependencies:

```bash
npm install
```

Install Chromium for Playwright if needed:

```bash
npx playwright install chromium
```

---

# Running the bot

Start it with:

```bash
npm start
```

This executes:

```bash
node index.js
```

---

# Windows one-click launcher

A `.bat` launcher can be used to start the project by double-clicking a file.

Example:

```bat
@echo off
title DEX Research Lab Launcher
cls

echo ========================================
echo    DEX RESEARCH LAB - STARTING BOT
echo ========================================
echo.

cd /d "C:\Users\Alex\dex-lab-project"

echo Running npm install check...
call npm install

echo.
echo Starting bot...
echo.

call npm start

echo.
echo ========================================
echo    BOT STOPPED
echo ========================================
pause
```

Save it as:

```text
run-bot.bat
```

Then double-click the file to launch the project.

---

# Changing the target token

Edit:

```js
TARGET_URL
```

inside `config.js`.

For example:

```js
TARGET_URL:
    'https://dexscreener.com/<chain>/<pair-address>'
```

Restart the bot after changing the target.

---

# Changing chart behaviour

To change available chart intervals:

```js
CHART_TIMEFRAMES: [
    '5m',
    '15m',
    '1h',
    '4h'
]
```

To change zoom strength:

```js
CHART_ZOOM_DELTA: 300
```

To change how many zoom wheel events are used:

```js
CHART_ZOOM_OUT_STEPS: [
    2,
    5
]
```

---

# Changing session behaviour

Interaction count:

```js
INTERACTION_CYCLES: 4
```

Pause range:

```js
PAUSE_BETWEEN_ACTIONS_RANGE_MS: [
    800,
    1800
]
```

Final dwell range:

```js
DWELL_TIME_RANGE: [
    15,
    25
]
```

Panel scroll distance:

```js
SCROLL_DISTANCE_RANGE: [
    300,
    700
]
```

---

# Git workflow

After changing the project:

```bash
git add .
git commit -m "Update bot"
git push
```

To check what has changed first:

```bash
git status
```

---

# Dependencies

The project currently uses:

```text
playwright
playwright-extra
puppeteer-extra-plugin-stealth
```

See `package.json` for the exact dependency versions.

---

# Maintenance notes

DEX Screener is a live web application and its frontend can change.

Potential changes that may require code updates include:

- chart implementation
- DOM structure
- button labels
- CSS/layout
- scrollable containers
- TradingView canvas structure
- timeframe controls

The worker contains extensive logging specifically to make those changes easier to diagnose.

---

# Disclaimer

This project is intended for research, browser-automation development, QA, and other authorised use.

Always comply with applicable website terms, rate limits, access controls, and local laws. Do not use the project to interfere with a service, misrepresent activity, or generate prohibited traffic.
