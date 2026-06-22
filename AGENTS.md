# Agent Context: Digiversity 2026 Power BI

Read [docs/PROJECT_REFERENCE.md](docs/PROJECT_REFERENCE.md) before making architectural, gameplay, Firebase, authentication, or scalability changes.

## Project purpose

This is a browser-based, instructor-led live quiz for Power BI workshops. The host and every student phone display the same question, image, and answer content. The host controls progression and results; students answer directly from complete mobile question screens.

## Runtime and files

- No package manager, bundler, framework, or build step.
- Serve the repository through HTTP; ES modules will not work reliably from `file://`.
- [index.html](index.html): all views and modal markup.
- [style.css](style.css): design system and responsive UI.
- [app.js](app.js): all application state, workflows, rendering, scoring, and Firebase operations.
- [firebase-config.js](firebase-config.js): Firebase project and CDN SDK initialization.

## Current product behavior

- Default title: `Digiversity 2026 Power BI`.
- Instructor password: `eypowerbi2026`.
- The password is client-side convenience only. It is not security.
- Instructor login is stored in `sessionStorage`; Firebase Authentication is not enabled.
- Branding title and subtitle are editable and synchronized under `settings/powerbi`.
- Quiz definitions are stored under `quizzes/powerbi`.
- Live rooms are stored under `powerbiSessions/{pin}`.

## Game mode compatibility

Public Power BI names map to inherited internal IDs. Preserve these IDs unless a migration is added:

| UI name | Internal `type` |
|---|---|
| Visual Match | `multiple-choice` |
| BI Verdict | `true-false` |
| Process Order | `jumbled-prompt` |
| DAX Answer | `type-answer` |
| KPI Estimate | `number-guess` |
| Analyst Poll | `poll` |
| Missing DAX | `speed-math` |

The old IDs are data compatibility identifiers, not current product terminology.

## Important engineering constraints

- Existing Firebase test rules allow public reads and writes until timestamp `1784563200000`, which is July 21, 2026 at 12:00 AM Singapore time.
- Do not describe the instructor password as protecting Firebase data.
- The classroom reliability layer includes atomic nickname claims, stable per-device identity, per-connection presence, refresh recovery, explicit leave cleanup, collision-safe PIN creation, stale-answer filtering, and idempotent scoring.
- `publicState` must include `questionText`, `questionImage`, `questionOptions`, question numbering, and mode-specific public fields so phones never depend on the projector.
- Do not claim guaranteed 40+ production readiness until a real or simulated multi-client load test is completed.
- Disconnected players are hidden when their final connection disappears; their score record remains available for same-device reconnect. Explicit Leave removes the record and nickname claim.
- Answer timing and scoring trust client-provided elapsed time.
- Several Firebase/user values are rendered through `innerHTML`; treat stored XSS as unresolved.
- Firebase security rules are not versioned in this repository.

## Change guidance

- Preserve unrelated user edits.
- Keep changes compatible with a static CDN-served application unless explicitly asked to introduce a build system.
- When adding a mode, update the builder, compiler, host rendering, broadcast payload, player rendering, result rendering, scoring, preview, samples, and documentation.
- When changing Firebase paths or data shapes, provide migration or backward compatibility.
- Prefer DOM APIs and `textContent` over interpolating untrusted values into `innerHTML`.
- Unsubscribe existing Firebase listeners before replacing them.
- Validate all client-submitted values before scoring.

## Minimum verification

After changes, check:

1. No duplicate HTML IDs.
2. Every literal `getElementById()` reference exists.
3. CSS and JavaScript braces are balanced.
4. Host can create a room.
5. Two separate devices can join, answer, receive results, and advance.
6. Refresh, multiple-tab presence, disconnect, reconnect, explicit leave, kick, and room termination behavior.
7. All seven game modes through builder preview and live play.
