// ─────────────────────────────────────────────────────────────────────
// Small Town Select — Firebase init (shared by public pages + admin).
//
// ⚠️  PASTE THE STS firebaseConfig BELOW (Firebase console → Project settings
//     → Web app). Until you do, isConfigured stays false and the site runs on
//     built-in sample data so every page still renders for preview.
//
//     This is a NEW, SEPARATE Firebase project from D27/DVSL.
// ─────────────────────────────────────────────────────────────────────
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyD9JVIrRYSI6Y9ydU5TYThHBsBKYeu1Hvo",
  authDomain: "small-town-select.firebaseapp.com",
  projectId: "small-town-select",
  storageBucket: "small-town-select.firebasestorage.app",
  messagingSenderId: "879539750087",
  appId: "1:879539750087:web:8515a0d8a74c47c7f02ae2"
};

export const isConfigured = !String(firebaseConfig.apiKey).startsWith('PASTE');

let app = null, db = null, auth = null;
if (isConfigured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
}
export { app, db, auth };
