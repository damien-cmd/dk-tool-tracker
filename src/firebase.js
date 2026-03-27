import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBCVbarssu_7O8pNBhJgLHmEkfg5P1V6nw",
  authDomain: "dk-tool-tracker-2026.firebaseapp.com",
  projectId: "dk-tool-tracker-2026",
  storageBucket: "dk-tool-tracker-2026.firebasestorage.app",
  messagingSenderId: "143829416825",
  appId: "1:143829416825:web:96d550a53e41454a410da8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
  });
} catch (e) {
  console.warn("Offline persistence blocked, falling back to network:", e);
  db = getFirestore(app);
}

// Secondary Auth instance to create new users without signing out the Admin
const secondaryApp = initializeApp(firebaseConfig, "Secondary");
export const secondaryAuth = getAuth(secondaryApp);
