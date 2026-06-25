import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, remove, child, push, onChildAdded, runTransaction, increment, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// ==========================================
// USER: PASTE YOUR FIREBASE CONFIG HERE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBNenoP2x8YlxUoQkjJboEgyAEsCBsHLjg",
    authDomain: "powerbi-dashboard-wars.firebaseapp.com",
    databaseURL: "https://powerbi-dashboard-wars-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "powerbi-dashboard-wars",
    storageBucket: "powerbi-dashboard-wars.firebasestorage.app",
    messagingSenderId: "1022872480339",
    appId: "1:1022872480339:web:f0d8caf2066f3008ffb4a6",
    measurementId: "G-SR3SJDMZ9S"
};

let app, database, auth, storage;
let isFirebaseEnabled = false;
let currentUser = null;

try {
    if (Object.keys(firebaseConfig).length > 0) {
        app = initializeApp(firebaseConfig);
        database = getDatabase(app);
        auth = getAuth(app);
        storage = getStorage(app);
        isFirebaseEnabled = true;
        
        onAuthStateChanged(auth, (user) => {
            if (user && !user.isAnonymous) {
                currentUser = user;
                console.log("Logged in as Admin:", user.email);
            } else if (user && user.isAnonymous) {
                // Purge the old anonymous session
                signOut(auth).catch(console.error);
                currentUser = null;
            } else {
                currentUser = null;
                console.log("Admin logged out.");
            }
        });
        
        console.log("Firebase initialized successfully.");
    } else {
        console.warn("Firebase config is empty. Live sync will not work.");
    }
} catch (error) {
    console.error("Firebase initialization error:", error);
}

export { database, auth, storage, ref, set, get, update, onValue, remove, child, push, onChildAdded, runTransaction, increment, onDisconnect, storageRef, uploadBytes, getDownloadURL, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, isFirebaseEnabled };
export const getCurrentUser = () => currentUser;
