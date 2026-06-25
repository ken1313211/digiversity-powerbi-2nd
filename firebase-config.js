import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, remove, child, push, onChildAdded, runTransaction, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCKBwPbBoBvGgYgUT03mMBcGnyKbmBfBC0",
  authDomain: "digiversity-vba.firebaseapp.com",
  projectId: "digiversity-vba",
  storageBucket: "digiversity-vba.firebasestorage.app",
  messagingSenderId: "275180996364",
  appId: "1:275180996364:web:d800542fa21cb66a912b29",
  measurementId: "G-MY21PLW0JH",
  databaseURL: "https://digiversity-vba-default-rtdb.asia-southeast1.firebasedatabase.app"
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
