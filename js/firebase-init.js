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

// Demo mode — add ?demo=1 to any page URL to force the built-in SAMPLE data (so the
// site can be shown fully populated without real Firebase). It persists per-browser
// via localStorage; ?demo=0 exits. Real visitors never see it unless they opt in.
function demoMode(){
  var u = null;
  try { u = new URLSearchParams(location.search).get('demo'); } catch (e) {}
  if (u === '1') { try { localStorage.setItem('sts-demo', '1'); } catch (e) {} return true; }   // active this page even if storage is blocked
  if (u === '0') { try { localStorage.removeItem('sts-demo'); } catch (e) {} return false; }
  try { return localStorage.getItem('sts-demo') === '1'; } catch (e) { return false; }
}
export const DEMO = demoMode();
export const isConfigured = !DEMO && !String(firebaseConfig.apiKey).startsWith('PASTE');

let app = null, db = null, auth = null;
if (isConfigured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
}
export { app, db, auth };
