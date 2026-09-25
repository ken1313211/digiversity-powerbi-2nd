import {
    database, ref, set, get, update, onValue, remove, child, push, onChildAdded, runTransaction, onDisconnect,
    isFirebaseEnabled
} from "./firebase-config.js";

// ==========================================
// 1. POWER BI BRANDED PRESETS & CONFIG
// ==========================================
const defaultPresets = [
    {
        title: "Power BI Foundations",
        questions: [
            { type: "multiple-choice", text: "Which Power BI view is used to create relationships between tables?", options: ["Report view", "Data view", "Model view", "Dashboard view"], correct: 2, timeLimit: 20 },
            { type: "multiple-choice", text: "Which visual is best for showing a trend over time?", options: ["Card", "Line chart", "Gauge", "Treemap"], correct: 1, timeLimit: 20 },
            { type: "true-false", text: "A measure is calculated based on the current filter context.", options: ["True", "False"], correct: 0, timeLimit: 15 },
            { type: "jumbled-prompt", text: "Arrange a typical Power BI workflow:", words: ["Connect to data", "Transform in Power Query", "Build the data model", "Create report visuals"], timeLimit: 30 },
            { type: "type-answer", text: "Which language is used to create measures in Power BI?", answerText: "DAX", timeLimit: 20 },
            { type: "number-guess", text: "A KPI target is 100 and the actual value is 75. What is the achievement percentage?", targetNumber: 75, timeLimit: 20 },
            { type: "speed-math", text: "Complete a measure that totals the Sales column.", equation: "SUM, Sales", timeLimit: 30 }
        ]
    },
    {
        title: "Data Modeling and DAX",
        questions: [
            { type: "multiple-choice", text: "Which schema is generally recommended for Power BI models?", options: ["Star schema", "Mesh schema", "Circular schema", "Flat-file schema"], correct: 0, timeLimit: 20 },
            { type: "true-false", text: "Calculated columns are evaluated during data refresh.", options: ["True", "False"], correct: 0, timeLimit: 15 },
            { type: "multiple-choice", text: "Which DAX function changes filter context?", options: ["FORMAT", "CALCULATE", "CONCATENATE", "ROUND"], correct: 1, timeLimit: 20 },
            { type: "type-answer", text: "Which Power BI tool is used to clean and transform data?", answerText: "Power Query", timeLimit: 20 },
            { type: "poll", text: "Which Power BI skill would help you most?", options: ["Power Query", "Data modeling", "DAX", "Dashboard design"], timeLimit: 20 },
            { type: "jumbled-prompt", text: "Arrange these modeling tasks:", words: ["Import dimension tables", "Import fact table", "Create relationships", "Hide technical columns"], timeLimit: 30 },
            { type: "number-guess", text: "A report has 4 pages with 5 visuals each. How many visuals are there?", targetNumber: 20, timeLimit: 20 }
        ]
    }
];

let powerBiPresets = [];
try {
    const saved = localStorage.getItem("powerbi_custom_quizzes");
    if (saved) {
        powerBiPresets = JSON.parse(saved);
    } else {
        powerBiPresets = defaultPresets;
        localStorage.setItem("powerbi_custom_quizzes", JSON.stringify(powerBiPresets));
    }
} catch (e) {
    powerBiPresets = defaultPresets;
}

const THEME_COLORS = {
    primary: "#FFE600",
    purple: "#62626E",
    blue: "#464650",
    darkBlue: "#34343F"
};

const DEFAULT_APP_TITLE = "Digiversity 2026 Power BI";
const DEFAULT_APP_SUBTITLE = "Model. Visualize. Analyze. Compete.";
const ADMIN_PASSWORD = "eypowerbi2026";
const ADMIN_SESSION_KEY = "powerbi_instructor_authenticated";
const SESSION_ROOT = "powerbiSessions";
const LEGACY_QUIZ_PACK_URL = "./data/legacy-powerbi-quizzes.json";
let currentAppTitle = DEFAULT_APP_TITLE;
let currentAppSubtitle = DEFAULT_APP_SUBTITLE;
try {
    currentAppTitle = localStorage.getItem("powerbi_app_title") || DEFAULT_APP_TITLE;
    currentAppSubtitle = localStorage.getItem("powerbi_app_subtitle") || DEFAULT_APP_SUBTITLE;
} catch (e) {}

// Global State
let editingQuizIndex = null;
let gameSessionRef = null;
let currentSessionPin = null;
let currentRole = null;
let myPlayerKey = null;
let myNickname = "";
let currentQuizData = null;

// Host tracking configurations
let timerInterval = null;
let timeLeft = 0;
let hostActiveQuestionIndex = 0;
let hostAnswersMap = {};
let isTimerPaused = false;
let sessionTotalAnswersCount = 0;
let sessionTotalCorrectAnswersCount = 0;

// Player data tracking
let hasAnsweredCurrent = false;
let playerActiveQuestionIndex = -1;
let currentQuestionStartTime = 0;
let currentScore = 0;
let currentStreak = 0;
let previousRank = null;
let playerClientId = null;
let playerConnectionId = null;
let questionConclusionInProgress = false;
let roomCreationInProgress = false;

// Synchronization handles
let sessionStateListener = null;
let playerRecordListener = null;
let playerLobbyListener = null;
let answersListener = null;
let emojiListener = null;
let emojiCooldownActive = false;

const views = {
    landing: document.getElementById("view-landing"),
    adminLogin: document.getElementById("view-admin-login"),
    playerJoin: document.getElementById("view-player-join"),
    playerLobby: document.getElementById("view-player-lobby"),
    playerQuestion: document.getElementById("view-player-question"),
    playerResult: document.getElementById("view-player-result"),
    playerLeaderboard: document.getElementById("view-player-leaderboard"),
    hostSetup: document.getElementById("view-host-setup"),
    adminMaker: document.getElementById("view-admin-maker"),
    hostLobby: document.getElementById("view-host-lobby"),
    hostQuestion: document.getElementById("view-host-question"),
    hostResults: document.getElementById("view-host-results"),
    hostLeaderboard: document.getElementById("view-host-leaderboard")
};

const sfx = {
    tick: document.getElementById("sfx-tick"),
    ding: document.getElementById("sfx-ding"),
    powerup: document.getElementById("sfx-powerup")
};

// ==========================================
// 2. VIEW NAVIGATION SYSTEM
// ==========================================
function switchView(targetKey) {
    Object.keys(views).forEach(key => {
        if (views[key]) views[key].classList.remove("active");
    });
    if (views[targetKey]) {
        views[targetKey].classList.add("active");
        console.log(`Switched layout to view state: ${targetKey}`);
    } else {
        console.error(`Target view layout mapping failed for: ${targetKey}`);
    }
}

function unsubscribeActiveListeners() {
    if (sessionStateListener) { sessionStateListener(); sessionStateListener = null; }
    if (playerRecordListener) { playerRecordListener(); playerRecordListener = null; }
    if (playerLobbyListener) { playerLobbyListener(); playerLobbyListener = null; }
    if (answersListener) { answersListener(); answersListener = null; }
    if (emojiListener) { emojiListener(); emojiListener = null; }
}

function clearPlayerSessionStorage() {
    playerActiveQuestionIndex = -1;
    sessionStorage.removeItem("powerbi_player_session_pin");
    sessionStorage.removeItem("powerbi_player_nickname");
    sessionStorage.removeItem("powerbi_player_key");
    sessionStorage.removeItem("powerbi_player_role");
}

function clearHostSessionStorage() {
    sessionStorage.removeItem("powerbi_host_session_pin");
    sessionStorage.removeItem("powerbi_host_role");
    sessionStorage.removeItem("powerbi_host_quiz");
}

function purgeActiveListeners() {
    unsubscribeActiveListeners();
    clearPlayerSessionStorage();
    clearHostSessionStorage();
}

// ==========================================
// 3. CORE INITIALIZATION PIPELINE
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    console.log("Power BI Challenge operational system running successfully...");
    initializeBrandingSettings();

    if (!isFirebaseEnabled) {
        const warningModal = document.getElementById("firebase-warning-modal");
        if (warningModal) warningModal.classList.remove("hidden");
        document.getElementById("btn-dismiss-firebase")?.addEventListener("click", () => {
            warningModal.classList.add("hidden");
        });
    }

    // Attach Interactivity Routes
    document.getElementById("btn-goto-join")?.addEventListener("click", () => switchView("playerJoin"));
    document.getElementById("btn-goto-login")?.addEventListener("click", () => {
        if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "true") {
            enterHostDashboard();
        } else {
            switchView("adminLogin");
        }
    });

    document.getElementById("btn-back-landing-login")?.addEventListener("click", () => switchView("landing"));
    document.getElementById("btn-back-landing-player")?.addEventListener("click", () => switchView("landing"));
    document.getElementById("btn-back-landing-host")?.addEventListener("click", () => {
        switchView("landing");
    });

    setupInstructorLoginWorkflow();
    setupHostManagementWorkflow();
    setupPlayerParticipationWorkflow();
    recoverPlayerSession();
});

// ==========================================
// 4. ADMINISTRATIVE WORKFLOW SYSTEMS
// ==========================================
function setupInstructorLoginWorkflow() {
    const loginForm = document.getElementById("form-admin-login");
    loginForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const pwdInput = document.getElementById("input-admin-password");
        const submitBtn = document.getElementById("btn-admin-login");
        const password = pwdInput.value;

        if (password !== ADMIN_PASSWORD) {
            alert("Administrative connection verification credentials failed.");
            return;
        }

        submitBtn.disabled = true;
        try {
            sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
            pwdInput.value = "";
            await enterHostDashboard();
        } finally {
            submitBtn.disabled = false;
        }
    });

    document.getElementById("btn-admin-logout")?.addEventListener("click", () => {
        purgeActiveListeners();
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        switchView("landing");
    });
}

function applyAppTitle(title) {
    const cleanTitle = (title || "").trim() || DEFAULT_APP_TITLE;
    currentAppTitle = cleanTitle;
    document.title = cleanTitle;

    const titleDisplay = document.getElementById("app-title-display");
    if (titleDisplay) {
        const parts = cleanTitle.split(/\s+/);
        const accent = parts.length >= 2 && parts.slice(-2).join(" ").toLowerCase() === "power bi"
            ? parts.splice(-2).join(" ")
            : (parts.pop() || "Power BI");
        titleDisplay.replaceChildren(
            document.createTextNode(parts.length ? `${parts.join(" ")} ` : ""),
            Object.assign(document.createElement("span"), { textContent: accent })
        );
    }

    const titleInput = document.getElementById("input-app-title");
    if (titleInput && document.activeElement !== titleInput) titleInput.value = cleanTitle;
}

function applyAppSubtitle(subtitle) {
    const cleanSubtitle = (subtitle || "").trim() || DEFAULT_APP_SUBTITLE;
    currentAppSubtitle = cleanSubtitle;

    const subtitleDisplay = document.getElementById("app-subtitle-display");
    const subtitleSpacer = document.getElementById("app-subtitle-spacer");
    if (subtitleDisplay) subtitleDisplay.textContent = cleanSubtitle;
    if (subtitleSpacer) subtitleSpacer.textContent = cleanSubtitle;

    const subtitleInput = document.getElementById("input-app-subtitle");
    if (subtitleInput && document.activeElement !== subtitleInput) subtitleInput.value = cleanSubtitle;
}

function initializeBrandingSettings() {
    applyAppTitle(currentAppTitle);
    applyAppSubtitle(currentAppSubtitle);

    if (isFirebaseEnabled) {
        onValue(ref(database, "settings/powerbi/appTitle"), (snapshot) => {
            if (!snapshot.exists()) return;
            const sharedTitle = String(snapshot.val() || "").trim();
            if (!sharedTitle) return;
            localStorage.setItem("powerbi_app_title", sharedTitle);
            applyAppTitle(sharedTitle);
        });

        onValue(ref(database, "settings/powerbi/appSubtitle"), (snapshot) => {
            if (!snapshot.exists()) return;
            const sharedSubtitle = String(snapshot.val() || "").trim();
            if (!sharedSubtitle) return;
            localStorage.setItem("powerbi_app_subtitle", sharedSubtitle);
            applyAppSubtitle(sharedSubtitle);
        });
    }

    document.getElementById("btn-save-branding")?.addEventListener("click", async () => {
        const titleInput = document.getElementById("input-app-title");
        const subtitleInput = document.getElementById("input-app-subtitle");
        const nextTitle = titleInput?.value.trim() || DEFAULT_APP_TITLE;
        const nextSubtitle = subtitleInput?.value.trim() || DEFAULT_APP_SUBTITLE;
        localStorage.setItem("powerbi_app_title", nextTitle);
        localStorage.setItem("powerbi_app_subtitle", nextSubtitle);
        applyAppTitle(nextTitle);
        applyAppSubtitle(nextSubtitle);

        if (isFirebaseEnabled) {
            try {
                await update(ref(database, "settings/powerbi"), {
                    appTitle: nextTitle,
                    appSubtitle: nextSubtitle
                });
            } catch (err) {
                console.warn("Shared branding sync failed:", err);
            }
        }

        const button = document.getElementById("btn-save-branding");
        const originalText = button.innerText;
        button.innerText = "Saved";
        setTimeout(() => { button.innerText = originalText; }, 1000);
    });
}

// ============================================
// QUESTION MAKER - PREMIUM BUILDER SYSTEM
// ============================================
const GAME_TYPE_META = {
    "multiple-choice": { label: "Visual Match", icon: "📊", color: "#FFE600" },
    "true-false":      { label: "BI Verdict", icon: "✅", color: "#8A6D00" },
    "jumbled-prompt":  { label: "Process Order", icon: "🔀", color: "#5B8DEF" },
    "type-answer":     { label: "DAX Answer", icon: "ƒx", color: "#a855f7" },
    "number-guess":    { label: "KPI Estimate", icon: "🎯", color: "#f97316" },
    "poll":            { label: "Analyst Poll", icon: "📈", color: "#22c55e" },
    "speed-math":      { label: "Missing DAX", icon: "ƒx", color: "#FFD700" },
};

const SAMPLE_DATA = {
    "multiple-choice": [
        { text: "Which visual best compares categories?", options: ["Bar chart", "Card", "Gauge", "Map"], correct: 0 },
        { text: "Which view manages table relationships?", options: ["Report", "Model", "Data", "Dashboard"], correct: 1 }
    ],
    "true-false": [
        { text: "Measures respond to filter context.", correct: 0 },
        { text: "A dashboard can contain multiple pages.", correct: 1 }
    ],
    "jumbled-prompt": [
        { text: "Arrange the report workflow:", words: ["Connect", "Transform", "Model", "Visualize"] },
        { text: "Arrange model development:", words: ["Load dimensions", "Load facts", "Create relationships", "Create measures"] }
    ],
    "type-answer": [
        { text: "Which DAX function changes filter context?", answerText: "CALCULATE" },
        { text: "Which tool transforms data before loading?", answerText: "Power Query" }
    ],
    "number-guess": [
        { text: "Actual is 80 against a target of 100. What percentage was achieved?", targetNumber: 80 },
        { text: "A report has 6 pages with 5 visuals each. How many visuals?", targetNumber: 30 }
    ],
    "poll": [
        { text: "Which Power BI topic needs more practice?", options: ["Power Query", "Modeling", "DAX", "Design"] },
        { text: "How confident are you building reports?", options: ["Very confident", "Somewhat confident", "Still learning", "Brand new"] }
    ],
    "speed-math": [
        { text: "Complete a measure that totals Sales[Amount].", equation: "SUM, Sales, Amount" },
        { text: "Complete a measure that counts rows in Customers.", equation: "COUNTROWS, Customers" }
    ]
};

function updateMakerCount() {
    const count = document.querySelectorAll(".maker-q-block").length;
    const el = document.getElementById("maker-q-count");
    if (el) el.innerText = count === 0 ? "0 questions added" : `${count} question${count !== 1 ? "s" : ""} added`;
    const emptyState = document.getElementById("maker-empty-state");
    if (emptyState) emptyState.style.display = count === 0 ? "flex" : "none";
}

function buildMakerBlock(typeSelect) {
    const meta = GAME_TYPE_META[typeSelect] || { label: typeSelect, icon: "❓", color: "white" };
    const qBlock = document.createElement("div");
    qBlock.className = "maker-q-block fade-in-up";
    qBlock.setAttribute("data-qtype", typeSelect);
    const radioGroup = "mc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);

    let html = `
        <div class="maker-q-header" style="border-left: 4px solid ${meta.color}">
            <span style="display:flex;align-items:center;gap:0.6rem">
                <span style="font-size:1.4rem">${meta.icon}</span>
                <strong style="color:${meta.color};font-size:1rem">${meta.label}</strong>
            </span>
            <div style="display:flex; gap:0.5rem">
                <button class="btn btn-secondary maker-up-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; border-radius: var(--radius-sm); cursor: pointer;" title="Move Up">↑</button>
                <button class="btn btn-secondary maker-down-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; border-radius: var(--radius-sm); cursor: pointer;" title="Move Down">↓</button>
                <button class="btn btn-secondary maker-sample-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; border-radius: var(--radius-sm); cursor: pointer;" title="Generate Sample Data">🎲</button>
                <button class="btn btn-secondary maker-preview-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; border-radius: var(--radius-sm); cursor: pointer;">👁️ Preview</button>
                <button class="maker-remove-btn">✕ Remove</button>
            </div>
        </div>
        <div class="maker-q-field">
            <label class="maker-q-label">Question Text</label>
            <textarea class="maker-q-text" rows="2" placeholder="Write your question here..."></textarea>
        </div>`;

    if (typeSelect === "multiple-choice") {
        html += `
            <div class="maker-options-grid">
                <div class="maker-q-field maker-opt-row"><input type="radio" name="${radioGroup}" class="maker-q-correct" value="0" checked><input type="text" class="maker-q-opt" placeholder="Option A..."></div>
                <div class="maker-q-field maker-opt-row"><input type="radio" name="${radioGroup}" class="maker-q-correct" value="1"><input type="text" class="maker-q-opt" placeholder="Option B..."></div>
                <div class="maker-q-field maker-opt-row"><input type="radio" name="${radioGroup}" class="maker-q-correct" value="2"><input type="text" class="maker-q-opt" placeholder="Option C... (optional)"></div>
                <div class="maker-q-field maker-opt-row"><input type="radio" name="${radioGroup}" class="maker-q-correct" value="3"><input type="text" class="maker-q-opt" placeholder="Option D... (optional)"></div>
            </div>
            <div class="maker-q-hint">🔘 Select the radio button next to the <strong style="color:#22c55e">correct answer</strong>.</div>`;
    } else if (typeSelect === "true-false") {
        html += `
            <div class="maker-q-guide" style="background: rgba(255,255,255,0.05); border-left: 3px solid #8A6D00; padding: 0.75rem; margin-bottom: 1rem; border-radius: 0 4px 4px 0; font-size: 0.85rem; color: #cbd5e1;">
                <strong>💡 How it works:</strong> Players decide whether a Power BI statement or modeling claim is true or false.
            </div>
            <div class="maker-options-list">
                <div class="maker-q-field maker-opt-row"><input type="radio" name="${radioGroup}" class="maker-q-correct" value="0" checked><label>Valid / True</label></div>
                <div class="maker-q-field maker-opt-row"><input type="radio" name="${radioGroup}" class="maker-q-correct" value="1"><label>Invalid / False</label></div>
            </div>`;
    } else if (typeSelect === "jumbled-prompt") {
        html += `
            <div class="maker-q-guide" style="background: rgba(255,255,255,0.05); border-left: 3px solid #5B8DEF; padding: 0.75rem; margin-bottom: 1rem; border-radius: 0 4px 4px 0; font-size: 0.85rem; color: #cbd5e1;">
                <strong>💡 How it works:</strong> Players arrange Power BI workflow steps in the correct order. Enter the steps below in the <strong>correct order</strong>, separated by commas.
            </div>
            <div class="maker-q-field"><label class="maker-q-label">🔀 Steps in Correct Order <span class="text-muted">(comma-separated)</span></label><input type="text" class="maker-q-words" placeholder="e.g. Connect, Transform, Model, Visualize"></div>`;
    } else if (typeSelect === "type-answer") {
        html += `
            <div class="maker-q-guide" style="background: rgba(255,255,255,0.05); border-left: 3px solid #a855f7; padding: 0.75rem; margin-bottom: 1rem; border-radius: 0 4px 4px 0; font-size: 0.85rem; color: #cbd5e1;">
                <strong>💡 How it works:</strong> Players enter the exact DAX function, Power BI term, or result. Matching is case-insensitive.
            </div>
            <div class="maker-q-field"><label class="maker-q-label">✅ Expected Answer <span class="text-muted">(case-insensitive)</span></label><input type="text" class="maker-q-answer" placeholder="e.g. CALCULATE"></div>`;
    } else if (typeSelect === "number-guess") {
        html += `
            <div class="maker-q-guide" style="background: rgba(255,255,255,0.05); border-left: 3px solid #f97316; padding: 0.75rem; margin-bottom: 1rem; border-radius: 0 4px 4px 0; font-size: 0.85rem; color: #cbd5e1;">
                <strong>💡 How it works:</strong> Players estimate a numeric KPI, percentage, or measure result.
            </div>
            <div class="maker-q-field"><label class="maker-q-label">🎯 Correct Value <span class="text-muted">(0 to 100)</span></label><input type="number" class="maker-q-number" min="0" max="100" step="1" placeholder="e.g. 42"></div>`;
    } else if (typeSelect === "poll") {
        html += `
            <div class="maker-q-guide" style="background: rgba(255,255,255,0.05); border-left: 3px solid #22c55e; padding: 0.75rem; margin-bottom: 1rem; border-radius: 0 4px 4px 0; font-size: 0.85rem; color: #cbd5e1;">
                <strong>💡 How it works:</strong> No right or wrong answers. Players vote on an option, and the host screen shows a live bar chart of the group's consensus. No points are awarded.
            </div>
            <div class="maker-q-field"><label class="maker-q-label">Poll Options <span class="text-muted">(comma-separated)</span></label><input type="text" class="maker-q-poll-opts" placeholder="e.g. Daily, Weekly, Monthly, Never"></div>`;
    } else if (typeSelect === "speed-math") {
        html += `
            <div class="maker-q-guide" style="background: rgba(255,255,255,0.05); border-left: 3px solid #FFD700; padding: 0.75rem; margin-bottom: 1rem; border-radius: 0 4px 4px 0; font-size: 0.85rem; color: #cbd5e1;">
                <strong>💡 How it works:</strong> Players complete a missing DAX expression. Their response must contain every required element; concise answers score higher.
            </div>
            <div class="maker-q-field"><label class="maker-q-label">🔑 Required DAX Elements <span class="text-muted">(comma-separated)</span></label><input type="text" class="maker-q-math-eq" placeholder="e.g. CALCULATE, SUM, Sales"></div>`;
    }

    html += `
        <div class="maker-q-field mt-3">
            <label class="maker-q-label">🖼️ Optional Question Image</label>
            <div class="flex items-center gap-2" style="margin-top: 0.25rem;">
                <input type="file" class="maker-q-image-file" accept="image/*" style="display: none;">
                <button type="button" class="btn btn-secondary btn-upload-img-btn" style="padding: 0.4rem 0.8rem; font-size: 0.9rem; border-radius: var(--radius-md);">Upload Image</button>
                <span class="maker-q-img-name text-muted text-small" style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">No file selected</span>
                <button type="button" class="btn btn-danger btn-clear-img-btn hidden" style="padding: 0.4rem 0.8rem; font-size: 0.9rem; background: #ef4444; border: none; border-radius: var(--radius-md); color: white; cursor: pointer;">Remove</button>
            </div>
            <div class="maker-q-img-preview-container mt-2 hidden" style="max-width: 120px; border: 1px solid var(--glass-border); border-radius: var(--radius-md); overflow: hidden;">
                <img class="maker-q-img-preview" src="" style="width: 100%; display: block;">
            </div>
        </div>
    `;

    html += `<div class="maker-q-field" style="max-width:200px; margin-top: 1rem;"><label class="maker-q-label">⏱ Time Limit (seconds)</label><input type="number" class="maker-q-time" value="20" min="5" max="120"></div>`;
    qBlock.innerHTML = html;

    const fileInput = qBlock.querySelector(".maker-q-image-file");
    const uploadBtn = qBlock.querySelector(".btn-upload-img-btn");
    const clearBtn = qBlock.querySelector(".btn-clear-img-btn");
    const nameSpan = qBlock.querySelector(".maker-q-img-name");
    const previewContainer = qBlock.querySelector(".maker-q-img-preview-container");
    const previewImg = qBlock.querySelector(".maker-q-img-preview");

    uploadBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        nameSpan.innerText = file.name;
        clearBtn.classList.remove("hidden");

        const reader = new FileReader();
        reader.onload = (evt) => {
            const base64Image = evt.target.result;
            previewImg.src = base64Image;
            previewContainer.classList.remove("hidden");
            qBlock.setAttribute("data-image", base64Image);
        };
        reader.readAsDataURL(file);
    });

    clearBtn.addEventListener("click", () => {
        fileInput.value = "";
        nameSpan.innerText = "No file selected";
        clearBtn.classList.add("hidden");
        previewContainer.classList.add("hidden");
        previewImg.src = "";
        qBlock.removeAttribute("data-image");
    });

    qBlock.querySelector(".maker-remove-btn").addEventListener("click", () => {
        qBlock.style.animation = "slideOutBlock 0.3s ease forwards";
        setTimeout(() => { qBlock.remove(); updateMakerCount(); }, 280);
    });

    qBlock.querySelector(".maker-preview-btn").addEventListener("click", () => {
        if (typeof compileQuestionFromBlock === 'function') {
            const qObj = compileQuestionFromBlock(qBlock);
            if (qObj) showPreviewModal([qObj], 0);
        }
    });

    qBlock.querySelector(".maker-sample-btn")?.addEventListener("click", () => {
        const samples = SAMPLE_DATA[typeSelect];
        if (!samples || samples.length === 0) return;
        const q = samples[Math.floor(Math.random() * samples.length)];
        
        const qTextEl = qBlock.querySelector(".maker-q-text");
        if (qTextEl) qTextEl.value = q.text || "";
        
        if (typeSelect === "multiple-choice") {
            const opts = qBlock.querySelectorAll(".maker-q-opt");
            const radios = qBlock.querySelectorAll(".maker-q-correct");
            q.options.forEach((optStr, i) => { if (opts[i]) opts[i].value = optStr; });
            if (q.correct !== undefined && radios[q.correct]) radios[q.correct].checked = true;
        } else if (typeSelect === "true-false") {
            const radios = qBlock.querySelectorAll(".maker-q-correct");
            if (q.correct !== undefined && radios[q.correct]) radios[q.correct].checked = true;
        } else if (typeSelect === "jumbled-prompt") {
            const wordInput = qBlock.querySelector(".maker-q-words");
            if (wordInput && q.words) wordInput.value = q.words.join(", ");
        } else if (typeSelect === "type-answer") {
            const ansInput = qBlock.querySelector(".maker-q-answer");
            if (ansInput) ansInput.value = q.answerText || "";
        } else if (typeSelect === "number-guess") {
            const numInput = qBlock.querySelector(".maker-q-number");
            if (numInput && q.targetNumber !== undefined) numInput.value = q.targetNumber;
        } else if (typeSelect === "poll") {
            const pollInput = qBlock.querySelector(".maker-q-poll-opts");
            if (pollInput && q.options) pollInput.value = q.options.join(", ");
        } else if (typeSelect === "speed-math") {
            const eqInput = qBlock.querySelector(".maker-q-math-eq");
            const ansInput = qBlock.querySelector(".maker-q-math-ans");
            if (eqInput) eqInput.value = q.equation || "";
            if (ansInput && q.answerNumber !== undefined) ansInput.value = q.answerNumber;
        }
    });

    qBlock.querySelector(".maker-up-btn")?.addEventListener("click", () => {
        if (qBlock.previousElementSibling) {
            qBlock.parentNode.insertBefore(qBlock, qBlock.previousElementSibling);
            qBlock.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    });

    qBlock.querySelector(".maker-down-btn")?.addEventListener("click", () => {
        if (qBlock.nextElementSibling) {
            qBlock.parentNode.insertBefore(qBlock.nextElementSibling, qBlock);
            qBlock.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    });

    return qBlock;
}


function setupHostManagementWorkflow() {
    document.getElementById("btn-import-legacy-quizzes")?.addEventListener("click", importLegacyPowerBiQuizzes);

    document.getElementById("btn-open-maker")?.addEventListener("click", () => {
        editingQuizIndex = null;
        document.getElementById("maker-quiz-title").value = "";
        const container = document.getElementById("maker-questions-container");
        if (container) {
            container.innerHTML = `
                <div id="maker-empty-state" class="maker-empty-state">
                    <div style="font-size:4rem;margin-bottom:1rem">🎮</div>
                    <h3 style="color:var(--color-cyan)">Start Building!</h3>
                    <p class="text-muted mt-2">Choose an activity on the left to build your Power BI challenge.</p>
                </div>`;
        }
        updateMakerCount();
        switchView("adminMaker");
    });
    document.getElementById("btn-close-maker")?.addEventListener("click", () => enterHostDashboard());

    // Sidebar type buttons — click to add
    document.querySelectorAll(".maker-type-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const type = btn.getAttribute("data-type");
            const container = document.getElementById("maker-questions-container");
            const emptyState = document.getElementById("maker-empty-state");
            if (emptyState) emptyState.remove();
            const block = buildMakerBlock(type);
            container.appendChild(block);
            block.scrollIntoView({ behavior: "smooth", block: "nearest" });
            updateMakerCount();
            btn.classList.add("maker-type-btn-flash");
            setTimeout(() => btn.classList.remove("maker-type-btn-flash"), 400);
        });
    });

    document.getElementById("btn-preview-quiz")?.addEventListener("click", () => {
        const qBlocks = document.querySelectorAll(".maker-q-block");
        if (qBlocks.length === 0) { alert("Add at least one question to preview!"); return; }
        if (typeof compileQuestionFromBlock === 'function') {
            const qs = Array.from(qBlocks).map(b => compileQuestionFromBlock(b));
            showPreviewModal(qs, 0);
        }
    });

    document.getElementById("btn-save-quiz")?.addEventListener("click", async () => {
        const title = document.getElementById("maker-quiz-title").value.trim();
        if (!title) { alert("Give your quiz a title first!"); return; }
        const qBlocks = document.querySelectorAll(".maker-q-block");
        if (qBlocks.length === 0) { alert("Add at least one question first!"); return; }

        const newQuiz = { title, questions: [] };
        let valid = true;
        let firstInvalidBlock = null;

        qBlocks.forEach(block => {
            block.classList.remove("validation-error");
            
            const markInvalid = () => {
                valid = false;
                block.classList.add("validation-error");
                if (!firstInvalidBlock) firstInvalidBlock = block;
            };

            const qType = block.getAttribute("data-qtype");
            const qText = (block.querySelector(".maker-q-text")?.value || "").trim();
            const qTime = parseInt(block.querySelector(".maker-q-time")?.value) || 20;
            if (!qText) { markInvalid(); return; }
            const qImage = block.getAttribute("data-image") || "";
            const qObj = { type: qType, text: qText, timeLimit: qTime, image: qImage };

            if (qType === "multiple-choice") {
                const opts = Array.from(block.querySelectorAll(".maker-q-opt")).map(i => i.value.trim()).filter(v => v);
                if (opts.length < 2) { markInvalid(); return; }
                const checkedRadio = block.querySelector(".maker-q-correct:checked");
                const correctIdx = checkedRadio ? parseInt(checkedRadio.value) : 0;
                qObj.options = opts; qObj.correct = Math.min(correctIdx, opts.length - 1);
            } else if (qType === "true-false") {
                const checkedRadio = block.querySelector(".maker-q-correct:checked");
                qObj.options = ["True", "False"];
                qObj.correct = checkedRadio ? parseInt(checkedRadio.value) : 0;
            } else if (qType === "jumbled-prompt") {
                const words = (block.querySelector(".maker-q-words")?.value || "").split(",").map(w => w.trim()).filter(w => w);
                if (words.length < 2) { markInvalid(); return; }
                qObj.words = words;
            } else if (qType === "type-answer") {
                const ans = block.querySelector(".maker-q-answer")?.value.trim();
                if (!ans) { markInvalid(); return; }
                qObj.answerText = ans;
            } else if (qType === "number-guess") {
                const num = parseFloat(block.querySelector(".maker-q-number")?.value);
                if (isNaN(num)) { markInvalid(); return; }
                qObj.targetNumber = num;
            } else if (qType === "poll") {
                const opts = (block.querySelector(".maker-q-poll-opts")?.value || "").split(",").map(o => o.trim()).filter(o => o);
                if (opts.length < 2) { markInvalid(); return; }
                qObj.options = opts; qObj.isPoll = true;
            } else if (qType === "speed-math") {
                const eq = block.querySelector(".maker-q-math-eq")?.value.trim();
                if (!eq) { markInvalid(); return; }
                qObj.equation = eq;
            }
            newQuiz.questions.push(qObj);
        });

        if (!valid) { 
            alert("Some questions have missing fields. They have been highlighted in red."); 
            if (firstInvalidBlock) firstInvalidBlock.scrollIntoView({ behavior: "smooth", block: "center" });
            return; 
        }
        
        if (editingQuizIndex !== null) {
            powerBiPresets[editingQuizIndex] = newQuiz;
        } else {
            powerBiPresets.push(newQuiz);
        }

        try {
            localStorage.setItem("powerbi_custom_quizzes", JSON.stringify(powerBiPresets));
        } catch (e) {}
        await syncPresetsToFirebase();
        enterHostDashboard();
    });
}

async function importLegacyPowerBiQuizzes() {
    const button = document.getElementById("btn-import-legacy-quizzes");
    const originalLabel = button?.textContent || "Import Old Power BI Quizzes";

    if (!confirm("Import the 8 quizzes and 54 questions from the old Power BI database export? Existing quiz titles will be skipped.")) {
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = "Importing...";
    }

    try {
        const response = await fetch(LEGACY_QUIZ_PACK_URL, { cache: "no-store" });
        if (!response.ok) throw new Error(`Quiz pack could not be loaded (${response.status}).`);

        const legacyQuizzes = await response.json();
        if (!Array.isArray(legacyQuizzes)) throw new Error("The old quiz pack has an invalid format.");

        const existingTitles = new Set(
            powerBiPresets.map(quiz => String(quiz.title || "").trim().toLowerCase())
        );
        const importedQuizzes = [];

        legacyQuizzes.forEach(quiz => {
            const title = String(quiz.title || "").trim();
            const normalizedTitle = title.toLowerCase();
            if (!title || existingTitles.has(normalizedTitle) || !Array.isArray(quiz.questions)) return;

            const questions = quiz.questions
                .filter(question => question && question.text && Array.isArray(question.options))
                .map(question => ({
                    type: "multiple-choice",
                    text: String(question.text),
                    options: question.options.map(option => String(option)),
                    correct: Number(question.correct) || 0,
                    timeLimit: Number(question.timeLimit) || 20,
                    image: question.image || ""
                }));

            if (questions.length === 0) return;
            importedQuizzes.push({ title, questions });
            existingTitles.add(normalizedTitle);
        });

        if (importedQuizzes.length === 0) {
            alert("No quizzes were imported. All old quiz titles are already present.");
            return;
        }

        powerBiPresets.push(...importedQuizzes);
        localStorage.setItem("powerbi_custom_quizzes", JSON.stringify(powerBiPresets));
        await syncPresetsToFirebase();
        renderQuizSelector();

        const questionCount = importedQuizzes.reduce((sum, quiz) => sum + quiz.questions.length, 0);
        alert(`Imported ${importedQuizzes.length} quizzes with ${questionCount} questions.`);
    } catch (error) {
        console.error("Old Power BI quiz import failed:", error);
        alert(`Import failed: ${error.message}`);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalLabel;
        }
    }
}

async function syncPresetsToFirebase() {
    if (!isFirebaseEnabled) return;
    try {
        await set(ref(database, 'quizzes/powerbi'), powerBiPresets);
    } catch (err) {
        console.warn("Firebase sync failed:", err);
    }
}

async function loadPresetsFromFirebase() {
    if (!isFirebaseEnabled) return;
    try {
        const snap = await get(ref(database, 'quizzes/powerbi'));
        if (snap.exists()) {
            powerBiPresets = snap.val();
            localStorage.setItem("powerbi_custom_quizzes", JSON.stringify(powerBiPresets));
        }
    } catch (err) {
        console.warn("Firebase load failed:", err);
    }
}

async function loadHistoryFromFirebase() {
    if (!isFirebaseEnabled) return null;
    try {
        const snap = await get(ref(database, 'quizzes/powerbiHistory'));
        if (snap.exists()) {
            return snap.val();
        }
    } catch (err) {
        console.warn("Firebase history load failed:", err);
    }
    return null;
}

async function syncHistoryToFirebase(historyData) {
    if (!isFirebaseEnabled) return;
    try {
        await set(ref(database, 'quizzes/powerbiHistory'), historyData);
    } catch (err) {
        console.warn("Firebase history sync failed:", err);
    }
}

async function enterHostDashboard() {
    currentRole = "host";
    await loadPresetsFromFirebase();
    switchView("hostSetup");
    renderQuizSelector();
    
    const activePin = sessionStorage.getItem("powerbi_host_session_pin");
    const banner = document.getElementById("host-active-session-banner");
    if (banner) {
        if (activePin) {
            document.getElementById("banner-active-pin").innerText = activePin;
            banner.classList.remove("hidden");
        } else {
            banner.classList.add("hidden");
        }
    }
    
    let history = [];
    const fbHistory = await loadHistoryFromFirebase();
    if (fbHistory) {
        history = fbHistory;
        try { localStorage.setItem("powerbi_recent_sessions", JSON.stringify(history)); } catch (e) {}
    } else {
        try {
            const savedHistory = localStorage.getItem("powerbi_recent_sessions");
            if (savedHistory) {
                history = JSON.parse(savedHistory);
            }
        } catch (e) {
            history = [];
        }
    }

    let workshops = 0;
    let totalPlayers = 0;
    let avgEngagement = 0;

    if (history.length > 0) {
        workshops = history.length;
        totalPlayers = history.reduce((sum, item) => sum + (item.playersCount || 0), 0);
        const totalAccuracy = history.reduce((sum, item) => sum + (item.accuracy || 0), 0);
        avgEngagement = Math.round(totalAccuracy / history.length);
    }

    document.getElementById("metric-workshops").innerText = workshops;
    document.getElementById("metric-players").innerText = totalPlayers;
    document.getElementById("metric-score").innerText = avgEngagement + "%";

    const historyList = document.getElementById("history-list");
    if (historyList) {
        historyList.innerHTML = "";
        if (history.length === 0) {
            historyList.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-muted text-small py-3">No recent sessions found.</td>
                </tr>
            `;
        } else {
            [...history].reverse().forEach((session, idx) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td class="text-small py-2">${session.date}</td>
                    <td class="text-small py-2" style="font-weight: 500;">${session.quizTitle}</td>
                    <td class="text-small py-2 text-center">${session.playersCount}</td>
                    <td class="text-small py-2 text-center">
                        <button class="btn btn-danger btn-delete-session" data-index="${history.length - 1 - idx}" style="padding: 0.25rem 0.5rem; background:#ef4444; border:none; border-radius:var(--radius-sm); color:white; cursor:pointer; font-size:0.8rem;">Delete</button>
                    </td>
                `;
                historyList.appendChild(tr);
            });

            historyList.querySelectorAll(".btn-delete-session").forEach(btn => {
                btn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    const targetIdx = parseInt(e.currentTarget.getAttribute("data-index"));
                    if (confirm("Are you sure you want to delete this session record?")) {
                        history.splice(targetIdx, 1);
                        try {
                            localStorage.setItem("powerbi_recent_sessions", JSON.stringify(history));
                        } catch (err) {}
                        await syncHistoryToFirebase(history);
                        enterHostDashboard();
                    }
                });
            });
        }
    }
}

// Keep the familiar vertical library as the default; remember each browser's choice.
let quizLibraryLayout = "list";
try {
    if (localStorage.getItem("powerbi_quiz_library_layout") === "grid") quizLibraryLayout = "grid";
} catch (_) {}

function applyQuizLibraryLayout(layout) {
    quizLibraryLayout = layout === "grid" ? "grid" : "list";
    document.getElementById("custom-quizzes-list")?.classList.toggle("quiz-list-view", quizLibraryLayout === "list");
    document.getElementById("btn-quiz-view-list")?.setAttribute("aria-pressed", String(quizLibraryLayout === "list"));
    document.getElementById("btn-quiz-view-grid")?.setAttribute("aria-pressed", String(quizLibraryLayout === "grid"));
}

function renderQuizSelector() {
    const listContainer = document.getElementById("custom-quizzes-list");
    if (!listContainer) return;
    applyQuizLibraryLayout(quizLibraryLayout);
    for (const layout of ["list", "grid"]) {
        document.getElementById(`btn-quiz-view-${layout}`).onclick = () => {
            applyQuizLibraryLayout(layout);
            try { localStorage.setItem("powerbi_quiz_library_layout", layout); } catch (_) {}
        };
    }
    listContainer.innerHTML = "";

    powerBiPresets.forEach((quiz, index) => {
        const card = document.createElement("div");
        card.className = "card card-hover fade-in-up quiz-tile";
        card.dataset.palette = index % 4;
        card.innerHTML = `
            <div class="quiz-cover" aria-hidden="true"><span class="quiz-number">${String(index + 1).padStart(2, "0")}</span><span class="quiz-cover-shape"></span><span class="quiz-cover-arrow">↗</span></div>
            <h4 class="quiz-title"></h4>
            <p class="text-small">${quiz.questions.length} Power BI activities</p>
            <div class="flex gap-2 mt-3">
                <button class="btn btn-primary flex-1 btn-launch-quiz" data-index="${index}">Launch Challenge</button>
                <button class="btn btn-secondary btn-edit-quiz" data-index="${index}" style="padding: 0.5rem 0.75rem; border-radius:var(--radius-md);" title="Edit Quiz">✏️</button>
                <button class="btn btn-danger btn-delete-quiz" data-index="${index}" style="padding: 0.5rem 0.75rem; background:#ef4444; border:none; border-radius:var(--radius-md); color:white; cursor:pointer;" title="Delete Quiz">🗑️</button>
            </div>
        `;
        card.querySelector(".quiz-title").textContent = quiz.title;
        listContainer.appendChild(card);
    });

    listContainer.querySelectorAll(".btn-launch-quiz").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const idx = parseInt(e.currentTarget.getAttribute("data-index"));
            initializeLiveRoom(powerBiPresets[idx]);
        });
    });

    listContainer.querySelectorAll(".btn-edit-quiz").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const idx = parseInt(e.currentTarget.getAttribute("data-index"));
            loadQuizIntoMaker(idx);
        });
    });

    listContainer.querySelectorAll(".btn-delete-quiz").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const idx = parseInt(e.currentTarget.getAttribute("data-index"));
            if (confirm(`Are you sure you want to delete the quiz "${powerBiPresets[idx].title}"?`)) {
                powerBiPresets.splice(idx, 1);
                try {
                    localStorage.setItem("powerbi_custom_quizzes", JSON.stringify(powerBiPresets));
                } catch(err) {}
                syncPresetsToFirebase();
                renderQuizSelector();
            }
        });
    });

    const startGameButton = document.getElementById("btn-start-game");
    if (startGameButton) startGameButton.onclick = () => {
        hostActiveQuestionIndex = 0; 
        executeQuestionBroadcast(); 
    };

    const cancelSessionButton = document.getElementById("btn-cancel-session");
    if (cancelSessionButton) cancelSessionButton.onclick = () => terminateRoomInstance();

    const endGameButton = document.getElementById("btn-host-end-game-early");
    if (endGameButton) endGameButton.onclick = () => {
        if (confirm("End game early and skip to final results?")) {
            hostActiveQuestionIndex = currentQuizData.questions.length;
            clearInterval(timerInterval);
            presentHostLeaderboardView();
        }
    };

    const rejoinButton = document.getElementById("btn-banner-rejoin");
    if (rejoinButton) rejoinButton.onclick = () => recoverHostSession();

    const destroyButton = document.getElementById("btn-banner-destroy");
    if (destroyButton) destroyButton.onclick = () => {
        if (confirm("Are you sure you want to completely destroy the active live session?")) {
            terminateRoomInstance();
        }
    };

    const backDashboardButton = document.getElementById("btn-back-dashboard");
    if (backDashboardButton) backDashboardButton.onclick = () => terminateRoomInstance();
}

function loadQuizIntoMaker(index) {
    const quiz = powerBiPresets[index];
    if (!quiz) return;

    editingQuizIndex = index;
    document.getElementById("maker-quiz-title").value = quiz.title;
    const container = document.getElementById("maker-questions-container");
    container.innerHTML = "";

    quiz.questions.forEach(q => {
        const block = buildMakerBlock(q.type);
        container.appendChild(block);
        
        const qTextEl = block.querySelector(".maker-q-text");
        if (qTextEl) qTextEl.value = q.text || "";
        
        const qTimeEl = block.querySelector(".maker-q-time");
        if (qTimeEl) qTimeEl.value = q.timeLimit || 20;

        if (q.image) {
            block.setAttribute("data-image", q.image);
            const nameSpan = block.querySelector(".maker-q-img-name");
            const previewContainer = block.querySelector(".maker-q-img-preview-container");
            const previewImg = block.querySelector(".maker-q-img-preview");
            const clearBtn = block.querySelector(".btn-clear-img-btn");
            if (nameSpan) nameSpan.innerText = "Saved Image";
            if (previewImg) previewImg.src = q.image;
            if (previewContainer) previewContainer.classList.remove("hidden");
            if (clearBtn) clearBtn.classList.remove("hidden");
        }

        if (q.type === "multiple-choice") {
            const opts = block.querySelectorAll(".maker-q-opt");
            const radios = block.querySelectorAll(".maker-q-correct");
            q.options.forEach((optStr, i) => {
                if (opts[i]) opts[i].value = optStr;
            });
            if (q.correct !== undefined && radios[q.correct]) {
                radios[q.correct].checked = true;
            }
        } else if (q.type === "true-false") {
            const radios = block.querySelectorAll(".maker-q-correct");
            if (q.correct !== undefined && radios[q.correct]) {
                radios[q.correct].checked = true;
            }
        } else if (q.type === "jumbled-prompt") {
            const wordInput = block.querySelector(".maker-q-words");
            if (wordInput && q.words) wordInput.value = q.words.join(", ");
        } else if (q.type === "type-answer") {
            const ansInput = block.querySelector(".maker-q-answer");
            if (ansInput) ansInput.value = q.answerText || "";
        } else if (q.type === "number-guess") {
            const numInput = block.querySelector(".maker-q-number");
            if (numInput && q.targetNumber !== undefined) numInput.value = q.targetNumber;
        } else if (q.type === "poll") {
            const pollInput = block.querySelector(".maker-q-poll-opts");
            if (pollInput && q.options) pollInput.value = q.options.join(", ");
        } else if (q.type === "speed-math") {
            const eqInput = block.querySelector(".maker-q-math-eq");
            const ansInput = block.querySelector(".maker-q-math-ans");
            if (eqInput) eqInput.value = q.equation || "";
            if (ansInput && q.answerNumber !== undefined) ansInput.value = q.answerNumber;
        }
    });

    updateMakerCount();
    switchView("adminMaker");
}

async function initializeLiveRoom(quiz) {
    if (roomCreationInProgress) return;
    if (!quiz?.questions?.length) {
        alert("Add at least one question before hosting this quiz.");
        return;
    }
    if (!isFirebaseEnabled) {
        alert("Live hosting is unavailable because Firebase could not initialize. Check firebase-config.js and reload the page.");
        return;
    }

    roomCreationInProgress = true;
    const launchButtons = Array.from(document.querySelectorAll(".btn-launch-quiz"));
    const buttonStates = launchButtons.map(button => ({ button, text: button.textContent, disabled: button.disabled }));
    launchButtons.forEach(button => {
        button.disabled = true;
        button.textContent = "Creating room…";
    });
    const slowNotice = setTimeout(() => {
        launchButtons.forEach(button => { button.textContent = "Still connecting — check your internet…"; });
    }, 10000);

    try {
        if (isFirebaseEnabled) {
            let roomCreated = false;
            for (let attempt = 0; attempt < 12 && !roomCreated; attempt++) {
                const candidatePin = Math.floor(100000 + Math.random() * 900000).toString();
                const candidateRef = ref(database, `${SESSION_ROOT}/${candidatePin}`);
                const result = await runTransaction(candidateRef, current => {
                    if (current !== null) return;
                    return {
                        status: "lobby",
                        quizTitle: quiz.title,
                        currentQuestion: -1,
                        timestamp: Date.now(),
                        publicState: {
                            status: "lobby",
                            currentQuestion: -1
                        }
                    };
                });
                if (result.committed) {
                    currentSessionPin = candidatePin;
                    gameSessionRef = candidateRef;
                    roomCreated = true;
                }
            }
            if (!roomCreated) {
                alert("Unable to reserve a unique room PIN. Please try again.");
                return;
            }
        }

        currentRole = "host";
        currentQuizData = quiz;
        sessionTotalAnswersCount = 0;
        sessionTotalCorrectAnswersCount = 0;

        // Storage can be blocked or full (especially with image-heavy quizzes).
        // A recovery failure must not hide a successfully created live room.
        try {
            sessionStorage.setItem("powerbi_host_session_pin", currentSessionPin);
            sessionStorage.setItem("powerbi_host_role", "host");
            sessionStorage.setItem("powerbi_host_quiz", JSON.stringify(currentQuizData));
        } catch (error) {
            console.warn("Host refresh recovery could not be saved:", error);
            try { clearHostSessionStorage(); } catch (_) { /* Storage may be disabled. */ }
        }

        document.getElementById("display-game-pin").innerText = currentSessionPin;
        updateHostPinDisplays();
        document.getElementById("display-join-url").innerHTML = `Join at <strong>${window.location.origin}</strong>`;

        const qrContainer = document.getElementById("qr-code-container");
        if (qrContainer) {
            qrContainer.innerHTML = "";
            try {
                new QRCode(qrContainer, {
                    text: `${window.location.origin}?pin=${currentSessionPin}`,
                    width: 160, height: 160, colorDark: "#2B2B2B", colorLight: "#FFFFFF"
                });
            } catch (error) {
                console.warn("QR code unavailable:", error);
                qrContainer.textContent = "Join using the game PIN above.";
            }
        }

        trackLobbyRegistrations();
        switchView("hostLobby");
    } catch (error) {
        console.error("Unable to create live room:", error);
        const detail = `${error?.code || ""} ${error?.message || ""}`;
        if (/permission[_ -]?denied/i.test(detail)) {
            alert("Firebase denied access, so the game PIN could not be created. In Firebase Console, open kahoots-bi → Realtime Database → Rules and check read/write access for powerbiSessions. Confirm that the published rules belong to the database URL in firebase-config.js and have not expired. The instructor password does not grant database access. After access is corrected, try launching again.");
        } else {
            alert("Unable to open the live room. Check your internet connection and Firebase configuration, then try again. Details: " + (error?.message || "Unknown error"));
        }
    } finally {
        clearTimeout(slowNotice);
        roomCreationInProgress = false;
        buttonStates.forEach(({ button, text, disabled }) => {
            button.textContent = text;
            button.disabled = disabled;
        });
    }
}

function trackLobbyRegistrations() {
    if (!gameSessionRef) return;
    const countDisplay = document.getElementById("player-count");
    const listGrid = document.getElementById("player-list");
    const startBtn = document.getElementById("btn-start-game");

    if (playerLobbyListener) playerLobbyListener();
    playerLobbyListener = onValue(ref(database, `${SESSION_ROOT}/${currentSessionPin}/players`), (snapshot) => {
        listGrid.innerHTML = "";
        if (!snapshot.exists()) {
            countDisplay.innerText = "0";
            startBtn.disabled = true;
            return;
        }
        const data = snapshot.val();
        const keys = Object.keys(data).filter(k => isPlayerOnline(data[k]));
        countDisplay.innerText = keys.length;
        startBtn.disabled = keys.length === 0;

        keys.forEach(k => {
            const tag = document.createElement("div");
            tag.className = "player-tag";
            const name = document.createElement("span");
            name.textContent = data[k].nickname;
            const kickButton = document.createElement("button");
            kickButton.className = "btn-kick";
            kickButton.dataset.key = k;
            kickButton.textContent = "×";
            tag.append(name, kickButton);
            listGrid.appendChild(tag);
        });

        listGrid.querySelectorAll(".btn-kick").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const targetKey = e.currentTarget.getAttribute("data-key");
                const player = data[targetKey];
                const tasks = [remove(ref(database, `${SESSION_ROOT}/${currentSessionPin}/players/${targetKey}`))];
                if (player?.nickname) {
                    const claimRef = ref(
                        database,
                        `${SESSION_ROOT}/${currentSessionPin}/nicknameClaims/${nicknameClaimKey(player.nickname)}`
                    );
                    tasks.push(runTransaction(claimRef, current => (
                        current?.playerKey === targetKey ? null : undefined
                    )));
                }
                await Promise.allSettled(tasks);
            });
        });
    });

    if (emojiListener) emojiListener();
    emojiListener = onChildAdded(ref(database, `${SESSION_ROOT}/${currentSessionPin}/reactions`), (snapshot) => {
        if (snapshot.exists()) spawnReactionOnHostScreen(snapshot.val().emoji);
    });
}

async function terminateRoomInstance() {
    purgeActiveListeners();
    if (isFirebaseEnabled && currentSessionPin) await remove(ref(database, `${SESSION_ROOT}/${currentSessionPin}`));
    enterHostDashboard();
}

// ==========================================
// 5. HOST QUESTION BROADCAST ENGINE
// ==========================================
async function executeQuestionBroadcast(isReconnect = false) {
    isTimerPaused = false;
    document.getElementById("btn-pause-timer").classList.remove("hidden");
    document.getElementById("btn-resume-timer").classList.add("hidden");

    const q = currentQuizData.questions[hostActiveQuestionIndex];
    hostAnswersMap = {};

    document.getElementById("host-question-text").innerText = q.text;
    const hNumber = document.getElementById("host-question-number");
    if(hNumber) hNumber.innerText = `Question ${hostActiveQuestionIndex + 1} of ${currentQuizData.questions.length}`;
    
    const imgContainer = document.getElementById("host-question-image-container");
    const imgEl = document.getElementById("host-question-image");
    if (imgContainer && imgEl) {
        if (q.image) {
            imgEl.src = q.image;
            imgContainer.classList.remove("hidden");
        } else {
            imgEl.src = "";
            imgContainer.classList.add("hidden");
        }
    }
    
    const mcContainer = document.getElementById("host-ans-container-mc");
    const tfContainer = document.getElementById("host-ans-container-tf");
    const jumbledContainer = document.getElementById("host-ans-container-jumbled");
    const textContainer = document.getElementById("host-ans-container-text");
    const numberContainer = document.getElementById("host-ans-container-number");
    const pollContainer = document.getElementById("host-ans-container-poll");
    const speedmathContainer = document.getElementById("host-ans-container-speedmath");
    
    if (mcContainer) mcContainer.classList.add("hidden");
    if (tfContainer) tfContainer.classList.add("hidden");
    if (jumbledContainer) jumbledContainer.classList.add("hidden");
    if (textContainer) textContainer.classList.add("hidden");
    if (numberContainer) numberContainer.classList.add("hidden");
    if (pollContainer) pollContainer.classList.add("hidden");
    if (speedmathContainer) speedmathContainer.classList.add("hidden");

    if (!q.type || q.type === "multiple-choice") {
        if (mcContainer) mcContainer.classList.remove("hidden");
        document.getElementById("host-ans-0").innerText = q.options[0] || "";
        document.getElementById("host-ans-1").innerText = q.options[1] || "";
        document.getElementById("host-ans-2").innerText = q.options[2] || "";
        document.getElementById("host-ans-3").innerText = q.options[3] || "";
    } else if (q.type === "true-false") {
        if (tfContainer) tfContainer.classList.remove("hidden");
        document.getElementById("host-ans-tf-0").innerText = q.options[0] || "True";
        document.getElementById("host-ans-tf-1").innerText = q.options[1] || "False";
    } else if (q.type === "jumbled-prompt") {
        if (jumbledContainer) jumbledContainer.classList.remove("hidden");
        const container = document.getElementById("host-jumbled-words");
        if (container) {
            container.innerHTML = "";
            const scrambled = [...q.words].sort(() => Math.random() - 0.5);
            scrambled.forEach(w => {
                const span = document.createElement("span");
                span.className = "jumbled-word-chip";
                span.innerText = w;
                container.appendChild(span);
            });
        }
    } else if (q.type === "type-answer") {
        if (textContainer) textContainer.classList.remove("hidden");
    } else if (q.type === "number-guess") {
        if (numberContainer) numberContainer.classList.remove("hidden");
    } else if (q.type === "poll") {
        if (pollContainer) pollContainer.classList.remove("hidden");
    } else if (q.type === "speed-math") {
        if (speedmathContainer) speedmathContainer.classList.remove("hidden");
        const eqDisplay = document.getElementById("host-math-equation-display");
        if (eqDisplay) {
            eqDisplay.innerText = `Required: ${q.equation || ""}`;
        }
    }

    document.getElementById("answers-count").innerText = "0 Answers";

    if (isFirebaseEnabled) {
        if (!isReconnect) {
            const publicState = {
                status: "question",
                currentQuestion: hostActiveQuestionIndex,
                totalQuestions: currentQuizData.questions.length,
                questionText: q.text,
                questionImage: q.image || null,
                timeLimit: q.timeLimit || 20,
                questionType: q.type || "multiple-choice",
                questionWords: q.words || null,
                questionOptions: q.options || null,
                questionEquation: q.equation || null,
                questionStartTime: Date.now()
            };
            await update(gameSessionRef, { 
                ...publicState,
                publicState,
                answers: null,
                reactions: null
            });
        }
        if (answersListener) answersListener();
        answersListener = onValue(ref(database, `${SESSION_ROOT}/${currentSessionPin}/answers`), (snapshot) => {
            if (snapshot.exists()) {
                hostAnswersMap = Object.fromEntries(
                    Object.entries(snapshot.val()).filter(([, answer]) => (
                        answer.questionIndex === hostActiveQuestionIndex
                    ))
                );
                document.getElementById("answers-count").innerText = `${Object.keys(hostAnswersMap).length} Answers`;
            } else {
                hostAnswersMap = {};
                document.getElementById("answers-count").innerText = "0 Answers";
            }
        });
    }

    switchView("hostQuestion");
    
    if (isReconnect) {
        get(ref(database, `${SESSION_ROOT}/${currentSessionPin}`)).then((snap) => {
            if (snap.exists()) {
                const session = snap.val();
                const elapsed = Math.floor((Date.now() - (session.questionStartTime || Date.now())) / 1000);
                const remaining = Math.max(0, (session.timeLimit || 20) - elapsed);
                runTimerCountdown(remaining);
            } else {
                runTimerCountdown(q.timeLimit);
            }
        }).catch(() => {
            runTimerCountdown(q.timeLimit);
        });
    } else {
        runTimerCountdown(q.timeLimit);
    }
}

function runTimerCountdown(duration) {
    clearInterval(timerInterval);
    timeLeft = duration;

    const timerUI = document.getElementById("host-timer");
    timerUI.innerText = timeLeft;
    timerUI.classList.remove("timer-warning");
    timerUI.style.borderColor = THEME_COLORS.primary;
    timerUI.style.boxShadow = `0 0 20px rgba(242, 200, 17, 0.3)`;

    timerInterval = setInterval(() => {
        if (isTimerPaused) return;
        timeLeft--;
        timerUI.innerText = timeLeft;

        if (timeLeft <= 5) {
            timerUI.classList.add("timer-warning");
            timerUI.style.borderColor = "#ef4444";
            timerUI.style.boxShadow = `0 0 20px rgba(239, 68, 68, 0.6)`;
            try { sfx.tick.currentTime = 0; sfx.tick.play(); } catch (e) { }
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            concludeQuestionEvaluation();
        }
    }, 1000);

    document.getElementById("btn-pause-timer").onclick = () => {
        isTimerPaused = true;
        document.getElementById("btn-pause-timer").classList.add("hidden");
        document.getElementById("btn-resume-timer").classList.remove("hidden");
    };

    document.getElementById("btn-resume-timer").onclick = () => {
        isTimerPaused = false;
        document.getElementById("btn-resume-timer").classList.add("hidden");
        document.getElementById("btn-pause-timer").classList.remove("hidden");
    };

    document.getElementById("btn-skip-question").onclick = () => {
        clearInterval(timerInterval);
        concludeQuestionEvaluation();
    };
}

async function concludeQuestionEvaluation() {
    if (questionConclusionInProgress) return;
    questionConclusionInProgress = true;
    try {
        if (answersListener) { answersListener(); answersListener = null; }
        const q = currentQuizData.questions[hostActiveQuestionIndex];

        if (isFirebaseEnabled && Object.keys(hostAnswersMap).length === 0) {
            const answersSnapshot = await get(ref(database, `${SESSION_ROOT}/${currentSessionPin}/answers`));
            hostAnswersMap = answersSnapshot.exists()
                ? Object.fromEntries(
                    Object.entries(answersSnapshot.val()).filter(([, answer]) => (
                        answer.questionIndex === hostActiveQuestionIndex
                    ))
                )
                : {};
        }
    
    document.getElementById("host-results-chart").classList.add("hidden");
    const jumbledResults = document.getElementById("host-results-jumbled");
    const textResults = document.getElementById("host-results-text");
    const numberResults = document.getElementById("host-results-number");
    const mcCorrectAns = document.getElementById("host-mc-correct-answer");
    if (mcCorrectAns) mcCorrectAns.classList.add("hidden");
    
    if (jumbledResults) jumbledResults.classList.add("hidden");
    if (textResults) textResults.classList.add("hidden");
    if (numberResults) numberResults.classList.add("hidden");

    if (!q.type || q.type === "multiple-choice" || q.type === "true-false" || q.type === "poll") {
        document.getElementById("host-results-chart").classList.remove("hidden");
        if (mcCorrectAns && q.type !== "poll" && q.correct !== undefined && q.options && q.options[q.correct]) {
            mcCorrectAns.classList.remove("hidden");
            document.getElementById("host-mc-correct-text").innerText = q.options[q.correct];
        }
        const numOptions = (q.options && q.options.length) ? q.options.length : 4;
        const distribution = Array(numOptions).fill(0);

        Object.values(hostAnswersMap).forEach(ans => {
            if (ans.optionIndex >= 0 && ans.optionIndex < numOptions) distribution[ans.optionIndex]++;
        });

        const totalAnswers = Object.keys(hostAnswersMap).length || 1;
        for (let i = 0; i < 4; i++) {
            const barElement = document.getElementById(`bar-${i}`);
            const barContainer = barElement ? barElement.parentElement : null;
            if (barElement) {
                if (barContainer) barContainer.style.opacity = "1";
                if (i < numOptions) {
                    if (barContainer) barContainer.classList.remove("hidden");
                    const heightPercent = (distribution[i] / totalAnswers) * 100;
                    barElement.style.height = `${heightPercent}%`;
                    
                    if (q.type !== "poll" && q.correct !== undefined) {
                        if (i === q.correct) {
                            barElement.nextElementSibling.innerHTML = `${distribution[i]} <span style="color:#22c55e;">✔</span>`;
                        } else {
                            barElement.nextElementSibling.innerText = distribution[i];
                            if (barContainer) barContainer.style.opacity = "0.4";
                        }
                    } else {
                        barElement.nextElementSibling.innerText = distribution[i];
                    }
                } else {
                    if (barContainer) barContainer.classList.add("hidden");
                }
            }
        }
    } else if (q.type === "jumbled-prompt") {
        if (jumbledResults) {
            jumbledResults.classList.remove("hidden");
            let correctCount = 0;
            Object.values(hostAnswersMap).forEach(ans => {
                if (ans.sequence && ans.sequence.join(',') === q.words.join(',')) correctCount++;
            });
            document.getElementById("host-jumbled-correct-count").innerText = `${correctCount} participants ordered it correctly!`;
            const correctOrderEl = document.getElementById("host-jumbled-correct-order");
            correctOrderEl.innerHTML = "";
            q.words.forEach(w => {
                const span = document.createElement("span");
                span.className = "jumbled-word-chip correct";
                span.innerText = w;
                correctOrderEl.appendChild(span);
            });
        }
    } else if (q.type === "type-answer") {
        if (textResults) {
            textResults.classList.remove("hidden");
            let correctCount = 0;
            Object.values(hostAnswersMap).forEach(ans => {
                if (ans.textAnswer && ans.textAnswer.toLowerCase() === q.answerText.toLowerCase()) correctCount++;
            });
            document.getElementById("host-text-correct-count").innerText = `${correctCount} participants typed it correctly!`;
            document.getElementById("host-text-correct-answer").innerText = q.answerText;
        }
    } else if (q.type === "number-guess") {
        if (numberResults) {
            numberResults.classList.remove("hidden");
            document.getElementById("host-number-correct-answer").innerText = q.targetNumber;
            
            let closest = null;
            let closestDiff = Infinity;
            
            Object.entries(hostAnswersMap).forEach(([pKey, ans]) => {
                if (ans.numberAnswer !== undefined) {
                    const diff = Math.abs(ans.numberAnswer - q.targetNumber);
                    if (diff < closestDiff) {
                        closestDiff = diff;
                        closest = { pKey, val: ans.numberAnswer };
                    }
                }
            });
            
            const closestMsg = document.getElementById("host-number-closest");
            if (closest) {
                closestMsg.innerText = `Closest prediction was ${closest.val} (off by ${closestDiff.toFixed(2)})!`;
                if (closestDiff < 0.01) closestMsg.innerText = `Someone matched the value exactly!`;
            } else {
                closestMsg.innerText = `No values submitted.`;
            }
        }
    } else if (q.type === "speed-math") {
        if (textResults) {
            textResults.classList.remove("hidden");
            let correctCount = 0;
            Object.values(hostAnswersMap).forEach(ans => {
                if (ans.textAnswer !== undefined) {
                    const ansLower = ans.textAnswer.toLowerCase();
                    const keywords = q.equation.split(",").map(k => k.trim().toLowerCase()).filter(k => k);
                    const allPresent = keywords.every(k => ansLower.includes(k));
                    if (allPresent) correctCount++;
                }
            });
            document.getElementById("host-text-correct-count").innerText = `${correctCount} participants included every required element!`;
            document.getElementById("host-text-correct-answer").innerText = `Required: ${q.equation}`;
        }
    }

        if (isFirebaseEnabled) {
            let resultAnswer = "";
            if (q.type === "jumbled-prompt") resultAnswer = q.words.join(" → ");
            else if (q.type === "type-answer") resultAnswer = q.answerText;
            else if (q.type === "number-guess") resultAnswer = String(q.targetNumber);
            else if (q.type === "poll") resultAnswer = "Opinion recorded";
            else if (q.type === "speed-math") resultAnswer = `Required elements: ${q.equation}`;
            else if (q.options && q.correct !== undefined) resultAnswer = q.options[q.correct];

            const scoreClaim = await runTransaction(
                ref(database, `${SESSION_ROOT}/${currentSessionPin}/scoredQuestions/${hostActiveQuestionIndex}`),
                current => current === null ? { scoredAt: Date.now() } : undefined
            );
            if (scoreClaim.committed) {
                await evaluateSystemScoringTransactions(q.correct);
            }
            await update(gameSessionRef, {
                status: "results",
                "publicState/status": "results",
                "publicState/resultAnswer": resultAnswer
            });
        }

        try { sfx.ding.play(); } catch (e) { }
        switchView("hostResults");
        document.getElementById("btn-next-leaderboard").onclick = () => presentHostLeaderboardView();
    } finally {
        questionConclusionInProgress = false;
    }
}

async function evaluateSystemScoringTransactions(correctIdx) {
    const playersSnapshot = await get(ref(database, `${SESSION_ROOT}/${currentSessionPin}/players`));
    if (!playersSnapshot.exists()) return;

    const playersData = playersSnapshot.val();
    const updates = {};

    Object.keys(playersData).forEach(pKey => {
        const answerObj = hostAnswersMap[pKey];
        let scoreIncrement = 0;
        let answeredCorrectly = false;

        const currentQ = currentQuizData.questions[hostActiveQuestionIndex];
        if (currentQ.type === "jumbled-prompt") {
            if (answerObj && answerObj.sequence && answerObj.sequence.join(',') === currentQ.words.join(',')) {
                answeredCorrectly = true;
            }
        } else if (currentQ.type === "type-answer") {
            if (answerObj && answerObj.textAnswer && answerObj.textAnswer.toLowerCase() === currentQ.answerText.toLowerCase()) {
                answeredCorrectly = true;
            }
        } else if (currentQ.type === "number-guess") {
            if (answerObj && answerObj.numberAnswer !== undefined) {
                const diff = Math.abs(answerObj.numberAnswer - currentQ.targetNumber);
                if (diff <= 0.15) answeredCorrectly = true; 
            }
        } else if (currentQ.type === "poll") {
            if (answerObj) answeredCorrectly = true; // Everyone who submitted is marked correct/active
        } else if (currentQ.type === "speed-math") {
            if (answerObj && answerObj.textAnswer !== undefined) {
                const ansLower = answerObj.textAnswer.toLowerCase();
                const keywords = currentQ.equation.split(",").map(k => k.trim().toLowerCase()).filter(k => k);
                const allPresent = keywords.every(k => ansLower.includes(k));
                if (allPresent) answeredCorrectly = true;
            }
        } else {
            if (answerObj && answerObj.optionIndex === correctIdx) {
                answeredCorrectly = true;
            }
        }

        if (answeredCorrectly) {
            if (currentQ.type === "poll") {
                scoreIncrement = 0;
            } else if (currentQ.type === "speed-math" && answerObj.textAnswer) {
                const length = answerObj.textAnswer.length;
                const lengthBonus = Math.max(0, 500 - (length * 3));
                scoreIncrement = 500 + lengthBonus;
                const currentStreakInstance = (playersData[pKey].streak || 0) + 1;
                if (currentStreakInstance >= 3) scoreIncrement = Math.round(scoreIncrement * 1.5);
                updates[`players/${pKey}/streak`] = currentStreakInstance;
            } else {
                const durationLimit = (currentQ.timeLimit * 1000) || 20000;
                const submittedElapsed = Number(answerObj.elapsedTime);
                const elapsedTime = Number.isFinite(submittedElapsed)
                    ? Math.min(durationLimit, Math.max(0, submittedElapsed))
                    : durationLimit;
                const scale = Math.max(0.2, 1 - (elapsedTime / durationLimit));
                scoreIncrement = Math.round(1000 * scale);
                const currentStreakInstance = (playersData[pKey].streak || 0) + 1;
                if (currentStreakInstance >= 3) scoreIncrement = Math.round(scoreIncrement * 1.5);
                updates[`players/${pKey}/streak`] = currentStreakInstance;
            }
        } else {
            updates[`players/${pKey}/streak`] = 0;
        }

        updates[`players/${pKey}/score`] = (playersData[pKey].score || 0) + scoreIncrement;
        updates[`players/${pKey}/lastPointsEarned`] = scoreIncrement;
        updates[`players/${pKey}/wasCorrect`] = answeredCorrectly;

        if (answerObj) {
            sessionTotalAnswersCount++;
            if (answeredCorrectly) {
                sessionTotalCorrectAnswersCount++;
            }
        }
    });

    await update(gameSessionRef, updates);
}

async function presentHostLeaderboardView() {
    if (!isFirebaseEnabled) {
        switchView("hostLeaderboard");
        return;
    }
    const playersSnapshot = await get(ref(database, `${SESSION_ROOT}/${currentSessionPin}/players`));
    const listUI = document.getElementById("leaderboard-list");
    listUI.innerHTML = "";

    if (playersSnapshot.exists()) {
        const array = Object.entries(playersSnapshot.val()).map(([key, val]) => ({ key, ...val }));
        array.sort((a, b) => b.score - a.score);
        
        const podiumDisplay = document.getElementById("podium-display");
        if (podiumDisplay) {
            podiumDisplay.classList.remove("hidden");
            const p1 = document.querySelector(".podium-1");
            const p2 = document.querySelector(".podium-2");
            const p3 = document.querySelector(".podium-3");
            
            if(array[0]) { 
                document.getElementById("podium-p1-name").innerText = array[0].nickname; 
                document.getElementById("podium-p1-score").innerText = array[0].score + " pts"; 
                if (p1) p1.style.display = "flex";
            } else { if (p1) p1.style.display = "none"; }
            
            if(array[1]) { 
                document.getElementById("podium-p2-name").innerText = array[1].nickname; 
                document.getElementById("podium-p2-score").innerText = array[1].score + " pts"; 
                if (p2) p2.style.display = "flex"; 
            } else { if (p2) p2.style.display = "none"; }
            
            if(array[2]) { 
                document.getElementById("podium-p3-name").innerText = array[2].nickname; 
                document.getElementById("podium-p3-score").innerText = array[2].score + " pts"; 
                if (p3) p3.style.display = "flex"; 
            } else { if (p3) p3.style.display = "none"; }
        }

        array.slice(3, 10).forEach((player, idx) => {
            const row = document.createElement("div");
            row.className = "leaderboard-row fade-in-up";
            const name = document.createElement("span");
            const score = document.createElement("span");
            name.textContent = `#${idx + 4} ${player.nickname}`;
            score.textContent = `${player.score} pts`;
            row.append(name, score);
            listUI.appendChild(row);
        });
    }

    const nextBtn = document.getElementById("btn-next-question");
    const backBtn = document.getElementById("btn-back-dashboard");

    if (hostActiveQuestionIndex + 1 < currentQuizData.questions.length) {
        nextBtn.innerText = "Next Question";
        nextBtn.classList.remove("hidden");
        backBtn.classList.add("hidden");
        nextBtn.onclick = () => { hostActiveQuestionIndex++; executeQuestionBroadcast(); };
    } else {
        nextBtn.classList.add("hidden");
        backBtn.classList.remove("hidden");
        backBtn.innerText = "Conclude Workshop Session";
        await update(gameSessionRef, {
            status: "gameover",
            "publicState/status": "gameover"
        });
        backBtn.onclick = async () => {
            const playersCount = playersSnapshot.exists() ? Object.keys(playersSnapshot.val()).length : 0;
            const correctRatio = sessionTotalAnswersCount > 0 ? (sessionTotalCorrectAnswersCount / sessionTotalAnswersCount) : 0.92;
            const sessionScorePercent = Math.round(correctRatio * 100);

            let history = [];
            try {
                const savedHistory = localStorage.getItem("powerbi_recent_sessions");
                if (savedHistory) {
                    history = JSON.parse(savedHistory);
                }
            } catch (err) {}

            history.push({
                date: new Date().toLocaleDateString(),
                quizTitle: currentQuizData.title,
                playersCount: playersCount,
                accuracy: sessionScorePercent
            });

            try {
                localStorage.setItem("powerbi_recent_sessions", JSON.stringify(history));
            } catch (err) {}
            
            await syncHistoryToFirebase(history);
            terminateRoomInstance();
        };
    }
    switchView("hostLeaderboard");
}

// ==========================================
// 6. PLAYER ARCHITECTURE LOGIC PIPELINES
// ==========================================
function getOrCreatePlayerClientId() {
    if (playerClientId) return playerClientId;
    try {
        playerClientId = localStorage.getItem("powerbi_player_client_id");
        if (!playerClientId) {
            playerClientId = globalThis.crypto?.randomUUID?.()
                || `client_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
            localStorage.setItem("powerbi_player_client_id", playerClientId);
        }
    } catch (e) {
        playerClientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    }
    return playerClientId;
}

function nicknameClaimKey(nickname) {
    return Array.from(nickname.trim().normalize("NFKC").toLocaleLowerCase())
        .map(char => char.codePointAt(0).toString(16))
        .join("-");
}

function isPlayerOnline(player) {
    if (player?.presenceVersion === 2) {
        return Boolean(player.connections && Object.keys(player.connections).length > 0);
    }
    return player?.online !== false;
}

function persistPlayerSession() {
    sessionStorage.setItem("powerbi_player_session_pin", currentSessionPin);
    sessionStorage.setItem("powerbi_player_nickname", myNickname);
    sessionStorage.setItem("powerbi_player_key", myPlayerKey);
    sessionStorage.setItem("powerbi_player_role", "player");
}

async function reserveNickname(pin, nickname, candidatePlayerKey, clientId) {
    const claimRef = ref(database, `${SESSION_ROOT}/${pin}/nicknameClaims/${nicknameClaimKey(nickname)}`);
    const createClaim = playerKey => ({ playerKey, clientId, nickname, claimedAt: Date.now() });

    let result = await runTransaction(claimRef, current => {
        if (current === null) return createClaim(candidatePlayerKey);
        if (current.clientId === clientId) return createClaim(current.playerKey || candidatePlayerKey);
        return;
    });
    if (result.committed) return { claim: result.snapshot.val(), replacedPlayerKey: null };

    const blockingClaim = result.snapshot.val();
    if (!blockingClaim?.playerKey) throw new Error("NICKNAME_TAKEN");
    const blockingPlayerSnap = await get(ref(database, `${SESSION_ROOT}/${pin}/players/${blockingClaim.playerKey}`));
    const claimAge = Date.now() - (blockingClaim.claimedAt || 0);
    if (!blockingPlayerSnap.exists() && claimAge < 15000) {
        throw new Error("NICKNAME_TAKEN");
    }
    if (blockingPlayerSnap.exists() && isPlayerOnline(blockingPlayerSnap.val())) {
        throw new Error("NICKNAME_TAKEN");
    }

    result = await runTransaction(claimRef, current => {
        if (
            current
            && current.clientId === blockingClaim.clientId
            && current.playerKey === blockingClaim.playerKey
        ) {
            return createClaim(candidatePlayerKey);
        }
        return;
    });
    if (!result.committed) throw new Error("NICKNAME_TAKEN");
    return { claim: result.snapshot.val(), replacedPlayerKey: blockingClaim.playerKey };
}

async function configurePlayerPresence(pin, nickname, playerKey) {
    if (!playerConnectionId) {
        playerConnectionId = `connection_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
    const connectionRef = ref(
        database,
        `${SESSION_ROOT}/${pin}/players/${playerKey}/connections/${playerConnectionId}`
    );
    await onDisconnect(connectionRef).remove();
    await set(connectionRef, true);
}

async function releaseCurrentPlayer() {
    if (!isFirebaseEnabled || !currentSessionPin || !myPlayerKey) {
        unsubscribeActiveListeners();
        clearPlayerSessionStorage();
        switchView("landing");
        return;
    }

    const pin = currentSessionPin;
    const playerKey = myPlayerKey;
    const clientId = getOrCreatePlayerClientId();
    const claimRef = ref(database, `${SESSION_ROOT}/${pin}/nicknameClaims/${nicknameClaimKey(myNickname)}`);
    unsubscribeActiveListeners();
    await Promise.allSettled([
        remove(ref(database, `${SESSION_ROOT}/${pin}/players/${playerKey}`)),
        runTransaction(claimRef, current => (
            current?.clientId === clientId && current?.playerKey === playerKey ? null : undefined
        ))
    ]);

    clearPlayerSessionStorage();
    currentSessionPin = null;
    myPlayerKey = null;
    myNickname = "";
    currentRole = null;
    playerConnectionId = null;
    switchView("landing");
}

function installPlayerLeaveControls() {
    ["playerLobby", "playerQuestion", "playerResult", "playerLeaderboard"].forEach(viewKey => {
        const view = views[viewKey];
        if (!view || view.querySelector(".btn-player-leave")) return;
        const target = viewKey === "playerQuestion"
            ? view.querySelector(".player-header > div:last-child")
            : view.querySelector(".glass-panel");
        if (!target) return;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn-text btn-player-leave";
        button.textContent = viewKey === "playerQuestion" ? "Leave" : "Leave Session";
        button.setAttribute("aria-label", "Leave session");
        button.addEventListener("click", () => {
            if (confirm("Leave this session? Your current player entry will be removed.")) {
                releaseCurrentPlayer();
            }
        });
        target.appendChild(button);
    });
}

function setupPlayerParticipationWorkflow() {
    getOrCreatePlayerClientId();
    installPlayerLeaveControls();

    const pinFromUrl = new URLSearchParams(window.location.search).get("pin");
    if (pinFromUrl && /^\d{6}$/.test(pinFromUrl)) {
        document.getElementById("input-pin").value = pinFromUrl;
        switchView("playerJoin");
    }

    const savedName = localStorage.getItem("powerbi_last_nickname");
    if (savedName) {
        const inputNickname = document.getElementById("input-nickname");
        if (inputNickname) inputNickname.value = savedName;
    }

    const joinForm = document.getElementById("form-join");
    joinForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const pinInput = document.getElementById("input-pin").value.trim();
        const nameInput = document.getElementById("input-nickname").value.trim();
        
        if (!/^\d{6}$/.test(pinInput)) {
            alert("Please enter a valid six-digit game PIN.");
            return;
        }
        if (nameInput.length < 2) {
            alert("Please enter a nickname with at least 2 characters.");
            return;
        }

        localStorage.setItem("powerbi_last_nickname", nameInput);
        const submitBtn = document.getElementById("btn-join-submit");

        if (!isFirebaseEnabled) {
            myNickname = nameInput;
            currentSessionPin = pinInput;
            currentRole = "player";
            myPlayerKey = `offline_${getOrCreatePlayerClientId()}`;
            persistPlayerSession();
            document.getElementById("display-player-name").innerText = myNickname;
            updatePlayerPinDisplays();
            switchView("playerLobby");
            return;
        }

        try {
            submitBtn.disabled = true;
            const sessionSnap = await get(ref(database, `${SESSION_ROOT}/${pinInput}`));

            if (!sessionSnap.exists()) {
                alert("Game room code not found.");
                return;
            }
            if (sessionSnap.val().status === "gameover") {
                alert("This game session has already ended.");
                return;
            }

            currentSessionPin = pinInput;
            myNickname = nameInput;
            currentRole = "player";

            const playerListRef = ref(database, `${SESSION_ROOT}/${pinInput}/players`);
            const candidatePlayerKey = push(playerListRef).key;
            const clientId = getOrCreatePlayerClientId();
            const reservation = await reserveNickname(pinInput, nameInput, candidatePlayerKey, clientId);
            myPlayerKey = reservation.claim.playerKey;

            if (reservation.replacedPlayerKey && reservation.replacedPlayerKey !== myPlayerKey) {
                await remove(ref(database, `${SESSION_ROOT}/${pinInput}/players/${reservation.replacedPlayerKey}`));
            }

            const playerRef = ref(database, `${SESSION_ROOT}/${pinInput}/players/${myPlayerKey}`);
            const existingPlayerSnap = await get(playerRef);
            if (existingPlayerSnap.exists() && existingPlayerSnap.val().clientId === clientId) {
                await update(playerRef, {
                    nickname: myNickname,
                    online: true,
                    presenceVersion: 2,
                    lastSeen: Date.now()
                });
            } else {
                await set(playerRef, {
                    clientId,
                    nickname: myNickname,
                    score: 0,
                    streak: 0,
                    lastPointsEarned: 0,
                    wasCorrect: false,
                    online: true,
                    presenceVersion: 2,
                    joinedAt: Date.now(),
                    lastSeen: Date.now()
                });
            }
            await configurePlayerPresence(pinInput, myNickname, myPlayerKey);
            persistPlayerSession();
            
            document.getElementById("display-player-name").innerText = myNickname;
            updatePlayerPinDisplays();
            switchView("playerLobby");
            bindPlayerSessionSyncPipeline();

        } catch (err) {
            if (err.message === "NICKNAME_TAKEN") {
                alert("That nickname is already in use. Please choose another.");
                return;
            }
            console.error("Firebase join failed:", err);
            alert("Unable to join the live session. Check your connection and try again.");
        } finally {
            submitBtn.disabled = false;
        }
    });

    setupPlayerReactionPipelines();

    document.querySelectorAll(".btn-player-sync").forEach(btn => {
        btn.addEventListener("click", () => {
            if (isFirebaseEnabled && currentSessionPin && myPlayerKey) {
                bindPlayerSessionSyncPipeline();
                const origText = btn.innerText;
                btn.innerText = "Synced! ✓";
                btn.style.color = "#22c55e";
                setTimeout(() => {
                    btn.innerText = origText;
                    btn.style.color = "";
                }, 1000);
            }
        });
    });
}

async function recoverPlayerSession() {
    if (!isFirebaseEnabled || sessionStorage.getItem("powerbi_player_role") !== "player") return;

    const savedPin = sessionStorage.getItem("powerbi_player_session_pin");
    const savedNickname = sessionStorage.getItem("powerbi_player_nickname");
    const savedPlayerKey = sessionStorage.getItem("powerbi_player_key");
    if (!savedPin || !savedNickname || !savedPlayerKey) {
        clearPlayerSessionStorage();
        return;
    }

    try {
        const sessionSnap = await get(ref(database, `${SESSION_ROOT}/${savedPin}`));
        const playerSnap = await get(ref(database, `${SESSION_ROOT}/${savedPin}/players/${savedPlayerKey}`));
        const clientId = getOrCreatePlayerClientId();
        if (!sessionSnap.exists() || !playerSnap.exists() || playerSnap.val().clientId !== clientId) {
            clearPlayerSessionStorage();
            return;
        }

        const reservation = await reserveNickname(savedPin, savedNickname, savedPlayerKey, clientId);
        if (reservation.claim.playerKey !== savedPlayerKey) {
            clearPlayerSessionStorage();
            return;
        }

        currentSessionPin = savedPin;
        myNickname = savedNickname;
        myPlayerKey = savedPlayerKey;
        currentRole = "player";
        currentScore = playerSnap.val().score || 0;
        currentStreak = playerSnap.val().streak || 0;

        await update(ref(database, `${SESSION_ROOT}/${savedPin}/players/${savedPlayerKey}`), {
            online: true,
            presenceVersion: 2,
            lastSeen: Date.now()
        });
        await configurePlayerPresence(savedPin, savedNickname, savedPlayerKey);
        document.getElementById("display-player-name").innerText = myNickname;
        updatePlayerPinDisplays();
        bindPlayerSessionSyncPipeline();
    } catch (err) {
        console.warn("Player session recovery failed:", err);
        clearPlayerSessionStorage();
    }
}


async function recoverHostSession() {
    const savedPin = sessionStorage.getItem("powerbi_host_session_pin");
    const savedRole = sessionStorage.getItem("powerbi_host_role");
    const savedQuiz = sessionStorage.getItem("powerbi_host_quiz");

    if (savedPin && savedRole === "host" && savedQuiz) {
        currentSessionPin = savedPin;
        currentRole = "host";
        currentQuizData = JSON.parse(savedQuiz);
        gameSessionRef = ref(database, `${SESSION_ROOT}/${currentSessionPin}`);

        try {
            const snap = await get(ref(database, `${SESSION_ROOT}/${currentSessionPin}`));
            if (!snap.exists()) {
                purgeActiveListeners();
                enterHostDashboard();
                return;
            }
            const session = snap.val();
            hostActiveQuestionIndex = session.currentQuestion !== undefined ? session.currentQuestion : 0;

            document.getElementById("display-game-pin").innerText = currentSessionPin;
            updateHostPinDisplays();
            document.getElementById("display-join-url").innerHTML = `Join at <strong>${window.location.origin}</strong>`;
            const qrContainer = document.getElementById("qr-code-container");
            if (qrContainer) {
                qrContainer.innerHTML = "";
                new QRCode(qrContainer, {
                    text: `${window.location.origin}?pin=${currentSessionPin}`,
                    width: 160, height: 160, colorDark: "#2B2B2B", colorLight: "#FFFFFF"
                });
            }

            if (session.status === "lobby") {
                trackLobbyRegistrations();
                switchView("hostLobby");
            } else if (session.status === "question") {
                await executeQuestionBroadcast(true);
            } else if (session.status === "results") {
                concludeQuestionEvaluation();
            } else if (session.status === "gameover") {
                purgeActiveListeners();
                enterHostDashboard();
            } else {
                presentHostLeaderboardView();
            }
            console.log("Restored host session from sessionStorage for PIN:", currentSessionPin);
        } catch (err) {
            console.error("Error recovering host session:", err);
            enterHostDashboard();
        }
    }
}

function updatePlayerPinDisplays() {
    document.querySelectorAll(".display-player-pin").forEach(el => {
        el.innerText = currentSessionPin || "---";
    });
}


function updateHostPinDisplays() {
    document.querySelectorAll(".display-host-pin").forEach(el => {
        el.innerText = currentSessionPin || "---";
    });
}

function handlePlayerSessionExit(message) {
    if (currentRole !== "player") return;
    currentRole = null;
    playerConnectionId = null;
    unsubscribeActiveListeners();
    clearPlayerSessionStorage();
    alert(message);
    switchView("landing");
}

function bindPlayerSessionSyncPipeline() {
    if (!currentSessionPin || !myPlayerKey) return;
    updatePlayerPinDisplays();
    if (sessionStateListener) sessionStateListener();
    if (playerRecordListener) playerRecordListener();

    playerRecordListener = onValue(
        ref(database, `${SESSION_ROOT}/${currentSessionPin}/players/${myPlayerKey}`),
        async snapshot => {
            if (!snapshot.exists()) {
                const roomSnapshot = await get(ref(database, `${SESSION_ROOT}/${currentSessionPin}`));
                handlePlayerSessionExit(
                    roomSnapshot.exists()
                        ? "You have been removed from the session."
                        : "The host has ended this game session."
                );
                return;
            }
            const player = snapshot.val();
            currentScore = player.score || 0;
            currentStreak = player.streak || 0;
            const scoreDisplay = document.getElementById("player-score-display");
            if (scoreDisplay) scoreDisplay.innerText = currentScore;
        }
    );

    sessionStateListener = onValue(
        ref(database, `${SESSION_ROOT}/${currentSessionPin}/publicState`),
        snapshot => {
        if (!snapshot.exists()) {
            handlePlayerSessionExit("The host has ended this game session.");
            return;
        }
        const session = snapshot.val();

        switch (session.status) {
            case "lobby": switchView("playerLobby"); break;
            case "question": preparePlayerInputInterface(session); break;
            case "results": renderPlayerResultPanel(session); break;
            case "gameover": listUIFinalLeaderboard(session); break;
        }
    });
}

function preparePlayerInputInterface(session) {
    const sessionQIndex = session.currentQuestion !== undefined ? session.currentQuestion : 0;
    if (playerActiveQuestionIndex !== sessionQIndex) {
        playerActiveQuestionIndex = sessionQIndex;
        hasAnsweredCurrent = false;
    } else {
        if (hasAnsweredCurrent) return;
    }
    currentQuestionStartTime = session.questionStartTime || Date.now();

    document.getElementById("player-score-display").innerText = currentScore;
    document.getElementById("player-waiting-msg").classList.add("hidden");

    const pNumber = document.getElementById("player-question-number");
    if(pNumber) {
        pNumber.innerText = `Question ${(session.currentQuestion || 0) + 1} of ${session.totalQuestions || "?"}`;
    }

    const mobileQuestionText = document.getElementById("player-question-text-mobile");
    if (mobileQuestionText) mobileQuestionText.textContent = session.questionText || "Question";
    const mobileImageContainer = document.getElementById("player-question-image-mobile-container");
    const mobileImage = document.getElementById("player-question-image-mobile");
    if (mobileImageContainer && mobileImage) {
        if (session.questionImage) {
            mobileImage.src = session.questionImage;
            mobileImageContainer.classList.remove("hidden");
        } else {
            mobileImage.src = "";
            mobileImageContainer.classList.add("hidden");
        }
    }
    
    if(window.potentialPointsInterval) clearInterval(window.potentialPointsInterval);
    const potentialPointsEl = document.getElementById("player-potential-points");
    if(potentialPointsEl) {
        potentialPointsEl.innerText = "1000";
        if(session.questionType !== "poll") {
            const durationLimit = (session.timeLimit || 20) * 1000;
            window.potentialPointsInterval = setInterval(() => {
                if(hasAnsweredCurrent) {
                    clearInterval(window.potentialPointsInterval);
                    return;
                }
                const elapsed = Date.now() - currentQuestionStartTime;
                const scale = Math.max(0.2, 1 - (elapsed / durationLimit));
                potentialPointsEl.innerText = Math.round(1000 * scale);
            }, 100);
        } else {
            potentialPointsEl.innerText = "0";
        }
    }

    const qType = session.questionType || "multiple-choice";
    
    document.getElementById("player-input-mc").classList.add("hidden");
    document.getElementById("player-input-tf").classList.add("hidden");
    document.getElementById("player-input-jumbled").classList.add("hidden");
    document.getElementById("player-input-text").classList.add("hidden");
    document.getElementById("player-input-number").classList.add("hidden");
    document.getElementById("player-input-poll").classList.add("hidden");
    document.getElementById("player-input-speedmath").classList.add("hidden");

    switchView("playerQuestion");

    if (qType === "multiple-choice") {
        document.getElementById("player-input-mc").classList.remove("hidden");
        const btns = document.getElementById("player-input-mc").querySelectorAll(".answer-btn");
        const options = session.questionOptions || [];
        btns.forEach((btn, index) => {
            btn.classList.remove("selected", "disabled-answer", "hidden");
            btn.disabled = false;
            const label = btn.querySelector(".answer-label");
            if (label) label.textContent = options[index] || `Option ${String.fromCharCode(65 + index)}`;
            if (index >= options.length) btn.classList.add("hidden");
        });
        btns.forEach(btn => {
            btn.onclick = async (e) => {
                const chosenIdx = parseInt(e.currentTarget.getAttribute("data-index"));
                hasAnsweredCurrent = true;
                btns.forEach(b => { b.disabled = true; if (b !== e.currentTarget) b.classList.add("disabled-answer"); });
                e.currentTarget.classList.add("selected");
                if (isFirebaseEnabled && myPlayerKey) {
                    await set(ref(database, `${SESSION_ROOT}/${currentSessionPin}/answers/${myPlayerKey}`), { questionIndex: playerActiveQuestionIndex, optionIndex: chosenIdx, elapsedTime: Date.now() - currentQuestionStartTime });
                    document.getElementById("player-waiting-msg").classList.remove("hidden");
                }
            };
        });
    } else if (qType === "true-false") {
        document.getElementById("player-input-tf").classList.remove("hidden");
        const btns = document.getElementById("player-input-tf").querySelectorAll(".answer-btn");
        btns.forEach(btn => { btn.classList.remove("selected", "disabled-answer"); btn.disabled = false; });
        btns.forEach(btn => {
            btn.onclick = async (e) => {
                const chosenIdx = parseInt(e.currentTarget.getAttribute("data-index"));
                hasAnsweredCurrent = true;
                btns.forEach(b => { b.disabled = true; if (b !== e.currentTarget) b.classList.add("disabled-answer"); });
                e.currentTarget.classList.add("selected");
                if (isFirebaseEnabled && myPlayerKey) {
                    await set(ref(database, `${SESSION_ROOT}/${currentSessionPin}/answers/${myPlayerKey}`), { questionIndex: playerActiveQuestionIndex, optionIndex: chosenIdx, elapsedTime: Date.now() - currentQuestionStartTime });
                    document.getElementById("player-waiting-msg").classList.remove("hidden");
                }
            };
        });
    } else if (qType === "jumbled-prompt") {
        document.getElementById("player-input-jumbled").classList.remove("hidden");
        renderPlayerJumbledPrompt(session.questionWords);
    } else if (qType === "type-answer") {
        document.getElementById("player-input-text").classList.remove("hidden");
        const inputEl = document.getElementById("input-type-answer");
        const submitBtn = document.getElementById("btn-submit-type-answer");
        inputEl.value = "";
        inputEl.disabled = false;
        submitBtn.disabled = false;
        
        submitBtn.onclick = async () => {
            if (hasAnsweredCurrent) return;
            const typedAns = inputEl.value.trim();
            if (!typedAns) return;
            
            hasAnsweredCurrent = true;
            inputEl.disabled = true;
            submitBtn.disabled = true;
            if (isFirebaseEnabled && myPlayerKey) {
                await set(ref(database, `${SESSION_ROOT}/${currentSessionPin}/answers/${myPlayerKey}`), { questionIndex: playerActiveQuestionIndex, textAnswer: typedAns, elapsedTime: Date.now() - currentQuestionStartTime });
                document.getElementById("player-waiting-msg").classList.remove("hidden");
            }
        };
    } else if (qType === "number-guess") {
        document.getElementById("player-input-number").classList.remove("hidden");
        const rangeEl = document.getElementById("input-number-guess");
        const displayEl = document.getElementById("display-number-guess");
        const submitBtn = document.getElementById("btn-submit-number-guess");
        
        rangeEl.value = 50;
        displayEl.innerText = 50;
        rangeEl.disabled = false;
        submitBtn.disabled = false;
        
        rangeEl.oninput = (e) => {
            displayEl.innerText = e.target.value;
        };
        
        submitBtn.onclick = async () => {
            if (hasAnsweredCurrent) return;
            hasAnsweredCurrent = true;
            rangeEl.disabled = true;
            submitBtn.disabled = true;
            if (isFirebaseEnabled && myPlayerKey) {
                await set(ref(database, `${SESSION_ROOT}/${currentSessionPin}/answers/${myPlayerKey}`), { questionIndex: playerActiveQuestionIndex, numberAnswer: parseFloat(rangeEl.value), elapsedTime: Date.now() - currentQuestionStartTime });
                document.getElementById("player-waiting-msg").classList.remove("hidden");
            }
        };
    } else if (qType === "poll") {
        document.getElementById("player-input-poll").classList.remove("hidden");
        const pollContainer = document.getElementById("player-poll-options");
        pollContainer.innerHTML = "";
        const options = session.questionOptions || [];
        options.forEach((opt, idx) => {
            const btn = document.createElement("button");
            btn.className = "btn btn-secondary w-full text-left flex items-center gap-3";
            btn.style.fontSize = "1.1rem";
            btn.style.padding = "0.75rem 1.25rem";
            btn.style.marginBottom = "0.5rem";
            btn.innerHTML = `<span style="font-weight:bold; color:var(--color-cyan)">${String.fromCharCode(65 + idx)}</span> <span>${opt}</span>`;
            btn.onclick = async () => {
                if (hasAnsweredCurrent) return;
                hasAnsweredCurrent = true;
                const btns = pollContainer.querySelectorAll("button");
                btns.forEach(b => {
                    b.disabled = true;
                    if (b !== btn) b.style.opacity = "0.5";
                });
                btn.style.borderColor = "var(--color-cyan)";
                if (isFirebaseEnabled && myPlayerKey) {
                    await set(ref(database, `${SESSION_ROOT}/${currentSessionPin}/answers/${myPlayerKey}`), { questionIndex: playerActiveQuestionIndex, optionIndex: idx, elapsedTime: Date.now() - currentQuestionStartTime });
                    document.getElementById("player-waiting-msg").classList.remove("hidden");
                }
            };
            pollContainer.appendChild(btn);
        });
    } else if (qType === "speed-math") {
        document.getElementById("player-input-speedmath").classList.remove("hidden");
        const inputEl = document.getElementById("input-speedmath-answer");
        const submitBtn = document.getElementById("btn-submit-speedmath");
        const requirementsEl = document.getElementById("player-math-equation");
        inputEl.value = "";
        inputEl.disabled = false;
        submitBtn.disabled = false;
        if (requirementsEl) requirementsEl.innerText = `Required elements: ${session.questionEquation || "Use the appropriate DAX expression"}`;
        
        submitBtn.onclick = async () => {
            if (hasAnsweredCurrent) return;
            const val = inputEl.value.trim();
            if (!val) return;
            hasAnsweredCurrent = true;
            inputEl.disabled = true;
            submitBtn.disabled = true;
            if (isFirebaseEnabled && myPlayerKey) {
                await set(ref(database, `${SESSION_ROOT}/${currentSessionPin}/answers/${myPlayerKey}`), { questionIndex: playerActiveQuestionIndex, textAnswer: val, elapsedTime: Date.now() - currentQuestionStartTime });
                document.getElementById("player-waiting-msg").classList.remove("hidden");
            }
        };
    }
}

function renderPlayerJumbledPrompt(words) {
    const availableContainer = document.getElementById("player-jumbled-available");
    const constructedContainer = document.getElementById("player-jumbled-constructed");
    
    availableContainer.innerHTML = "";
    constructedContainer.innerHTML = "";
    
    let constructedSequence = [];
    const scrambled = [...words].sort(() => Math.random() - 0.5);
    
    const checkSubmission = async () => {
        if (constructedSequence.length === words.length) {
            hasAnsweredCurrent = true;
            const chips = document.querySelectorAll(".player-jumbled-chip");
            chips.forEach(c => c.style.pointerEvents = "none");
            if (isFirebaseEnabled && myPlayerKey) {
                await set(ref(database, `${SESSION_ROOT}/${currentSessionPin}/answers/${myPlayerKey}`), { questionIndex: playerActiveQuestionIndex, sequence: constructedSequence, elapsedTime: Date.now() - currentQuestionStartTime });
                document.getElementById("player-waiting-msg").classList.remove("hidden");
            }
        }
    };

    scrambled.forEach((w, index) => {
        const chip = document.createElement("div");
        chip.className = "player-jumbled-chip";
        chip.innerText = w;
        chip.onclick = () => {
            if (hasAnsweredCurrent) return;
            chip.remove();
            constructedContainer.appendChild(chip);
            constructedSequence.push(w);
            chip.onclick = () => {
                if (hasAnsweredCurrent) return;
                chip.remove();
                availableContainer.appendChild(chip);
                constructedSequence = constructedSequence.filter(item => item !== w);
                chip.onclick = () => {
                    if (hasAnsweredCurrent) return;
                    chip.remove();
                    constructedContainer.appendChild(chip);
                    constructedSequence.push(w);
                    checkSubmission();
                };
            };
            checkSubmission();
        };
        availableContainer.appendChild(chip);
    });
}

async function renderPlayerResultPanel(session) {
    hasAnsweredCurrent = false;
    if (!isFirebaseEnabled || !myPlayerKey) { switchView("playerResult"); return; }

    try {
        const pSnap = await get(ref(database, `${SESSION_ROOT}/${currentSessionPin}/players/${myPlayerKey}`));
        const allPlayersSnap = await get(ref(database, `${SESSION_ROOT}/${currentSessionPin}/players`));
        if (!pSnap.exists() || !allPlayersSnap.exists()) return;

        const pData = pSnap.val();
        currentScore = pData.score;
        currentStreak = pData.streak;

        const titleUI = document.getElementById("player-result-title");
        const panel = document.getElementById("player-result-panel");
        const pointsBadge = document.getElementById("player-points-earned");
        const streakMsg = document.getElementById("player-result-streak-msg");
        const correctAnswer = document.getElementById("player-correct-answer");
        const correctAnswerLabel = document.getElementById("player-correct-answer-label");
        const correctAnswerText = document.getElementById("player-correct-answer-text");

        panel.classList.remove("result-correct", "result-incorrect");

        const qType = session.questionType || "multiple-choice";
        if (qType === "poll") {
            titleUI.innerText = "Opinion Recorded! 📊";
            panel.classList.add("result-correct");
            pointsBadge.innerText = "0";
        } else {
            if (pData.wasCorrect) {
                titleUI.innerText = qType === "speed-math" ? "DAX Accepted! ✓" : "Correct!";
                panel.classList.add("result-correct");
                pointsBadge.innerText = pData.lastPointsEarned;
                try { sfx.powerup.play(); } catch (e) { }
            } else {
                titleUI.innerText = qType === "speed-math" ? "Missing Required DAX ✕" : "Not quite.";
                panel.classList.add("result-incorrect");
                pointsBadge.innerText = "0";
            }
        }

        if (correctAnswer && correctAnswerLabel && correctAnswerText && session.resultAnswer) {
            correctAnswerLabel.textContent = qType === "poll" ? "Poll result" : "Correct answer";
            correctAnswerText.textContent = session.resultAnswer;
            correctAnswer.classList.remove("hidden");
        } else if (correctAnswer) {
            correctAnswer.classList.add("hidden");
        }

        if (currentStreak >= 3) {
            streakMsg.classList.remove("hidden");
            document.getElementById("player-streak-badge").classList.remove("hidden");
            document.getElementById("player-streak-count").innerText = currentStreak;
        } else {
            streakMsg.classList.add("hidden");
            if (currentStreak === 0) document.getElementById("player-streak-badge").classList.add("hidden");
        }

        const sortedPool = Object.entries(allPlayersSnap.val()).map(([k, v]) => ({ key: k, score: v.score })).sort((a, b) => b.score - a.score);
        const currentRank = sortedPool.findIndex(item => item.key === myPlayerKey) + 1;

        document.getElementById("player-rank-number").innerText = currentRank;
        document.getElementById("player-rank-total").innerText = sortedPool.length;
        document.getElementById("player-total-score").innerText = currentScore;

        const movementUI = document.getElementById("player-rank-movement");
        movementUI.classList.remove("up", "down", "same");

        if (previousRank === null || currentRank === previousRank) {
            movementUI.innerText = "— Stable"; movementUI.classList.add("same");
        } else if (currentRank < previousRank) {
            movementUI.innerText = `▲ Up ${previousRank - currentRank} Position(s)`; movementUI.classList.add("up");
        } else {
            movementUI.innerText = `▼ Down ${currentRank - previousRank} Position(s)`; movementUI.classList.add("down");
        }

        previousRank = currentRank;
        switchView("playerResult");
    } catch (err) { console.error(err); }
}

async function listUIFinalLeaderboard(session) {
    document.getElementById("player-lb-msg").innerText = "Match concluded! Final Standings:";
    switchView("playerLeaderboard");
    
    if (!isFirebaseEnabled) return;
    try {
        const playersSnapshot = await get(ref(database, `${SESSION_ROOT}/${currentSessionPin}/players`));
        const listUI = document.getElementById("player-lb-list");
        listUI.innerHTML = "";
        
        if (playersSnapshot.exists()) {
            const array = Object.entries(playersSnapshot.val()).map(([key, val]) => ({ key, ...val }));
            array.sort((a, b) => b.score - a.score);
            
            const myIndex = array.findIndex(p => p.key === myPlayerKey);
            
            let displaySet = new Set();
            for(let i=0; i<3 && i<array.length; i++) displaySet.add(i);
            
            if(myIndex !== -1) {
                if(myIndex - 1 >= 0) displaySet.add(myIndex - 1);
                displaySet.add(myIndex);
                if(myIndex + 1 < array.length) displaySet.add(myIndex + 1);
            }
            
            let sortedIndices = Array.from(displaySet).sort((a,b) => a-b);
            let lastIdx = -1;
            
            sortedIndices.forEach(idx => {
                if(lastIdx !== -1 && idx > lastIdx + 1) {
                    const dots = document.createElement("div");
                    dots.className = "text-muted text-center my-2";
                    dots.innerText = "• • •";
                    listUI.appendChild(dots);
                }
                
                const player = array[idx];
                const row = document.createElement("div");
                row.className = "leaderboard-row fade-in-up";
                if (player.key === myPlayerKey) {
                    row.style.background = "rgba(242, 200, 17, 0.16)";
                    row.style.border = "1px solid var(--color-cyan)";
                }
                const name = document.createElement("span");
                const score = document.createElement("span");
                name.textContent = `#${idx + 1} ${player.nickname}`;
                score.textContent = `${player.score} pts`;
                row.append(name, score);
                listUI.appendChild(row);
                
                lastIdx = idx;
            });
        }
    } catch(err) {
        console.error(err);
    }
}

// ==========================================
// 7. MULTICAST RX EMISSIONS
// ==========================================
function setupPlayerReactionPipelines() {
    const triggerInboundReaction = async (emojiChar) => {
        if (emojiCooldownActive || !currentSessionPin) return;
        emojiCooldownActive = true;
        const targetButtons = document.querySelectorAll(".btn-emoji");
        targetButtons.forEach(b => b.classList.add("on-cooldown"));

        if (isFirebaseEnabled) {
            await set(push(ref(database, `${SESSION_ROOT}/${currentSessionPin}/reactions`)), { emoji: emojiChar, origin: myNickname, timestamp: Date.now() });
        }
        setTimeout(() => {
            emojiCooldownActive = false;
            targetButtons.forEach(b => b.classList.remove("on-cooldown"));
        }, 800);
    };

    document.querySelectorAll(".btn-emoji").forEach(btn => {
        btn.addEventListener("click", (e) => triggerInboundReaction(e.currentTarget.getAttribute("data-emoji")));
    });
}

function spawnReactionOnHostScreen(emojiChar) {
    let container = document.getElementById("host-lobby-emoji-container");
    if (views.hostLeaderboard.classList.contains("active")) container = document.getElementById("host-emoji-container");
    if (!container) return;

    const el = document.createElement("div");
    el.className = "floating-emoji";
    el.innerText = emojiChar;
    el.style.left = `${Math.random() * 85 + 5}%`;
    container.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
}

// ==========================================
// 8. PREVIEW MODAL ENGINE
// ==========================================
function compileQuestionFromBlock(block) {
    const qType = block.getAttribute("data-qtype");
    const qText = (block.querySelector(".maker-q-text")?.value || "").trim() || "Example Question?";
    const qTime = parseInt(block.querySelector(".maker-q-time")?.value) || 20;
    const qImage = block.getAttribute("data-image") || "";
    const qObj = { type: qType, text: qText, timeLimit: qTime, image: qImage };

    if (qType === "multiple-choice") {
        const opts = Array.from(block.querySelectorAll(".maker-q-opt")).map(i => i.value.trim());
        const checkedRadio = block.querySelector(".maker-q-correct:checked");
        const correctIdx = checkedRadio ? parseInt(checkedRadio.value) : 0;
        qObj.options = opts.map((o, i) => o || `Option ${i+1}`);
        qObj.correct = correctIdx;
    } else if (qType === "true-false") {
        const checkedRadio = block.querySelector(".maker-q-correct:checked");
        qObj.options = ["True", "False"];
        qObj.correct = checkedRadio ? parseInt(checkedRadio.value) : 0;
    } else if (qType === "jumbled-prompt") {
        const words = (block.querySelector(".maker-q-words")?.value || "").split(",").map(w => w.trim()).filter(w => w);
        qObj.words = words.length > 0 ? words : ["Example", "jumbled", "prompt"];
    } else if (qType === "type-answer") {
        qObj.answerText = block.querySelector(".maker-q-answer")?.value.trim() || "Answer";
    } else if (qType === "number-guess") {
        qObj.targetNumber = parseFloat(block.querySelector(".maker-q-number")?.value) || 50;
    } else if (qType === "poll") {
        const opts = (block.querySelector(".maker-q-poll-opts")?.value || "").split(",").map(o => o.trim()).filter(o => o);
        qObj.options = opts.length > 0 ? opts : ["Option A", "Option B"]; qObj.isPoll = true;
    } else if (qType === "speed-math") {
        qObj.equation = block.querySelector(".maker-q-math-eq")?.value.trim() || "Range, Value"; 
    }
    return qObj;
}

let previewQuestions = [];
let currentPreviewIndex = 0;

function showPreviewModal(questions, startIndex = 0) {
    previewQuestions = questions;
    currentPreviewIndex = startIndex;
    renderPreviewQuestion();
    document.getElementById("preview-modal").classList.remove("hidden");
}

function renderPreviewQuestion() {
    const q = previewQuestions[currentPreviewIndex];
    if (!q) return;

    document.getElementById("preview-question-text").innerText = q.text;
    document.getElementById("preview-timer").innerText = q.timeLimit;
    
    const imgContainer = document.getElementById("preview-question-image-container");
    const imgEl = document.getElementById("preview-question-image");
    if (q.image) {
        imgEl.src = q.image;
        imgContainer.classList.remove("hidden");
    } else {
        imgEl.src = "";
        imgContainer.classList.add("hidden");
    }
    
    const mc = document.getElementById("preview-ans-mc");
    const tf = document.getElementById("preview-ans-tf");
    const jumbled = document.getElementById("preview-ans-jumbled");
    const text = document.getElementById("preview-ans-text");
    const number = document.getElementById("preview-ans-number");
    const poll = document.getElementById("preview-ans-poll");
    const speedmath = document.getElementById("preview-ans-speedmath");
    
    if(mc) mc.classList.add("hidden"); if(tf) tf.classList.add("hidden");
    if(jumbled) jumbled.classList.add("hidden"); if(text) text.classList.add("hidden");
    if(number) number.classList.add("hidden"); if(poll) poll.classList.add("hidden"); if(speedmath) speedmath.classList.add("hidden");

    if (!q.type || q.type === "multiple-choice") {
        if(mc) mc.classList.remove("hidden");
        document.getElementById("preview-ans-0").innerText = q.options[0] || "";
        document.getElementById("preview-ans-1").innerText = q.options[1] || "";
        document.getElementById("preview-ans-2").innerText = q.options[2] || "";
        document.getElementById("preview-ans-3").innerText = q.options[3] || "";
    } else if (q.type === "true-false") {
        if(tf) tf.classList.remove("hidden");
        document.getElementById("preview-ans-tf-0").innerText = q.options[0] || "True";
        document.getElementById("preview-ans-tf-1").innerText = q.options[1] || "False";
    } else if (q.type === "jumbled-prompt") {
        if(jumbled) jumbled.classList.remove("hidden");
        const container = document.getElementById("preview-jumbled-words");
        if(container) {
            container.innerHTML = "";
            const scrambled = [...q.words].sort(() => Math.random() - 0.5);
            scrambled.forEach(w => {
                const span = document.createElement("span"); span.className = "jumbled-word-chip"; span.innerText = w;
                container.appendChild(span);
            });
        }
    } else if (q.type === "type-answer") {
        if(text) text.classList.remove("hidden");
    } else if (q.type === "number-guess") {
        if(number) number.classList.remove("hidden");
    } else if (q.type === "poll") {
        if(poll) poll.classList.remove("hidden");
    } else if (q.type === "speed-math") {
        if(speedmath) speedmath.classList.remove("hidden");
        const eqDisp = document.getElementById("preview-math-equation-display");
        if(eqDisp) eqDisp.innerText = `Required: ${q.equation || "?"}`;
    }

    const nav = document.getElementById("preview-nav-controls");
    if (previewQuestions.length > 1) {
        nav.classList.remove("hidden");
        document.getElementById("preview-counter").innerText = `${currentPreviewIndex + 1} / ${previewQuestions.length}`;
        document.getElementById("btn-preview-prev").disabled = currentPreviewIndex === 0;
        document.getElementById("btn-preview-next").disabled = currentPreviewIndex === previewQuestions.length - 1;
    } else {
        nav.classList.add("hidden");
    }
}

// Attach modal event listeners directly (module is deferred, DOM is ready)
document.getElementById("btn-close-preview")?.addEventListener("click", () => {
    document.getElementById("preview-modal").classList.add("hidden");
});
document.getElementById("btn-preview-prev")?.addEventListener("click", () => {
    if (currentPreviewIndex > 0) { currentPreviewIndex--; renderPreviewQuestion(); }
});
document.getElementById("btn-preview-next")?.addEventListener("click", () => {
    if (currentPreviewIndex < previewQuestions.length - 1) { currentPreviewIndex++; renderPreviewQuestion(); }
});
