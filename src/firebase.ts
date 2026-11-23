import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { doc, getDocFromServer, initializeFirestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import defaultAppletConfig from '../firebase-applet-config.json';

// Read from VITE_FIREBASE_* environment variables, falling back to firebase-applet-config.json
const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) || defaultAppletConfig.apiKey,
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) || defaultAppletConfig.authDomain,
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) || defaultAppletConfig.projectId,
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) || defaultAppletConfig.storageBucket,
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) || defaultAppletConfig.messagingSenderId,
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) || defaultAppletConfig.appId,
  firestoreDatabaseId: (import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID as string | undefined) || defaultAppletConfig.firestoreDatabaseId,
  measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined) || defaultAppletConfig.measurementId || '',
};

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Optional Firebase Storage (for large chat attachments when bucket rules are enabled)
let storageInstance: FirebaseStorage | null = null;
try {
  if (firebaseConfig.storageBucket) {
    storageInstance = getStorage(app);
  }
} catch {
  storageInstance = null;
}
export const storage = storageInstance;

// Optional Firebase Realtime Database for ultra-low-latency online presence
let rtdbInstance: Database | null = null;
try {
  const configuredRtdbUrl =
    (import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined) ||
    ((defaultAppletConfig as Record<string, unknown>).databaseURL as string | undefined);
  if (configuredRtdbUrl && configuredRtdbUrl.startsWith('https://')) {
    rtdbInstance = getDatabase(app, configuredRtdbUrl);
  }
} catch {
  rtdbInstance = null;
}
export const rtdb = rtdbInstance;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      // Offline mode active; Firestore offline persistence handles caching
      return;
    }
  }
}

void testConnection();
