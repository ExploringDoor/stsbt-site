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
  apiKey: "PASTE_STS_API_KEY",
  authDomain: "PASTE.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE.firebasestorage.app",
  messagingSenderId: "PASTE",
  appId: "PASTE"
};

export const isConfigured = !String(firebaseConfig.apiKey).startsWith('PASTE');

let app = null, db = null, auth = null;
if (isConfigured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
}
export { app, db, auth };
