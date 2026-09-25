import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, remove, child, push, onChildAdded, runTransaction, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCEuBPiYcwdBASVBX-QVCoWN9TMQzbfwYk",
  authDomain: "kahoots-bi.firebaseapp.com",
  projectId: "kahoots-bi",
  storageBucket: "kahoots-bi.firebasestorage.app",
  messagingSenderId: "560669020928",
  appId: "1:560669020928:web:a3be350c311a7d7caf19e5",
  measurementId: "G-L81DCVHZRG",
  databaseURL: "https://kahoots-bi-default-rtdb.asia-southeast1.firebasedatabase.app"
};

let app, database, storage;
let isFirebaseEnabled = false;

try {
    if (Object.keys(firebaseConfig).length > 0) {
        app = initializeApp(firebaseConfig);
        storage = getStorage(app);

        if (firebaseConfig.databaseURL) {
            database = getDatabase(app, firebaseConfig.databaseURL);
            isFirebaseEnabled = true;
            console.log("Firebase and Realtime Database initialized successfully.");
        } else {
            console.warn("Firebase project initialized, but Realtime Database is disabled until databaseURL is configured.");
        }
    } else {
        console.warn("Firebase config is empty. Live sync will not work.");
    }
} catch (error) {
    console.error("Firebase initialization error:", error);
}

export { database, storage, ref, set, get, update, onValue, remove, child, push, onChildAdded, runTransaction, onDisconnect, storageRef, uploadBytes, getDownloadURL, isFirebaseEnabled };
