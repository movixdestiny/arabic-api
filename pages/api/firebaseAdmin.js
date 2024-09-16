import admin from 'firebase-admin';
import serviceAccount from './google-services.json'; // Adjust the path to where `google-services.json` is located

// Initialize the Firebase Admin SDK
if (!admin.apps.length) { // Check if an app instance is already initialized to avoid errors on hot reloads
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

export { db };
