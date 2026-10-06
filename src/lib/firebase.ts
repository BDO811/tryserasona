import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

// All values are public client config (safe to ship), not secrets. Firebase
// project setup is documented in docs/SETUP_BILLING.md.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// getAuth() throws synchronously on an invalid/empty apiKey, which — because
// this module sits at the top of the import graph (App -> AuthContext ->
// firebase.ts) — used to take down the entire SPA, including the anonymous
// demo flow that has nothing to do with accounts. Accounts simply stay
// unavailable (see AuthContext) until real keys are filled in.
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId
);

let firebaseApp: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

if (isFirebaseConfigured) {
  firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  authInstance = getAuth(firebaseApp);
  dbInstance = getFirestore(firebaseApp);
}

export { firebaseApp };
export const auth = authInstance;
export const db = dbInstance;
