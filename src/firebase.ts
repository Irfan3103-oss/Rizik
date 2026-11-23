import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import defaultAppletConfig from '../firebase-applet-config.json';

function isPlaceholderEnv(val: unknown): boolean {
  if (typeof val !== 'string') return true;
  const trimmed = val.trim();
  if (!trimmed) return true;
  return (
    trimmed.includes('...') ||
    trimmed.includes('your-') ||
    trimmed.includes('example') ||
    trimmed === '123456789012' ||
    trimmed === '1:123456789012:web:abcdef123456'
  );
}

function pickFirebaseEnv(envVal: unknown, fallback: string): string {
  return isPlaceholderEnv(envVal) ? fallback : String(envVal).trim();
}

const hasCustomProjectEnv = !isPlaceholderEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID);
const rawEnvDbId =
  typeof import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID === 'string'
    ? import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID.trim()
    : '';

// Read from VITE_FIREBASE_* environment variables, falling back to firebase-applet-config.json
const firebaseConfig = {
  apiKey: pickFirebaseEnv(import.meta.env.VITE_FIREBASE_API_KEY, defaultAppletConfig.apiKey),
  authDomain: pickFirebaseEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, defaultAppletConfig.authDomain),
  projectId: pickFirebaseEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID, defaultAppletConfig.projectId),
  storageBucket: pickFirebaseEnv(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, defaultAppletConfig.storageBucket),
  messagingSenderId: pickFirebaseEnv(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, defaultAppletConfig.messagingSenderId),
  appId: pickFirebaseEnv(import.meta.env.VITE_FIREBASE_APP_ID, defaultAppletConfig.appId),
  firestoreDatabaseId:
    hasCustomProjectEnv && !isPlaceholderEnv(rawEnvDbId)
      ? rawEnvDbId
      : defaultAppletConfig.firestoreDatabaseId,
  measurementId: pickFirebaseEnv(
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    defaultAppletConfig.measurementId || ''
  ),
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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
  const rawRtdbEnv = import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined;
  const configuredRtdbUrl =
    (!isPlaceholderEnv(rawRtdbEnv) ? rawRtdbEnv?.trim() : undefined) ||
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
