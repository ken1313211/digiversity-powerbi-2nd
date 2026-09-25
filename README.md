# Digiversity 2026 Power BI

An instructor-led Power BI learning game. The projector and student phones show the same question and answer content, so students can participate even when the shared screen is distant or difficult to read.

## Run locally

Serve the repository using VS Code Live Server or another static HTTP server. On the host computer:

```text
http://127.0.0.1:5500/
```

For phones on the same Wi-Fi, use the computer's LAN address instead:

```text
http://<computer-ip>:5500/
```

Open the LAN URL on the host too, so generated QR codes use an address students can reach.

## Instructor access

- Password: `eypowerbi2026`
- Login is stored only for the current browser tab/session.
- This is a UI gate, not secure authentication.

## Main features

- Six-digit live room PINs and a QR code that opens the app
- Instructor lobby with connected participant list and kick controls
- Seven Power BI learning modes
- Full question text, image, and answer labels on every phone
- Timed questions, pause/resume, skip, results, scoring, streaks, and leaderboards
- Quiz builder with samples, preview, ordering, images, editing, and deletion
- Player reactions
- Host and player synchronization controls
- Session history and accuracy metrics
- A CSV download control is present, but its export handler is not yet implemented
- Editable application title and subtitle synchronized through Firebase
- Local browser fallbacks for quiz and history storage

## Power BI modes

- **Visual Match:** choose the best concept, visual, modeling, or DAX answer
- **BI Verdict:** true/false Power BI statements
- **Process Order:** arrange transformation and modeling steps
- **DAX Answer:** enter an exact function, term, or result
- **KPI Estimate:** predict a numeric measure or percentage
- **Analyst Poll:** unscored opinion poll
- **Missing DAX:** complete a measure using required elements

## Firebase

The application currently uses:

- Firebase project: `kahoots-bi` (web configuration verified against Firebase Console).
- Power BI data is isolated under `settings/powerbi` and `quizzes/powerbi`
- Realtime Database region: `asia-southeast1`
- CDN Firebase JavaScript SDK `10.8.0`
- Realtime Database and Storage initialization
- No Firebase Authentication

See [docs/PROJECT_REFERENCE.md](docs/PROJECT_REFERENCE.md) for the data model, state machine, scoring, security status, and reuse guidance.

## Current readiness

The classroom reliability layer now includes atomic nickname reservation, stable device identity, refresh recovery, per-connection presence, explicit leave cleanup, collision-safe PIN creation, narrow player subscriptions, stale-answer filtering, and idempotent scoring.

It is still not guaranteed production-safe for 40+ simultaneous students until a multi-client load test is completed. Firebase security rules, trusted scoring, remaining unsafe HTML rendering, and automated browser tests still require work.

QR links now prefill the six-digit PIN in the player join form.
