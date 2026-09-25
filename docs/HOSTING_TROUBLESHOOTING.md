# Hosting stops before a game PIN appears

The host reserves a room with a Firebase transaction before showing the PIN. This requires both read and write permission at `powerbiSessions/{pin}`. Initializing the Firebase SDK successfully does not establish database access.

On September 25, 2026 (local time), the app still targeted `digiversity-vba`. A read-only REST request to that database's `powerbiSessions.json?shallow=true` returned HTTP 401 with `Permission denied`. The user's Firebase Console instead showed `kahoots-bi`, with rules allowing access until `1798761599000` (December 31, 2026 at 23:59:59 UTC). Those rules were for a different project, so changing them could not fix the app's old connection.

The complete web configuration in `firebase-config.js` now matches the `kahoots-bi-web` app shown in Firebase Console. The intended database returned HTTP 200. Firebase paths and saved quiz formats are unchanged. Data from the old database has not been copied; locally saved quizzes remain available, and any required old cloud data needs a separate authorized migration.

At the user's request, all 8 quizzes (54 questions, including 9 images) from `data/legacy-powerbi-quizzes.json` were subsequently imported into `kahoots-bi/quizzes/powerbi`. The destination was empty. The import used an ETag conditional write to prevent overwriting concurrent changes. Every original question field was verified after saving, and all 8 titles appeared in the instructor dashboard. The app's existing cloud loader automatically uses this collection instead of the two sample presets.

## Restore access

1. Open the Firebase Console for `kahoots-bi`, then **Realtime Database → Rules** (not Firestore or Storage rules).
2. Confirm the database URL matches `firebase-config.js`, and inspect the published rules for `kahoots-bi-default-rtdb`. The current rule deadline is `1798761599000`; the earlier July deadline in the original project documentation described the old setup.
3. Correct the deployed access policy. The current app has no Firebase Authentication, so simply requiring `auth != null` would also block it. Permanent restricted access requires implementing authentication and matching rules. Do not replace the rules with unrestricted public access as a permanent fix; the instructor password is only a browser-side UI gate.
4. Reload the application, launch a quiz, and verify that a six-digit PIN appears. Join from two separate devices, answer, receive results, and advance.

Database rules are hosted in Firebase and are not deployed by editing `app.js`. No live rules were changed during this investigation.

## Local fixes and verification

Hosting now displays progress, prevents simultaneous launches, reports permission failures, and restores the launch controls after a rejected request. It does not show a nonfunctional local PIN when Firebase initialization fails. QR-library or browser-storage failures no longer prevent a created room from opening. While Firebase is waiting for a network connection, the launch remains pending and displays a connection hint; no additional room transaction is started.

Run `node qa/hosting.cjs` for simulated success, denied access, unavailable Firebase, PIN collision, failed QR rendering, failed storage, and duplicate-launch checks. It also checks duplicate HTML IDs, literal DOM references, and CSS braces. Parse browser scripts with `Get-Content -Raw app.js | node --input-type=module --check` and the equivalent command for `firebase-config.js`.

Live browser verification against `kahoots-bi` passed: room creation and PIN display, two player clients with separate origin storage (`localhost` and `127.0.0.1`), synchronized questions, both answers, correct results and scores, leaderboard, next-question progression, host refresh/rejoin, and player refresh with score recovery. The temporary room was removed afterward, and both clients displayed the session-ended notice. These were browser clients on one computer, not two physical phones. All seven modes, builder previews, multi-tab presence, network loss/reconnect, explicit leave, and kick were not fully retested in this focused hosting fix.
