# Implementation Plan - Advanced Dashboard Wars with Presenter Sandbox Mode

This plan details the implementation of a 2-round **Practice Arena (Tutorial Mode)**, new dashboard components (KPI Grid, Polar Area Chart), real-time power-ups (Blur, Shake, Glitch, Emoji Flood pop, Shield), player gamification (potential points timer, receipts, scoreboard shifts), an **Upgraded Question Maker**, and a **🧪 Presenter Sandbox Mode** for easy, single-person demos.

---

## User Review Required

### 1. Presenter Sandbox Mode (Split-Screen Simulator) 🧪
To allow a single presenter (or two people) to demo the game to managers without needing multiple physical phones:
* **Host Sandbox Toggle**: A prominent "🧪 Live Demo Sandbox" button is added to the Host Setup Dashboard.
* **Split-Screen Interface**: Clicking it divides the desktop view:
  * **Left Column (70%)**: The standard Host Projector View (lobby, charts, results, leaderboard).
  * **Right Column (30%)**: A live, interactive **Player Phone Web Simulator** that connects directly to the game session, allowing you to play the game in the same browser tab.
* **Simulation Control Panel**: An admin drawer next to the phone simulator with quick actions:
  * `🤖 Spawn 3 Bot Players`: Instantly writes 3 bot players (`Bot Red`, `Bot Blue`, `Bot Gold`) into the lobby.
  * `⚡ Auto-Answer Bots`: Triggers all bots to answer the current question with randomized accuracy and response times (so the results bars and scoreboard update automatically).
  * `🌫️ Trigger Blur Attack on Simulator`: Simulates a bot attacking the simulator player with a Foggy Window (blurring the simulator chart).
  * `📳 Trigger Earthquake Attack on Simulator`: Simulates a bot attacking the simulator player with a Dashboard Earthquake (shaking the simulator).
  * `🤪 Trigger Emoji Flood on Simulator`: Simulates a bot attacking the simulator player with an Emoji Flood, spawning 8 bouncing emojis to clear.
  * `🛡️ Trigger Attack on Shielded Bot`: Shows a bot blocking an attack on the projector screen.

---

## Proposed Changes

### [Component 1] UI Layout & CSS Transitions

#### [MODIFY] [style.css](file:///c:/Users/Administrator/Downloads/digiversity-pbi-icebreaker-main/style.css)
* Add styling for:
  * `.sandbox-split-layout` - Encompasses the split-screen view when sandbox is enabled.
  * `.sandbox-projector-side` - Takes up 70% width, hides standard background animations.
  * `.sandbox-sidebar` - Takes up 30% width, styled like a mobile frame with neon borders.
  * `.sandbox-controls` - Control panel buttons.
  * `.sabotage-blur`, `.sabotage-shake`, `.sabotage-greyout` - Visual debuffs.
  * `.emoji-bubble-float` - Bouncing/floating animation for the Emoji Flood items.
  * `.kpi-grid`, `.kpi-card`, `.hype-meter-container`, `.tutorial-banner`.

#### [MODIFY] [index.html](file:///c:/Users/Administrator/Downloads/digiversity-pbi-icebreaker-main/index.html)
* **Add Sandbox Elements**:
  * Add a "🧪 Live Demo Sandbox" toggle button in the Host Dashboard header.
  * Create a split-screen viewport wrapper.
  * Embed a simulator container `#sandbox-phone-simulator` and control container `#sandbox-controls-drawer`.
* **Expand Emojis**:
  * Add 🚀, 🥳, 🏆, 🤔, 💻, 💡, 😮 to the `#player-lobby-emoji-bar`.
  * Add 🥳, 👑, 💥, 💀, 🤩, 😮, 🤔, 💩 to the `#player-emoji-bar`.
* **Add Power-Up, Tutorial, & KPI UI**:
  * Insert `<div id="player-powerup-bar" class="powerup-bar hidden">` at the bottom of player views.
  * Insert `<div id="emoji-flood-overlay" class="emoji-flood-overlay hidden">` for popping debuffs.
  * Insert `<div id="player-tutorial-hint" class="tutorial-banner hidden"></div>` for real-time tutorial tips.
  * Insert `<div id="player-kpi-container" class="kpi-grid hidden"></div>` and `#host-kpi-container`.

---

### [Component 2] Javascript Engines

#### [MODIFY] [dashboard-engine.js](file:///c:/Users/Administrator/Downloads/digiversity-pbi-icebreaker-main/dashboard-engine.js)
* Add `polarArea` and `kpi` to scenario components.
* Introduce `isDoublePoints` (25%) and `isPowerDrop` (25%) rounds in generated challenges.
* Add presets for auto-populating custom quizzes.
* Export tutorial rounds.

#### [MODIFY] [app.js](file:///c:/Users/Administrator/Downloads/digiversity-pbi-icebreaker-main/app.js)
* **Implement Presenter Sandbox**:
  * Implement `toggleSandboxMode(enabled)`.
  * If enabled, initialize a local "Simulator Player" that mirrors all player view transitions and communicates with Firebase under a test player ID.
  * Render a floating control panel on the right sidebar.
  * Wire Bot Spawner: `spawnBotPlayers(count)`.
  * Wire Bot Auto-Answer: `autoAnswerBots()`.
  * Wire Simulated Attacks: Push corresponding event to `attacks` node targeting the Simulator Player.
* **Upgraded Question Maker**:
  * Add collapsibility, question reordering, and data auto-population.
* **Fix Duplicate Join**:
  * Disable the join button inside the form submit listener. Check for unique nicknames (case-insensitive). Re-enable on error.
* **Lobby Hype Meter**:
  * Update `sessions/${pin}/hypeScore` when lobby emojis are clicked. Draw the bar on the host lobby.
* **Perform Sabotages & Block with Shield**:
  * Track and resolve attacks inside the `sessions/${pin}/attacks` Firebase listener.
  * If hit by Emoji Flood, spawn 8 clickable emoji bubbles. Target must click each to pop them.
* **Potential Points & Receipt**:
  * Animate decaying points on player view. Render receipt on results screen.
* **Rank shifts**:
  * Save previous rank as `prevRank` on round start. Render shift indicators on host scoreboard.
* **KPI Card Renderer**:
  * Implement `renderPlayerKpis()` and `renderHostKpis()` showing interactive metric grids.
