import admin from 'firebase-admin';
import serviceAccount from './google-services.json'; // Correct path to the JSON file

if (!admin.apps.length) {
  try {
    console.log('Initializing Firebase Admin SDK');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error.message);
  }
}

const db = admin.firestore();

export { db };
