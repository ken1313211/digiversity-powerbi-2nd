import { database, auth, storage, ref, set, get, update, onValue, remove, child, push, onChildAdded, runTransaction, increment, onDisconnect, storageRef, uploadBytes, getDownloadURL, isFirebaseEnabled, getCurrentUser, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from './firebase-config.js';
import { generateDashboardGame, serializeRound, deserializeToChartConfig, getTutorialRounds, getRandomScenarioPreset } from './dashboard-engine.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ==========================================
// STATE
// ==========================================
Chart.register(ChartDataLabels);
const PAGE_PARAMS = new URLSearchParams(window.location.search);
const IS_SIMULATOR_CLIENT = PAGE_PARAMS.get('sim') === '1' || window.self !== window.top;
if (!IS_SIMULATOR_CLIENT && sessionStorage.getItem('dashboard_wars_host_session')) {
    sessionStorage.removeItem('dashboard_wars_player_session');
}
let currentGamePin = null;
let isHost = false;
let myPlayerId = null;
let myNickname = null;
let currentGameState = null;
let currentQuestionIndex = 0;
let questions = [];
let currentHostedQuizTitle = '';
let hostTimerInterval = null;
let pointsDecayInterval = null;
let timeRemaining = 0;
let hasAnsweredThisRound = false;
let previousRank = null;
let emojiCooldown = false;
const MAX_FLOATING_EMOJIS = 15;
let lastInitializedQuestionIndex = -1;
let answerClickLocked = false;
let hostPausedAt = 0;
let makerCollapsed = [];
let sessionStartTime = Date.now();
let questionConclusionInProgress = false;
let currentPlayerConnectionRef = null;
let playerPresenceUnsubscribe = null;
const processedAttackIds = new Set();
let syncedPlayerQuestionStartTime = 0;
let syncedPlayerQuestionTimeLimit = 20;
let syncedPlayerQuestionPaused = false;

let customQuizzes = {};
let makerQuestions = [];
let sessionHistory = {};
let currentEditingQuizId = null;

// Dashboard + Team State
let currentGameMode = 'classic';
let dashboardRounds = [];
let playerChartInstance = null;
let hostChartInstance = null;
let resultChartInstance = null;
let teamModeEnabled = false;
let teamCount = 4;
let currentTeamLabelMode = 'groups';
let playerDashTimerInterval = null;
const TEAM_COLORS = [
    { name: 'Red', key: 'red', emoji: '🔴', color: '#E35205' },
    { name: 'Blue', key: 'blue', emoji: '🔵', color: '#0078D2' },
    { name: 'Gold', key: 'gold', emoji: '🟡', color: '#FFE600' },
    { name: 'Green', key: 'green', emoji: '🟢', color: '#339966' },
    { name: 'Purple', key: 'purple', emoji: '🟣', color: '#9966ff' },
    { name: 'Teal', key: 'teal', emoji: '🩵', color: '#4bc0c0' },
    { name: 'Orange', key: 'orange', emoji: '🟠', color: '#f97316' },
    { name: 'Pink', key: 'pink', emoji: '🩷', color: '#ec4899' },
];
function getTeamDefinition(teamKey) {
    return TEAM_COLORS.find(team => team.key === teamKey) || null;
}
function getTeamLabel(teamKey, labelMode = currentTeamLabelMode) {
    const index = TEAM_COLORS.findIndex(team => team.key === teamKey);
    if (index < 0) return 'No Group';
    return labelMode === 'colors' ? TEAM_COLORS[index].name : `Group ${index + 1}`;
}
function formatTeamLabel(teamKey, labelMode = currentTeamLabelMode) {
    const team = getTeamDefinition(teamKey);
    return team ? `${team.emoji} ${getTeamLabel(teamKey, labelMode)}` : '';
}
function formatTeamShort(teamKey, labelMode = currentTeamLabelMode) {
    const team = getTeamDefinition(teamKey);
    const index = TEAM_COLORS.findIndex(item => item.key === teamKey);
    if (!team || index < 0) return '';
    return labelMode === 'colors' ? team.emoji : `${team.emoji} G${index + 1}`;
}

// Presets
const eyPresets = [
    {
        title: "Power BI Fundamentals",
        questions: [
            { text: "What is Power BI mainly used for?", options: ["Gaming", "Data visualization", "Video editing", "Social media"], correct: 1, timeLimit: 20 },
            { text: "Which company created Power BI?", options: ["Google", "Apple", "Microsoft", "Amazon"], correct: 2, timeLimit: 20 },
            { text: "Which Power BI component is free to download?", options: ["Power BI Desktop", "Power BI Premium", "Azure Portal", "SQL Server"], correct: 0, timeLimit: 20 },
            { text: "Power BI dashboards can update in:", options: ["Real time", "Once a month", "Once a year", "Offline only"], correct: 0, timeLimit: 20 },
            { text: "Which feature helps secure data visibility?", options: ["VPN", "Firewall", "Row-Level Security", "Antivirus"], correct: 2, timeLimit: 20 },
            { text: "Which assistant integrates with Power BI?", options: ["Siri", "Alexa", "Cortana", "Google Assistant"], correct: 2, timeLimit: 20 },
            { text: "Which Power BI version is cloud-based?", options: ["Power BI Service", "Power BI Paint", "Power BI Desktop", "Power BI Mobile"], correct: 0, timeLimit: 20 },
            { text: "Power BI Mobile allows users to:", options: ["Access dashboards anywhere", "Edit movies", "Build games", "Repair databases"], correct: 0, timeLimit: 20 }
        ]
    },
    {
        title: "Module 1 - Prepare Your Data",
        questions: [
            { text: "Which tool is used to clean and shape data?", options: ["Paint", "Power Query Editor", "Teams", "Notepad"], correct: 1, timeLimit: 20 },
            { text: "Which connection mode gives real-time updates?", options: ["Import", "Direct", "Offline", "Static"], correct: 1, timeLimit: 20 },
            { text: "Which connection mode stores a copy of the data?", options: ["Direct", "Import", "Live", "Shared"], correct: 1, timeLimit: 20 },
            { text: "Removing columns is an example of:", options: ["Data shaping", "Coding", "Publishing", "Security"], correct: 0, timeLimit: 20 },
            { text: "Can Power BI combine data from multiple tables?", options: ["Yes", "No", "N/A", "N/A"], correct: 0, timeLimit: 20 },
            { text: "Which language is used in Power Query?", options: ["Python", "Java", "M Language", "HTML"], correct: 2, timeLimit: 20 },
            { text: "Which option combines tables together?", options: ["Merge/Append Queries", "Delete Query", "Export Query", "Refresh Query"], correct: 0, timeLimit: 20 },
            { text: "Does shaping data affect the original source?", options: ["Yes", "No", "N/A", "N/A"], correct: 1, timeLimit: 20 }
        ]
    },
    {
        title: "Module 2 - Data Modeling",
        questions: [
            { text: "What does DAX stand for?", options: ["Data Analysis Expressions", "Data Access XML", "Digital Analytics System", "Dynamic Azure Exchange"], correct: 0, timeLimit: 20 },
            { text: "Which DAX function adds values together?", options: ["COUNT", "IF", "SUM", "MAX"], correct: 2, timeLimit: 20 },
            { text: "Which function counts unique values?", options: ["COUNT", "DISTINCTCOUNT", "SUM", "MIN"], correct: 1, timeLimit: 20 },
            { text: "Relationships connect:", options: ["Two tables", "Two emails", "Two reports", "Two dashboards"], correct: 0, timeLimit: 20 },
            { text: "Power BI can auto-detect relationships.", options: ["True", "False", "N/A", "N/A"], correct: 0, timeLimit: 20 },
            { text: "Which relationship type should usually be avoided?", options: ["One-to-One", "One-to-Many", "Many-to-Many", "Active"], correct: 2, timeLimit: 20 },
            { text: "Measures are mainly used for:", options: ["Calculations", "Printing", "Formatting slides", "Security"], correct: 0, timeLimit: 20 },
            { text: "Calculated columns are created using:", options: ["DAX formulas", "VBA only", "SQL Server", "PowerPoint"], correct: 0, timeLimit: 20 }
        ]
    },
    {
        title: "Module 3 - Data Visualization",
        questions: [
            { text: "Charts and graphs are examples of:", options: ["Visualizations", "Databases", "Security tools", "Servers"], correct: 0, timeLimit: 20 },
            { text: "Which chart is best for showing trends over time?", options: ["Donut chart", "Funnel chart", "Line chart", "Gauge chart"], correct: 2, timeLimit: 20 },
            { text: "Which visual looks like a speedometer?", options: ["Table", "Gauge chart", "Pie chart", "Tree map"], correct: 1, timeLimit: 20 },
            { text: "What is a slicer mainly used for?", options: ["Filtering data", "Printing reports", "Deleting visuals", "Coding"], correct: 0, timeLimit: 20 },
            { text: "Reports can be published to:", options: ["Workspace", "Paint", "BIOS", "Command Prompt"], correct: 0, timeLimit: 20 },
            { text: "Which of these is a Power BI visual?", options: ["KPI chart", "Word document", "PDF editor", "Browser tab"], correct: 0, timeLimit: 20 },
            { text: "Custom visuals can come from:", options: ["Microsoft and community creators", "Only Microsoft", "Only Google", "Nobody"], correct: 0, timeLimit: 20 },
            { text: "Data visualization helps users understand:", options: ["Trends and patterns", "Hardware repairs", "Coding syntax", "Network cables"], correct: 0, timeLimit: 20 }
        ]
    },
    {
        title: "Quick Functionality Test",
        questions: [
            { text: "Is the Host's Pause Timer working right now?", options: ["Yes, I'll pause it!", "No, it's broken", "What is a timer?", "I don't know"], correct: 0, timeLimit: 30 },
            { text: "Will the leaderboard show up after this question?", options: ["Yes, always", "Only at the end", "I hope so", "No"], correct: 0, timeLimit: 15 },
            { text: "Are you ready to test the live emojis on the final screen?", options: ["Absolutely!", "Let's go!", "Bring on the emojis", "All of the above"], correct: 3, timeLimit: 15 }
        ]
    }
];

const vbaCopilotPresets = [
    {
        title: "VBA Automation Challenge",
        subject: "vba",
        questions: [
            { subject: "vba", type: "multiple-choice", text: "Which keyword declares a variable in VBA?", options: ["Let", "Dim", "Var", "ConstOnly"], correct: 1, timeLimit: 20 },
            { subject: "vba", type: "true-false", text: "Option Explicit helps catch undeclared variables.", options: ["True", "False"], correct: 0, timeLimit: 15 },
            { subject: "vba", type: "jumbled-prompt", text: "Arrange this simple VBA procedure.", words: ["Sub ShowMessage()", "MsgBox \"Hello\"", "End Sub"], timeLimit: 30 },
            { subject: "vba", type: "type-answer", text: "Which VBA statement displays a message box?", answerText: "MsgBox", timeLimit: 20 },
            { subject: "vba", type: "number-guess", text: "How many times does For i = 1 To 5 execute?", targetNumber: 5, min: 0, max: 10, timeLimit: 20 },
            { subject: "vba", type: "poll", text: "Which VBA skill should we practise next?", options: ["Loops", "Worksheets", "UserForms", "Error handling"], timeLimit: 20 },
            { subject: "vba", type: "speed-math", text: "Complete the key parts of a loop that runs from 1 to 10.", equation: "For, To, Next", timeLimit: 30 }
        ]
    },
    {
        title: "Microsoft Copilot Challenge",
        subject: "copilot",
        questions: [
            { subject: "copilot", type: "multiple-choice", text: "Which prompt gives Copilot the clearest output format?", options: ["Help me", "Summarize this", "Summarize this report in 3 bullets for executives", "Do something useful"], correct: 2, timeLimit: 20 },
            { subject: "copilot", type: "true-false", text: "Important Copilot responses should still be reviewed by a person.", options: ["True", "False"], correct: 0, timeLimit: 15 },
            { subject: "copilot", type: "jumbled-prompt", text: "Build a well-structured email prompt.", words: ["Draft an email", "to the project team", "summarizing the delay", "in a calm professional tone"], timeLimit: 30 },
            { subject: "copilot", type: "type-answer", text: "What do we call a confident but invented AI response?", answerText: "Hallucination", timeLimit: 20 },
            { subject: "copilot", type: "number-guess", text: "How many requested bullet points are in: 'Summarize this in 4 bullets'?", targetNumber: 4, min: 0, max: 10, timeLimit: 20 },
            { subject: "copilot", type: "poll", text: "Where would Copilot save you the most time?", options: ["Email", "Meetings", "Documents", "Data analysis"], timeLimit: 20 },
            { subject: "copilot", type: "speed-math", text: "Enter the three required prompt elements.", equation: "Goal, Context, Format", timeLimit: 30 }
        ]
    }
];

const RANDOM_QUESTION_BANK = {
    powerbi: {
        "multiple-choice": [
            { text: "Which Power BI visual is best for a trend over time?", options: ["Card", "Line chart", "Gauge", "Table"], correct: 1 },
            { text: "Which language creates measures in Power BI?", options: ["DAX", "VBA", "HTML", "CSS"], correct: 0 }
        ],
        "true-false": [{ text: "A measure is evaluated in filter context.", options: ["True", "False"], correct: 0 }],
        "jumbled-prompt": [{ text: "Arrange the Power BI workflow.", words: ["Connect", "Transform", "Model", "Visualize"] }],
        "type-answer": [{ text: "Which tool cleans and transforms data?", answerText: "Power Query" }],
        "number-guess": [{ text: "Four pages contain five visuals each. How many visuals?", targetNumber: 20, min: 0, max: 30 }],
        "poll": [{ text: "Which topic needs more practice?", options: ["Power Query", "Modeling", "DAX", "Design"] }],
        "speed-math": [{ text: "Enter the required elements for a total-sales measure.", equation: "SUM, Sales" }]
    },
    vba: {},
    copilot: {}
};
RANDOM_QUESTION_BANK.vba = Object.fromEntries(vbaCopilotPresets[0].questions.map(q => [q.type, [q]]));
RANDOM_QUESTION_BANK.copilot = Object.fromEntries(vbaCopilotPresets[1].questions.map(q => [q.type, [q]]));

const DEFAULT_BRANDING = {
    eventBadge: '🎉 ICEBREAKER 🎉',
    titleLine1: 'Digiversity',
    titleLine2: '2026',
    subtitle: 'The Ultimate Data Challenge',
    supportingText: 'Dashboard Battles • Team Wars • Awarding Night',
    joinLabel: '🎮 Join Game',
    hostLabel: '🎤 Host Game'
};
let currentBranding = { ...DEFAULT_BRANDING };
const AVAILABLE_THEMES = new Set(['ey', 'ocean', 'aurora', 'sunset']);
let currentTheme = 'ey';

function applyTheme(theme) {
    currentTheme = AVAILABLE_THEMES.has(theme) ? theme : 'ey';
    document.documentElement.dataset.theme = currentTheme;
    const selector = document.getElementById('branding-theme');
    if (selector) selector.value = currentTheme;
}

async function loadTheme() {
    const localTheme = localStorage.getItem('dashboard_wars_theme');
    if (localTheme) applyTheme(localTheme);
    if (!isFirebaseEnabled) return;
    try {
        const snapshot = await get(ref(database, 'settings/dashboardWarsTheme'));
        if (snapshot.exists()) {
            applyTheme(snapshot.val());
            localStorage.setItem('dashboard_wars_theme', currentTheme);
        }
    } catch (error) {
        console.warn('Shared theme could not be loaded:', error);
    }
}

function normalizeBranding(value = {}) {
    const next = {};
    Object.keys(DEFAULT_BRANDING).forEach(key => {
        const candidate = String(value[key] ?? '').trim();
        next[key] = candidate || DEFAULT_BRANDING[key];
    });
    return next;
}

function applyBranding(value) {
    currentBranding = normalizeBranding(value);
    const mappings = {
        'landing-event-badge': currentBranding.eventBadge,
        'landing-title-line-1': currentBranding.titleLine1,
        'landing-title-line-2': currentBranding.titleLine2,
        'landing-subtitle': currentBranding.subtitle,
        'landing-supporting-text': currentBranding.supportingText,
        'landing-join-label': currentBranding.joinLabel,
        'landing-host-label': currentBranding.hostLabel
    };
    Object.entries(mappings).forEach(([id, text]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = text;
    });
    document.title = `${currentBranding.titleLine1} ${currentBranding.titleLine2}`.trim();
    const inputMappings = {
        'branding-event-badge': currentBranding.eventBadge,
        'branding-title-line-1': currentBranding.titleLine1,
        'branding-title-line-2': currentBranding.titleLine2,
        'branding-subtitle': currentBranding.subtitle,
        'branding-supporting-text': currentBranding.supportingText,
        'branding-join-label': currentBranding.joinLabel,
        'branding-host-label': currentBranding.hostLabel
    };
    Object.entries(inputMappings).forEach(([id, text]) => {
        const input = document.getElementById(id);
        if (input) input.value = text;
    });
}

async function loadBranding() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('dashboard_wars_branding') || 'null'); } catch {}
    if (saved) applyBranding(saved);
    if (!isFirebaseEnabled) return;
    try {
        const snapshot = await get(ref(database, 'settings/dashboardWarsBranding'));
        if (snapshot.exists()) {
            applyBranding(snapshot.val());
            localStorage.setItem('dashboard_wars_branding', JSON.stringify(currentBranding));
        }
    } catch (error) {
        console.warn('Shared branding could not be loaded:', error);
    }
}

function normalizeQuestionType(q) {
    if (q.dashboardData || q.type === 'dashboard') return 'dashboard';
    if (!q.type || q.type === 'text') return 'multiple-choice';
    return q.type;
}

function questionSubject(q) {
    const raw = q?.subject || 'powerbi';
    return raw === 'vba' ? 'VBA' : raw === 'copilot' ? 'Microsoft Copilot' : raw === 'mixed' ? 'Mixed Challenge' : 'Power BI';
}

function getCorrectAnswerText(q) {
    const type = normalizeQuestionType(q);
    if (type === 'dashboard') {
        const idx = q.dashboardData?.correctIndex ?? q.correctIndex;
        return q.dashboardData?.labels?.[idx] ?? '';
    }
    if (type === 'jumbled-prompt') return (q.words || []).join(' → ');
    if (type === 'type-answer') return q.answerText || '';
    if (type === 'number-guess') return String(q.targetNumber ?? '');
    if (type === 'speed-math') return `Required: ${q.equation || ''}`;
    if (type === 'poll') return 'Opinion recorded';
    return q.options?.[q.correct] || '';
}

function isResponseCorrect(q, response) {
    const type = normalizeQuestionType(q);
    if (type === 'poll') return true;
    if (type === 'jumbled-prompt') {
        return Array.isArray(response.sequence) &&
            response.sequence.join('\u0001') === (q.words || []).join('\u0001');
    }
    if (type === 'type-answer') {
        return String(response.textAnswer || '').trim().toLowerCase() === String(q.answerText || '').trim().toLowerCase();
    }
    if (type === 'speed-math') {
        const answer = String(response.textAnswer || '').toLowerCase();
        return String(q.equation || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean)
            .every(keyword => answer.includes(keyword));
    }
    if (type === 'number-guess') {
        return Math.abs(Number(response.numberAnswer) - Number(q.targetNumber)) <= (q.tolerance ?? 0.15);
    }
    return Number(response.optionIndex) === Number(q.correct);
}

async function submitPlayerResponse(response) {
    if (!currentGamePin || !myPlayerId || hasAnsweredThisRound || currentGameState !== 'question') return false;
    hasAnsweredThisRound = true;
    const sessionRef = ref(database, `sessions/${currentGamePin}`);
    let sessionSnap;
    try {
        sessionSnap = await get(sessionRef);
    } catch (error) {
        hasAnsweredThisRound = false;
        showToast('Could not submit. Check your connection and try again.');
        return false;
    }
    if (!sessionSnap.exists()) { hasAnsweredThisRound = false; return false; }
    const session = sessionSnap.val();
    if (session.state !== 'question' || session.currentQuestionIndex !== currentQuestionIndex || session.isPaused) {
        hasAnsweredThisRound = false;
        showToast(session.isPaused ? 'The host paused the game.' : 'That question has already closed.');
        return false;
    }
    const q = session.questions?.[currentQuestionIndex] || questions[currentQuestionIndex];
    const isPoll = normalizeQuestionType(q) === 'poll';
    const isCorrect = isResponseCorrect(q, response);
    const elapsed = Math.max(0, (Date.now() - session.questionStartTime) / 1000);
    const playerRef = ref(database, `sessions/${currentGamePin}/players/${myPlayerId}`);
    let awardedPoints = 0;
    let claim;
    try {
        claim = await runTransaction(playerRef, player => {
        if (!player || player.answeredQuestionIndex === currentQuestionIndex) return;
        let streak = player.streak || 0;
        let base = 0, speed = 0, streakBonus = 0;
        if (isCorrect && !isPoll) {
            base = 500;
            speed = Math.floor(Math.max(0, 500 * (1 - elapsed / (q.timeLimit || 20))));
            streak += 1;
            if (streak >= 3) streakBonus = Math.floor((base + speed) * 0.2);
            awardedPoints = base + speed + streakBonus;
            if (q.isDoublePoints) awardedPoints *= 2;
            if (player.speedBoostActive) awardedPoints = Math.floor(awardedPoints * 1.5);
            if (player.multiplierActive) awardedPoints *= 2;
        } else if (!isPoll) {
            streak = 0;
        }
        return {
            ...player,
            score: (player.score || 0) + awardedPoints,
            streak,
            hasAnswered: true,
            answeredQuestionIndex: currentQuestionIndex,
            lastAnswerCorrect: isCorrect,
            lastPointsEarned: awardedPoints,
            isStreakMultiplierActive: isCorrect && streak >= 3,
            inventory: awardRandomPowerupIfDeserving(isCorrect && !isPoll, streak, elapsed, player.inventory || []),
            speedBoostActive: false,
            multiplierActive: false,
            receiptBase: base,
            receiptSpeed: speed,
            receiptStreak: streakBonus,
            receiptDouble: Boolean(q.isDoublePoints)
        };
        });
    } catch (error) {
        hasAnsweredThisRound = false;
        showToast('Could not lock in your answer. Please try again.');
        return false;
    }
    if (!claim.committed) return false;

    const updates = {
        [`answers/${myPlayerId}`]: { ...response, questionIndex: currentQuestionIndex, elapsedTime: Math.round(elapsed * 1000) },
        totalAnswers: increment(1)
    };
    if (response.optionIndex !== undefined) updates[`answersCount/${response.optionIndex}`] = increment(1);
    await update(sessionRef, updates);
    document.getElementById('player-waiting-msg')?.classList.remove('hidden');
    document.getElementById('player-dash-locked')?.classList.remove('hidden');
    return true;
}

function renderPlayerQuestionInterface(q) {
    const type = normalizeQuestionType(q);
    const answerGrid = document.querySelector('#view-player-question .answer-grid');
    const special = document.getElementById('player-special-answer');
    document.getElementById('player-question-text').textContent = q.text || q.dashboardData?.question || 'Question';
    document.getElementById('player-question-subject').textContent = questionSubject(q);
    const image = document.getElementById('player-question-image');
    const imageUrl = q.imageUrl || q.image || '';
    image.src = imageUrl;
    image.classList.toggle('hidden', !imageUrl);
    image.onclick = () => image.classList.toggle('expanded');
    answerGrid.classList.add('hidden');
    special.classList.add('hidden');
    ['player-jumbled-answer', 'player-text-answer', 'player-number-answer', 'player-poll-answer']
        .forEach(id => document.getElementById(id)?.classList.add('hidden'));

    if (type === 'multiple-choice' || type === 'true-false') {
        answerGrid.classList.remove('hidden');
        document.querySelectorAll('.answer-btn').forEach((button, index) => {
            const label = q.options?.[index];
            button.classList.toggle('hidden', label === undefined);
            button.classList.remove('selected', 'disabled-answer');
            const labelEl = document.getElementById(`player-answer-${index}`);
            if (labelEl) labelEl.textContent = label || '';
        });
        return;
    }

    special.classList.remove('hidden');
    if (type === 'jumbled-prompt') {
        document.getElementById('player-jumbled-answer').classList.remove('hidden');
        const available = document.getElementById('player-jumbled-options');
        const built = document.getElementById('player-jumbled-built');
        let selected = [];
        const draw = () => {
            available.innerHTML = '';
            built.innerHTML = '';
            selected.forEach((word, index) => {
                const chip = document.createElement('button');
                chip.className = 'jumbled-chip';
                chip.textContent = word;
                chip.onclick = () => { selected.splice(index, 1); draw(); };
                built.appendChild(chip);
            });
            const remaining = [...(q.words || [])];
            selected.forEach(word => remaining.splice(remaining.indexOf(word), 1));
            remaining.sort(() => Math.random() - 0.5).forEach(word => {
                const chip = document.createElement('button');
                chip.className = 'jumbled-chip';
                chip.textContent = word;
                chip.onclick = async () => {
                    selected.push(word);
                    draw();
                    if (selected.length === (q.words || []).length) await submitPlayerResponse({ sequence: selected });
                };
                available.appendChild(chip);
            });
        };
        document.getElementById('btn-reset-jumbled').onclick = () => { selected = []; draw(); };
        draw();
    } else if (type === 'type-answer' || type === 'speed-math') {
        document.getElementById('player-text-answer').classList.remove('hidden');
        const input = document.getElementById('input-player-text-answer');
        input.value = '';
        input.placeholder = type === 'speed-math' ? 'Enter the required elements' : 'Type your answer';
        document.getElementById('btn-submit-player-text').onclick = () => submitPlayerResponse({ textAnswer: input.value.trim() });
    } else if (type === 'number-guess') {
        document.getElementById('player-number-answer').classList.remove('hidden');
        const range = document.getElementById('input-player-number-answer');
        range.min = q.min ?? 0;
        range.max = q.max ?? 100;
        range.value = q.defaultValue ?? Math.round((Number(range.min) + Number(range.max)) / 2);
        const value = document.getElementById('player-number-value');
        value.textContent = range.value;
        range.oninput = () => { value.textContent = range.value; };
        document.getElementById('btn-submit-player-number').onclick = () => submitPlayerResponse({ numberAnswer: Number(range.value) });
    } else if (type === 'poll') {
        document.getElementById('player-poll-answer').classList.remove('hidden');
        const options = document.getElementById('player-poll-options');
        options.innerHTML = '';
        (q.options || []).forEach((label, index) => {
            const button = document.createElement('button');
            button.className = 'btn btn-secondary w-full';
            button.textContent = label;
            button.onclick = () => submitPlayerResponse({ optionIndex: index });
            options.appendChild(button);
        });
    }
}

// ==========================================
// UTILS & UI
// ==========================================
function generatePin() { return Math.floor(100000 + Math.random() * 900000).toString(); }
function generateId() { return Math.random().toString(36).substr(2, 9); }
function getPlayerDeviceId() {
    let id = localStorage.getItem('dashboard_wars_device_id');
    if (!id) {
        id = `${Date.now().toString(36)}-${generateId()}`;
        localStorage.setItem('dashboard_wars_device_id', id);
    }
    return id;
}
function savePlayerSession() {
    if (IS_SIMULATOR_CLIENT || !currentGamePin || !myPlayerId || !myNickname) return;
    sessionStorage.setItem('dashboard_wars_player_session', JSON.stringify({
        pin: currentGamePin,
        playerId: myPlayerId,
        nickname: myNickname
    }));
    localStorage.setItem('dashboard_wars_last_join', JSON.stringify({
        pin: currentGamePin,
        nickname: myNickname
    }));
}
function setupPlayerPresence(pin, playerId) {
    if (IS_SIMULATOR_CLIENT || !pin || !playerId) return;
    if (playerPresenceUnsubscribe) playerPresenceUnsubscribe();
    const connectedRef = ref(database, '.info/connected');
    playerPresenceUnsubscribe = onValue(connectedRef, async snapshot => {
        if (snapshot.val() !== true) return;
        currentPlayerConnectionRef = ref(database, `sessions/${pin}/players/${playerId}/online`);
        await update(ref(database, `sessions/${pin}/players/${playerId}`), {
            online: true,
            lastSeen: Date.now()
        });
        await onDisconnect(currentPlayerConnectionRef).set(false);
    });
}
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    clearInterval(pointsDecayInterval);
}

// Start points decay ticker for player UI
function startPointsDecayTicker(questionStartTime, timeLimit) {
    clearInterval(pointsDecayInterval);
    syncedPlayerQuestionStartTime = Number(questionStartTime) || Date.now();
    syncedPlayerQuestionTimeLimit = Math.max(1, Number(timeLimit) || 20);
    const updateTicker = () => {
        if (hasAnsweredThisRound) {
            clearInterval(pointsDecayInterval);
            return;
        }
        if (syncedPlayerQuestionPaused) return;
        const timeElapsed = Math.max(0, (Date.now() - syncedPlayerQuestionStartTime) / 1000);
        const speedBonus = Math.max(0, 500 * (1 - (timeElapsed / syncedPlayerQuestionTimeLimit)));
        const potential = Math.max(500, Math.floor(500 + speedBonus));
        const el1 = document.getElementById('player-potential-points');
        const el2 = document.getElementById('player-dash-potential-points');
        if (el1) el1.innerText = potential;
        if (el2) el2.innerText = potential;
    };
    updateTicker();
    pointsDecayInterval = setInterval(updateTicker, 100);
}

let isTimeFrozenLocal = false;
let playerTimerInterval = null;
let selectedInventoryIndex = null;
let isDonateModeActive = false;

const POWERUP_DEFS = {
    steal:        { name: 'Point Steal',      emoji: '💰' },
    freeze:       { name: 'Time Freeze',      emoji: '⏳' },
    shield:       { name: 'Defensive Shield', emoji: '🛡️' },
    multiplier:   { name: '2x Multiplier',    emoji: '⭐' },
    blur:         { name: 'Foggy Window',     emoji: '🌫️' },
    shuffle:      { name: 'Answer Shuffle',   emoji: '🔀' },
    glitch:       { name: 'Glitch Out',       emoji: '📺' },
    emoji_flood:  { name: 'Emoji Flood',      emoji: '🎈' },
    redacted:     { name: 'Redacted Question',emoji: '🕵️' },
    double_shield:{ name: 'Double Shield',    emoji: '🛡️🛡️' },
    speed_boost:  { name: 'Speed Boost',      emoji: '⚡' },
};
function normalizePowerupItem(item) {
    const source = typeof item === 'string' ? { type: item } : (item || {});
    const definition = POWERUP_DEFS[source.type] || {
        name: source.type ? String(source.type).replaceAll('_', ' ') : 'Unknown Power-Up',
        emoji: '❓'
    };
    return {
        ...source,
        type: source.type || 'unknown',
        name: source.name || definition.name,
        emoji: source.emoji || definition.emoji
    };
}

function awardRandomPowerupIfDeserving(isCorrect, newStreak, timeElapsed, currentInventory) {
    if (!isCorrect) return currentInventory || [];
    const inv = Array.isArray(currentInventory) ? [...currentInventory] : [];
    if (inv.length >= 3) return inv;

    const hasStreak = newStreak >= 2;
    const isSpeedy = timeElapsed < 3;
    const isLucky = Math.random() < 0.25;

    if (hasStreak || isSpeedy || isLucky) {
        const rand = Math.random() * 100;
        let item = null;
        if (rand < 25) {
            item = { type: 'shield', name: 'Defensive Shield', emoji: '🛡️' };
        } else if (rand < 40) {
            item = { type: 'blur', name: 'Foggy Window', emoji: '🌫️' };
        } else if (rand < 55) {
            item = { type: 'shuffle', name: 'Answer Shuffle', emoji: '🔀' };
        } else if (rand < 67) {
            item = { type: 'glitch', name: 'Glitch Out', emoji: '📺' };
        } else if (rand < 79) {
            item = { type: 'emoji_flood', name: 'Emoji Flood', emoji: '🎈' };
        } else if (rand < 84) {
            item = { type: 'redacted', name: 'Redacted Question', emoji: '🕵️' };
        } else if (rand < 89) {
            item = { type: 'steal', name: 'Point Steal', emoji: '💰' };
        } else if (rand < 95) {
            item = { type: 'freeze', name: 'Time Freeze', emoji: '⏳' };
        } else if (rand < 98) {
            item = { type: 'double_shield', name: 'Double Shield', emoji: '🛡️🛡️' };
        } else {
            item = { type: 'speed_boost', name: 'Speed Boost', emoji: '⚡' };
        }

        if (item) {
            inv.push(item);
        }
    }
    return inv;
}

function renderPlayerInventory(inventory, myTeam, teamModeActive, teamPools) {
    const slotsContainer = document.getElementById('player-slots-container');
    const dashSlotsContainer = document.getElementById('player-dash-slots-container');
    const stratSlotsContainer = document.getElementById('player-strategy-slots-container');
    
    const redraw = (container) => {
        if (!container) return;
        container.innerHTML = '';
        
        for (let i = 0; i < 3; i++) {
            const slot = document.createElement('div');
            const item = inventory[i] ? normalizePowerupItem(inventory[i]) : null;
            
            if (item) {
                // Ensure item has emoji/name (admin-granted items may only have type)
                const emoji = item.emoji;
                const name = item.name;

                slot.className = 'inventory-slot';
                if (selectedInventoryIndex === i) slot.classList.add('selected');
                
                slot.innerHTML = `
                    <span class="inventory-emoji">${emoji}</span>
                    <span class="inventory-slot-tooltip">${name}</span>
                `;
                
                slot.onclick = () => {
                    if (isDonateModeActive) {
                        donateItemToTeam(i);
                        return;
                    }
                    
                    if (item.type === 'shield' || item.type === 'double_shield' || item.type === 'speed_boost' || item.type === 'multiplier') {
                        activateBuffItem(i, item);
                    } else {
                        selectedInventoryIndex = i;
                        renderPlayerInventory(inventory, myTeam, teamModeActive, teamPools);
                        showPlayerTargetSelector(item.type, name, i, false);
                    }
                };
            } else {
                slot.className = 'inventory-slot empty';
                slot.innerHTML = '';
            }
            container.appendChild(slot);
        }
    };
    
    redraw(slotsContainer);
    redraw(dashSlotsContainer);
    redraw(stratSlotsContainer);
    
    // Donate buttons
    const donateBtn = document.getElementById('btn-donate-item');
    const dashDonateBtn = document.getElementById('btn-dash-donate-item');
    const stratDonateBtn = document.getElementById('btn-strategy-donate-item');
    
    if (teamModeActive && myTeam) {
        if (donateBtn) { donateBtn.style.display = 'block'; donateBtn.classList.remove('hidden'); }
        if (dashDonateBtn) { dashDonateBtn.style.display = 'block'; dashDonateBtn.classList.remove('hidden'); }
        if (stratDonateBtn) { stratDonateBtn.style.display = 'block'; stratDonateBtn.classList.remove('hidden'); }
    } else {
        if (donateBtn) { donateBtn.style.display = 'none'; donateBtn.classList.add('hidden'); }
        if (dashDonateBtn) { dashDonateBtn.style.display = 'none'; dashDonateBtn.classList.add('hidden'); }
        if (stratDonateBtn) { stratDonateBtn.style.display = 'none'; stratDonateBtn.classList.add('hidden'); }
    }
    
    // Team Pools
    const poolSec = document.getElementById('player-team-pool-section');
    const dashPoolSec = document.getElementById('player-dash-team-pool-section');
    const stratPoolSec = document.getElementById('player-strategy-team-pool-section');
    
    if (teamModeActive && myTeam) {
        if (poolSec) { poolSec.style.display = 'block'; poolSec.classList.remove('hidden'); }
        if (dashPoolSec) { dashPoolSec.style.display = 'block'; dashPoolSec.classList.remove('hidden'); }
        if (stratPoolSec) { stratPoolSec.style.display = 'block'; stratPoolSec.classList.remove('hidden'); }
        
        const poolItems = teamPools?.[myTeam]?.items || [];
        
        const renderPoolItems = (container) => {
            if (!container) return;
            container.innerHTML = '';
            if (poolItems.length === 0) {
                container.innerHTML = '<span style="font-size:0.65rem; color:var(--text-muted); font-style:italic;">No team items pooled yet.</span>';
                return;
            }
            
            poolItems.forEach((rawItem, idx) => {
                const item = normalizePowerupItem(rawItem);
                const emoji = item.emoji;
                const name = item.name;
                const pill = document.createElement('div');
                pill.className = 'pool-item-pill';
                pill.innerHTML = `<span>${emoji}</span><span>${name}</span>`;
                pill.onclick = () => {
                    if (item.type === 'shield' || item.type === 'double_shield' || item.type === 'speed_boost' || item.type === 'multiplier') {
                        activateBuffFromPool(idx, item);
                    } else {
                        showPlayerTargetSelector(item.type, name, idx, true);
                    }
                };
                container.appendChild(pill);
            });
        };
        
        renderPoolItems(document.getElementById('player-team-pool-items'));
        renderPoolItems(document.getElementById('player-dash-team-pool-items'));
        renderPoolItems(document.getElementById('player-strategy-team-pool-items'));
    } else {
        if (poolSec) { poolSec.style.display = 'none'; poolSec.classList.add('hidden'); }
        if (dashPoolSec) { dashPoolSec.style.display = 'none'; dashPoolSec.classList.add('hidden'); }
        if (stratPoolSec) { stratPoolSec.style.display = 'none'; stratPoolSec.classList.add('hidden'); }
    }
}

function toggleDonateMode() {
    isDonateModeActive = !isDonateModeActive;
    const btn = document.getElementById('btn-donate-item');
    const dashBtn = document.getElementById('btn-dash-donate-item');
    const stratBtn = document.getElementById('btn-strategy-donate-item');
    
    const label = isDonateModeActive ? "❌ Cancel" : "🤝 Donate";
    if (btn) btn.innerText = label;
    if (dashBtn) dashBtn.innerText = label;
    if (stratBtn) stratBtn.innerText = label;
    
    if (isDonateModeActive) {
        showToast("Select an item from inventory to donate it to the team.");
    }
}

async function donateItemToTeam(index) {
    if (!currentGamePin || !myPlayerId) return;
    const snap = await get(ref(database, `sessions/${currentGamePin}`));
    const d = snap.val();
    const pData = d.players?.[myPlayerId];
    if (!pData || !pData.inventory || !pData.inventory[index]) return;
    
    const item = normalizePowerupItem(pData.inventory[index]);
    const team = pData.team;
    if (!team) return;
    
    const newInv = [...pData.inventory];
    newInv.splice(index, 1);
    
    const poolItems = d.teamPools?.[team]?.items || [];
    poolItems.push(item);
    
    isDonateModeActive = false;
    const btn = document.getElementById('btn-donate-item');
    const dashBtn = document.getElementById('btn-dash-donate-item');
    const stratBtn = document.getElementById('btn-strategy-donate-item');
    if (btn) btn.innerText = "🤝 Donate";
    if (dashBtn) dashBtn.innerText = "🤝 Donate";
    if (stratBtn) stratBtn.innerText = "🤝 Donate";
    
    const updates = {};
    updates[`players/${myPlayerId}/inventory`] = newInv;
    updates[`teamPools/${team}/items`] = poolItems;
    
    await update(ref(database, `sessions/${currentGamePin}`), updates);
    showToast(`Donated ${item.emoji} ${item.name} to the team shared pool!`);
}

async function activateBuffItem(index, item) {
    if (!currentGamePin || !myPlayerId) return;
    const snap = await get(ref(database, `sessions/${currentGamePin}/players/${myPlayerId}`));
    const pData = snap.val();
    if (!pData || !pData.inventory) return;
    
    const newInv = [...pData.inventory];
    newInv.splice(index, 1);
    
    const updates = { inventory: newInv };
    
    if (item.type === 'shield') {
        updates.shieldCount = (pData.shieldCount || 0) + 1;
        updates.shieldActive = true;
        showShieldActiveLocalEffect();
    } else if (item.type === 'double_shield') {
        updates.shieldCount = (pData.shieldCount || 0) + 2;
        updates.shieldActive = true;
        showShieldActiveLocalEffect();
    } else if (item.type === 'speed_boost') {
        updates.speedBoostActive = true;
        showToast("⚡ Speed Boost Active! Next correct answer gets 1.5x points.");
    } else if (item.type === 'multiplier') {
        updates.multiplierActive = true;
        showToast("⭐ 2x Multiplier Active! Next correct answer gets double points.");
    }
    
    await update(ref(database, `sessions/${currentGamePin}/players/${myPlayerId}`), updates);
}

async function activateBuffFromPool(poolIndex, item) {
    if (!currentGamePin || !myPlayerId) return;
    const snap = await get(ref(database, `sessions/${currentGamePin}`));
    const d = snap.val();
    const pData = d.players?.[myPlayerId];
    const team = pData?.team;
    if (!team) return;
    
    const poolItems = d.teamPools?.[team]?.items || [];
    if (!poolItems[poolIndex]) return;
    
    poolItems.splice(poolIndex, 1);
    
    const updates = {};
    updates[`teamPools/${team}/items`] = poolItems;
    
    if (item.type === 'shield') {
        updates[`players/${myPlayerId}/shieldCount`] = (pData.shieldCount || 0) + 1;
        updates[`players/${myPlayerId}/shieldActive`] = true;
        showShieldActiveLocalEffect();
    } else if (item.type === 'double_shield') {
        updates[`players/${myPlayerId}/shieldCount`] = (pData.shieldCount || 0) + 2;
        updates[`players/${myPlayerId}/shieldActive`] = true;
        showShieldActiveLocalEffect();
    } else if (item.type === 'speed_boost') {
        updates[`players/${myPlayerId}/speedBoostActive`] = true;
        showToast("⚡ Speed Boost Active! Next correct answer gets 1.5x points.");
    } else if (item.type === 'multiplier') {
        updates[`players/${myPlayerId}/multiplierActive`] = true;
        showToast("⭐ 2x Multiplier Active! Next correct answer gets double points.");
    }
    
    await update(ref(database, `sessions/${currentGamePin}`), updates);
}

const TUTORIAL_SLIDES = [
    {
        title: "🎮 Welcome to Dashboard Wars!",
        desc: "Answer questions on your phone. Earn points based on accuracy and speed. Keep your streak alive to multiply your scores!"
    },
    {
        title: "🎒 Strategic Inventory",
        desc: "Answering correctly earns you power-ups and sabotages! You can hold up to 3 items in your inventory. Choose when to deploy them wisely."
    },
    {
        title: "🌫️ Attacks & Sabotages",
        desc: "Launch attacks on opponents! Foggy Window blurs screens (tap 5x to clear), Answer Shuffle randomizes button positions, Emoji Flood blocks views, Glitch Out grays out screens, Time Freeze delays timers, and Point Steal takes 100 points!"
    },
    {
        title: "🛡️ Shields & Boosts",
        desc: "Use Defensive Shields to block incoming sabotages automatically. Double Shields block 2 attacks. Use Speed Boost to multiply your next correct answer points by 1.5x!"
    },
    {
        title: "👥 Team Mechanics",
        desc: "When Team Mode is active, donate items to your team's Shared Pool. Coordinate with your group to launch powerful team-wide sabotages!"
    }
];

let currentTutorialSlide = 0;

function initTutorialCarousel() {
    const container = document.getElementById('tutorial-carousel-container');
    const dotsContainer = document.getElementById('tutorial-dots');
    if (!container || !dotsContainer) return;

    const renderSlide = (index) => {
        currentTutorialSlide = index;
        const slide = TUTORIAL_SLIDES[index];
        container.innerHTML = `
            <div class="tutorial-slide">
                <h3>${slide.title}</h3>
                <p>${slide.desc}</p>
            </div>
        `;
        
        const dots = dotsContainer.querySelectorAll('.tutorial-dot');
        dots.forEach((dot, idx) => {
            dot.classList.toggle('active', idx === index);
        });
    };

    dotsContainer.innerHTML = '';
    TUTORIAL_SLIDES.forEach((_, idx) => {
        const dot = document.createElement('div');
        dot.className = 'tutorial-dot';
        dot.onclick = () => renderSlide(idx);
        dotsContainer.appendChild(dot);
    });

    document.getElementById('btn-tutorial-prev').onclick = () => {
        const prev = (currentTutorialSlide - 1 + TUTORIAL_SLIDES.length) % TUTORIAL_SLIDES.length;
        renderSlide(prev);
    };

    document.getElementById('btn-tutorial-next').onclick = () => {
        const next = (currentTutorialSlide + 1) % TUTORIAL_SLIDES.length;
        renderSlide(next);
    };

    renderSlide(0);
}

async function showPlayerTargetSelector(attackType, attackName, itemIndex, isFromTeamPool) {
    if (!currentGamePin) return;
    const snap = await get(ref(database, `sessions/${currentGamePin}`));
    const d = snap.val() || {};
    const players = d.players || {};
    
    const modal = document.getElementById('player-target-modal');
    const listEl = document.getElementById('player-target-list');
    if (!modal || !listEl) return;
    
    listEl.innerHTML = '';
    modal.classList.remove('hidden');
    
    const sortedPlayers = Object.entries(players)
        .map(([id, p]) => ({ id, ...p }))
        .filter(p => p.id !== myPlayerId)
        .sort((a, b) => (b.score || 0) - (a.score || 0));
        
    if (sortedPlayers.length === 0) {
        listEl.innerHTML = '<p class="text-small text-muted" style="text-align:center;padding:1rem;">No other players found to target.</p>';
        return;
    }
    
    const myTeam = players[myPlayerId]?.team;
    const isQueued = currentGameState !== 'question';
    const attacksRefPath = 'queuedAttacks';

    const consumeItem = async () => {
        if (isFromTeamPool) {
            const poolItems = d.teamPools?.[myTeam]?.items || [];
            const idx = poolItems.findIndex(it => it.type === attackType);
            if (idx !== -1) {
                poolItems.splice(idx, 1);
                await update(ref(database, `sessions/${currentGamePin}`), {
                    [`teamPools/${myTeam}/items`]: poolItems
                });
            }
        } else {
            const pData = players[myPlayerId];
            const newInv = [...(pData?.inventory || [])];
            newInv.splice(itemIndex, 1);
            await update(ref(database, `sessions/${currentGamePin}/players/${myPlayerId}`), {
                inventory: newInv
            });
        }
    };

    const executeAttack = async (targetId, targetName) => {
        if (!confirm(`Use ${attackName} on ${targetName}?`)) return;
        modal.classList.add('hidden');
        await consumeItem();
        
        const attackRef = push(ref(database, `sessions/${currentGamePin}/${attacksRefPath}`));
        await set(attackRef, {
            attackerId: myPlayerId,
            attackerName: myNickname,
            attackerTeam: myTeam || null,
            targetId,
            targetName,
            type: attackType,
            timestamp: Date.now(),
            blocked: false
        });

        if (isQueued) {
            showToast(`⏳ Sabotage queued for ${targetName}!`);
        } else {
            showToast(`⚔️ Sabotage fired at ${targetName}!`);
        }
    };

    const executeTeamAttack = async (targetTeamKey, targetTeamName) => {
        modal.classList.add('hidden');
        
        if (isFromTeamPool) {
            const poolItems = d.teamPools?.[myTeam]?.items || [];
            const idx = poolItems.findIndex(it => it.type === attackType);
            if (idx !== -1) {
                poolItems.splice(idx, 1);
                await update(ref(database, `sessions/${currentGamePin}`), {
                    [`teamPools/${myTeam}/items`]: poolItems
                });
            }
        } else {
            const pData = players[myPlayerId];
            const myInv = pData?.inventory || [];
            let removed = 0;
            const newInv = [];
            for (let i = 0; i < myInv.length; i++) {
                if (myInv[i].type === attackType && removed < 2) {
                    removed++;
                } else {
                    newInv.push(myInv[i]);
                }
            }
            await update(ref(database, `sessions/${currentGamePin}/players/${myPlayerId}`), {
                inventory: newInv
            });
        }

        const targetPlayers = Object.entries(players).filter(([, p]) => p.team === targetTeamKey);
        const updates = {};
        
        targetPlayers.forEach(([pid, p]) => {
            const newAttackRef = push(ref(database, `sessions/${currentGamePin}/${attacksRefPath}`));
            updates[`${attacksRefPath}/${newAttackRef.key}`] = {
                attackerId: myPlayerId,
                attackerName: myNickname,
                attackerTeam: myTeam || null,
                targetId: pid,
                targetName: p.name,
                type: attackType,
                timestamp: Date.now(),
                blocked: false
            };
        });
        
        await update(ref(database, `sessions/${currentGamePin}`), updates);
        
        if (isQueued) {
            showToast(`⏳ Team Sabotage queued for ${targetTeamName}!`);
        } else {
            showToast(`⚔️ Sabotage fired at all players in ${targetTeamName}!`);
        }
    };
    
    const allSorted = Object.entries(players)
        .map(([id, p]) => ({ id, ...p }))
        .sort((a, b) => (b.score || 0) - (a.score || 0));
        
    const amILeader = allSorted.length > 0 && allSorted[0].id === myPlayerId;
    const topTarget = sortedPlayers[0];
    
    const leaderBtn = document.createElement('button');
    leaderBtn.className = 'btn btn-secondary text-small target-btn';
    if (amILeader) {
        leaderBtn.innerHTML = `🥈 2nd Place (<strong>${topTarget.name}</strong>)`;
    } else {
        leaderBtn.innerHTML = `🥇 Leader (<strong>${topTarget.name}</strong>)`;
    }
    leaderBtn.onclick = () => executeAttack(topTarget.id, topTarget.name);
    listEl.appendChild(leaderBtn);
    
    const randBtn = document.createElement('button');
    randBtn.className = 'btn btn-secondary text-small target-btn';
    randBtn.innerHTML = `🎲 Random Player`;
    randBtn.onclick = () => {
        const randTarget = sortedPlayers[Math.floor(Math.random() * sortedPlayers.length)];
        executeAttack(randTarget.id, randTarget.name);
    };
    listEl.appendChild(randBtn);
    
    if (myTeam) {
        const opponents = sortedPlayers.filter(p => p.team !== myTeam);
        if (opponents.length > 0) {
            const oppBtn = document.createElement('button');
            oppBtn.className = 'btn btn-secondary text-small target-btn';
            oppBtn.innerHTML = `⚔️ Random Opponent`;
            oppBtn.onclick = () => {
                const randOpp = opponents[Math.floor(Math.random() * opponents.length)];
                executeAttack(randOpp.id, randOpp.name);
            };
            listEl.appendChild(oppBtn);
        }

        let canTargetTeam = false;
        if (isFromTeamPool) {
            canTargetTeam = true;
        } else {
            const myInv = players[myPlayerId]?.inventory || [];
            const matches = myInv.filter(it => it.type === attackType);
            if (matches.length >= 2) canTargetTeam = true;
        }

        TEAM_COLORS.forEach(teamObj => {
            if (teamObj.key === myTeam) return;
            const teamPlayers = Object.values(players).filter(p => p.team === teamObj.key);
            if (teamPlayers.length === 0) return;

            const teamBtn = document.createElement('button');
            teamBtn.className = 'btn btn-secondary text-small target-btn';
            teamBtn.style.borderLeft = `4px solid ${teamObj.color}`;
            
            if (canTargetTeam) {
                const targetTeamLabel = getTeamLabel(teamObj.key);
                teamBtn.innerHTML = `⚔️ Sabotage ${targetTeamLabel}`;
                teamBtn.onclick = () => executeTeamAttack(teamObj.key, targetTeamLabel);
            } else {
                teamBtn.innerHTML = `⚔️ Sabotage ${getTeamLabel(teamObj.key)} (Requires 2 of same item)`;
                teamBtn.disabled = true;
                teamBtn.style.opacity = '0.5';
            }
            listEl.appendChild(teamBtn);
        });
    }

    const individualHeading = document.createElement('div');
    individualHeading.className = 'text-small text-muted';
    individualHeading.textContent = 'Players';
    listEl.appendChild(individualHeading);
    sortedPlayers.forEach(player => {
        const playerBtn = document.createElement('button');
        playerBtn.className = 'btn btn-secondary text-small target-btn player-target-option';
        playerBtn.dataset.playerName = String(player.name || '').toLowerCase();
        playerBtn.textContent = `${player.team ? '⚔️ ' : ''}${player.name}`;
        playerBtn.addEventListener('click', () => executeAttack(player.id, player.name));
        listEl.appendChild(playerBtn);
    });

    const targetSearch = document.getElementById('input-target-search');
    if (targetSearch) {
        targetSearch.value = '';
        targetSearch.blur();
        targetSearch.oninput = () => {
            const query = targetSearch.value.trim().toLowerCase();
            listEl.querySelectorAll('.player-target-option').forEach(button => {
                button.classList.toggle('hidden', Boolean(query) && !button.dataset.playerName.includes(query));
            });
        };
    }
}

function showShieldActiveLocalEffect() {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#166534;color:white;padding:0.75rem 1.5rem;border-radius:12px;z-index:99999;font-weight:bold;pointer-events:none;animation:fadeInUp 0.3s ease';
    toast.innerText = '🛡️ Shield Activated! You are immune to the next attack.';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
    document.getElementById('player-powerup-bar')?.classList.add('hidden');
    document.getElementById('player-dash-powerup-bar')?.classList.add('hidden');
}

function showShieldBlockEffect() {
    const flash = document.createElement('div');
    flash.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;background:rgba(34,197,94,0.4);pointer-events:none;z-index:99999;transition:opacity 0.8s ease-out';
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = '0'; setTimeout(() => flash.remove(), 800); }, 100);
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#166534;color:white;padding:0.75rem 1.5rem;border-radius:12px;z-index:99999;font-weight:bold;pointer-events:none;animation:fadeInUp 0.3s ease';
    toast.innerText = '🛡️ Shield blocked an incoming attack!';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function startEmojiFloodSabotage() {
    const activeOverlay = document.getElementById('view-player-question').classList.contains('active')
        ? document.getElementById('emoji-flood-overlay')
        : document.getElementById('dash-emoji-flood-overlay');
    if (!activeOverlay) return;
    
    activeOverlay.innerHTML = '';
    activeOverlay.classList.remove('hidden');
    
    // Add instruction text
    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:white;font-family:var(--font-heading);font-weight:700;font-size:1.2rem;text-align:center;z-index:1000;pointer-events:none;text-shadow:0 2px 8px rgba(0,0,0,0.8);animation:pulse 1s infinite';
    hint.innerText = '👆 TAP EMOJIS TO CLEAR!';
    activeOverlay.appendChild(hint);
    
    let popped = 0;
    const emojis = ['🎈', '👾', '⚠️', '🔥', '💩'];
    for (let i = 0; i < 5; i++) {
        const pop = document.createElement('div');
        pop.className = 'bouncing-emoji';
        pop.innerText = emojis[i];
        pop.style.left = Math.random() * 80 + 10 + '%';
        pop.style.top = Math.random() * 80 + 10 + '%';
        pop.addEventListener('click', (e) => {
            e.stopPropagation();
            pop.remove();
            popped++;
            if (popped >= 5) {
                activeOverlay.classList.add('hidden');
                activeOverlay.innerHTML = '';
            }
        });
        activeOverlay.appendChild(pop);
    }
    
    // Auto-clear fallback after 15 seconds in case player can't tap
    setTimeout(() => {
        activeOverlay.classList.add('hidden');
        activeOverlay.innerHTML = '';
    }, 15000);
}

function showPersistentDebuffNotification({ typeName, attackerName, attackerTeam, howToClear }) {
    let stack = document.getElementById('debuff-notification-stack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'debuff-notification-stack';
        document.body.appendChild(stack);
    }
    const card = document.createElement('div');
    card.className = 'debuff-card';
    const teamText = attackerTeam ? ` (${getTeamLabel(attackerTeam)})` : '';
    const header = document.createElement('div');
    header.className = 'debuff-card-header';
    const title = document.createElement('strong');
    title.textContent = `⚠️ ${attackerName}${teamText} used ${typeName}`;
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.textContent = 'Clear';
    clearButton.addEventListener('click', () => card.remove());
    const details = document.createElement('p');
    details.textContent = howToClear;
    header.append(title, clearButton);
    card.append(header, details);
    stack.prepend(card);
}

function clearSabotageEffectsForNextQuestion() {
    isTimeFrozenLocal = false;
    ['view-player-question', 'view-player-dashboard'].forEach(id => {
        document.getElementById(id)?.classList.remove('sabotage-blur', 'sabotage-greyout', 'sabotage-shake', 'sabotage-redacted');
    });
    document.querySelectorAll('.answer-btn').forEach(button => {
        button.style.order = '';
        button.disabled = false;
        button.style.pointerEvents = '';
        button.style.opacity = '';
    });
    ['emoji-flood-overlay', 'dash-emoji-flood-overlay'].forEach(id => {
        const overlay = document.getElementById(id);
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.innerHTML = '';
        }
    });
}

function applySabotageEffect(type, attackerName, attackerTeam, attackerId) {
    const qView = document.getElementById('view-player-question');
    const dView = document.getElementById('view-player-dashboard');
    
    let typeName = type.toUpperCase().replace('_', ' ');
    let howToClear = "Resolves automatically.";
    if (type === 'blur') {
        typeName = "Foggy Window";
        howToClear = "TAP screen 5 times to wipe screen clean!";
    } else if (type === 'emoji_flood') {
        typeName = "Emoji Flood";
        howToClear = "Pop all balloons to clear your screen!";
    } else if (type === 'shuffle') {
        typeName = "Answer Shuffle";
        howToClear = "Buttons shuffled! Read answers carefully.";
    } else if (type === 'freeze') {
        typeName = "Time Freeze";
        howToClear = "Timer frozen for 3 seconds!";
    } else if (type === 'steal') {
        typeName = "Point Steal";
        howToClear = "Stole 100 points from you!";
    } else if (type === 'glitch') {
        typeName = "Glitch Out";
        howToClear = "Grayscale glitch! Resolves in 7s.";
    } else if (type === 'redacted') {
        typeName = "Redacted Question";
        howToClear = "Tap the question card to reveal it, or wait 8 seconds.";
    }

    showPersistentDebuffNotification({ typeName, attackerName, attackerTeam, howToClear });

    if (type === 'blur') {
        qView.classList.add('sabotage-blur');
        dView.classList.add('sabotage-blur');
        
        let clicks = 0;
        const clickHandler = () => {
            clicks++;
            if (clicks >= 5) {
                qView.classList.remove('sabotage-blur');
                dView.classList.remove('sabotage-blur');
                document.removeEventListener('click', clickHandler);
                showToast("✨ Foggy Window wiped clean!");
            }
        };
        document.addEventListener('click', clickHandler);
        
        setTimeout(() => {
            qView.classList.remove('sabotage-blur');
            dView.classList.remove('sabotage-blur');
            document.removeEventListener('click', clickHandler);
        }, 8000);

    } else if (type === 'shuffle') {
        const buttons = Array.from(document.querySelectorAll('.answer-btn'));
        const orders = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        buttons.forEach((btn, idx) => {
            btn.style.order = orders[idx];
        });
        showToast("🔀 Buttons shuffled!");

    } else if (type === 'freeze') {
        isTimeFrozenLocal = true;
        showToast("❄️ Screen Frozen for 3s!");
        setTimeout(() => {
            isTimeFrozenLocal = false;
        }, 3000);

    } else if (type === 'steal') {
        (async () => {
            if (!currentGamePin || !myPlayerId) return;
            const snap = await get(ref(database, `sessions/${currentGamePin}`));
            const sessionVal = snap.val();
            const pData = sessionVal?.players?.[myPlayerId];
            if (!pData) return;

            const oldScore = pData.score || 0;
            const stolen = Math.min(oldScore, 100);
            
            const updates = {};
            updates[`players/${myPlayerId}/score`] = oldScore - stolen;
            
            if (attackerId) {
                const atkData = sessionVal.players[attackerId];
                if (atkData) {
                    updates[`players/${attackerId}/score`] = (atkData.score || 0) + stolen;
                }
            }
            await update(ref(database, `sessions/${currentGamePin}`), updates);
            showToast(`💰 Stole 100 points!`);
        })();

    } else if (type === 'glitch') {
        qView.classList.add('sabotage-greyout');
        dView.classList.add('sabotage-greyout');
        setTimeout(() => {
            qView.classList.remove('sabotage-greyout');
            dView.classList.remove('sabotage-greyout');
        }, 7000);

    } else if (type === 'emoji_flood') {
        startEmojiFloodSabotage();
    } else if (type === 'redacted') {
        qView.classList.add('sabotage-redacted');
        // Disable answer buttons so player cannot select while question is hidden
        const answerButtons = document.querySelectorAll('#view-player-question .answer-btn');
        answerButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.3';
        });
        const questionCard = document.querySelector('#view-player-question .player-question-card');
        const clearRedaction = () => {
            qView.classList.remove('sabotage-redacted');
            answerButtons.forEach(btn => {
                btn.disabled = false;
                btn.style.pointerEvents = '';
                btn.style.opacity = '';
            });
            questionCard?.removeEventListener('click', clearRedaction);
        };
        questionCard?.addEventListener('click', clearRedaction, { once: true });
        setTimeout(clearRedaction, 8000);
    }
}

// Particle Canvas Implementation
function initLandingParticles() {
    const canvas = document.getElementById('landing-particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 80; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2.5 + 0.5,
            speedX: (Math.random() - 0.5) * 0.4,
            speedY: (Math.random() - 0.5) * 0.3 - 0.2,
            opacity: Math.random() * 0.5 + 0.1,
            hue: Math.random() > 0.7 ? 45 : 55,
        });
    }

    function animateParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.x += p.speedX;
            p.y += p.speedY;
            p.opacity += (Math.random() - 0.5) * 0.02;
            p.opacity = Math.max(0.05, Math.min(0.6, p.opacity));
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height;
            if (p.y > canvas.height) p.y = 0;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${p.opacity})`;
            ctx.fill();
        });
        requestAnimationFrame(animateParticles);
    }
    animateParticles();
}

// Firebase Auth Listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        onValue(ref(database, `users/${user.uid}/quizzes`), (snapshot) => {
            customQuizzes = snapshot.val() || {};
            renderCustomQuizzes();
        });
        onValue(ref(database, `users/${user.uid}/history`), (snapshot) => {
            sessionHistory = snapshot.val() || {};
            renderMetrics();
            renderHistoryTable();
        });
    }
});

function renderMetrics() {
    const keys = Object.keys(sessionHistory);
    let totalPlayers = 0;
    let totalScore = 0;
    let scoresCount = 0;

    keys.forEach(k => {
        const h = sessionHistory[k];
        totalPlayers += (h.playerCount || 0);
        if (h.topScores && h.topScores.length > 0) {
            h.topScores.forEach(s => {
                totalScore += s.score;
                scoresCount++;
            });
        }
    });

    const avgScore = scoresCount > 0 ? Math.floor(totalScore / scoresCount) : 0;
    
    document.getElementById('metric-workshops').innerText = keys.length;
    document.getElementById('metric-players').innerText = totalPlayers;
    document.getElementById('metric-score').innerText = avgScore;
}

function renderHistoryTable() {
    const tbody = document.getElementById('history-list');
    if (!tbody) return;
    tbody.innerHTML = '';
    const keys = Object.keys(sessionHistory).sort((a,b) => sessionHistory[b].date - sessionHistory[a].date);
    
    if (keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted text-small py-3">No recent sessions found.</td></tr>';
        return;
    }

    keys.slice(0, 5).forEach(k => {
        const h = sessionHistory[k];
        const dateStr = new Date(h.date).toLocaleDateString();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dateStr}</td>
            <td>${h.quizName || 'Preset Session'}</td>
            <td>${h.playerCount || 0}</td>
            <td class="flex gap-2">
                <button class="btn btn-secondary text-small py-1 px-2" onclick="window.downloadHistoryCsv('${k}')">CSV</button>
                <button class="btn btn-secondary text-small py-1 px-2" style="color: var(--color-red);" onclick="window.deleteHistorySession('${k}')" title="Delete Test Session">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.downloadHistoryCsv = (historyId) => {
    const h = sessionHistory[historyId];
    if (!h || !h.topScores) return alert("No player data for this session.");
    
    const teamMap = {};
    h.topScores.forEach(p => {
        if (!p.team) return;
        if (!teamMap[p.team]) teamMap[p.team] = 0;
        teamMap[p.team] += (p.score || 0);
    });

    let csv = "Rank,Nickname,Score,Team,Team Score\n";
    h.topScores.forEach((p, idx) => {
        const teamObj = p.team ? TEAM_COLORS.find(t => t.key === p.team) : null;
        const teamName = teamObj ? getTeamLabel(p.team) : "None";
        const teamPoints = p.team ? (teamMap[p.team] || 0) : "";
        csv += `${idx + 1},${p.name},${p.score},${teamName},${teamPoints}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `powerquiz_history_${new Date(h.date).toISOString().split('T')[0]}.csv`);
    a.click();
};

window.deleteHistorySession = async (historyId) => {
    if (!confirm("Are you sure you want to delete this session? This will update your top metrics.")) return;
    const user = getCurrentUser();
    if (user) {
        await remove(ref(database, `users/${user.uid}/history/${historyId}`));
    }
};

function renderCustomQuizzes() {
    const container = document.getElementById('custom-quizzes-list');
    if (!container) return;
    container.innerHTML = '';
    const keys = Object.keys(customQuizzes);
    if (keys.length === 0) {
        container.innerHTML = '<p class="text-muted text-small text-center">No custom quizzes found.</p>';
        return;
    }
    keys.forEach(key => {
        const qz = customQuizzes[key];
        const el = document.createElement('div');
        el.className = 'card card-hover flex-between quiz-library-item';
        el.style.padding = '1rem';
        el.innerHTML = `
            <div>
                <strong>${qz.title}</strong>
                <div class="text-small text-muted mt-2">${qz.questions.length} questions</div>
            </div>
            <div class="flex gap-2 quiz-library-actions">
                <button class="btn btn-secondary" onclick="window.editQuiz('${key}')" title="Edit Quiz">✎</button>
                <button class="btn btn-secondary" onclick="window.deleteQuiz('${key}')" style="color:var(--color-red);" title="Delete Quiz">×</button>
                <button class="btn btn-primary" onclick="window.startCustomQuiz('${key}')">Host</button>
            </div>
        `;
        container.appendChild(el);
    });
}

// ==========================================
// ADMIN / MAKER LOGIC
// ==========================================
const defaultMakerQuestion = () => ({ subject: 'powerbi', type: 'multiple-choice', text: '', options: ['', '', '', ''], words: [], answerText: '', targetNumber: 50, min: 0, max: 100, equation: '', values: [0, 0, 0, 0], chartType: 'bar', metric: 'Value', unitPrefix: '', correct: 0, timeLimit: 20, isDoublePoints: false, imageUrl: null });

window.editQuiz = (key) => {
    const qz = customQuizzes[key];
    currentEditingQuizId = key;
    makerQuestions = JSON.parse(JSON.stringify(qz.questions)).map(q => ({ ...defaultMakerQuestion(), ...q }));
    document.getElementById('maker-quiz-title').value = qz.title;
    renderMakerQuestions();
    switchView('view-admin-maker');
};

window.deleteQuiz = async (key) => {
    if (confirm("Are you sure you want to delete this quiz?")) {
        const user = getCurrentUser();
        await remove(ref(database, `users/${user.uid}/quizzes/${key}`));
    }
};

window.updateMakerValue = (idx, optIdx, val) => { makerQuestions[idx].values[optIdx] = parseInt(val) || 0; };

window.moveMakerQuestion = (idx, dir) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= makerQuestions.length) return;
    const temp = makerQuestions[idx];
    makerQuestions[idx] = makerQuestions[targetIdx];
    makerQuestions[targetIdx] = temp;
    
    const tempCollapse = makerCollapsed[idx];
    makerCollapsed[idx] = makerCollapsed[targetIdx];
    makerCollapsed[targetIdx] = tempCollapse;
    
    renderMakerQuestions();
};

window.toggleMakerCollapse = (idx) => {
    makerCollapsed[idx] = !makerCollapsed[idx];
    renderMakerQuestions();
};

window.autoGenerateMakerQuestion = (idx) => {
    const q = makerQuestions[idx];
    const type = normalizeQuestionType(q);
    if (type !== 'dashboard') {
        const subject = q.subject || 'powerbi';
        const candidates = RANDOM_QUESTION_BANK[subject]?.[type] || RANDOM_QUESTION_BANK[subject]?.['multiple-choice'] || [];
        if (!candidates.length) return showToast('No random example is available for this type yet.', '#b45309');
        const generated = candidates[Math.floor(Math.random() * candidates.length)];
        makerQuestions[idx] = {
            ...defaultMakerQuestion(),
            ...JSON.parse(JSON.stringify(generated)),
            type,
            subject,
            timeLimit: q.timeLimit || 20
        };
        renderMakerQuestions();
        return;
    }
    const preset = getRandomScenarioPreset();
    makerQuestions[idx].text = `Tap the category with the HIGHEST ${preset.metric}`;
    makerQuestions[idx].metric = preset.metric;
    makerQuestions[idx].unitPrefix = preset.unit;
    makerQuestions[idx].options = [...preset.labels];
    makerQuestions[idx].values = [...preset.values];
    
    let maxVal = -Infinity;
    let maxIdx = 0;
    preset.values.forEach((v, i) => {
        if (v > maxVal) { maxVal = v; maxIdx = i; }
    });
    makerQuestions[idx].correct = maxIdx;
    
    renderMakerQuestions();
};

function renderMakerQuestions() {
    const container = document.getElementById('maker-questions-container');
    if (!container) return;
    container.innerHTML = '';
    makerQuestions.forEach((q, idx) => {
        if (makerCollapsed[idx] === undefined) makerCollapsed[idx] = false;
        
        const el = document.createElement('div');
        el.className = 'maker-q-card fade-in-up';
        
        let headerInner = `
            <div class="maker-q-header" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 0.5rem 0;" onclick="if(event.target.tagName !== 'BUTTON' && event.target.tagName !== 'SELECT') window.toggleMakerCollapse(${idx});">
                <h3 style="margin: 0; font-size: 1.05rem;">Q${idx + 1}: <span style="font-weight: normal; opacity: 0.8; font-size: 0.9rem;">${q.text || '(Untitled Question)'}</span></h3>
                <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; justify-content: flex-end;" onclick="event.stopPropagation();">
                    <button class="btn btn-secondary text-small" onclick="window.moveMakerQuestion(${idx}, -1)" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; margin: 0;">▲</button>
                    <button class="btn btn-secondary text-small" onclick="window.moveMakerQuestion(${idx}, 1)" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; margin: 0;">▼</button>
                    <select onchange="window.updateMakerQ(${idx}, 'type', this.value);" style="padding: 0.3rem; border-radius: 4px; background: rgba(0,0,0,0.4); color: white; border: 1px solid rgba(255,255,255,0.1); font-size: 0.8rem;">
                        <option value="multiple-choice" ${q.type === 'multiple-choice' || q.type === 'text' ? 'selected' : ''}>🔠 Multiple Choice</option>
                        <option value="true-false" ${q.type === 'true-false' ? 'selected' : ''}>✅ True / False</option>
                        <option value="jumbled-prompt" ${q.type === 'jumbled-prompt' ? 'selected' : ''}>🔀 Arrange in Order</option>
                        <option value="type-answer" ${q.type === 'type-answer' ? 'selected' : ''}>⌨️ Exact Answer</option>
                        <option value="number-guess" ${q.type === 'number-guess' ? 'selected' : ''}>🎯 Number Estimate</option>
                        <option value="poll" ${q.type === 'poll' ? 'selected' : ''}>📊 Poll</option>
                        <option value="speed-math" ${q.type === 'speed-math' ? 'selected' : ''}>⚡ Missing Elements</option>
                        <option value="dashboard" ${q.type === 'dashboard' ? 'selected' : ''}>📊 Dashboard</option>
                    </select>
                    <button class="btn-delete-q" onclick="window.deleteMakerQuestion(${idx})" style="position: static; font-size: 1.2rem; padding: 0.1rem 0.4rem;">×</button>
                </div>
            </div>
        `;

        let bodyInner = '';
        const makerActions = `
            <div class="flex gap-2 mt-2 mb-2">
                <button class="btn btn-secondary" onclick="window.previewMakerChart(${idx})" style="flex:1; margin:0; padding:0.45rem;">👁 Preview Question</button>
                <button class="btn btn-secondary" onclick="window.autoGenerateMakerQuestion(${idx})" style="flex:1; margin:0; padding:0.45rem; border-color:var(--color-primary); color:var(--color-primary);">🎲 Random Content</button>
            </div>`;
        if (!makerCollapsed[idx]) {
            if (q.type === 'dashboard') {
                bodyInner = `
                    <div class="mt-3">
                        <input type="text" placeholder="Question Text (e.g. 'Tap the highest value')" value="${q.text}" oninput="window.updateMakerQ(${idx}, 'text', this.value)" class="mb-3">
                        
                        <div class="flex-between mb-2">
                            <span class="text-small text-muted">Time Limit (s):</span>
                            <select onchange="window.updateMakerQ(${idx}, 'timeLimit', parseInt(this.value))" style="padding: 0.25rem 0.5rem; border-radius: 4px;">
                                <option value="10" ${q.timeLimit===10?'selected':''}>10s</option>
                                <option value="20" ${q.timeLimit===20?'selected':''}>20s</option>
                                <option value="30" ${q.timeLimit===30?'selected':''}>30s</option>
                                <option value="45" ${q.timeLimit===45?'selected':''}>45s</option>
                                <option value="60" ${q.timeLimit===60?'selected':''}>60s</option>
                            </select>
                        </div>

                        <div class="flex-between gap-2 mb-3 mt-3">
                            <select onchange="window.updateMakerQ(${idx}, 'chartType', this.value)" style="flex: 1; padding: 0.5rem; border-radius: 4px; background: #0f172a; border: 1px solid rgba(255,255,255,0.1); color: white;">
                                <option value="bar" ${q.chartType === 'bar' ? 'selected' : ''}>Bar Chart</option>
                                <option value="line" ${q.chartType === 'line' ? 'selected' : ''}>Line Chart</option>
                                <option value="pie" ${q.chartType === 'pie' ? 'selected' : ''}>Pie Chart</option>
                                <option value="polarArea" ${q.chartType === 'polarArea' ? 'selected' : ''}>Polar Chart</option>
                                <option value="kpi" ${q.chartType === 'kpi' ? 'selected' : ''}>KPI Grid</option>
                            </select>
                            <input type="text" placeholder="Metric (e.g. Profit)" value="${q.metric || ''}" oninput="window.updateMakerQ(${idx}, 'metric', this.value)" style="flex: 1; margin: 0;">
                            <input type="text" placeholder="Prefix ($)" value="${q.unitPrefix || ''}" oninput="window.updateMakerQ(${idx}, 'unitPrefix', this.value)" style="flex: 0.5; margin: 0;">
                        </div>
                        
                        <div class="flex gap-2 mb-3">
                            <button class="btn btn-secondary" onclick="window.previewMakerChart(${idx})" style="flex: 1; padding: 0.5rem; margin: 0; font-size: 0.8rem;">👁️ Preview Chart</button>
                            <button class="btn btn-secondary" onclick="window.autoGenerateMakerQuestion(${idx})" style="flex: 1; padding: 0.5rem; margin: 0; font-size: 0.8rem; border-color: var(--color-primary); color: var(--color-primary);">🎲 Auto-Generate Data</button>
                        </div>

                        <div class="maker-options-grid mt-2">
                            <div class="text-small text-muted mb-1" style="grid-column: 1 / -1; display: flex; gap: 0.5rem;">
                                <span style="width: 24px; text-align: center;">✅</span>
                                <span style="flex: 1;">Data Label</span>
                                <span style="flex: 1;">Numerical Value</span>
                            </div>
                            ${[0,1,2,3].map(i => `
                            <div class="maker-option-row" style="display: flex; gap: 0.5rem; align-items: center; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 4px;">
                                <input type="radio" name="correct-${idx}" ${q.correct===i?'checked':''} onchange="window.updateMakerQ(${idx}, 'correct', ${i})" style="width: 24px; height: 24px; accent-color: var(--color-primary); cursor: pointer;">
                                <input type="text" placeholder="Label ${i+1}" value="${q.options[i] || ''}" oninput="window.updateMakerOption(${idx}, ${i}, this.value)" style="flex: 1; margin: 0;">
                                <input type="number" placeholder="Value" value="${q.values[i] || ''}" oninput="window.updateMakerValue(${idx}, ${i}, this.value)" style="flex: 1; margin: 0;">
                            </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else if (['jumbled-prompt', 'type-answer', 'number-guess', 'speed-math'].includes(q.type)) {
                let specialField = '';
                if (q.type === 'jumbled-prompt') {
                    specialField = `<input type="text" placeholder="Correct order, separated by commas" value="${(q.words || []).join(', ')}" oninput="window.updateMakerWords(${idx}, this.value)">`;
                } else if (q.type === 'type-answer') {
                    specialField = `<input type="text" placeholder="Exact answer" value="${q.answerText || ''}" oninput="window.updateMakerQ(${idx}, 'answerText', this.value)">`;
                } else if (q.type === 'number-guess') {
                    specialField = `<div class="flex gap-2"><input type="number" placeholder="Correct number" value="${q.targetNumber ?? 0}" oninput="window.updateMakerQ(${idx}, 'targetNumber', Number(this.value))"><input type="number" placeholder="Minimum" value="${q.min ?? 0}" oninput="window.updateMakerQ(${idx}, 'min', Number(this.value))"><input type="number" placeholder="Maximum" value="${q.max ?? 100}" oninput="window.updateMakerQ(${idx}, 'max', Number(this.value))"></div>`;
                } else {
                    specialField = `<input type="text" placeholder="Required elements, separated by commas" value="${q.equation || ''}" oninput="window.updateMakerQ(${idx}, 'equation', this.value)">`;
                }
                bodyInner = `
                    <div class="mt-3">
                        <input type="text" placeholder="Question Text" value="${q.text || ''}" oninput="window.updateMakerQ(${idx}, 'text', this.value)" class="mb-3">
                        ${specialField}
                        <div class="flex-between mt-2">
                            <span class="text-small text-muted">Time Limit</span>
                            <select onchange="window.updateMakerQ(${idx}, 'timeLimit', Number(this.value))">
                                ${[10,15,20,30,45,60].map(seconds => `<option value="${seconds}" ${q.timeLimit===seconds?'selected':''}>${seconds}s</option>`).join('')}
                            </select>
                        </div>
                    </div>`;
            } else {
                bodyInner = `
                    <div class="mt-3">
                        <input type="text" placeholder="Question Text" value="${q.text}" oninput="window.updateMakerQ(${idx}, 'text', this.value)" class="mb-3">
                        <div class="flex-between mb-2">
                            <span class="text-small text-muted">Time Limit (s):</span>
                            <select onchange="window.updateMakerQ(${idx}, 'timeLimit', parseInt(this.value))" style="padding: 0.25rem 0.5rem; border-radius: 4px;">
                                <option value="10" ${q.timeLimit===10?'selected':''}>10s</option>
                                <option value="20" ${q.timeLimit===20?'selected':''}>20s</option>
                                <option value="30" ${q.timeLimit===30?'selected':''}>30s</option>
                                <option value="60" ${q.timeLimit===60?'selected':''}>60s</option>
                            </select>
                        </div>
                        <div class="flex-between mb-2" style="background: rgba(255,230,0,0.1); padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--color-primary);">
                            <label style="color: var(--color-primary); font-weight: bold; cursor: pointer;">
                                <input type="checkbox" ${q.isDoublePoints?'checked':''} onchange="window.updateMakerQ(${idx}, 'isDoublePoints', this.checked)" style="accent-color: var(--color-primary);"> 
                                Double Points Power-Up!
                            </label>
                        </div>
                        <div class="mb-3" style="background: rgba(255,255,255,0.05); padding: 0.5rem; border-radius: var(--radius-sm);">
                            <span class="text-small text-muted block mb-1">Optional Image:</span>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <input type="file" accept="image/*" onchange="window.uploadMakerImage(${idx}, this)" style="font-size: 0.8rem; color: white; flex: 1;">
                                ${q.imageUrl ? `<button onclick="window.removeMakerImage(${idx})" style="background: none; border: 1px solid var(--color-red); color: var(--color-red); border-radius: var(--radius-sm); padding: 4px 8px; cursor: pointer; font-size: 0.75rem;">Remove</button>` : ''}
                            </div>
                            <div id="maker-img-status-${idx}" class="text-small mt-2" style="display: none;"></div>
                            ${q.imageUrl ? `<img src="${q.imageUrl}" style="max-height: 100px; border-radius: var(--radius-sm); margin-top: 0.5rem; display: block; border: 2px solid var(--color-green);">
                            <span class="text-small" style="color: var(--color-green);">✅ Image attached</span>` : ''}
                        </div>
                        <div class="maker-options-grid mt-2">
                            <div class="maker-option-row">
                                <input type="radio" name="correct-${idx}" ${q.correct===0?'checked':''} onchange="window.updateMakerQ(${idx}, 'correct', 0)">
                                <input type="text" placeholder="Answer A (Red)" value="${q.options[0] || ''}" oninput="window.updateMakerOption(${idx}, 0, this.value)">
                            </div>
                            <div class="maker-option-row">
                                <input type="radio" name="correct-${idx}" ${q.correct===1?'checked':''} onchange="window.updateMakerQ(${idx}, 'correct', 1)">
                                <input type="text" placeholder="Answer B (Blue)" value="${q.options[1] || ''}" oninput="window.updateMakerOption(${idx}, 1, this.value)">
                            </div>
                            <div class="maker-option-row">
                                <input type="radio" name="correct-${idx}" ${q.correct===2?'checked':''} onchange="window.updateMakerQ(${idx}, 'correct', 2)">
                                <input type="text" placeholder="Answer C (Yellow)" value="${q.options[2] || ''}" oninput="window.updateMakerOption(${idx}, 2, this.value)">
                            </div>
                            <div class="maker-option-row">
                                <input type="radio" name="correct-${idx}" ${q.correct===3?'checked':''} onchange="window.updateMakerQ(${idx}, 'correct', 3)">
                                <input type="text" placeholder="Answer D (Green)" value="${q.options[3] || ''}" oninput="window.updateMakerOption(${idx}, 3, this.value)">
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        
        if (!makerCollapsed[idx]) bodyInner = makerActions + bodyInner;
        el.innerHTML = headerInner + bodyInner;
        container.appendChild(el);
    });
}

window.deleteMakerQuestion = (idx) => { makerQuestions.splice(idx, 1); makerCollapsed.splice(idx, 1); renderMakerQuestions(); };
window.updateMakerQ = (idx, field, val) => { 
    makerQuestions[idx][field] = val; 
    if (field === 'type') {
        if (val === 'true-false') {
            makerQuestions[idx].options = ['True', 'False'];
            makerQuestions[idx].correct = 0;
        } else if (val === 'multiple-choice' && makerQuestions[idx].options.length < 4) {
            makerQuestions[idx].options = ['', '', '', ''];
        }
        renderMakerQuestions();
    }
};
window.updateMakerOption = (idx, optIdx, val) => { makerQuestions[idx].options[optIdx] = val; };
window.updateMakerWords = (idx, value) => {
    makerQuestions[idx].words = value.split(',').map(item => item.trim()).filter(Boolean);
};

let previewChartInstance = null;
window.previewMakerChart = (idx) => {
    const q = makerQuestions[idx];
    if (!q) return;

    const modal = document.getElementById('modal-chart-preview');
    modal.classList.remove('hidden');
    const generic = document.getElementById('preview-generic-content');
    const canvas = document.getElementById('preview-chart-canvas');
    const canvasPanel = canvas.parentElement;
    const type = normalizeQuestionType(q);
    
    document.getElementById('preview-chart-question').innerText = q.text || 'Tap the correct element';
    if (type !== 'dashboard') {
        if (previewChartInstance) previewChartInstance.destroy();
        canvasPanel.classList.add('hidden');
        generic.classList.remove('hidden');
        generic.innerHTML = '';
        const typeLine = document.createElement('div');
        typeLine.className = 'player-question-subject';
        typeLine.textContent = `${questionSubject(q)} · ${type.replaceAll('-', ' ')}`;
        const answerLine = document.createElement('p');
        answerLine.style.marginTop = '0.75rem';
        answerLine.textContent = type === 'poll' ? 'Unscored opinion question' : `Expected answer: ${getCorrectAnswerText(q) || 'Not set'}`;
        generic.append(typeLine, answerLine);
        if (q.options?.length) {
            const list = document.createElement('ol');
            q.options.forEach(option => {
                const item = document.createElement('li');
                item.textContent = option;
                list.appendChild(item);
            });
            generic.appendChild(list);
        }
        document.getElementById('preview-chart-title').innerText = 'Question Preview';
        return;
    }
    generic.classList.add('hidden');
    canvasPanel.classList.remove('hidden');
    document.getElementById('preview-chart-title').innerText = `${q.chartType.charAt(0).toUpperCase() + q.chartType.slice(1)} Chart Preview`;
    
    const ctx = canvas.getContext('2d');
    if (previewChartInstance) previewChartInstance.destroy();
    
    const labels = q.options.map((o, i) => o || `Label ${i + 1}`);
    const values = q.values.map(v => v || 0);
    const correctIdx = q.correct || 0;
    const prefix = q.unitPrefix || '';
    const metric = q.metric || 'Value';
    
    let backgroundColors = [];
    let borderColors = [];
    
    for (let i = 0; i < 4; i++) {
        if (i === correctIdx) {
            backgroundColors.push('rgba(16, 185, 129, 0.7)');
            borderColors.push('rgba(16, 185, 129, 1)');
        } else {
            backgroundColors.push('rgba(59, 130, 246, 0.4)');
            borderColors.push('rgba(59, 130, 246, 0.8)');
        }
    }
    
    let config = {
        type: q.chartType === 'pie' ? 'doughnut' : q.chartType,
        data: {
            labels: labels,
            datasets: [{
                label: metric,
                data: values,
                backgroundColor: q.chartType === 'pie' ? ['rgba(239, 68, 68, 0.7)', 'rgba(59, 130, 246, 0.7)', 'rgba(245, 158, 11, 0.7)', 'rgba(16, 185, 129, 0.7)'] : backgroundColors,
                borderColor: q.chartType === 'pie' ? ['#ef4444', '#3b82f6', '#f59e0b', '#10b981'] : borderColors,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: q.chartType === 'pie', labels: { color: 'white' } },
                tooltip: {
                    callbacks: {
                        label: function(context) { return ` ${metric}: ${prefix}${context.parsed.y !== undefined ? context.parsed.y : context.parsed}`; }
                    }
                },
                datalabels: { color: '#fff', font: { weight: 'bold', size: 12 }, formatter: (value) => prefix + value }
            },
            scales: q.chartType === 'pie' ? {} : {
                x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'white' } },
                y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'white' } }
            }
        }
    };
    
    previewChartInstance = new Chart(ctx, config);
};

window.removeMakerImage = (idx) => {
    makerQuestions[idx].imageUrl = null;
    renderMakerQuestions();
};

window.uploadMakerImage = async (idx, inputEl) => {
    const file = inputEl.files[0];
    if (!file) return;

    const statusEl = document.getElementById(`maker-img-status-${idx}`);
    if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.color = 'var(--color-primary)';
        statusEl.innerText = '⏳ Processing image...';
    }
    inputEl.disabled = true;

    try {
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_DIM = 600;
                    let w = img.width, h = img.height;
                    if (w > MAX_DIM || h > MAX_DIM) {
                        if (w > h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM; }
                        else { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; }
                    }
                    canvas.width = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', 0.6));
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });

        makerQuestions[idx].imageUrl = dataUrl;
        renderMakerQuestions();
    } catch (err) {
        alert('Image processing failed: ' + err.message);
        if (statusEl) {
            statusEl.style.color = 'var(--color-red)';
            statusEl.innerText = '❌ Failed — try a smaller image';
        }
        inputEl.disabled = false;
    }
};

window.startCustomQuiz = (key) => {
    const isMixed = document.getElementById('toggle-mixed-mode')?.checked;
    const baseQuestions = customQuizzes[key].questions;
    
    const processedBaseQuestions = baseQuestions.map(q => {
        if (q.type === 'dashboard') {
            return {
                text: q.text,
                correctIndex: q.correct,
                timeLimit: q.timeLimit,
                dashboardData: {
                    scenarioTitle: "Custom Dashboard",
                    question: q.text,
                    metric: q.metric || "Value",
                    unit: q.unitPrefix || "",
                    unitSuffix: "",
                    chartType: q.chartType || "bar",
                    labels: q.options.map(opt => opt || " "),
                    values: q.values.map(v => parseInt(v) || 0),
                    correctIndex: q.correct,
                    timeLimit: q.timeLimit
                }
            };
        }
        return q;
    });

    if (isMixed) {
        currentGameMode = 'mixed';
        const difficulty = document.getElementById('dash-difficulty')?.value || 'normal';
        const dashRounds = generateDashboardGame(processedBaseQuestions.length, difficulty);
        
        questions = [];
        for (let i = 0; i < processedBaseQuestions.length; i++) {
            questions.push(processedBaseQuestions[i]);
            const r = dashRounds[i];
            questions.push({ text: r.question, correctIndex: r.correctIndex, timeLimit: r.timeLimit, dashboardData: serializeRound(r) });
        }
    } else {
        currentGameMode = 'classic';
        questions = processedBaseQuestions;
    }
    
    currentHostedQuizTitle = customQuizzes[key].title + (isMixed ? ' (Mixed)' : '');
    setupGameLobby();
};

async function setupGameLobby() {
    if (!isFirebaseEnabled) return alert("Firebase is not connected.");
    
    isHost = true;
    if (!IS_SIMULATOR_CLIENT) sessionStorage.removeItem('dashboard_wars_player_session');
    let sessionRef;
    for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = generatePin();
        const candidateRef = ref(database, `sessions/${candidate}`);
        const reservation = await runTransaction(candidateRef, current => current === null ? {
            state: 'lobby',
            mode: currentGameMode,
            teamMode: false,
            teamCount: 4,
            teamLabelMode: 'groups',
            currentQuestionIndex: 0,
            questions,
            questionStartTime: 0,
            answersCount: { 0: 0, 1: 0, 2: 0, 3: 0 },
            totalAnswers: 0,
            createdAt: Date.now()
        } : undefined);
        if (reservation.committed) {
            currentGamePin = candidate;
            sessionRef = candidateRef;
            break;
        }
    }
    if (!sessionRef) return alert('Could not reserve a game PIN. Please try again.');
    sessionStorage.setItem('dashboard_wars_host_session', JSON.stringify({
        pin: currentGamePin,
        title: currentHostedQuizTitle,
        questions,
        mode: currentGameMode
    }));

    if (currentGameMode === 'dashboard') {
        document.getElementById('lobby-mode-badge')?.classList.remove('hidden');
    } else {
        document.getElementById('lobby-mode-badge')?.classList.add('hidden');
    }

    document.getElementById('display-game-pin').innerText = currentGamePin;
    document.getElementById('display-join-url').innerHTML = `Join at <strong>${window.location.host}</strong> with PIN:`;
    
    const qrContainer = document.getElementById('qr-code-container');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: window.location.href.split('?')[0] + "?pin=" + currentGamePin,
        width: 150, height: 150,
        colorDark : "#1A1A24", colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    switchView('view-host-lobby');

    onChildAdded(ref(database, `sessions/${currentGamePin}/reactions`), (snapshot) => {
        const data = snapshot.val();
        if (data && data.emoji) spawnFloatingEmoji(data.emoji);
    });

    onChildAdded(ref(database, `sessions/${currentGamePin}/chat`), (snapshot) => {
        const msg = snapshot.val();
        if (msg) spawnSmackTalk(msg.text, msg.name);
    });

    onValue(ref(database, `sessions/${currentGamePin}/hype`), (snapshot) => {
        const h = snapshot.val() || 0;
        const target = Math.max(10, Object.keys(lobbyPlayers || {}).length * 15);
        const pct = Math.min(100, (h / target) * 100);
        
        const bar = document.getElementById('host-hype-bar');
        const txt = document.getElementById('host-hype-text');
        if (bar) bar.style.width = pct + '%';
        
        if (h >= target && h > 0) {
            if (txt) txt.innerText = "DOUBLE POINTS UNLOCKED!";
            if (bar) bar.style.background = 'linear-gradient(90deg, #ffd700, #ff8c00)';
            update(ref(database, `sessions/${currentGamePin}`), { nextDoublePoints: true });
        } else {
            if (txt) txt.innerText = "Mash HYPE to unlock Double Points!";
            if (bar) bar.style.background = 'linear-gradient(90deg, #ff416c, #ff4b2b)';
        }
    });

    onChildAdded(ref(database, `sessions/${currentGamePin}/attacks`), (snapshot) => {
        const attack = snapshot.val();
        if (attack) {
            const toastContainer = document.getElementById('host-attacks-container');
            if (toastContainer) {
                const toast = document.createElement('div');
                toast.className = 'host-attack-toast fade-in-up';
                
                let icon = '⚡';
                if (attack.type === 'blur') icon = '🌫️';
                else if (attack.type === 'shuffle') icon = '🔀';
                else if (attack.type === 'glitch') icon = '📺';
                else if (attack.type === 'emoji_flood') icon = '🎈';
                else if (attack.type === 'steal') icon = '💰';
                else if (attack.type === 'freeze') icon = '⏳';
                else if (attack.type === 'redacted') icon = '🕵️';
                
                toast.innerHTML = `
                    <div style="font-size: 1.25rem; margin-right: 0.5rem;">${icon}</div>
                    <div>
                        <strong style="color: var(--color-primary);">${attack.attackerName}</strong> 
                        used <strong>${attack.type.toUpperCase().replace('_', ' ')}</strong> 
                        on <strong style="color: var(--color-green);">${attack.targetName}</strong>!
                    </div>
                    <button type="button" aria-label="Clear notification">Clear</button>
                `;
                toastContainer.appendChild(toast);
                toast.querySelector('button')?.addEventListener('click', () => toast.remove());
            }
        }
    });

    let lobbyPlayers = {};
    const renderHostLobbyPlayers = () => {
        const playerKeys = Object.keys(lobbyPlayers);
        document.getElementById('player-count').innerText = playerKeys.length;
        const listEl = document.getElementById('player-list');
        if (!listEl) return;
        listEl.innerHTML = '';
        
        playerKeys.forEach(key => {
            const el = document.createElement('div');
            const teamKey = teamModeEnabled ? (lobbyPlayers[key].team || '') : '';
            el.className = `player-tag ${teamKey ? 'team-' + teamKey : ''}`;
            const teamEmoji = teamKey ? formatTeamShort(teamKey) + ' ' : '';
            el.innerHTML = `
                <span>${teamEmoji}${lobbyPlayers[key].name}</span>
                <button class="btn-kick" onclick="window.kickPlayer('${key}')">×</button>
            `;
            listEl.appendChild(el);
        });

        const startBtn = document.getElementById('btn-start-game');
        if (startBtn) startBtn.disabled = playerKeys.length === 0;
    };

    onValue(ref(database, `sessions/${currentGamePin}/players`), (snapshot) => {
        lobbyPlayers = snapshot.val() || {};
        renderHostLobbyPlayers();
    });

    document.getElementById('toggle-team-mode').checked = false;
    document.getElementById('select-team-count').classList.add('hidden');
    document.getElementById('select-team-labels').classList.add('hidden');
    document.getElementById('select-team-labels').value = 'groups';
    currentTeamLabelMode = 'groups';
    document.getElementById('toggle-team-mode').onchange = async (e) => {
        teamModeEnabled = e.target.checked;
        document.getElementById('select-team-count').classList.toggle('hidden', !teamModeEnabled);
        document.getElementById('select-team-assign').classList.toggle('hidden', !teamModeEnabled);
        document.getElementById('select-team-labels').classList.toggle('hidden', !teamModeEnabled);
        const assignMode = document.getElementById('select-team-assign').value;
        renderHostLobbyPlayers();
        await update(ref(database, `sessions/${currentGamePin}`), {
            teamMode: teamModeEnabled,
            teamCount: parseInt(document.getElementById('select-team-count').value),
            teamAssign: assignMode,
            teamLabelMode: currentTeamLabelMode
        });
        if (teamModeEnabled && assignMode === 'auto') reassignTeams();
    };

    document.getElementById('select-team-count').onchange = async (e) => {
        teamCount = parseInt(e.target.value);
        const assignMode = document.getElementById('select-team-assign').value;
        renderHostLobbyPlayers();
        await update(ref(database, `sessions/${currentGamePin}`), { teamCount });
        if (teamModeEnabled && assignMode === 'auto') reassignTeams();
    };

    document.getElementById('select-team-assign').onchange = async (e) => {
        const assignMode = e.target.value;
        renderHostLobbyPlayers();
        await update(ref(database, `sessions/${currentGamePin}`), { teamAssign: assignMode });
        if (assignMode === 'auto' && teamModeEnabled) reassignTeams();
    };

    document.getElementById('select-team-labels').onchange = async (e) => {
        currentTeamLabelMode = e.target.value;
        renderHostLobbyPlayers();
        await update(ref(database, `sessions/${currentGamePin}`), { teamLabelMode: currentTeamLabelMode });
    };

    onValue(ref(database, `sessions/${currentGamePin}/totalAnswers`), (snapshot) => {
        const total = snapshot.val() || 0;
        document.getElementById('answers-count').innerText = `${total} Answers`;
        if (document.getElementById('dash-answers-count')) document.getElementById('dash-answers-count').innerText = `${total} Answers`;
        
        get(ref(database, `sessions/${currentGamePin}/players`)).then(snap => {
            const players = snap.val() || {};
            const playerCount = Object.values(players).filter(player => player.online !== false).length;
            if (playerCount > 0 && total >= playerCount && currentGameState === 'question') {
                const q = questions[currentQuestionIndex];
                if (q && q.dashboardData) {
                    endDashboardQuestion();
                } else {
                    endQuestion();
                }
            }
        });
    });
}

window.kickPlayer = async (playerId) => {
    await remove(ref(database, `sessions/${currentGamePin}/players/${playerId}`));
};

function startQuestion(index, recoverySession = null) {
    clearSabotageEffectsForNextQuestion();
    currentQuestionIndex = index;
    const q = questions[index];
    timeRemaining = recoverySession
        ? Math.max(0, (q.timeLimit || 20) - Math.floor((Date.now() - (recoverySession.questionStartTime || Date.now())) / 1000))
        : q.timeLimit;
    currentGameState = 'question';
    
    if (!recoverySession) {
    update(ref(database, `sessions/${currentGamePin}`), {
        state: 'question',
        currentQuestionIndex: index,
        questionStartTime: Date.now(),
        answersCount: { 0: 0, 1: 0, 2: 0, 3: 0 },
        totalAnswers: 0,
        isPaused: false,
        resultAnswer: null,
        answers: null
    });

    get(ref(database, `sessions/${currentGamePin}/queuedAttacks`)).then(async (snap) => {
        const queued = snap.val();
        if (queued) {
            const updates = {};
            Object.keys(queued).forEach(key => {
                const atk = queued[key];
                const newAtkRef = push(ref(database, `sessions/${currentGamePin}/attacks`));
                updates[`attacks/${newAtkRef.key}`] = { ...atk, timestamp: Date.now() };
            });
            await update(ref(database, `sessions/${currentGamePin}`), updates);
            await remove(ref(database, `sessions/${currentGamePin}/queuedAttacks`));
        }
    });

    document.getElementById('btn-pause-timer').classList.remove('hidden');
    document.getElementById('btn-resume-timer').classList.add('hidden');

    get(ref(database, `sessions/${currentGamePin}/players`)).then(snapshot => {
        const players = snapshot.val() || {};
        const updates = {};
        const sortedKeys = Object.keys(players).sort((a, b) => (players[b].score || 0) - (players[a].score || 0));
        sortedKeys.forEach((key, idx) => {
            updates[`players/${key}/previousRank`] = idx + 1;
            updates[`players/${key}/hasAnswered`] = false;
            updates[`players/${key}/answeredQuestionIndex`] = -1;
            updates[`players/${key}/lastAnswerCorrect`] = false;
            updates[`players/${key}/lastPointsEarned`] = 0;
        });
        update(ref(database, `sessions/${currentGamePin}`), updates);
    });
    }

    document.getElementById('host-question-number').innerText = `Question ${index + 1} of ${questions.length}`;
    document.getElementById('host-question-text').innerText = q.text || q.dashboardData?.question || 'Loading question...';
    const type = normalizeQuestionType(q);
    let hostChoices = q.options || [];
    if (type === 'jumbled-prompt') hostChoices = q.words || [];
    else if (type === 'type-answer') hostChoices = ['Players type the exact answer on their phone'];
    else if (type === 'number-guess') hostChoices = [`Players choose a number from ${q.min ?? 0} to ${q.max ?? 100}`];
    else if (type === 'speed-math') hostChoices = ['Players enter all required code or prompt elements'];
    document.querySelectorAll('#view-host-question .host-answer-card').forEach((card, i) => {
        card.classList.toggle('hidden', hostChoices[i] === undefined);
    });
    for (let i = 0; i < 4; i++) {
        const label = document.getElementById(`host-ans-${i}`);
        if (label) label.innerText = hostChoices[i] || '';
    }
    document.getElementById('host-timer').innerText = timeRemaining;
    document.getElementById('answers-count').innerText = `${recoverySession?.totalAnswers || 0} Answers`;
    
    if (q.isDoublePoints) {
        document.getElementById('host-question-header').style.background = 'linear-gradient(90deg, rgba(255,230,0,0.2) 0%, rgba(255,230,0,0.05) 100%)';
        document.getElementById('host-question-header').style.borderLeft = '4px solid var(--color-primary)';
        document.getElementById('host-timer').style.background = 'linear-gradient(45deg, #FFD700, #FFA500)';
        const sfxPower = document.getElementById('sfx-powerup');
        if(sfxPower) { sfxPower.currentTime = 0; sfxPower.play().catch(()=>{}); }
    } else {
        document.getElementById('host-question-header').style.background = 'var(--glass-bg)';
        document.getElementById('host-question-header').style.borderLeft = 'none';
        document.getElementById('host-timer').style.background = 'var(--color-primary)';
    }

    const imgContainer = document.getElementById('host-question-image-container');
    const imgEl = document.getElementById('host-question-image');
    if (q.imageUrl) {
        imgEl.src = q.imageUrl;
        imgContainer.classList.remove('hidden');
    } else {
        imgEl.src = '';
        imgContainer.classList.add('hidden');
    }

    switchView('view-host-question');

    clearInterval(hostTimerInterval);
    hostTimerInterval = setInterval(() => {
        timeRemaining--;
        document.getElementById('host-timer').innerText = timeRemaining;
        
        if (timeRemaining <= 5 && timeRemaining > 0) {
            document.getElementById('host-timer').classList.add('timer-warning');
            const sfxTick = document.getElementById('sfx-tick');
            if(sfxTick) { sfxTick.currentTime = 0; sfxTick.play().catch(()=>{}); }
        } else {
            document.getElementById('host-timer').classList.remove('timer-warning');
        }

        if (timeRemaining <= 0) endQuestion();
    }, 1000);
}

async function endQuestion() {
    if (questionConclusionInProgress || currentGameState !== 'question') return;
    questionConclusionInProgress = true;
    try {
        clearInterval(hostTimerInterval);
        currentGameState = 'results';
        const q = questions[currentQuestionIndex];
        await update(ref(database, `sessions/${currentGamePin}`), {
            state: 'results',
            resultAnswer: getCorrectAnswerText(q),
            resultQuestionType: normalizeQuestionType(q)
        });
        const sfxDing = document.getElementById('sfx-ding');
        if(sfxDing) { sfxDing.currentTime = 0; sfxDing.play().catch(()=>{}); }
        showHostResults();
    } finally {
        questionConclusionInProgress = false;
    }
}

function showHostResults() {
    switchView('view-host-results');
    const q = questions[currentQuestionIndex];
    const answerReveal = document.getElementById('host-correct-answer');
    const answerText = document.getElementById('host-correct-answer-text');
    if (answerReveal && answerText) {
        answerText.textContent = getCorrectAnswerText(q);
        answerReveal.classList.toggle('hidden', normalizeQuestionType(q) === 'poll');
    }
    document.getElementById('host-results-chart')?.classList.toggle(
        'hidden',
        !['multiple-choice', 'true-false', 'poll'].includes(normalizeQuestionType(q))
    );
    get(ref(database, `sessions/${currentGamePin}`)).then(snapshot => {
        const data = snapshot.val();
        const correctIdx = q.correct;
        const counts = data.answersCount || { 0: 0, 1: 0, 2: 0, 3: 0 };
        
        let maxCount = Math.max(counts[0], counts[1], counts[2], counts[3], 1);
        
        for (let i = 0; i < 4; i++) {
            document.getElementById(`bar-${i}`).style.height = '0%';
            document.getElementById(`count-${i}`).innerText = '0';
            document.getElementById(`pillar-container-${i}`).className = `pillar-container pillar-${['red','blue','yellow','green'][i]}`;
        }
        
        for (let i = 0; i < 4; i++) {
            const targetHeight = (counts[i] / maxCount) * 100;
            const targetCount = counts[i];
            
            setTimeout(() => {
                document.getElementById(`bar-${i}`).style.height = `${targetHeight}%`;
                
                let curr = 0;
                const counter = setInterval(() => {
                    if (curr >= targetCount) {
                        clearInterval(counter);
                        document.getElementById(`count-${i}`).innerText = targetCount;
                        if (i === 3) {
                            for (let j = 0; j < 4; j++) {
                                if (j !== correctIdx) document.getElementById(`pillar-container-${j}`).classList.add('dimmed');
                                else document.getElementById(`pillar-container-${j}`).classList.add('winner');
                            }
                        }
                    } else {
                        curr += Math.max(1, Math.floor(targetCount / 10));
                        document.getElementById(`count-${i}`).innerText = Math.min(curr, targetCount);
                    }
                }, 50);
            }, 500 + (i * 200));
        }
    });
}

function showHostLeaderboard() {
    switchView('view-host-leaderboard');
    if (currentQuestionIndex + 1 >= questions.length && currentGameState !== 'game_over') {
        document.getElementById('btn-next-question').innerText = "End Game";
    } else if (currentGameState === 'game_over') {
        document.getElementById('btn-next-question').innerText = "Game Ended";
    }

    // Clean up any stale special events from previous rounds
    update(ref(database, `sessions/${currentGamePin}`), { activeEvent: null }).catch(() => {});
    window.bossBattleEnding = false;
    window.mysteryBoxEnding = false;
    window.bossDefeatedRewarded = false;
    if (window.bossInterval) { clearInterval(window.bossInterval); window.bossInterval = null; }
    
    renderHostLeaderboardContent();

    // Host-side listener for activeEvent (Boss Battle / Mystery Box)
    if (window.hostEventUnsub) window.hostEventUnsub();
    window.hostEventUnsub = onValue(ref(database, `sessions/${currentGamePin}`), (snapshot) => {
        const d = snapshot.val();
        if (!d) return;
        const hostMysteryOverlay = document.getElementById('host-mystery-box-overlay');
        const hostBossOverlay = document.getElementById('host-boss-battle-overlay');
        if (hostMysteryOverlay) hostMysteryOverlay.classList.add('hidden');
        if (hostBossOverlay) hostBossOverlay.classList.add('hidden');

        if (d.activeEvent === 'mystery_box') {
            if (hostMysteryOverlay) {
                hostMysteryOverlay.classList.remove('hidden');
                const res = document.getElementById('mystery-box-result');
                if (d.mysteryBoxWinner) {
                    const wName = d.players?.[d.mysteryBoxWinner]?.name || 'Someone';
                    res.innerHTML = `🎉 ${wName} won the Mystery Box!`;
                    res.classList.remove('hidden');
                    if (!window.mysteryBoxEnding) {
                        window.mysteryBoxEnding = true;
                        setTimeout(() => {
                            update(ref(database, `sessions/${currentGamePin}`), { activeEvent: null });
                            window.mysteryBoxEnding = false;
                            renderHostLeaderboardContent();
                        }, 4000);
                    }
                } else {
                    res.classList.add('hidden');
                }
            }
        } else if (d.activeEvent === 'boss_battle') {
            if (hostBossOverlay) {
                hostBossOverlay.classList.remove('hidden');
                const hp = d.bossHp ?? 1000;
                const maxHp = d.bossMaxHp || 1000;
                document.getElementById('host-boss-hp-bar').style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
                document.getElementById('host-boss-hp-text').innerText = `${hp} / ${maxHp} HP`;

                if (!window.bossInterval) {
                    window.bossInterval = setInterval(() => {
                        const elapsed = Math.floor((Date.now() - (d.eventStartTime || Date.now())) / 1000);
                        const left = Math.max(0, 15 - elapsed);
                        const timeEl = document.getElementById('host-boss-time-left');
                        if (timeEl) timeEl.innerText = `Time left: ${left}s`;
                        if (left <= 0 && !window.bossBattleEnding) {
                            window.bossBattleEnding = true;
                            clearInterval(window.bossInterval); window.bossInterval = null;
                            const bossRes = document.getElementById('host-boss-result');
                            if (bossRes) { bossRes.innerHTML = `💀 DEFEAT! Time's Up!`; bossRes.style.color = '#f87171'; bossRes.classList.remove('hidden'); }
                            setTimeout(() => {
                                update(ref(database, `sessions/${currentGamePin}`), { activeEvent: null });
                                window.bossBattleEnding = false;
                                renderHostLeaderboardContent();
                            }, 5000);
                        }
                    }, 500);
                }

                const bossRes = document.getElementById('host-boss-result');
                if (hp <= 0) {
                    if (window.bossInterval) { clearInterval(window.bossInterval); window.bossInterval = null; }
                    bossRes.innerHTML = `✨ VICTORY! Boss Defeated!`;
                    bossRes.style.color = '#4ade80';
                    bossRes.classList.remove('hidden');
                    if (!window.bossDefeatedRewarded) {
                        window.bossDefeatedRewarded = true;
                        get(ref(database, `sessions/${currentGamePin}/players`)).then(pSnap => {
                            if (pSnap.exists()) {
                                const players = pSnap.val();
                                const updates = {};
                                Object.keys(players).forEach(pId => {
                                    updates[`players/${pId}/score`] = (players[pId].score || 0) + 1500;
                                });
                                update(ref(database, `sessions/${currentGamePin}`), updates);
                            }
                        });
                    }
                    if (!window.bossBattleEnding) {
                        window.bossBattleEnding = true;
                        setTimeout(() => {
                            update(ref(database, `sessions/${currentGamePin}`), { activeEvent: null });
                            window.bossBattleEnding = false; window.bossDefeatedRewarded = false;
                            renderHostLeaderboardContent();
                        }, 5000);
                    }
                } else {
                    bossRes.classList.add('hidden');
                }
            }
        }
    });
}

function renderHostLeaderboardContent() {
    get(ref(database, `sessions/${currentGamePin}/players`)).then(snapshot => {
        const playersObj = snapshot.val() || {};
        const allPlayers = Object.entries(playersObj).map(([id, p]) => ({ id, ...p })).sort((a, b) => b.score - a.score);
        const players = allPlayers.slice(0, 5);
        
        const listEl = document.getElementById('leaderboard-list');
        listEl.innerHTML = '';
        
        if (players.length === 0) return;

        const podiumContainer = document.createElement('div');
        podiumContainer.className = 'podium-container';
        
        const podiumOrder = [
            { rank: 2, p: players[1] },
            { rank: 1, p: players[0] },
            { rank: 3, p: players[2] }
        ];

        podiumOrder.forEach(item => {
            if (item.p) {
                const initial = item.p.name.charAt(0).toUpperCase();
                const crown = item.rank === 1 ? '<div class="podium-crown">👑</div>' : '';
                
                let shiftIndicator = '';
                if (currentQuestionIndex > 0) {
                    const prevRank = item.p.previousRank || 1;
                    const currRank = item.rank;
                    if (currRank < prevRank) {
                        shiftIndicator = `<span class="rank-shift-up" style="font-size: 0.8rem; margin-left: 0.3rem;">▲</span>`;
                    } else if (currRank > prevRank) {
                        shiftIndicator = `<span class="rank-shift-down" style="font-size: 0.8rem; margin-left: 0.3rem;">▼</span>`;
                    } else {
                        shiftIndicator = `<span class="rank-shift-same" style="font-size: 0.8rem; margin-left: 0.3rem;">—</span>`;
                    }
                }
                
                let teamEmoji = '';
                if (teamModeEnabled && item.p.team) {
                    teamEmoji = `<span style="font-size: 0.72em; margin-right: 4px;">${formatTeamShort(item.p.team)}</span>`;
                }
                
                const podiumEl = document.createElement('div');
                podiumEl.className = `podium-place rank-${item.rank}`;
                podiumEl.innerHTML = `
                    ${crown}
                    <div class="podium-avatar">${initial}</div>
                    <div class="podium-name" style="display:flex; align-items:center; justify-content:center; gap:0.3rem;">
                        <span class="leaderboard-player-name" title="${item.p.name}">${teamEmoji}${item.p.name}${shiftIndicator}</span>
                        <span class="admin-gear" data-id="${item.p.id}" data-name="${item.p.name}" title="Override ${item.p.name}" style="cursor:pointer;">⚙️</span>
                    </div>
                    <div class="podium-score">${item.p.score}</div>
                    <div class="podium-block">${item.rank}</div>
                `;
                podiumContainer.appendChild(podiumEl);
            }
        });
        
        listEl.appendChild(podiumContainer);

        for (let i = 3; i < allPlayers.length; i++) {
            const p = allPlayers[i];
            let shiftIndicator = '';
            if (currentQuestionIndex > 0) {
                const prevRank = p.previousRank || 1;
                const currRank = i + 1;
                if (currRank < prevRank) shiftIndicator = `<span class="rank-shift-up" style="font-size: 0.8rem; margin-left: 0.3rem;">▲</span>`;
                else if (currRank > prevRank) shiftIndicator = `<span class="rank-shift-down" style="font-size: 0.8rem; margin-left: 0.3rem;">▼</span>`;
                else shiftIndicator = `<span class="rank-shift-same" style="font-size: 0.8rem; margin-left: 0.3rem;">—</span>`;
            }
            let teamEmoji = '';
            if (teamModeEnabled && p.team) {
                teamEmoji = `<span style="font-size: 0.72em; margin-right: 4px;">${formatTeamShort(p.team)}</span>`;
            }
            
            const el = document.createElement('div');
            el.className = 'leaderboard-row fade-in-up mt-2';
            el.style.animationDelay = `${(i-3) * 0.1}s`;
            el.style.borderLeft = '4px solid #475569';
            el.innerHTML = `
                <span class="leaderboard-player-main">
                    <span class="leaderboard-player-name" title="${p.name}">${i + 1}. ${teamEmoji}${p.name}${shiftIndicator}</span>
                    <span class="admin-gear" data-id="${p.id}" data-name="${p.name}" title="Override ${p.name}" style="cursor:pointer;">⚙️</span>
                </span>
                <span style="flex:0 0 auto;">${p.score} pts</span>`;
            listEl.appendChild(el);
        }

        listEl.querySelectorAll('.admin-gear').forEach(gear => {
            gear.addEventListener('click', (e) => {
                e.stopPropagation();
                openAdminModal(gear.getAttribute('data-id'), gear.getAttribute('data-name'));
            });
        });

        if (teamModeEnabled) {
            renderTeamScores(playersObj, document.getElementById('host-team-scores'), true);
        }

        setTimeout(() => {
            const sfxDing = document.getElementById('sfx-ding');
            if (sfxDing) { sfxDing.currentTime = 0; sfxDing.play().catch(()=>{}); }
            for (let i = 0; i < 30; i++) {
                setTimeout(() => spawnFloatingEmoji('🎉'), Math.random() * 1000);
            }
        }, 1500);
    });
}

function startDashboardQuestion(index, recoverySession = null) {
    clearSabotageEffectsForNextQuestion();
    currentQuestionIndex = index;
    const q = questions[index];
    const limit = q.timeLimit || q.dashboardData?.timeLimit || 30;
    timeRemaining = recoverySession
        ? Math.max(0, limit - Math.floor((Date.now() - (recoverySession.questionStartTime || Date.now())) / 1000))
        : limit;
    currentGameState = 'question';

    if (!recoverySession) {
    update(ref(database, `sessions/${currentGamePin}`), {
        state: 'question',
        currentQuestionIndex: index,
        questionStartTime: Date.now(),
        totalAnswers: 0,
        isPaused: false,
        resultAnswer: null,
        answers: null
    });

    get(ref(database, `sessions/${currentGamePin}/players`)).then(snapshot => {
        const players = snapshot.val() || {};
        const updates = {};
        const sortedKeys = Object.keys(players).sort((a, b) => (players[b].score || 0) - (players[a].score || 0));
        sortedKeys.forEach((key, idx) => {
            updates[`players/${key}/previousRank`] = idx + 1;
            updates[`players/${key}/hasAnswered`] = false;
            updates[`players/${key}/answeredQuestionIndex`] = -1;
            updates[`players/${key}/lastAnswerCorrect`] = false;
            updates[`players/${key}/lastPointsEarned`] = 0;
        });
        update(ref(database, `sessions/${currentGamePin}`), updates);
    });

    get(ref(database, `sessions/${currentGamePin}/queuedAttacks`)).then(async (snap) => {
        const queued = snap.val();
        if (queued) {
            const updates = {};
            Object.keys(queued).forEach(key => {
                const atk = queued[key];
                const newAtkRef = push(ref(database, `sessions/${currentGamePin}/attacks`));
                updates[`attacks/${newAtkRef.key}`] = { ...atk, timestamp: Date.now() };
            });
            await update(ref(database, `sessions/${currentGamePin}`), updates);
            await remove(ref(database, `sessions/${currentGamePin}/queuedAttacks`));
        }
    });
    }

    const countEl = document.getElementById('host-dash-round-count');
    if (countEl) countEl.innerText = `📊 Question ${index + 1} of ${questions.length} (${currentGameMode === 'tutorial' ? 'Practice Arena' : 'Dashboard Challenge'})`;
    document.getElementById('host-dash-question').innerText = q.text || q.dashboardData?.question || '';
    document.getElementById('host-dash-timer').innerText = timeRemaining;
    document.getElementById('dash-answers-count').innerText = `${recoverySession?.totalAnswers || 0} Answers`;
    document.getElementById('btn-dash-pause').classList.remove('hidden');
    document.getElementById('btn-dash-resume').classList.add('hidden');

    if (q.dashboardData) renderHostChart(q.dashboardData);
    switchView('view-host-dashboard');

    clearInterval(hostTimerInterval);
    hostTimerInterval = setInterval(() => {
        timeRemaining--;
        document.getElementById('host-dash-timer').innerText = timeRemaining;
        if (timeRemaining <= 5 && timeRemaining > 0) {
            document.getElementById('host-dash-timer').classList.add('timer-warning');
            const sfxTick = document.getElementById('sfx-tick');
            if(sfxTick) { sfxTick.currentTime = 0; sfxTick.play().catch(()=>{}); }
        } else {
            document.getElementById('host-dash-timer').classList.remove('timer-warning');
        }
        if (timeRemaining <= 0) endDashboardQuestion();
    }, 1000);
}

async function endDashboardQuestion() {
    if (questionConclusionInProgress || currentGameState !== 'question') return;
    questionConclusionInProgress = true;
    try {
        clearInterval(hostTimerInterval);
        currentGameState = 'results';
        const q = questions[currentQuestionIndex];
        await update(ref(database, `sessions/${currentGamePin}`), {
            state: 'results',
            resultAnswer: getCorrectAnswerText(q),
            resultQuestionType: 'dashboard'
        });
        const sfxDing = document.getElementById('sfx-ding');
        if (sfxDing) { sfxDing.currentTime = 0; sfxDing.play().catch(() => {}); }
        showDashboardResults();
    } finally {
        questionConclusionInProgress = false;
    }
}

function showDashboardResults() {
    switchView('view-host-dash-results');
    const currentQ = questions[currentQuestionIndex];
    const answerReveal = document.getElementById('host-dash-correct-answer');
    const answerText = document.getElementById('host-dash-correct-answer-text');
    if (answerReveal && answerText) {
        answerText.textContent = getCorrectAnswerText(currentQ);
        answerReveal.classList.remove('hidden');
    }
    get(ref(database, `sessions/${currentGamePin}`)).then(snapshot => {
        const data = snapshot.val();
        const playersObj = data.players || {};
        const allPlayers = Object.values(playersObj);
        const correctCount = allPlayers.filter(p => p.lastAnswerCorrect).length;
        const incorrectCount = allPlayers.filter(p => p.hasAnswered && !p.lastAnswerCorrect).length;
        document.getElementById('dash-correct-count').innerText = correctCount;
        document.getElementById('dash-incorrect-count').innerText = incorrectCount;

        const q = currentQ;
        if (q.dashboardData) {
            if (q.dashboardData.chartType === 'kpi') {
                document.getElementById('host-result-chart-canvas').style.display = 'none';
                let resKpi = document.getElementById('host-result-kpi-container');
                if (!resKpi) {
                    resKpi = document.createElement('div');
                    resKpi.id = 'host-result-kpi-container';
                    resKpi.className = 'kpi-grid';
                    document.getElementById('host-result-chart-canvas').parentNode.appendChild(resKpi);
                }
                resKpi.style.display = 'grid';
                resKpi.innerHTML = '';
                
                const correctIdx = q.dashboardData.correctIndex;
                q.dashboardData.labels.forEach((lbl, idx) => {
                    const card = document.createElement('div');
                    card.className = 'kpi-card';
                    if (idx === correctIdx) {
                        card.style.borderColor = '#22c55e';
                        card.style.background = 'rgba(34, 197, 94, 0.1)';
                    } else {
                        card.style.opacity = '0.4';
                    }
                    card.innerHTML = `
                        <div class="kpi-value">${q.dashboardData.unit}${q.dashboardData.values[idx]}${q.dashboardData.unitSuffix}</div>
                        <div class="kpi-label">${lbl}</div>
                    `;
                    resKpi.appendChild(card);
                });
            } else {
                const resKpi = document.getElementById('host-result-kpi-container');
                if (resKpi) resKpi.style.display = 'none';
                document.getElementById('host-result-chart-canvas').style.display = 'block';

                const config = deserializeToChartConfig(q.dashboardData);
                const correctIdx = q.dashboardData.correctIndex;
                if (config && config.data.datasets[0].backgroundColor) {
                    const bg = [...config.data.datasets[0].backgroundColor];
                    
                    let origBorder = config.data.datasets[0].borderColor;
                    const border = Array.isArray(origBorder) ? [...origBorder] : bg.map(() => origBorder || '#fff');
                    
                    for (let i = 0; i < bg.length; i++) {
                        if (i !== correctIdx) { 
                            bg[i] = bg[i].includes('0.85') ? bg[i].replace('0.85', '0.2') : bg[i].replace('0.6', '0.2'); 
                        }
                        else { border[i] = '#22c55e'; }
                    }
                    config.data.datasets[0].backgroundColor = bg;
                    config.data.datasets[0].borderColor = border;
                    config.data.datasets[0].borderWidth = bg.map((_, i) => i === correctIdx ? 4 : 1);
                }
                if (config) {
                    config.options.plugins.title.text += ' — ✅ ' + (q.dashboardData.labels[correctIdx] || '');
                    if (resultChartInstance) resultChartInstance.destroy();
                    resultChartInstance = new Chart(document.getElementById('host-result-chart-canvas'), config);
                }
            }
        }
    });
}

function renderHostChart(dashData) {
    if (dashData.chartType === 'kpi') {
        document.getElementById('host-chart-canvas').style.display = 'none';
        const kpiContainer = document.getElementById('host-kpi-container');
        kpiContainer.classList.remove('hidden');
        kpiContainer.innerHTML = '';
        
        dashData.labels.forEach((lbl, idx) => {
            const card = document.createElement('div');
            card.className = 'kpi-card';
            card.innerHTML = `
                <div class="kpi-value">${dashData.unit}${dashData.values[idx]}${dashData.unitSuffix}</div>
                <div class="kpi-label">${lbl}</div>
            `;
            kpiContainer.appendChild(card);
        });
    } else {
        document.getElementById('host-chart-canvas').style.display = 'block';
        document.getElementById('host-kpi-container').classList.add('hidden');
        const config = deserializeToChartConfig(dashData);
        if (hostChartInstance) hostChartInstance.destroy();
        hostChartInstance = new Chart(document.getElementById('host-chart-canvas'), config);
    }
}

function renderPlayerChart(dashData, questionStartTime, timeLimit) {
    const handleAnswer = async (clickedIndex) => {
        if (!currentGamePin || hasAnsweredThisRound || currentGameState !== 'question') return;
        const isCorrect = clickedIndex === dashData.correctIndex;
        hasAnsweredThisRound = true;

        document.getElementById('player-dash-locked').classList.remove('hidden');
        clearInterval(playerDashTimerInterval);

        const sessionRef = ref(database, `sessions/${currentGamePin}`);
        const snap = await get(sessionRef);
        const d = snap.val();
        if (!d || !d.players || !d.players[myPlayerId]) return;
        if (d.state !== 'question' || d.currentQuestionIndex !== currentQuestionIndex) {
            hasAnsweredThisRound = false;
            return showToast("That question has already closed.");
        }
        const pData = d.players[myPlayerId];
        if (pData.answeredQuestionIndex === currentQuestionIndex) return;

        const timeElapsed = (Date.now() - questionStartTime) / 1000;
        const q = questions[currentQuestionIndex];
        
        let points = 0;
        let newStreak = pData.streak || 0;
        let isStreakMultiplierActive = false;
        
        let receiptBase = 0;
        let receiptSpeed = 0;
        let receiptStreak = 0;
        let receiptDouble = q?.isDoublePoints || false;

        if (isCorrect) {
            receiptBase = 500;
            receiptSpeed = Math.floor(Math.max(0, 500 * (1 - (timeElapsed / timeLimit))));
            
            newStreak += 1;
            if (newStreak >= 3) {
                receiptStreak = Math.floor((receiptBase + receiptSpeed) * 0.2);
                isStreakMultiplierActive = true;
            }
            
            points = receiptBase + receiptSpeed + receiptStreak;
            if (receiptDouble) points *= 2;
            if (pData.speedBoostActive) points = Math.floor(points * 1.5);
        } else {
            newStreak = 0;
        }

        const awardedInventory = awardRandomPowerupIfDeserving(isCorrect, newStreak, timeElapsed, pData.inventory || []);

        const playerUpdates = {};
        playerUpdates[`players/${myPlayerId}/hasAnswered`] = true;
        playerUpdates[`players/${myPlayerId}/answeredQuestionIndex`] = currentQuestionIndex;
        playerUpdates[`players/${myPlayerId}/lastAnswerCorrect`] = isCorrect;
        playerUpdates[`players/${myPlayerId}/lastPointsEarned`] = points;
        playerUpdates[`players/${myPlayerId}/score`] = pData.score + points;
        playerUpdates[`players/${myPlayerId}/streak`] = newStreak;
        playerUpdates[`players/${myPlayerId}/isStreakMultiplierActive`] = isStreakMultiplierActive;
        playerUpdates[`players/${myPlayerId}/inventory`] = awardedInventory;
        if (pData.speedBoostActive) playerUpdates[`players/${myPlayerId}/speedBoostActive`] = false;
        
        playerUpdates[`players/${myPlayerId}/receiptBase`] = receiptBase;
        playerUpdates[`players/${myPlayerId}/receiptSpeed`] = receiptSpeed;
        playerUpdates[`players/${myPlayerId}/receiptStreak`] = receiptStreak;
        playerUpdates[`players/${myPlayerId}/receiptDouble`] = receiptDouble;

        playerUpdates[`answersCount/${clickedIndex}`] = increment(1);
        playerUpdates[`totalAnswers`] = increment(1);
        playerUpdates[`answers/${myPlayerId}`] = { questionIndex: currentQuestionIndex, optionIndex: clickedIndex, elapsedTime: Math.round(timeElapsed * 1000) };

        await update(sessionRef, playerUpdates);
    };

    if (dashData.chartType === 'kpi') {
        document.getElementById('player-chart-canvas').style.display = 'none';
        const kpiContainer = document.getElementById('player-kpi-container');
        kpiContainer.classList.remove('hidden');
        kpiContainer.innerHTML = '';
        
        dashData.labels.forEach((lbl, idx) => {
            const card = document.createElement('div');
            card.className = 'kpi-card';
            card.innerHTML = `
                <div class="kpi-value">${dashData.unit}${dashData.values[idx]}${dashData.unitSuffix}</div>
                <div class="kpi-label">${lbl}</div>
            `;
            card.onclick = () => handleAnswer(idx);
            kpiContainer.appendChild(card);
        });
    } else {
        document.getElementById('player-chart-canvas').style.display = 'block';
        document.getElementById('player-kpi-container').classList.add('hidden');
        
        const config = deserializeToChartConfig(dashData);
        if (!config) return;
        
        if (config.type === 'line' && config.data.datasets[0]) {
            config.data.datasets[0].pointRadius = 12;
            config.data.datasets[0].pointHoverRadius = 16;
        }
        
        config.options.onClick = async (event, elements) => {
            if (!elements || elements.length === 0) return;
            handleAnswer(elements[0].index !== undefined ? elements[0].index : elements[0].datasetIndex);
        };
        
        if (playerChartInstance) playerChartInstance.destroy();
        playerChartInstance = new Chart(document.getElementById('player-chart-canvas'), config);
    }
}

async function reassignTeams() {
    if (!currentGamePin) return;
    const snap = await get(ref(database, `sessions/${currentGamePin}`));
    const data = snap.val();
    if (!data || !data.players) return;

    const tc = data.teamCount || teamCount || 4;
    const playerKeys = Object.keys(data.players);
    const updates = {};
    playerKeys.forEach((key, idx) => {
        updates[`players/${key}/team`] = TEAM_COLORS[idx % tc].key;
    });
    await update(ref(database, `sessions/${currentGamePin}`), updates);
}

function renderTeamScores(playersObj, containerEl, isHost) {
    if (!containerEl) return;
    containerEl.innerHTML = '';

    const players = Object.values(playersObj);
    const teamMap = {};
    players.forEach(p => {
        if (!p.team) return;
        if (!teamMap[p.team]) teamMap[p.team] = { score: 0, count: 0 };
        teamMap[p.team].score += (p.score || 0);
        teamMap[p.team].count++;
    });

    const sorted = Object.entries(teamMap).sort((a, b) => b[1].score - a[1].score);
    if (sorted.length === 0) { containerEl.classList.add('hidden'); return; }
    containerEl.classList.remove('hidden');

    sorted.forEach(([teamKey, data], idx) => {
        const tc = TEAM_COLORS.find(t => t.key === teamKey);
        if (!tc) return;

        if (isHost) {
            const card = document.createElement('div');
            card.className = `team-score-card ${idx === 0 ? 'rank-1' : ''}`;
            card.style.borderColor = tc.color;
            card.innerHTML = `<div class="team-name" style="color:${tc.color}">${tc.emoji} ${getTeamLabel(teamKey)}</div><div class="team-total">${data.score}</div><div class="team-members">${data.count} player${data.count !== 1 ? 's' : ''}</div>`;
            containerEl.appendChild(card);
        } else {
            const chip = document.createElement('div');
            chip.className = 'team-score-chip';
            chip.style.borderColor = tc.color;
            chip.innerHTML = `<span>${tc.emoji}</span> <span style="color:${tc.color}">${data.score}</span>`;
            containerEl.appendChild(chip);
        }
    });
}

function renderPlayerTeamPicker(data, playerData) {
    if (!data || !playerData) return;
    const badge = document.getElementById('player-team-badge');
    const pickerEl = document.getElementById('player-team-picker');
    const buttonsEl = document.getElementById('team-picker-buttons');
    
    if (data.teamMode && playerData.team && data.teamAssign === 'auto') {
        const tc = TEAM_COLORS.find(t => t.key === playerData.team);
        if (tc && badge) {
            badge.innerText = formatTeamLabel(playerData.team, data.teamLabelMode);
            badge.className = `team-badge mt-3 team-${tc.key}`;
            badge.classList.remove('hidden');
        }
        if (pickerEl) pickerEl.classList.add('hidden');
    } else if (data.teamMode && data.teamAssign === 'pick') {
        if (badge) badge.classList.add('hidden');
        if (pickerEl) pickerEl.classList.remove('hidden');
        if (buttonsEl) buttonsEl.innerHTML = '';
        
        const tc = data.teamCount || 4;
        for (let i = 0; i < tc; i++) {
            const t = TEAM_COLORS[i];
            const btn = document.createElement('button');
            btn.className = 'team-pick-btn';
            
            if (playerData.team === t.key) {
                btn.classList.add('selected');
                btn.style.borderColor = t.color;
                btn.style.background = t.color + '22';
                if (badge) {
                    badge.innerText = formatTeamLabel(t.key, data.teamLabelMode);
                    badge.className = `team-badge mt-3 team-${t.key}`;
                    badge.classList.remove('hidden');
                }
            } else {
                btn.style.borderColor = t.color + '66';
            }
            
            btn.innerHTML = `<span class="team-pick-emoji">${t.emoji}</span><span>${getTeamLabel(t.key, data.teamLabelMode)}</span>`;
            btn.addEventListener('click', async () => {
                await update(ref(database, `sessions/${currentGamePin}/players/${myPlayerId}`), { team: t.key });
            });
            if (buttonsEl) buttonsEl.appendChild(btn);
        }
    } else {
        if (badge) badge.classList.add('hidden');
        if (pickerEl) pickerEl.classList.add('hidden');
    }
}

function spawnSmackTalk(text, playerName) {
    const container = document.getElementById('host-chat-container');
    if (!container) return;
    const msg = document.createElement('div');
    msg.className = 'smack-talk-msg';
    msg.innerText = `${playerName}: ${text}`;
    msg.style.top = Math.floor(Math.random() * 80) + '%';
    const dur = 6 + Math.random() * 4;
    msg.style.animation = `scroll-left ${dur}s linear forwards`;
    container.appendChild(msg);
    setTimeout(() => { if(msg.parentNode) msg.parentNode.removeChild(msg); }, dur * 1000 + 500);
}

function spawnFloatingEmoji(emojiChar) {
    const lobbyContainer = document.getElementById('host-lobby-emoji-container');
    const lbContainer = document.getElementById('host-emoji-container');
    const hostLobbyView = document.getElementById('view-host-lobby');
    const container = (hostLobbyView && hostLobbyView.classList.contains('active')) ? lobbyContainer : lbContainer;

    if (!container) return;

    while (container.children.length >= MAX_FLOATING_EMOJIS) {
        container.removeChild(container.firstChild);
    }

    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.innerText = emojiChar;
    el.style.left = Math.random() * 80 + 10 + '%';
    const dur = Math.random() * 2 + 2;
    el.style.animationDuration = dur + 's';
    
    container.appendChild(el);
    el.addEventListener('animationend', () => {
        if (container.contains(el)) container.removeChild(el);
    });
}

let sandboxActive = false;
function setSandboxStatus(msg) {
    const el = document.getElementById('sandbox-status');
    if (el) {
        el.innerText = msg;
        setTimeout(() => { el.innerText = ''; }, 4000);
    }
}

function showToast(msg, color = '#ef4444') {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:${color};color:#fff;padding:0.75rem 1.5rem;border-radius:12px;z-index:99999;font-weight:600;pointer-events:none;font-size:0.95rem;box-shadow:0 8px 24px rgba(0,0,0,0.4);animation:fadeInUp 0.3s ease`;
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.4s'; setTimeout(() => t.remove(), 400); }, 3000);
}

function toggleSandbox() {
    if (!currentGamePin) {
        showToast('Start a game session first, then open Presenter Sandbox from the lobby!', '#b45309');
        return;
    }
    sandboxActive = !sandboxActive;
    if (!IS_SIMULATOR_CLIENT) sessionStorage.removeItem('dashboard_wars_player_session');
    const panel = document.getElementById('sandbox-simulator-panel');
    const iframe = document.getElementById('sandbox-iframe');
    if (sandboxActive) {
        panel.classList.remove('hidden');
        panel.classList.remove('minimized');
        panel.style.bottom = '20px';
        panel.style.right = '20px';
        panel.style.top = 'auto';
        panel.style.left = 'auto';
        const simUrl = `${window.location.origin}${window.location.pathname}?pin=${currentGamePin}&nickname=DemoPlayer&sim=1`;
        iframe.src = simUrl;
        setSandboxStatus('Simulator loading...');
    } else {
        panel.classList.add('hidden');
        iframe.src = 'about:blank';
    }
}

function closeSandbox() {
    sandboxActive = false;
    const panel = document.getElementById('sandbox-simulator-panel');
    panel.classList.add('hidden');
    panel.classList.remove('minimized');
    document.getElementById('sandbox-iframe').src = 'about:blank';
}

// ==========================================
// CENTRAL NAV & ELEMENT EVENT ATTACHMENTS
// ==========================================
function initApp() {
    initLandingParticles();
    applyBranding(currentBranding);
    loadBranding();
    applyTheme(localStorage.getItem('dashboard_wars_theme') || 'ey');
    loadTheme();

    // Landing Screen Listeners
    document.getElementById('btn-goto-join')?.addEventListener('click', () => switchView('view-player-join'));
    document.getElementById('btn-goto-login')?.addEventListener('click', () => {
        if (getCurrentUser()) switchView('view-host-setup');
        else switchView('view-admin-login');
    });
    document.getElementById('btn-back-landing-host')?.addEventListener('click', () => switchView('view-landing'));
    document.getElementById('btn-back-landing-player')?.addEventListener('click', () => switchView('view-landing'));
    document.getElementById('btn-back-landing-login')?.addEventListener('click', () => switchView('view-landing'));

    document.getElementById('btn-save-branding')?.addEventListener('click', async () => {
        const nextBranding = normalizeBranding({
            eventBadge: document.getElementById('branding-event-badge')?.value,
            titleLine1: document.getElementById('branding-title-line-1')?.value,
            titleLine2: document.getElementById('branding-title-line-2')?.value,
            subtitle: document.getElementById('branding-subtitle')?.value,
            supportingText: document.getElementById('branding-supporting-text')?.value,
            joinLabel: document.getElementById('branding-join-label')?.value,
            hostLabel: document.getElementById('branding-host-label')?.value
        });
        applyBranding(nextBranding);
        applyTheme(document.getElementById('branding-theme')?.value || 'ey');
        localStorage.setItem('dashboard_wars_branding', JSON.stringify(nextBranding));
        localStorage.setItem('dashboard_wars_theme', currentTheme);
        if (isFirebaseEnabled) {
            await Promise.all([
                set(ref(database, 'settings/dashboardWarsBranding'), { ...nextBranding, updatedAt: Date.now() }),
                set(ref(database, 'settings/dashboardWarsTheme'), currentTheme)
            ]);
        }
        showToast('Home screen branding saved.', '#166534');
    });

    document.getElementById('btn-reset-branding')?.addEventListener('click', async () => {
        if (!confirm('Reset the home screen wording to the original defaults?')) return;
        applyBranding(DEFAULT_BRANDING);
        applyTheme('ey');
        localStorage.setItem('dashboard_wars_branding', JSON.stringify(DEFAULT_BRANDING));
        localStorage.setItem('dashboard_wars_theme', 'ey');
        if (isFirebaseEnabled) {
            await Promise.all([
                set(ref(database, 'settings/dashboardWarsBranding'), { ...DEFAULT_BRANDING, updatedAt: Date.now() }),
                set(ref(database, 'settings/dashboardWarsTheme'), 'ey')
            ]);
        }
        showToast('Home screen branding reset.', '#2563eb');
    });
    document.getElementById('branding-theme')?.addEventListener('change', event => {
        applyTheme(event.target.value);
    });

    // Admin Logout explicitly wired to Firebase SignOut
    document.getElementById('btn-admin-logout')?.addEventListener('click', async () => {
        if (confirm("Are you sure you want to sign out?")) {
            await signOut(auth);
            window.location.reload(); // Refreshes the page to clear the session safely
        }
    });

    // Firebase Error Dismissal
    document.getElementById('btn-dismiss-firebase')?.addEventListener('click', () => {
        document.getElementById('firebase-warning-modal').classList.add('hidden');
    });

    // Admin Login Workflow
    document.getElementById('form-admin-login')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isFirebaseEnabled) return alert("Firebase is not connected.");
        const password = document.getElementById('input-admin-password').value.trim();
        if (password !== 'eypowerbi2026') return alert("Incorrect Master Password.");
        const dummyEmail = 'admin@eypowerbi.com';
        try {
            await signInWithEmailAndPassword(auth, dummyEmail, password);
            switchView('view-host-setup');
        } catch (err) {
            try {
                await createUserWithEmailAndPassword(auth, dummyEmail, password);
                switchView('view-host-setup');
            } catch (regErr) {
                alert("System Error: " + regErr.message);
            }
        }
    });

    // Content Generators
    document.getElementById('btn-import-presets')?.addEventListener('click', async () => {
        const user = getCurrentUser();
        if (!user) return alert("Not logged in.");
        if (!confirm("Import the Power BI, VBA, and Microsoft Copilot question packs?")) return;
        document.getElementById('btn-import-presets').innerText = "Importing...";
        const packs = [
            ...eyPresets.map(module => ({
                ...module,
                subject: 'powerbi',
                questions: module.questions.map(question => ({ ...question, subject: 'powerbi', type: question.type || 'multiple-choice' }))
            })),
            ...vbaCopilotPresets
        ];
        for (let module of packs) {
            const newQuizRef = push(ref(database, `users/${user.uid}/quizzes`));
            await set(newQuizRef, { title: module.title, subject: module.subject, questions: module.questions, createdAt: Date.now() });
        }
        alert("Power BI, VBA, and Copilot packs imported successfully.");
        document.getElementById('btn-import-presets').innerText = "Import Power BI, VBA & Copilot Packs";
    });

    document.getElementById('btn-open-maker')?.addEventListener('click', () => {
        currentEditingQuizId = null;
        makerQuestions = [defaultMakerQuestion()];
        document.getElementById('maker-quiz-title').value = '';
        renderMakerQuestions();
        switchView('view-admin-maker');
    });
    document.getElementById('btn-close-maker')?.addEventListener('click', () => switchView('view-host-setup'));
    document.getElementById('btn-add-maker-question')?.addEventListener('click', () => {
        makerQuestions.push(defaultMakerQuestion());
        renderMakerQuestions();
    });

    document.getElementById('btn-save-quiz')?.addEventListener('click', async () => {
        const title = document.getElementById('maker-quiz-title').value.trim();
        if (!title) return alert('Please enter a quiz title.');
        if (makerQuestions.length === 0) return alert('Please add at least one question.');
        for (let q of makerQuestions) {
            if (!q.text) return alert('All questions must have text.');
            q.subject = q.subject || 'powerbi';
            const type = normalizeQuestionType(q);
            if (['multiple-choice', 'true-false', 'poll', 'dashboard'].includes(type) && (!q.options?.length || q.options.some(opt => !opt))) {
                return alert('All visible options must be filled.');
            }
            if (type === 'jumbled-prompt' && (!q.words || q.words.length < 2)) return alert('Arrange-in-order questions need at least two pieces.');
            if (type === 'type-answer' && !q.answerText) return alert('Exact-answer questions need an answer.');
            if (type === 'speed-math' && !q.equation) return alert('Missing-elements questions need required elements.');
        }
        const subjects = [...new Set(makerQuestions.map(q => q.subject))];
        const subject = subjects.length === 1 ? subjects[0] : 'mixed';
        const user = getCurrentUser();
        if (!user) return alert('Not logged in. Cannot save.');
        if (currentEditingQuizId) {
            await update(ref(database, `users/${user.uid}/quizzes/${currentEditingQuizId}`), { title, subject, questions: makerQuestions, updatedAt: Date.now() });
            alert('Quiz Updated!');
        } else {
            const newQuizRef = push(ref(database, `users/${user.uid}/quizzes`));
            await set(newQuizRef, { title, subject, questions: makerQuestions, createdAt: Date.now() });
            alert('New Quiz Saved!');
        }
        switchView('view-host-setup');
    });

    document.getElementById('btn-close-preview')?.addEventListener('click', () => {
        document.getElementById('modal-chart-preview').classList.add('hidden');
        if (previewChartInstance) previewChartInstance.destroy();
    });
    document.getElementById('btn-close-preview-ok')?.addEventListener('click', () => {
        document.getElementById('modal-chart-preview').classList.add('hidden');
        if (previewChartInstance) previewChartInstance.destroy();
    });

    // Engine Launcher Buttons
    document.getElementById('btn-dashboard-challenge')?.addEventListener('click', () => {
        currentGameMode = 'dashboard';
        const roundCount = parseInt(document.getElementById('dash-round-count')?.value || 5);
        const difficulty = document.getElementById('dash-difficulty')?.value || 'normal';
        dashboardRounds = generateDashboardGame(roundCount, difficulty);
        questions = dashboardRounds.map(r => ({ text: r.question, correctIndex: r.correctIndex, timeLimit: r.timeLimit, dashboardData: serializeRound(r) }));
        currentHostedQuizTitle = 'Dashboard Challenge';
        setupGameLobby();
    });

    document.getElementById('btn-tutorial-mode')?.addEventListener('click', () => {
        currentGameMode = 'tutorial';
        questions = getTutorialRounds(); 
        currentHostedQuizTitle = 'Practice Arena (Tutorial)';
        setupGameLobby();
    });

    // General Session Interactors
    document.getElementById('btn-cancel-session')?.addEventListener('click', () => {
        if (confirm("Cancel this session and return to dashboard?")) {
            remove(ref(database, `sessions/${currentGamePin}`));
            currentGamePin = null;
            switchView('view-host-setup');
        }
    });
    document.getElementById('btn-start-game')?.addEventListener('click', () => {
        if (questions[0].dashboardData) startDashboardQuestion(0);
        else startQuestion(0);
    });
    document.getElementById('btn-skip-question')?.addEventListener('click', () => endQuestion());
    document.getElementById('btn-pause-timer')?.addEventListener('click', () => {
        clearInterval(hostTimerInterval);
        hostPausedAt = Date.now();
        document.getElementById('btn-pause-timer').classList.add('hidden');
        document.getElementById('btn-resume-timer').classList.remove('hidden');
        update(ref(database, `sessions/${currentGamePin}`), { isPaused: true, pausedAt: hostPausedAt });
    });
    document.getElementById('btn-resume-timer')?.addEventListener('click', async () => {
        document.getElementById('btn-resume-timer').classList.add('hidden');
        document.getElementById('btn-pause-timer').classList.remove('hidden');
        // Adjust questionStartTime to account for pause duration
        const snap = await get(ref(database, `sessions/${currentGamePin}`));
        const d = snap.val();
        const pauseDuration = Date.now() - (d.pausedAt || hostPausedAt || Date.now());
        const newStartTime = (d.questionStartTime || 0) + pauseDuration;
        await update(ref(database, `sessions/${currentGamePin}`), { isPaused: false, questionStartTime: newStartTime, pausedAt: null });
        hostTimerInterval = setInterval(() => {
            timeRemaining--;
            document.getElementById('host-timer').innerText = timeRemaining;
            if (timeRemaining <= 5) document.getElementById('host-timer').classList.add('timer-warning');
            else document.getElementById('host-timer').classList.remove('timer-warning');
            if (timeRemaining <= 0) endQuestion();
        }, 1000);
    });

    document.getElementById('btn-next-leaderboard')?.addEventListener('click', () => {
        update(ref(database, `sessions/${currentGamePin}`), { state: 'leaderboard' });
        showHostLeaderboard();
    });

    function executeGameOverSequence() {
        clearInterval(hostTimerInterval);
        currentGameState = 'game_over';
        update(ref(database, `sessions/${currentGamePin}`), { state: 'game_over' });
        document.getElementById('btn-next-question').innerText = "Game Ended";
        document.getElementById('btn-next-question').disabled = true;
        document.getElementById('btn-back-dashboard').classList.remove('hidden');

        get(ref(database, `sessions/${currentGamePin}/players`)).then(snapshot => {
            const playersObj = snapshot.val() || {};
            const players = Object.values(playersObj).sort((a, b) => (b.score || 0) - (a.score || 0));
            const user = getCurrentUser();
            if (user) {
                push(ref(database, `users/${user.uid}/history`), {
                    date: Date.now(),
                    quizName: currentHostedQuizTitle,
                    playerCount: players.length,
                    topScores: players
                });
            }
        });
        showHostLeaderboard();
    }

    document.getElementById('btn-end-game-early')?.addEventListener('click', () => {
        if (confirm("Are you sure you want to end the game early and skip all remaining questions?")) {
            executeGameOverSequence();
        }
    });

    document.getElementById('btn-dash-end-game-early')?.addEventListener('click', () => {
        if (confirm("Are you sure you want to end the game early and skip all remaining questions?")) {
            executeGameOverSequence();
        }
    });

    document.getElementById('btn-next-question')?.addEventListener('click', async () => {
        if (currentQuestionIndex + 1 < questions.length) {
            const sessSnap = await get(ref(database, `sessions/${currentGamePin}/nextDoublePoints`));
            if (sessSnap.val() === true) {
                questions[currentQuestionIndex + 1].isDoublePoints = true;
                await update(ref(database, `sessions/${currentGamePin}`), { nextDoublePoints: false, hype: 0 });
            }
            if (questions[currentQuestionIndex + 1].dashboardData) startDashboardQuestion(currentQuestionIndex + 1);
            else startQuestion(currentQuestionIndex + 1);
        } else {
            executeGameOverSequence();
        }
    });

    document.getElementById('btn-back-dashboard')?.addEventListener('click', () => {
        if (currentGamePin) remove(ref(database, `sessions/${currentGamePin}`));
        currentGamePin = null;
        document.getElementById('btn-next-question').innerText = "Next Question";
        document.getElementById('btn-next-question').disabled = false;
        document.getElementById('btn-back-dashboard').classList.add('hidden');
        switchView('view-host-setup');
    });

    document.getElementById('btn-download-csv')?.addEventListener('click', async () => {
        const snap = await get(ref(database, `sessions/${currentGamePin}/players`));
        const playersObj = snap.val() || {};
        const players = Object.values(playersObj).sort((a, b) => b.score - a.score);
        const teamMap = {};
        players.forEach(p => {
            if (!p.team) return;
            if (!teamMap[p.team]) teamMap[p.team] = 0;
            teamMap[p.team] += (p.score || 0);
        });
        let csv = "Rank,Nickname,Score,Team,Team Score\n";
        players.forEach((p, idx) => {
            const teamObj = p.team ? TEAM_COLORS.find(t => t.key === p.team) : null;
            const teamName = teamObj ? getTeamLabel(p.team) : "None";
            const teamPoints = p.team ? (teamMap[p.team] || 0) : "";
            csv += `${idx + 1},${p.name},${p.score},${teamName},${teamPoints}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('href', url);
        a.setAttribute('download', `powerquiz_results_${currentGamePin}.csv`);
        a.click();
    });

    document.getElementById('btn-dash-skip')?.addEventListener('click', () => endDashboardQuestion());
    document.getElementById('btn-dash-next-leaderboard')?.addEventListener('click', () => {
        update(ref(database, `sessions/${currentGamePin}`), { state: 'leaderboard' });
        showHostLeaderboard();
    });
    document.getElementById('btn-dash-pause')?.addEventListener('click', () => {
        clearInterval(hostTimerInterval);
        hostPausedAt = Date.now();
        document.getElementById('btn-dash-pause').classList.add('hidden');
        document.getElementById('btn-dash-resume').classList.remove('hidden');
        update(ref(database, `sessions/${currentGamePin}`), { isPaused: true, pausedAt: hostPausedAt });
    });
    document.getElementById('btn-dash-resume')?.addEventListener('click', async () => {
        document.getElementById('btn-dash-resume').classList.add('hidden');
        document.getElementById('btn-dash-pause').classList.remove('hidden');
        const snap = await get(ref(database, `sessions/${currentGamePin}`));
        const d = snap.val();
        const pauseDuration = Date.now() - (d.pausedAt || hostPausedAt || Date.now());
        const newStartTime = (d.questionStartTime || 0) + pauseDuration;
        await update(ref(database, `sessions/${currentGamePin}`), { isPaused: false, questionStartTime: newStartTime, pausedAt: null });
        hostTimerInterval = setInterval(() => {
            timeRemaining--;
            document.getElementById('host-dash-timer').innerText = timeRemaining;
            if (timeRemaining <= 5) document.getElementById('host-dash-timer').classList.add('timer-warning');
            else document.getElementById('host-dash-timer').classList.remove('timer-warning');
            if (timeRemaining <= 0) endDashboardQuestion();
        }, 1000);
    });

    // Player Join Logic
    document.getElementById('form-join')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isFirebaseEnabled) return alert("Firebase is not connected.");

        const pin = document.getElementById('input-pin').value.trim();
        const name = document.getElementById('input-nickname').value.trim();
        
        if (!pin || !name) return;
        if (name.length < 2) return alert("Please enter a nickname with at least 2 characters.");
        if (/^\d+$/.test(name)) return alert("Nickname cannot be only numbers.");
        if (!/[a-zA-Z]/.test(name)) return alert("Nickname must contain at least one letter.");
        if (!IS_SIMULATOR_CLIENT) {
            localStorage.setItem('dashboard_wars_last_join', JSON.stringify({ pin, nickname: name }));
        }

        const submitBtn = document.getElementById('btn-join-submit');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = "⏳ Entering..."; }

        try {
            const sessionSnap = await get(ref(database, `sessions/${pin}`));
            if (!sessionSnap.exists()) {
                alert("Game PIN not found.");
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = "🚀 Enter Arena"; }
                return;
            }
            
            const data = sessionSnap.val();
            const deviceId = getPlayerDeviceId();
            
            const playersEntries = Object.entries(data.players || {});
            const existingPlayer = playersEntries.find(([id, p]) => p.name.toLowerCase() === name.toLowerCase());

            if (existingPlayer) {
                if (existingPlayer[1].deviceId && existingPlayer[1].deviceId !== deviceId) {
                    alert("That nickname is already being used on another device.");
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = "🚀 Enter Arena"; }
                    return;
                }
                myPlayerId = existingPlayer[0];
                myNickname = existingPlayer[1].name;
                showToast(`Reconnected as ${myNickname}!`);
            } else {
                if (data.state !== 'lobby') {
                    alert("Game has already started! You cannot join as a new player.");
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = "🚀 Enter Arena"; }
                    return;
                }
                
                myPlayerId = generateId();
                myNickname = name;
                
                const playerData = { name: myNickname, deviceId, online: true, score: 0, hasAnswered: false, lastAnswerCorrect: false, lastPointsEarned: 0, streak: 0 };
                if (data.teamMode && data.teamAssign !== 'pick') {
                    const existingCount = playersEntries.length;
                    const tc = data.teamCount || 4;
                    playerData.team = TEAM_COLORS[existingCount % tc].key;
                }
                
                await set(ref(database, `sessions/${pin}/players/${myPlayerId}`), playerData);
            }

            currentGamePin = pin;
            questions = data.questions;
            currentGameMode = data.mode || 'classic';
            await update(ref(database, `sessions/${pin}/players/${myPlayerId}`), { deviceId, online: true, lastSeen: Date.now() });
            savePlayerSession();
            setupPlayerPresence(pin, myPlayerId);

            document.getElementById('display-player-name').innerText = myNickname;
            document.getElementById('input-pin').value = pin;
            document.getElementById('input-nickname').value = myNickname;
            document.getElementById('player-floating-pin-text').innerText = pin;
            document.getElementById('player-floating-pin').classList.remove('hidden');
            document.getElementById('btn-player-sync-view')?.classList.remove('hidden');
            if (data.state === 'lobby') {
                renderPlayerTeamPicker(data, data.players?.[myPlayerId] || {});
                switchView('view-player-lobby');
            }

            onChildAdded(ref(database, `sessions/${pin}/attacks`), async (snapshot) => {
                const attack = snapshot.val();
                if (processedAttackIds.has(snapshot.key)) return;
                if (attack && attack.targetId === myPlayerId && !attack.blocked && (Date.now() - attack.timestamp < 10000)) {
                    processedAttackIds.add(snapshot.key);
                    const mySnap = await get(ref(database, `sessions/${pin}/players/${myPlayerId}`));
                    const myData = mySnap.val();
                    const sCount = myData ? (myData.shieldCount || (myData.shieldActive ? 1 : 0)) : 0;
                    if (sCount > 0) {
                        const newCount = sCount - 1;
                        await update(ref(database, `sessions/${pin}/players/${myPlayerId}`), { shieldCount: newCount, shieldActive: newCount > 0 });
                        await update(ref(database, `sessions/${pin}/attacks/${snapshot.key}`), { blocked: true });
                        showShieldBlockEffect();
                    } else {
                        applySabotageEffect(attack.type, attack.attackerName, attack.attackerTeam, attack.attackerId);
                    }
                }
            });
        } catch (err) {
            alert("Error joining: " + err.message);
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = "🚀 Enter Arena"; }
        }

        onValue(ref(database, `sessions/${pin}/players/${myPlayerId}`), (snap) => {
            if (!snap.exists() && currentGamePin && currentGameState !== 'game_over') {
                alert("You have been kicked by the host.");
                window.location.reload();
            }
        });

        onValue(ref(database, `sessions/${pin}`), (snapshot) => {
            const d = snapshot.val();
            if (!d) return; 
            
            currentGameState = d.state;
            currentQuestionIndex = d.currentQuestionIndex;
            currentTeamLabelMode = d.teamLabelMode || 'groups';

            // Handle Special Events (Player-side only)
            const playerMysteryOverlay = document.getElementById('player-mystery-box-overlay');
            const playerBossOverlay = document.getElementById('player-boss-battle-overlay');
            if (playerMysteryOverlay) playerMysteryOverlay.classList.add('hidden');
            if (playerBossOverlay) playerBossOverlay.classList.add('hidden');

            const isPlayerView = document.getElementById('view-player-leaderboard')?.classList.contains('active');

            if (d.activeEvent === 'mystery_box' && isPlayerView) {
                if (playerMysteryOverlay) {
                    playerMysteryOverlay.classList.remove('hidden');
                    const btnGrab = document.getElementById('btn-grab-mystery-box');
                    if (d.mysteryBoxWinner) {
                        btnGrab.innerText = d.mysteryBoxWinner === myPlayerId ? "🎉 YOU WON!" : "❌ TOO LATE!";
                        btnGrab.disabled = true;
                    } else {
                        btnGrab.innerText = "GRAB IT!";
                        btnGrab.disabled = false;
                    }
                }
            } else if (d.activeEvent === 'boss_battle' && isPlayerView) {
                if (playerBossOverlay) {
                    playerBossOverlay.classList.remove('hidden');
                    const btnAttack = document.getElementById('btn-attack-boss');
                    const elapsed = Math.floor((Date.now() - (d.eventStartTime || Date.now())) / 1000);
                    if (d.bossHp <= 0 || elapsed >= 15) {
                        btnAttack.disabled = true;
                        btnAttack.innerText = d.bossHp <= 0 ? "VICTORY!" : "FAILED!";
                    } else {
                        btnAttack.disabled = false;
                        btnAttack.innerText = "ATTACK!";
                    }
                }
            }

            const pData = d.players?.[myPlayerId];
            if (pData) {
                renderPlayerInventory(pData.inventory || [], pData.team, d.teamMode, d.teamPools);
                const isShielded = pData.shieldCount > 0 || pData.shieldActive;
                const shieldBadge = document.getElementById('player-shield-indicator');
                const dashShieldBadge = document.getElementById('player-dash-shield-indicator');
                if (shieldBadge) shieldBadge.classList.toggle('hidden', !isShielded);
                if (dashShieldBadge) dashShieldBadge.classList.toggle('hidden', !isShielded);
            }

            if (d.state === 'lobby' && pData) {
                renderPlayerTeamPicker(d, pData);
            }

            if (d.state === 'question') {
                const q = d.questions[d.currentQuestionIndex];
                syncedPlayerQuestionPaused = Boolean(d.isPaused);
                syncedPlayerQuestionStartTime = Number(d.questionStartTime) || Date.now();
                syncedPlayerQuestionTimeLimit = Math.max(
                    1,
                    Number(q.timeLimit || q.dashboardData?.timeLimit) || 20
                );
                // Guard: skip re-initialization if same question already set up
                const isNewQuestion = d.currentQuestionIndex !== lastInitializedQuestionIndex;
                if (isNewQuestion) {
                    lastInitializedQuestionIndex = d.currentQuestionIndex;
                    hasAnsweredThisRound = false;
                    // Lock answer buttons briefly to prevent ghost clicks during transition
                    answerClickLocked = true;
                    setTimeout(() => { answerClickLocked = false; }, 400);
                }

                if (q.dashboardData) {
                    switchView('view-player-dashboard');
                    const progEl = document.getElementById('player-dash-question-progress');
                    if (progEl) progEl.innerText = `Question ${d.currentQuestionIndex + 1} of ${d.questions.length}`;
                    document.getElementById('player-dash-question').innerText = q.text || q.dashboardData?.question || 'Tap the correct element';
                    document.getElementById('player-dash-locked').classList.add('hidden');
                    if (pData) {
                        document.getElementById('player-dash-score').innerText = pData.score || 0;
                        if (pData.hasAnswered) { hasAnsweredThisRound = true; document.getElementById('player-dash-locked').classList.remove('hidden'); }
                        else { hasAnsweredThisRound = false; document.getElementById('player-dash-locked').classList.add('hidden'); }
                    }
                    if (pData?.team) {
                        const tc = TEAM_COLORS.find(t => t.key === pData.team);
                        const ti = document.getElementById('player-dash-team');
                        if (tc && ti) { ti.innerText = formatTeamLabel(pData.team, d.teamLabelMode); ti.classList.remove('hidden'); ti.style.background = tc.color + '33'; ti.style.color = tc.color; }
                    }
                    if (q.dashboardData && isNewQuestion) renderPlayerChart(q.dashboardData, d.questionStartTime, q.timeLimit || q.dashboardData.timeLimit);
                    if (isNewQuestion) startPointsDecayTicker(d.questionStartTime, q.timeLimit || q.dashboardData.timeLimit);

                    clearInterval(playerDashTimerInterval);
                    const timerEl = document.getElementById('player-dash-timer');
                    let lastVibDash = -1;
                    playerDashTimerInterval = setInterval(() => {
                        if (d.isPaused) { timerEl.innerText = "⏸ PAUSED"; timerEl.classList.remove('warning'); return; }
                        if (isTimeFrozenLocal) { timerEl.innerText = "❄️ FROZEN"; timerEl.classList.add('warning'); return; }
                        const elapsed = (Date.now() - d.questionStartTime) / 1000;
                        const limit = (q.timeLimit || q.dashboardData?.timeLimit || 30);
                        const remaining = Math.max(0, Math.ceil(limit - elapsed));
                        timerEl.innerText = remaining + 's';
                        timerEl.classList.toggle('warning', remaining <= 5);
                        if ('vibrate' in navigator && remaining !== lastVibDash) {
                            if (remaining === 10) navigator.vibrate(100);
                            else if (remaining === 5) navigator.vibrate([100, 50, 100]);
                            else if (remaining === 3 || remaining === 2 || remaining === 1) navigator.vibrate([100, 30, 100]);
                            lastVibDash = remaining;
                        }
                        if (remaining <= 0) clearInterval(playerDashTimerInterval);
                    }, 500);
                } else {
                    document.getElementById('player-waiting-msg').classList.add('hidden');
                    switchView('view-player-question');
                    if (isNewQuestion) renderPlayerQuestionInterface(q);
                    const progEl = document.getElementById('player-question-progress');
                    if (progEl) progEl.innerText = `Question ${d.currentQuestionIndex + 1} of ${d.questions.length}`;
                    if (isNewQuestion) startPointsDecayTicker(d.questionStartTime, q.timeLimit);

                    clearInterval(playerTimerInterval);
                    const timerEl = document.getElementById('player-timer');
                    let lastVibClassic = -1;
                    if (timerEl) {
                        playerTimerInterval = setInterval(() => {
                            if (d.isPaused) { timerEl.innerText = "⏸ PAUSED"; timerEl.classList.remove('warning'); return; }
                            if (isTimeFrozenLocal) { timerEl.innerText = "❄️ FROZEN"; timerEl.classList.add('warning'); return; }
                            const elapsed = (Date.now() - d.questionStartTime) / 1000;
                            const remaining = Math.max(0, Math.ceil(q.timeLimit - elapsed));
                            timerEl.innerText = remaining + 's';
                            timerEl.classList.toggle('warning', remaining <= 5);
                            if ('vibrate' in navigator && remaining !== lastVibClassic) {
                                if (remaining === 10) navigator.vibrate(100);
                                else if (remaining === 5) navigator.vibrate([100, 50, 100]);
                                else if (remaining === 3 || remaining === 2 || remaining === 1) navigator.vibrate([100, 30, 100]);
                                lastVibClassic = remaining;
                            }
                            if (remaining <= 0) clearInterval(playerTimerInterval);
                        }, 500);
                    }

                    if (isNewQuestion) {
                        document.querySelectorAll('.answer-btn').forEach(b => b.classList.remove('selected', 'disabled-answer'));
                    }
                    if (pData) {
                        if (pData.hasAnswered) { hasAnsweredThisRound = true; document.getElementById('player-waiting-msg').classList.remove('hidden'); }
                        else { hasAnsweredThisRound = false; document.getElementById('player-waiting-msg').classList.add('hidden'); }
                        if (pData.streak >= 3) { document.getElementById('player-streak-badge').classList.remove('hidden'); document.getElementById('player-streak-count').innerText = pData.streak; }
                        else document.getElementById('player-streak-badge').classList.add('hidden');
                    }
                }
            } else {
                clearInterval(playerTimerInterval);
                clearInterval(playerDashTimerInterval);
                document.querySelectorAll('.answer-btn').forEach(btn => btn.style.order = '');
                const pData = d.players[myPlayerId];
                if (pData && (d.state === 'results' || d.state === 'results_dash')) {
                    switchView('view-player-result');
                    const correctAnswer = document.getElementById('player-correct-answer');
                    const correctAnswerText = document.getElementById('player-correct-answer-text');
                    if (correctAnswer && correctAnswerText && d.resultAnswer && d.resultQuestionType !== 'poll') {
                        correctAnswerText.textContent = d.resultAnswer;
                        correctAnswer.classList.remove('hidden');
                    } else {
                        correctAnswer?.classList.add('hidden');
                    }
                    document.getElementById('player-total-score').innerText = pData.score;
                    document.getElementById('player-points-earned').innerText = pData.lastPointsEarned;
                    document.getElementById('player-score-display').innerText = pData.score;

                    const allPlayers = Object.values(d.players || {}).sort((a, b) => b.score - a.score);
                    const currentRank = allPlayers.findIndex(p => p.name === myNickname) + 1;
                    document.getElementById('player-rank-number').innerText = currentRank;
                    document.getElementById('player-rank-total').innerText = allPlayers.length;

                    const movementEl = document.getElementById('player-rank-movement');
                    if (previousRank !== null && previousRank !== currentRank) {
                        const diff = previousRank - currentRank;
                        if (diff > 0) { movementEl.className = 'rank-movement up'; movementEl.innerText = `↑${diff} place${diff > 1 ? 's' : ''}`; }
                        else { movementEl.className = 'rank-movement down'; movementEl.innerText = `↓${Math.abs(diff)} place${Math.abs(diff) > 1 ? 's' : ''}`; }
                    } else {
                        movementEl.className = 'rank-movement same'; movementEl.innerText = '— same';
                    }
                    previousRank = currentRank;
                    
                    const title = document.getElementById('player-result-title');
                    const badge = document.getElementById('player-points-earned').parentElement;
                    
                    if (d.resultQuestionType === 'poll') {
                        title.innerText = "Opinion Recorded!";
                        badge.className = "points-badge mt-2 result-correct";
                        document.getElementById('player-points-earned').innerText = "0";
                        document.getElementById('player-result-streak-msg').classList.add('hidden');
                    } else if (pData.lastAnswerCorrect) {
                        title.innerText = "Correct!";
                        badge.className = "points-badge mt-2 result-correct";
                        document.getElementById('player-result-streak-msg').classList.toggle('hidden', !pData.isStreakMultiplierActive);
                    } else if (!pData.hasAnswered) {
                        title.innerText = "Time's Up!";
                        badge.className = "points-badge mt-2 result-incorrect";
                        document.getElementById('player-points-earned').innerText = "0";
                        document.getElementById('player-result-streak-msg').classList.add('hidden');
                    } else {
                        title.innerText = "Incorrect!";
                        badge.className = "points-badge mt-2 result-incorrect";
                        document.getElementById('player-points-earned').innerText = "0";
                        document.getElementById('player-result-streak-msg').classList.add('hidden');
                    }

                    const breakdownEl = document.getElementById('player-points-breakdown');
                    if (breakdownEl) {
                        if (pData.lastAnswerCorrect) {
                            const base = pData.receiptBase || 500;
                            const speed = pData.receiptSpeed || 0;
                            const streakBonus = pData.receiptStreak || 0;
                            const doubleMultiplier = pData.receiptDouble ? 2 : 1;
                            const total = (base + speed + streakBonus) * doubleMultiplier;
                            
                            breakdownEl.innerHTML = `
                                <div class="receipt-row" style="display:flex; justify-content:space-between; margin-bottom:0.25rem;"><span>Base Points:</span><span>+${base}</span></div>
                                <div class="receipt-row" style="display:flex; justify-content:space-between; margin-bottom:0.25rem;"><span>Speed Bonus:</span><span>+${speed}</span></div>
                                <div class="receipt-row" style="display:flex; justify-content:space-between; margin-bottom:0.25rem;"><span>Streak Multiplier:</span><span>+${streakBonus}</span></div>
                                ${doubleMultiplier > 1 ? '<div class="receipt-row" style="display:flex; justify-content:space-between; margin-bottom:0.25rem; color:var(--color-primary); font-weight:bold;"><span>Double Points Active!</span><span>2x Multiplier</span></div>' : ''}
                                <hr style="border-color:rgba(255,255,255,0.1); margin:0.5rem 0;">
                                <div class="receipt-row" style="display:flex; justify-content:space-between; font-weight:bold;"><span>Total Points Received:</span><span>+${total}</span></div>
                            `;
                        } else {
                            breakdownEl.innerHTML = `<div class="receipt-row" style="color:var(--color-red); text-align:center; width:100%;">No points received for this round.</div>`;
                        }
                        breakdownEl.classList.remove('hidden');
                    }
                }
            }
            
            if (d.state === 'leaderboard' || d.state === 'game_over') {
                switchView('view-player-leaderboard');
                if (d.state === 'game_over') {
                    document.getElementById('player-lb-title').innerText = "Game Over!";
                    document.getElementById('player-lb-msg').innerText = "Thanks for playing!";
                    document.getElementById('player-strategy-banner').style.display = 'none';
                } else {
                    document.getElementById('player-lb-title').innerText = "Leaderboard";
                    document.getElementById('player-lb-msg').innerText = "Waiting for next question...";
                    document.getElementById('player-strategy-banner').style.display = 'block';
                }

                const playersObj = d.players || {};
                const allSorted = Object.values(playersObj).sort((a, b) => b.score - a.score);
                const top5 = allSorted.slice(0, 5);
                const listEl = document.getElementById('player-lb-list');
                listEl.innerHTML = '';

                const myRankIdx = allSorted.findIndex(p => p.name === myNickname);
                const myInTop5 = myRankIdx >= 0 && myRankIdx < 5;
                
                top5.forEach((p, idx) => {
                    let teamEmoji = '';
                    if (d.teamMode && p.team) {
                        teamEmoji = `<span style="font-size: 0.72em; margin-right: 4px;">${formatTeamShort(p.team, d.teamLabelMode)}</span>`;
                    }
                    const el = document.createElement('div');
                    el.className = p.name === myNickname ? 'leaderboard-row fade-in-up my-row' : 'leaderboard-row fade-in-up';
                    el.innerHTML = `<span>${idx + 1}. ${teamEmoji}${p.name}</span><span>${p.score} pts</span>`;
                    listEl.appendChild(el);
                });

                if (!myInTop5 && myRankIdx >= 0) {
                    const sep = document.createElement('div');
                    sep.className = 'lb-separator';
                    sep.innerHTML = 'Your Position';
                    listEl.appendChild(sep);

                    if (myRankIdx > 0 && myRankIdx - 1 >= 5) {
                        const aboveData = allSorted[myRankIdx - 1];
                        let aboveTeam = '';
                        if (d.teamMode && aboveData.team) {
                            aboveTeam = `<span style="font-size: 0.72em; margin-right: 4px;">${formatTeamShort(aboveData.team, d.teamLabelMode)}</span>`;
                        }
                        const aboveEl = document.createElement('div');
                        aboveEl.className = 'leaderboard-row fade-in-up';
                        aboveEl.style.opacity = '0.6';
                        aboveEl.innerHTML = `<span>${myRankIdx}. ${aboveTeam}${aboveData.name}</span><span>${aboveData.score} pts</span>`;
                        listEl.appendChild(aboveEl);
                    }

                    const myData = allSorted[myRankIdx];
                    let myTeam = '';
                    if (d.teamMode && myData.team) {
                        myTeam = `<span style="font-size: 0.72em; margin-right: 4px;">${formatTeamShort(myData.team, d.teamLabelMode)}</span>`;
                    }
                    const myEl = document.createElement('div');
                    myEl.className = 'leaderboard-row fade-in-up my-row';
                    myEl.innerHTML = `<span>${myRankIdx + 1}. ${myTeam}${myData.name}</span><span>${myData.score} pts</span>`;
                    listEl.appendChild(myEl);

                    if (myRankIdx + 1 < allSorted.length) {
                        const belowData = allSorted[myRankIdx + 1];
                        let belowTeam = '';
                        if (d.teamMode && belowData.team) {
                            belowTeam = `<span style="font-size: 0.72em; margin-right: 4px;">${formatTeamShort(belowData.team, d.teamLabelMode)}</span>`;
                        }
                        const belowEl = document.createElement('div');
                        belowEl.className = 'leaderboard-row fade-in-up';
                        belowEl.style.opacity = '0.6';
                        belowEl.innerHTML = `<span>${myRankIdx + 2}. ${belowTeam}${belowData.name}</span><span>${belowData.score} pts</span>`;
                        listEl.appendChild(belowEl);
                    }
                }

                if (d.teamMode) renderTeamScores(playersObj, document.getElementById('player-team-scores'), false);
            }
        });
    });

    // Handle classic selection options input
    document.querySelectorAll('.answer-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (currentGameState !== 'question' || hasAnsweredThisRound || answerClickLocked) return;
            if (isTimeFrozenLocal) {
                showToast("❄️ You are frozen! Wait until you thaw to answer.");
                return;
            }
            
            // Eagerly lock UI to provide instant feedback and prevent duplicate spam clicks
            hasAnsweredThisRound = true;
            const clickedBtn = e.currentTarget;
            document.querySelectorAll('.answer-btn').forEach(b => {
                if (b === clickedBtn) b.classList.add('selected');
                else b.classList.add('disabled-answer');
            });
            document.getElementById('player-waiting-msg').classList.remove('hidden');

            const ansIdx = parseInt(clickedBtn.getAttribute('data-index'));
            const sessionRef = ref(database, `sessions/${currentGamePin}`);
            const snap = await get(sessionRef);
            
            if (!snap.exists()) {
                hasAnsweredThisRound = false;
                document.getElementById('player-waiting-msg').classList.add('hidden');
                document.querySelectorAll('.answer-btn').forEach(b => b.classList.remove('selected', 'disabled-answer'));
                return;
            }
            
            const d = snap.val();

            if (d.state !== 'question' || d.currentQuestionIndex !== currentQuestionIndex) {
                hasAnsweredThisRound = false;
                document.getElementById('player-waiting-msg').classList.add('hidden');
                document.querySelectorAll('.answer-btn').forEach(b => b.classList.remove('selected', 'disabled-answer'));
                return showToast("That question has already closed.");
            }
            if (d.isPaused) {
                hasAnsweredThisRound = false;
                document.getElementById('player-waiting-msg').classList.add('hidden');
                document.querySelectorAll('.answer-btn').forEach(b => b.classList.remove('selected', 'disabled-answer'));
                return alert("The host has paused the game. You cannot answer right now.");
            }
            if (d.players && d.players[myPlayerId] && d.players[myPlayerId].answeredQuestionIndex === currentQuestionIndex) return;

            const q = questions[currentQuestionIndex];
            const isCorrect = ansIdx === q.correct;
            const timeElapsed = (Date.now() - d.questionStartTime) / 1000;

            let points = 0;
            let newStreak = d.players[myPlayerId].streak || 0;
            let isStreakMultiplierActive = false;

            let receiptBase = 0, receiptSpeed = 0, receiptStreak = 0, receiptDouble = q.isDoublePoints || false;

            if (isCorrect) {
                receiptBase = 500;
                receiptSpeed = Math.floor(Math.max(0, 500 * (1 - (timeElapsed / q.timeLimit))));
                newStreak += 1;
                if (newStreak >= 3) {
                    receiptStreak = Math.floor((receiptBase + receiptSpeed) * 0.2);
                    isStreakMultiplierActive = true;
                }
                points = receiptBase + receiptSpeed + receiptStreak;
                if (receiptDouble) points *= 2;
                if (d.players[myPlayerId].speedBoostActive) points = Math.floor(points * 1.5);
                if (d.players[myPlayerId].multiplierActive) points = Math.floor(points * 2);
            } else {
                newStreak = 0;
            }

            const awardedInventory = awardRandomPowerupIfDeserving(isCorrect, newStreak, timeElapsed, d.players[myPlayerId].inventory || []);

            const playerUpdates = {};
            playerUpdates[`players/${myPlayerId}/hasAnswered`] = true;
            playerUpdates[`players/${myPlayerId}/answeredQuestionIndex`] = currentQuestionIndex;
            playerUpdates[`players/${myPlayerId}/lastAnswerCorrect`] = isCorrect;
            playerUpdates[`players/${myPlayerId}/lastPointsEarned`] = points;
            playerUpdates[`players/${myPlayerId}/score`] = d.players[myPlayerId].score + points;
            playerUpdates[`players/${myPlayerId}/streak`] = newStreak;
            playerUpdates[`players/${myPlayerId}/isStreakMultiplierActive`] = isStreakMultiplierActive;
            playerUpdates[`players/${myPlayerId}/inventory`] = awardedInventory;
            if (d.players[myPlayerId].speedBoostActive) playerUpdates[`players/${myPlayerId}/speedBoostActive`] = false;
            if (d.players[myPlayerId].multiplierActive) playerUpdates[`players/${myPlayerId}/multiplierActive`] = false;
            playerUpdates[`players/${myPlayerId}/receiptBase`] = receiptBase;
            playerUpdates[`players/${myPlayerId}/receiptSpeed`] = receiptSpeed;
            playerUpdates[`players/${myPlayerId}/receiptStreak`] = receiptStreak;
            playerUpdates[`players/${myPlayerId}/receiptDouble`] = receiptDouble;
            playerUpdates[`answersCount/${ansIdx}`] = increment(1);
            playerUpdates[`totalAnswers`] = increment(1);
            playerUpdates[`answers/${myPlayerId}`] = { questionIndex: currentQuestionIndex, optionIndex: ansIdx, elapsedTime: Math.round(timeElapsed * 1000) };

            await update(sessionRef, playerUpdates);
        });
    });

    // Reaction click dispatch emitter
    document.querySelectorAll('.btn-emoji').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!currentGamePin || emojiCooldown) return;
            const emoji = e.currentTarget.getAttribute('data-emoji');
            push(ref(database, `sessions/${currentGamePin}/reactions`), { emoji: emoji, timestamp: Date.now(), uid: myPlayerId });

            emojiCooldown = true;
            document.querySelectorAll('.btn-emoji').forEach(b => b.classList.add('on-cooldown'));
            setTimeout(() => {
                emojiCooldown = false;
                document.querySelectorAll('.btn-emoji').forEach(b => b.classList.remove('on-cooldown'));
            }, 2000);
        });
    });

    document.querySelectorAll('.btn-smack-talk').forEach(btn => {
        btn.onclick = () => {
            if (!currentGamePin) return;
            const text = btn.getAttribute('data-text');
            push(ref(database, `sessions/${currentGamePin}/chat`), { text: text, name: myNickname, timestamp: Date.now() });
            btn.innerText = "Sent!";
            btn.disabled = true;
            setTimeout(() => {
                btn.innerText = text;
                btn.disabled = false;
            }, 3000);
        };
    });

    const hypeBtn = document.getElementById('btn-player-hype');
    if (hypeBtn) {
        let hypeCooldown = false;
        hypeBtn.addEventListener('click', () => {
            if (!currentGamePin || hypeCooldown) return;
            update(ref(database, `sessions/${currentGamePin}`), { hype: increment(1) });
            hypeCooldown = true;
            hypeBtn.style.transform = 'scale(0.9)';
            setTimeout(() => {
                hypeCooldown = false;
                hypeBtn.style.transform = 'scale(1)';
            }, 200);
        });
    }

    // Wire global inventory action nodes
    document.getElementById('btn-donate-item')?.addEventListener('click', toggleDonateMode);
    document.getElementById('btn-dash-donate-item')?.addEventListener('click', toggleDonateMode);
    document.getElementById('btn-strategy-donate-item')?.addEventListener('click', toggleDonateMode);
    document.getElementById('btn-player-tutorial')?.addEventListener('click', () => {
        const modal = document.getElementById('tutorial-modal');
        if (modal) { modal.style.display = 'flex'; modal.classList.remove('hidden'); initTutorialCarousel(); }
    });
    document.getElementById('btn-host-tutorial')?.addEventListener('click', () => {
        const modal = document.getElementById('tutorial-modal');
        if (modal) { modal.style.display = 'flex'; modal.classList.remove('hidden'); initTutorialCarousel(); }
    });
    document.getElementById('btn-close-tutorial')?.addEventListener('click', () => {
        const modal = document.getElementById('tutorial-modal');
        if (modal) { modal.style.display = 'none'; modal.classList.add('hidden'); }
    });
    document.getElementById('btn-cancel-target')?.addEventListener('click', () => {
        document.getElementById('player-target-modal')?.classList.add('hidden');
        selectedInventoryIndex = null;
        document.querySelectorAll('.inventory-slot').forEach(s => s.classList.remove('selected'));
    });

    let currentAdminTargetId = null;
    window.openAdminModal = function(playerId, playerName) {
        currentAdminTargetId = playerId;
        document.getElementById('admin-target-name').innerText = `Adjusting: ${playerName}`;
        document.getElementById('admin-points-input').value = '';
        document.getElementById('admin-powerup-select').value = '';
        
        const specialEvents = document.getElementById('admin-special-events-container');
        if (specialEvents) specialEvents.style.display = playerId === 'ALL' ? 'block' : 'none';

        const modal = document.getElementById('host-admin-modal');
        if (modal) { modal.style.display = 'flex'; modal.classList.remove('hidden'); }
    };

    document.getElementById('btn-global-admin')?.addEventListener('click', () => {
        openAdminModal('ALL', 'Everyone (Global Override)');
    });

    document.getElementById('btn-admin-cancel')?.addEventListener('click', () => {
        const modal = document.getElementById('host-admin-modal');
        if (modal) { modal.style.display = 'none'; modal.classList.add('hidden'); }
    });

    document.getElementById('btn-admin-save')?.addEventListener('click', async () => {
        if (!currentAdminTargetId || !currentGamePin) return;
        const pts = parseInt(document.getElementById('admin-points-input').value) || 0;
        const pwr = document.getElementById('admin-powerup-select').value;
        
        if (currentAdminTargetId === 'ALL') {
            const playersRef = ref(database, `sessions/${currentGamePin}/players`);
            const snap = await get(playersRef);
            if (!snap.exists()) return;
            const players = snap.val();
            const updates = {};
            
            Object.keys(players).forEach(pId => {
                const pData = players[pId];
                if (pts !== 0) {
                    updates[`players/${pId}/score`] = (pData.score || 0) + pts;
                }
                if (pwr) {
                    const randomPowers = ['steal', 'freeze', 'shield', 'multiplier', 'redacted'];
                    const powerType = pwr === 'random' ? randomPowers[Math.floor(Math.random() * randomPowers.length)] : pwr;
                    const inv = pData.inventory || [];
                    if (inv.length < 3) {
                        inv.push(normalizePowerupItem({ type: powerType, acquiredAt: Date.now() }));
                        updates[`players/${pId}/inventory`] = inv;
                    }
                }
            });
            
            if (Object.keys(updates).length > 0) {
                await update(ref(database, `sessions/${currentGamePin}`), updates);
            }
        } else {
            const playerRef = ref(database, `sessions/${currentGamePin}/players/${currentAdminTargetId}`);
            const snap = await get(playerRef);
            if (snap.exists()) {
                const updates = {};
                if (pts !== 0) updates.score = increment(pts);
                
                if (pwr) {
                    const randomPowers = ['steal', 'freeze', 'shield', 'multiplier', 'redacted'];
                    const powerType = pwr === 'random' ? randomPowers[Math.floor(Math.random() * randomPowers.length)] : pwr;
                    const pData = snap.val();
                    const inv = pData.inventory || [];
                    if (inv.length < 3) {
                        inv.push(normalizePowerupItem({ type: powerType, acquiredAt: Date.now() }));
                        updates.inventory = inv;
                    } else {
                        alert("Player inventory is full (max 3 items). Cannot grant power-up.");
                    }
                }
                
                if (Object.keys(updates).length > 0) {
                    await update(playerRef, updates);
                }
            }
        }
        
        document.getElementById('btn-admin-cancel').click();
        
        // Refresh the host leaderboard to reflect changes
        if (document.getElementById('view-host-leaderboard')?.classList.contains('active')) {
            renderHostLeaderboardContent();
        }
    });

    document.getElementById('btn-admin-mystery-box')?.addEventListener('click', async () => {
        if (!currentGamePin) return;
        await update(ref(database, `sessions/${currentGamePin}`), {
            activeEvent: 'mystery_box',
            mysteryBoxWinner: null,
            eventStartTime: Date.now()
        });
        document.getElementById('btn-admin-cancel').click();
    });

    document.getElementById('btn-admin-boss')?.addEventListener('click', async () => {
        if (!currentGamePin) return;
        await update(ref(database, `sessions/${currentGamePin}`), {
            activeEvent: 'boss_battle',
            bossHp: 1000,
            bossMaxHp: 1000,
            eventStartTime: Date.now()
        });
        document.getElementById('btn-admin-cancel').click();
    });

    // Leave Room — player self-removal
    document.getElementById('btn-leave-room')?.addEventListener('click', async () => {
        if (!currentGamePin || !myPlayerId) return;
        if (confirm("Are you sure you want to leave the room?")) {
            await remove(ref(database, `sessions/${currentGamePin}/players/${myPlayerId}`));
            currentGamePin = null;
            myPlayerId = null;
            myNickname = null;
            currentGameState = null;
            lastInitializedQuestionIndex = -1;
            sessionStorage.removeItem('dashboard_wars_player_session');
            switchView('view-landing');
        }
    });
    document.getElementById('btn-player-sync-view')?.addEventListener('click', async () => {
        if (!currentGamePin || !myPlayerId) {
            switchView('view-player-join');
            return;
        }
        const syncButton = document.getElementById('btn-player-sync-view');
        syncButton.disabled = true;
        syncButton.textContent = 'Syncing…';
        try {
            lastInitializedQuestionIndex = -1;
            await update(ref(database, `sessions/${currentGamePin}/players/${myPlayerId}`), {
                lastSyncRequest: Date.now(),
                online: true
            });
            showToast('Game view synced.', '#2563eb');
        } catch (error) {
            showToast('Sync failed. Check your connection and try again.');
        } finally {
            syncButton.disabled = false;
            syncButton.textContent = '🔄 Sync';
        }
    });

    // Special Event Interactivity
    document.getElementById('btn-grab-mystery-box')?.addEventListener('click', async () => {
        if (!currentGamePin || !myPlayerId) return;
        const btn = document.getElementById('btn-grab-mystery-box');
        if (btn.disabled) return;
        btn.disabled = true;
        btn.innerText = "GRABBING...";

        const boxRef = ref(database, `sessions/${currentGamePin}/mysteryBoxWinner`);
        
        try {
            const result = await runTransaction(boxRef, (currentData) => {
                if (currentData === null) {
                    return myPlayerId;
                }
                return; // Abort if already claimed
            });

            if (result.committed) {
                // I won!
                const points = Math.random() > 0.5 ? 1000 : 500;
                const pwr = ['steal', 'freeze', 'shield', 'multiplier'][Math.floor(Math.random() * 4)];
                const playerRef = ref(database, `sessions/${currentGamePin}/players/${myPlayerId}`);
                const pSnap = await get(playerRef);
                if (pSnap.exists()) {
                    const pData = pSnap.val();
                    const inv = pData.inventory || [];
                    const updates = { score: increment(points) };
                    if (inv.length < 3) {
                        inv.push(normalizePowerupItem({ type: pwr, acquiredAt: Date.now() }));
                        updates.inventory = inv;
                    }
                    await update(playerRef, updates);
                }
            } else {
                btn.innerText = "❌ TOO LATE!";
            }
        } catch (error) {
            console.error("Mystery box error:", error);
            btn.disabled = false;
            btn.innerText = "GRAB IT!";
        }
    });

    document.getElementById('btn-attack-boss')?.addEventListener('click', () => {
        if (!currentGamePin || !myPlayerId) return;
        
        const btn = document.getElementById('btn-attack-boss');
        if (btn.disabled) return;

        // Instant Visual feedback
        btn.style.transform = 'scale(0.9)';
        setTimeout(() => btn.style.transform = 'scale(1)', 50);

        // Optimistic Fire-and-forget to remove latency bottlenecks!
        update(ref(database, `sessions/${currentGamePin}`), { bossHp: increment(-10) }).catch(err => {
            console.error("Boss attack failed:", err);
        });
    });

    // Sandbox Controls Wiring
    document.getElementById('btn-toggle-sandbox')?.addEventListener('click', toggleSandbox);
    document.getElementById('btn-toggle-sandbox-lobby')?.addEventListener('click', toggleSandbox);
    document.getElementById('btn-close-sandbox')?.addEventListener('click', closeSandbox);
    document.getElementById('btn-minimize-sandbox')?.addEventListener('click', () => {
        const panel = document.getElementById('sandbox-simulator-panel');
        const btn = document.getElementById('btn-minimize-sandbox');
        panel.classList.toggle('minimized');
        btn.innerText = panel.classList.contains('minimized') ? '+' : '−';
    });

    // Sandbox Panel Simulation Actions
    document.getElementById('btn-sandbox-bots')?.addEventListener('click', async () => {
        if (!currentGamePin) return setSandboxStatus('⚠️ No active game session.');
        const snap = await get(ref(database, `sessions/${currentGamePin}`));
        const data = snap.val();
        if (!data) return;
        const botNames = ['Bot_Alpha', 'Bot_Bravo', 'Bot_Charlie'];
        const existingNames = Object.values(data.players || {}).map(p => p.name);
        let spawned = 0;
        for (const name of botNames) {
            if (existingNames.includes(name)) continue;
            const botId = 'bot_' + generateId();
            const botData = { name, score: Math.floor(Math.random() * 800), hasAnswered: false, lastAnswerCorrect: false, lastPointsEarned: 0, streak: Math.floor(Math.random() * 4), isBot: true };
            if (data.teamMode) botData.team = TEAM_COLORS[Math.floor(Math.random() * (data.teamCount || 4))].key;
            await set(ref(database, `sessions/${currentGamePin}/players/${botId}`), botData);
            spawned++;
        }
        setSandboxStatus(spawned > 0 ? `¼️ ${spawned} bot(s) spawned in lobby!` : '¹️ Bots already exist.');
    });

    document.getElementById('btn-sandbox-autoanswer')?.addEventListener('click', async () => {
        if (!currentGamePin) return setSandboxStatus('⚠️ No active game session.');
        const snap = await get(ref(database, `sessions/${currentGamePin}`));
        const data = snap.val();
        if (!data || data.state !== 'question') return setSandboxStatus('⚠️ No active question. Start a question first.');
        const bots = Object.entries(data.players || {}).filter(([, p]) => p.isBot && !p.hasAnswered);
        if (bots.length === 0) return setSandboxStatus('⚠️ No bots found. Spawn bots first.');
        const q = data.questions[data.currentQuestionIndex];
        const updates = {};
        for (const [botId, bot] of bots) {
            const isCorrect = Math.random() < 0.65;
            const timeElapsed = Math.random() * (q.timeLimit || 20);
            const speedBonus = isCorrect ? Math.floor(Math.max(0, 500 * (1 - (timeElapsed / (q.timeLimit || 20))))) : 0;
            let newStreak = isCorrect ? (bot.streak || 0) + 1 : 0;
            let points = isCorrect ? 500 + speedBonus : 0;
            if (isCorrect && newStreak >= 3) points = Math.floor(points * 1.2);
            updates[`players/${botId}/hasAnswered`] = true;
            updates[`players/${botId}/lastAnswerCorrect`] = isCorrect;
            updates[`players/${botId}/lastPointsEarned`] = points;
            updates[`players/${botId}/score`] = (bot.score || 0) + points;
            updates[`players/${botId}/streak`] = newStreak;
            updates['totalAnswers'] = increment(1);
        }
        await update(ref(database, `sessions/${currentGamePin}`), updates);
        setSandboxStatus(`¼️ ${bots.length} bot(s) answered!`);
    });

    document.getElementById('btn-sandbox-teammode')?.addEventListener('click', async () => {
        if (!currentGamePin) return setSandboxStatus('⚠️ No active game session.');
        const snap = await get(ref(database, `sessions/${currentGamePin}`));
        const data = snap.val();
        if (!data) return;
        const newTeamMode = !data.teamMode;
        const sandboxTeamCount = Math.min(8, Math.max(2, data.teamCount || 4));
        await update(ref(database, `sessions/${currentGamePin}`), { teamMode: newTeamMode, teamCount: sandboxTeamCount, teamAssign: 'auto', teamLabelMode: data.teamLabelMode || 'groups' });
        if (newTeamMode && data.players) {
            const playerKeys = Object.keys(data.players);
            const teamUpdates = {};
            playerKeys.forEach((key, idx) => {
                teamUpdates[`players/${key}/team`] = TEAM_COLORS[idx % sandboxTeamCount].key;
            });
            await update(ref(database, `sessions/${currentGamePin}`), teamUpdates);
        }
        const btn = document.getElementById('btn-sandbox-teammode');
        if (btn) btn.style.borderColor = newTeamMode ? '#22c55e' : '#4bc0c0';
        setSandboxStatus(newTeamMode ? `Team mode ON — assigned across ${sandboxTeamCount} groups!` : 'Team mode OFF.');
    });

    document.getElementById('btn-sandbox-grantpowerup')?.addEventListener('click', async () => {
        if (!currentGamePin) return setSandboxStatus('⚠️ No active game session.');
        const snap = await get(ref(database, `sessions/${currentGamePin}/players`));
        const players = snap.val() || {};
        const simEntry = Object.entries(players).find(([, p]) => p.isSim || p.name === 'DemoPlayer');
        if (!simEntry) return setSandboxStatus('⚠️ Sim player not found. Open sandbox iframe first.');
        const [simId, simVal] = simEntry;
        
        const items = [
            { type: 'shield', name: 'Defensive Shield', emoji: '🛡️' },
            { type: 'blur', name: 'Foggy Window', emoji: '🌫️' },
            { type: 'shuffle', name: 'Answer Shuffle', emoji: '🔀' },
            { type: 'glitch', name: 'Glitch Out', emoji: '📺' },
            { type: 'emoji_flood', name: 'Emoji Flood', emoji: '🎈' },
            { type: 'redacted', name: 'Redacted Question', emoji: '🕵️' },
            { type: 'steal', name: 'Point Steal', emoji: '💰' },
            { type: 'freeze', name: 'Time Freeze', emoji: '⏳' },
            { type: 'double_shield', name: 'Double Shield', emoji: '🛡️🛡️' },
            { type: 'speed_boost', name: 'Speed Boost', emoji: '⚡' }
        ];
        const chosen = items[Math.floor(Math.random() * items.length)];
        const curInv = Array.isArray(simVal.inventory) ? [...simVal.inventory] : [];
        if (curInv.length >= 3) return setSandboxStatus('⚠️ Sim player inventory full.');
        curInv.push(chosen);
        await update(ref(database, `sessions/${currentGamePin}/players/${simId}`), { inventory: curInv });
        setSandboxStatus(`¼️ Sim player got: ${chosen.emoji} ${chosen.name}!`);
    });

    document.getElementById('btn-sandbox-attack')?.addEventListener('click', async () => {
        if (!currentGamePin) return setSandboxStatus('⚠️ No active game session.');
        const snap = await get(ref(database, `sessions/${currentGamePin}/players`));
        const players = snap.val() || {};
        const targets = Object.entries(players).filter(([, p]) => p.isSim || p.isBot);
        if (targets.length === 0) return setSandboxStatus('⚠️ No targets found.');
        const [targetId, targetPlayer] = targets[Math.floor(Math.random() * targets.length)];
        const attackTypes = ['blur', 'shuffle', 'glitch', 'emoji_flood', 'steal', 'freeze', 'redacted'];
        const type = attackTypes[Math.floor(Math.random() * attackTypes.length)];
        const attackRef = push(ref(database, `sessions/${currentGamePin}/attacks`));
        await set(attackRef, { attackerId: 'sandbox_host', attackerName: '¼️ Host Demo', targetId, targetName: targetPlayer.name, type, timestamp: Date.now(), blocked: false });
        setSandboxStatus(`¼️ ${type.toUpperCase()} attack launched on ${targetPlayer.name}!`);
    });

    document.getElementById('btn-sandbox-shield')?.addEventListener('click', async () => {
        if (!currentGamePin) return setSandboxStatus('⚠️ No active game session.');
        const snap = await get(ref(database, `sessions/${currentGamePin}/players`));
        const players = snap.val() || {};
        const bots = Object.entries(players).filter(([, p]) => p.isBot || p.isSim);
        if (bots.length === 0) return setSandboxStatus('⚠️ No bots found.');
        const [botId, botPlayer] = bots[0];
        await update(ref(database, `sessions/${currentGamePin}/players/${botId}`), { shieldCount: 2, shieldActive: true });
        setSandboxStatus(`🛡️ Double Shield given to ${botPlayer.name}.`);
        setTimeout(async () => {
            const attackRef = push(ref(database, `sessions/${currentGamePin}/attacks`));
            await set(attackRef, { attackerId: 'sandbox_host', attackerName: '¼️ Host Demo', targetId: botId, targetName: botPlayer.name, type: 'blur', timestamp: Date.now(), blocked: false });
        }, 1000);
    });

    // Draggable Control Interface Engine
    (function initSandboxDrag() {
        const handle = document.getElementById('sandbox-drag-handle');
        const panel = document.getElementById('sandbox-simulator-panel');
        if (!handle || !panel) return;
        let isDragging = false, startX, startY, startLeft, startTop;
        handle.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button')) return;
            isDragging = true;
            handle.setPointerCapture(e.pointerId);
            const rect = panel.getBoundingClientRect();
            startX = e.clientX; startY = e.clientY;
            startLeft = rect.left; startTop = rect.top;
            panel.style.left = rect.left + 'px'; panel.style.top = rect.top + 'px';
            panel.style.right = 'auto'; panel.style.bottom = 'auto';
            e.preventDefault();
        });
        handle.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX, dy = e.clientY - startY;
            panel.style.left = Math.max(0, Math.min(window.innerWidth - 100, startLeft + dx)) + 'px';
            panel.style.top = Math.max(0, Math.min(window.innerHeight - 50, startTop + dy)) + 'px';
        });
        handle.addEventListener('pointerup', () => isDragging = false);
        handle.addEventListener('pointercancel', () => isDragging = false);
    })();

    // Automation Simulator Deep Query Params Parser Route
    (async () => {
        const simParams = new URLSearchParams(window.location.search);
        const simPin = simParams.get('pin');
        const simMode = simParams.get('sim');
        const simName = simParams.get('nickname') || 'DemoPlayer';

        if (simMode === '1' && simPin) {
            await new Promise(r => setTimeout(r, 800));
            const sessionSnap = await get(ref(database, `sessions/${simPin}`));
            if (!sessionSnap.exists()) return;
            const data = sessionSnap.val();
            if (data.state !== 'lobby') return;
            const existingNames = Object.values(data.players || {}).map(p => p.name.toLowerCase());
            if (existingNames.includes(simName.toLowerCase())) return;

            document.getElementById('input-pin').value = simPin;
            document.getElementById('input-nickname').value = simName;
            document.getElementById('form-join').requestSubmit();
        }
    })();

    // Host Keyboard Hotkeys
    document.addEventListener('keydown', (e) => {
        if (!hostId || myPlayerId !== hostId) return; // Only host can use hotkeys
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        if (e.code === 'Space') {
            e.preventDefault();
            const nextBtn = document.getElementById('btn-next-question');
            const startBtn = document.getElementById('btn-start-game');
            const dashNextBtn = document.getElementById('btn-dash-next');
            if (nextBtn && !nextBtn.classList.contains('hidden') && nextBtn.style.display !== 'none') nextBtn.click();
            else if (startBtn && !startBtn.disabled && startBtn.style.display !== 'none') startBtn.click();
            else if (dashNextBtn && !dashNextBtn.classList.contains('hidden') && dashNextBtn.style.display !== 'none') dashNextBtn.click();
        }
        else if (e.code === 'KeyE') {
            e.preventDefault();
            const endBtn = document.getElementById('btn-end-game-early');
            const dashEndBtn = document.getElementById('btn-dash-end-game-early');
            if (endBtn && endBtn.offsetParent !== null) endBtn.click();
            else if (dashEndBtn && dashEndBtn.offsetParent !== null) dashEndBtn.click();
        }
        else if (e.code === 'KeyM') {
            e.preventDefault();
            const music = document.getElementById('bg-music');
            if (music) {
                music.muted = !music.muted;
                showToast(music.muted ? '🔇 Music Muted' : '🔊 Music Unmuted');
            }
        }
    });
}

// Global scope attachments for visual orchestration
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

const urlParams = new URLSearchParams(window.location.search);
if (!IS_SIMULATOR_CLIENT) {
    try {
        const lastJoin = JSON.parse(localStorage.getItem('dashboard_wars_last_join') || 'null');
        if (lastJoin?.pin) document.getElementById('input-pin').value = lastJoin.pin;
        if (lastJoin?.nickname) document.getElementById('input-nickname').value = lastJoin.nickname;
    } catch {}
}
if (urlParams.has('pin')) {
    switchView('view-player-join');
    const inputPin = document.getElementById('input-pin');
    if (inputPin) inputPin.value = urlParams.get('pin');
}

async function recoverStoredHostSession() {
    if (IS_SIMULATOR_CLIENT || urlParams.has('pin')) return;
    const raw = sessionStorage.getItem('dashboard_wars_host_session');
    if (!raw || !isFirebaseEnabled) return;
    try {
        const saved = JSON.parse(raw);
        const snapshot = await get(ref(database, `sessions/${saved.pin}`));
        if (!snapshot.exists()) {
            sessionStorage.removeItem('dashboard_wars_host_session');
            return;
        }
        const session = snapshot.val();
        isHost = true;
        currentGamePin = saved.pin;
        questions = session.questions || saved.questions || [];
        currentGameMode = session.mode || saved.mode || 'classic';
        currentHostedQuizTitle = saved.title || 'Recovered Session';
        currentQuestionIndex = session.currentQuestionIndex || 0;
        currentGameState = session.state;
        sessionStorage.removeItem('dashboard_wars_player_session');
        document.getElementById('display-game-pin').innerText = currentGamePin;
        document.getElementById('display-join-url').innerHTML = `Join at <strong>${window.location.host}</strong> with PIN:`;
        const qrContainer = document.getElementById('qr-code-container');
        if (qrContainer) {
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, { text: `${window.location.origin}${window.location.pathname}?pin=${currentGamePin}`, width: 160, height: 160 });
        }

        onValue(ref(database, `sessions/${currentGamePin}/totalAnswers`), async answerSnapshot => {
            const total = answerSnapshot.val() || 0;
            document.getElementById('answers-count').innerText = `${total} Answers`;
            const dashCount = document.getElementById('dash-answers-count');
            if (dashCount) dashCount.innerText = `${total} Answers`;
        });

        if (session.state === 'question') {
            const q = questions[currentQuestionIndex];
            if (q?.dashboardData) startDashboardQuestion(currentQuestionIndex, session);
            else startQuestion(currentQuestionIndex, session);
        } else if (session.state === 'results' || session.state === 'results_dash') {
            if (questions[currentQuestionIndex]?.dashboardData) showDashboardResults();
            else showHostResults();
        } else if (session.state === 'leaderboard' || session.state === 'game_over') {
            showHostLeaderboard();
        } else {
            switchView('view-host-lobby');
            onValue(ref(database, `sessions/${currentGamePin}/players`), playersSnapshot => {
                const players = playersSnapshot.val() || {};
                const entries = Object.values(players).filter(player => player.online !== false);
                document.getElementById('player-count').innerText = entries.length;
                const list = document.getElementById('player-list');
                list.innerHTML = '';
                entries.forEach(player => {
                    const tag = document.createElement('div');
                    tag.className = 'player-tag';
                    tag.textContent = player.name;
                    list.appendChild(tag);
                });
                document.getElementById('btn-start-game').disabled = entries.length === 0;
            });
        }
        showToast('Host session recovered.', '#2563eb');
    } catch (error) {
        console.error('Host recovery failed:', error);
    }
}

setTimeout(recoverStoredHostSession, 250);

setTimeout(async () => {
    if (IS_SIMULATOR_CLIENT || urlParams.has('pin') || sessionStorage.getItem('dashboard_wars_host_session')) return;
    const raw = sessionStorage.getItem('dashboard_wars_player_session');
    if (!raw || !isFirebaseEnabled) return;
    try {
        const saved = JSON.parse(raw);
        const room = await get(ref(database, `sessions/${saved.pin}`));
        const player = await get(ref(database, `sessions/${saved.pin}/players/${saved.playerId}`));
        if (!room.exists() || !player.exists() || player.val().deviceId !== getPlayerDeviceId()) {
            sessionStorage.removeItem('dashboard_wars_player_session');
            return;
        }
        switchView('view-player-join');
        document.getElementById('input-pin').value = saved.pin;
        document.getElementById('input-nickname').value = saved.nickname;
        document.getElementById('form-join').requestSubmit();
    } catch {
        sessionStorage.removeItem('dashboard_wars_player_session');
    }
}, 350);

// Bypassing ESM boundary structures safely
window.startCustomQuiz = startCustomQuiz;
