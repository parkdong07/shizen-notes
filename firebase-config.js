// firebase-config.js
// Firebase is loaded via CDN in app.js via importmap or dynamic import
// Config values are injected by CI into env.js

export function getFirebaseConfig() {
  // env.js must be loaded before this (via <script src="env.js"> in HTML)
  if (typeof __ENV__ === 'undefined') {
    console.error('[Shizen] env.js not loaded. Using fallback (dev mode).');
    // DEV ONLY: paste your Firebase config here for local testing
    return {
      apiKey:            "YOUR_API_KEY",
      authDomain:        "YOUR_PROJECT.firebaseapp.com",
      projectId:         "YOUR_PROJECT_ID",
      storageBucket:     "YOUR_PROJECT.appspot.com",
      messagingSenderId: "YOUR_SENDER_ID",
      appId:             "YOUR_APP_ID",
      vapidKey:          "YOUR_VAPID_KEY",
    };
  }
  return __ENV__;
}
