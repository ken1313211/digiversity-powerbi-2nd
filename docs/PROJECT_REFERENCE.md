# Digiversity Power BI Project Reference

This document is the implementation reference for humans and coding agents maintaining this app or upgrading related Digiversity quiz applications.

## 1. Product overview

The application has two roles:

- **Instructor:** signs in through a local password gate, manages quizzes, creates a live room, controls the timer and question progression, reviews results, and ends the session.
- **Player:** joins with a room PIN and nickname, sees the full question, image, and answer choices on the phone, responds there, receives result and ranking updates, and can send reactions.

The browser contains all application logic. Firebase Realtime Database is used as a shared state and event transport; there is no custom server or Cloud Function.

## 2. Technology and architecture

| Layer | Current implementation |
|---|---|
| UI | One static HTML document containing all views |
| Styling | One CSS file with variables, layouts, responsive rules, and animations |
| Application | One ES module containing state, rendering, workflows, and scoring |
| Backend | Firebase Realtime Database |
| Authentication | None; instructor password is checked in browser JavaScript |
| Storage | Firebase Storage is initialized; quiz images are currently stored as base64 data in quiz objects |
| Local persistence | `localStorage` and `sessionStorage` |
| Deployment | Any static web host or local HTTP server |

### Source files

- `index.html`: landing, login, player views, instructor dashboard, quiz builder, lobby, host question/results, leaderboard, modals, audio.
- `style.css`: Power BI yellow/charcoal theme, components, animations, phone-first question layouts, and responsive styling.
- `app.js`: presets, app state, branding, login, builder, Firebase reads/writes, lobby, question engine, scoring, recovery, player UI, reactions, preview.
- `firebase-config.js`: Firebase CDN imports and project configuration.

## 3. Feature inventory

### Branding

- Default title and subtitle.
- Instructor-editable title and subtitle.
- Browser title and landing title update immediately.
- Values persist in local storage and synchronize from Firebase.

### Instructor dashboard

- Local password gate.
- Workshop, participant, and average-accuracy metrics.
- Recent session history.
- Active room recovery banner.
- Quiz create, edit, delete, preview, and launch actions.

### Quiz builder

- Add and reorder activity blocks.
- One-click import of 8 legacy Power BI quizzes and 54 questions from `data/legacy-powerbi-quizzes.json`.
- Legacy imports are merged by quiz title, so existing quizzes are not overwritten or duplicated.
- Per-question timer from 5 to 120 seconds.
- Optional base64 image upload.
- Validation and visual error highlighting.
- Sample content generator.
- Single-question and complete-quiz preview.
- Local and Firebase persistence.

### Live room

- Random six-digit PIN.
- QR code with `?pin={pin}` and join-form PIN prefilling.
- Live participant count and names.
- Instructor kick button.
- Start disabled until an online participant exists.
- Reactions shown on host screens.

### Gameplay

- Host-controlled timer, pause, resume, and skip.
- Question-specific player controls.
- Answer count tracking.
- Per-question results and correct answer display.
- Score, streak, rank movement, podium, and final leaderboard.
- CSV download button in the interface; export logic is not currently implemented.
- Session history and aggregate accuracy.

## 4. Game mode contracts

Internal type names are retained from the source application for saved-data compatibility.

### Visual Match — `multiple-choice`

Question fields:

```json
{
  "type": "multiple-choice",
  "text": "Which keyword declares a variable?",
  "options": ["Let", "Dim", "Var", "Declare"],
  "correct": 1,
  "timeLimit": 20,
  "image": ""
}
```

Player answer:

```json
{ "optionIndex": 1, "elapsedTime": 3200 }
```

### BI Verdict — `true-false`

Uses two options: `True` and `False`. The interface labels these as Valid/True and Invalid/False.

```json
{
  "type": "true-false",
  "text": "Option Explicit requires declarations.",
  "options": ["True", "False"],
  "correct": 0,
  "timeLimit": 15
}
```

### Process Order — `jumbled-prompt`

`words` is the expected statement order.

```json
{
  "type": "jumbled-prompt",
  "text": "Arrange the report workflow.",
  "words": ["Connect", "Transform", "Model", "Visualize"],
  "timeLimit": 30
}
```

Player answer:

```json
{
  "sequence": ["Sub Demo()", "MsgBox \"Hello\"", "End Sub"],
  "elapsedTime": 8500
}
```

### DAX Answer — `type-answer`

Exact case-insensitive string comparison. Whitespace is trimmed on input, but internal whitespace is significant.

```json
{
  "type": "type-answer",
  "text": "Which DAX function changes filter context?",
  "answerText": "CALCULATE",
  "timeLimit": 20
}
```

### KPI Estimate — `number-guess`

The current builder and slider support values from 0 through 100. A response is considered correct when its absolute difference from the target is at most `0.15`.

```json
{
  "type": "number-guess",
  "text": "What is 5 + 7 * 2?",
  "targetNumber": 19,
  "timeLimit": 20
}
```

### Analyst Poll — `poll`

Unscored. Any submitted option marks the player active/correct for result presentation.

```json
{
  "type": "poll",
  "text": "Which task would save the most time?",
  "options": ["Formatting", "Cleanup", "Email", "Consolidation"],
  "isPoll": true,
  "timeLimit": 20
}
```

### Missing DAX — `speed-math`

Despite the legacy ID, this is a DAX completion activity. `equation` contains comma-separated required elements. Matching is case-insensitive substring matching. Shorter accepted answers receive a larger bonus.

```json
{
  "type": "speed-math",
  "text": "Complete the line that clears A2:D100.",
  "equation": "Range, ClearContents",
  "timeLimit": 30
}
```

## 5. Firebase data model

### Branding

```text
settings/
  powerbi/
    appTitle: string
    appSubtitle: string
```

### Quizzes and history

```text
quizzes/
  powerbi: Quiz[]
  powerbiHistory:
    - date: string
      quizTitle: string
      playersCount: number
      accuracy: number
```

### Live sessions

```text
powerbiSessions/
  {pin}/
    status: "lobby" | "question" | "results" | "leaderboard" | "gameover"
    quizTitle: string
    currentQuestion: number
    timestamp: number
    timeLimit: number
    questionType: string
    questionWords: string[] | null
    questionOptions: string[] | null
    questionEquation: string | null
    questionStartTime: number
    publicState/
      status: "lobby" | "question" | "results" | "gameover"
      currentQuestion: number
      timeLimit?: number
      questionType?: string
      questionWords?: string[] | null
      questionOptions?: string[] | null
      questionEquation?: string | null
      questionStartTime?: number
      questionText?: string
      questionImage?: string | null
      totalQuestions?: number
      resultAnswer?: string
    nicknameClaims/
      {normalizedNickname}/
        playerKey: string
        clientId: string
        nickname: string
        claimedAt: number
    scoredQuestions/
      {questionIndex}/
        scoredAt: number
    players/
      {playerKey}/
        clientId: string
        nickname: string
        score: number
        streak: number
        lastPointsEarned: number
        wasCorrect: boolean
        online: boolean
        presenceVersion: 2
        connections/
          {connectionId}: true
    answers/
      {playerKey}/
        optionIndex?: number
        textAnswer?: string
        numberAnswer?: number
        sequence?: string[]
        questionIndex: number
        elapsedTime: number
    reactions/
      {reactionKey}/
        emoji: string
        origin: string
        timestamp: number
```

Not every listed status is currently written explicitly. The app principally writes `lobby`, `question`, `results`, and `gameover`; the host leaderboard is partly a local UI transition.

## 6. Session state flow

```text
Instructor creates room
        |
        v
      lobby <---- players join / presence changes
        |
        v
     question <---- answers and reactions
        |
        v
      results ---- scoring updates player records
        |
        v
  host leaderboard
        |
        +---- next question ----> question
        |
        +---- final question ---> gameover ---> history ---> room deletion
```

Players subscribe to the compact `publicState` node and their own player record. `publicState` carries the complete readable question payload so the projector is optional for answering.

## 7. Scoring

### Standard correct responses

```text
scale = max(0.2, 1 - elapsedTime / questionDuration)
points = round(1000 * scale)
```

This produces a minimum of 200 points for a correct answer.

### Streak

The correct-answer streak increments after each correct scored question. At streak 3 and above, points are multiplied by 1.5. An incorrect response resets the streak to zero.

### Missing DAX

```text
lengthBonus = max(0, 500 - answerLength * 3)
points = 500 + lengthBonus
```

The streak multiplier also applies.

### Survey

Analyst Poll awards zero points.

## 8. Browser persistence

### Local storage

```text
powerbi_custom_quizzes
powerbi_recent_sessions
powerbi_last_nickname
powerbi_app_title
powerbi_app_subtitle
powerbi_player_client_id
```

### Session storage

```text
powerbi_instructor_authenticated
powerbi_host_session_pin
powerbi_host_role
powerbi_host_quiz
powerbi_player_session_pin
powerbi_player_nickname
powerbi_player_role
powerbi_player_key
```

The player key is restored only when the stored player record matches the browser's stable client ID.

## 9. Firebase and security status

Current Firebase project:

```text
projectId: kahoots-bi
databaseURL: https://kahoots-bi-default-rtdb.asia-southeast1.firebasedatabase.app
```

Firebase Authentication is not implemented.

Current test rules supplied for the project:

```json
{
  "rules": {
    ".read": "now < 1798761599000",
    ".write": "now < 1798761599000"
  }
}
```

The timestamp expires December 31, 2026 at 23:59:59 UTC (January 1, 2027 at 07:59:59 Singapore time). Before expiry, anyone with the database URL can read or write everything. After expiry, all application database operations will fail unless rules are replaced.

The instructor password is present in downloaded JavaScript and cannot secure Firebase.

## 10. Known risks and defects

### Critical

1. Public database reads and writes.
2. No trusted backend authorization for instructor actions.
3. Client-provided elapsed time is trusted for scoring, although it is clamped to the question duration.
4. User/Firebase content is inserted through `innerHTML` in some quiz and history locations, creating stored-XSS risk.

### Reliability

1. Firebase disconnect detection is not instantaneous and depends on network timeout behavior.
2. Offline player records remain for same-device score recovery; explicit Leave or host kick purges them.
3. The CSV download button has no implementation.
4. No automated 40-client load test has been run.
5. Same-device multiple tabs intentionally share one player identity and answer slot.

### Maintainability

1. Most behavior is in one large JavaScript file.
2. View markup is one large HTML document.
3. Extensive inline styles make themes harder to reuse.
4. No automated tests or browser test harness.
5. No committed Firebase rules or deployment configuration.
6. Legacy mode IDs obscure current behavior.

## 11. Recommended improvement sequence

### Phase 1: classroom correctness — implemented

1. Stable random per-device identity.
2. Atomic normalized nickname claims.
3. Active duplicate rejection and identity-matched reconnect.
4. Explicit leave-room cleanup.
5. Refresh restoration of identity, presence, score, and view.
6. Listener replacement before rebinding.
7. Idempotent per-question scoring.
8. Atomic room PIN reservation.
9. Per-connection presence for refresh and multiple-tab safety.
10. Current-question tags that reject delayed stale answers.
11. Compact public-state and own-player subscriptions.

### Phase 2: security

1. Enable Firebase Authentication for instructors.
2. Prefer anonymous authentication for players.
3. Commit `database.rules.json`.
4. Restrict quiz, branding, history, session control, and scoring writes to instructors.
5. Restrict players to their own presence and answer paths.
6. Validate schema, lengths, types, and allowed status transitions in rules.
7. Move trusted scoring to Cloud Functions or another server.
8. Replace unsafe `innerHTML` rendering.

### Phase 3: scale and performance

1. Split the session into narrow public and private nodes.
2. Subscribe players only to public game state and their own player record.
3. Aggregate answer counts server-side or through transactions.
4. Bound or expire reactions.
5. Purge stale sessions with a scheduled function.
6. Load-test at 40, 75, and 150 simulated clients.
7. Test Wi-Fi loss, tab suspension, reconnect storms, and simultaneous submissions.

### Phase 4: maintainability

1. Extract modules for Firebase access, state, modes, scoring, host UI, and player UI.
2. Define a mode registry rather than repeated `if/else` branches.
3. Move inline styles into reusable CSS classes.
4. Add schema versioning and migrations.
5. Add unit tests for validation and scoring.
6. Add Playwright or equivalent multi-browser end-to-end tests.

## 12. Reusing features in sibling apps

When upgrading another Digiversity app, compare it against this checklist:

### Branding and configuration

- Configurable title and subtitle
- Product-specific storage and Firebase paths
- Theme variables rather than hard-coded colors
- Mobile-reachable QR code and join URL

### Content and builder

- Mode registry and mode-specific validation
- Question reordering
- Preview
- Sample generator
- Image handling
- Versioned quiz schema

### Live delivery

- Host state machine
- Player state restoration
- Presence and leave behavior
- Duplicate-name protection
- Listener cleanup
- Idempotent scoring
- Final history and export

Treat export as incomplete in the current app; sibling apps should implement and test actual CSV generation rather than copying only the button.

### Backend

- Environment-specific Firebase configuration
- Version-controlled security rules
- Authentication strategy
- Data validation
- Cleanup and retention
- Load-test plan

Do not copy the current client-side password or public database rules as an architecture pattern.

## 13. Adding a new game mode

A complete mode implementation must update all of these areas:

1. Public name and internal type contract.
2. Builder sidebar.
3. Builder fields and guidance.
4. Sample data.
5. Save validation and quiz serialization.
6. Edit/load behavior.
7. Preview compilation.
8. Host question renderer.
9. Firebase broadcast payload.
10. Player input renderer.
11. Player answer payload.
12. Host result renderer.
13. Scoring and streak behavior.
14. CSV/history effects if applicable.
15. This documentation.

Prefer a declarative mode registry for future additions rather than adding more branches to `app.js`.

## 14. Definition of production-ready for 40+ students

The app should not be described as production-ready until all of the following pass:

- Atomic unique nickname reservation
- Identity-safe reconnect
- Correct presence after close, sleep, network loss, and refresh
- No duplicate listeners
- No duplicate scoring
- Restricted Firebase rules
- Trusted or tamper-resistant scoring
- Sanitized rendering
- Forty simultaneous joins in a short burst
- Forty simultaneous answers
- Host reconnect during lobby, question, results, and leaderboard
- Mobile tests across iOS Safari and Android Chrome
- Documented recovery procedure if the host device fails

The nickname, reconnect, presence, listener, and scoring safeguards are implemented in code but still require multi-device and load verification.
