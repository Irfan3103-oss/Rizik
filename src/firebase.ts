import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import {
  doc,
  enableNetwork,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
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

const configuredDatabaseUrl = pickFirebaseEnv(
  import.meta.env.VITE_FIREBASE_DATABASE_URL,
  ((defaultAppletConfig as { databaseURL?: string }).databaseURL ?? '').trim()
);

// Read from VITE_FIREBASE_* environment variables, falling back to firebase-applet-config.json
const firebaseConfig = {
  apiKey: pickFirebaseEnv(import.meta.env.VITE_FIREBASE_API_KEY, defaultAppletConfig.apiKey),
  authDomain: pickFirebaseEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, defaultAppletConfig.authDomain),
  ...(configuredDatabaseUrl ? { databaseURL: configuredDatabaseUrl } : {}),
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

function createFirestoreInstance(): Firestore {
  const dbId = firebaseConfig.firestoreDatabaseId;
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      dbId
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          experimentalForceLongPolling: true,
          localCache: memoryLocalCache(),
        },
        dbId
      );
    } catch {
      return getFirestore(app, dbId);
    }
  }
}

export const db = createFirestoreInstance();
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
  if (configuredDatabaseUrl && configuredDatabaseUrl.startsWith('https://')) {
    rtdbInstance = getDatabase(app, configuredDatabaseUrl);
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

export interface FirestoreListenerError {
  code: string;
  message: string;
  path: string | null;
  operationType: OperationType;
  indexUrl: string | null;
  isIndexError: boolean;
  isPermissionError: boolean;
}

function extractFirestoreErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return String((error as { code: string }).code);
  }
  const msg = error instanceof Error ? error.message : String(error ?? '');
  if (msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
    return 'permission-denied';
  }
  if (msg.includes('failed-precondition') || msg.includes('requires an index')) {
    return 'failed-precondition';
  }
  if (msg.includes('unauthenticated')) {
    return 'unauthenticated';
  }
  if (msg.includes('unavailable')) {
    return 'unavailable';
  }
  return 'unknown';
}

function extractIndexUrl(message: string): string | null {
  const match = message.match(/https:\/\/console\.firebase\.google\.com\/[^\s"')]+/);
  return match ? match[0] : null;
}

export function parseFirestoreListenerError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreListenerError {
  const code = extractFirestoreErrorCode(error);
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown Firestore error');
  const indexUrl = extractIndexUrl(message);
  const isIndexError =
    code === 'failed-precondition' ||
    message.toLowerCase().includes('requires an index') ||
    Boolean(indexUrl);
  const isPermissionError = code === 'permission-denied' || code === 'unauthenticated';

  const errInfo: FirestoreErrorInfo = {
    error: `[${code}] ${message}`,
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

  console.error(`Firestore Listener Error (${path || 'unknown'}):`, errInfo, error);

  return {
    code,
    message,
    path,
    operationType,
    indexUrl,
    isIndexError,
    isPermissionError,
  };
}

export function getFirebaseConfigHealth(): {
  ok: boolean;
  missingKeys: string[];
  placeholderKeys: string[];
  projectId: string;
  firestoreDatabaseId: string;
  hasStorageBucket: boolean;
  hasRtdbUrl: boolean;
} {
  const requiredFields: Array<[string, string]> = [
    ['apiKey', firebaseConfig.apiKey],
    ['authDomain', firebaseConfig.authDomain],
    ['projectId', firebaseConfig.projectId],
    ['storageBucket', firebaseConfig.storageBucket],
    ['messagingSenderId', firebaseConfig.messagingSenderId],
    ['appId', firebaseConfig.appId],
    ['firestoreDatabaseId', firebaseConfig.firestoreDatabaseId],
  ];

  const missingKeys: string[] = [];
  const placeholderKeys: string[] = [];

  for (const [key, val] of requiredFields) {
    if (!val || !val.trim()) {
      missingKeys.push(key);
    } else if (isPlaceholderEnv(val)) {
      placeholderKeys.push(key);
    }
  }

  return {
    ok: missingKeys.length === 0 && placeholderKeys.length === 0,
    missingKeys,
    placeholderKeys,
    projectId: firebaseConfig.projectId || '',
    firestoreDatabaseId: firebaseConfig.firestoreDatabaseId || '(default)',
    hasStorageBucket: Boolean(storage),
    hasRtdbUrl: Boolean(rtdb),
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

export function isFirestoreOfflineError(error: unknown): boolean {
  const code = extractFirestoreErrorCode(error);
  if (code === 'unavailable') return true;
  const msg = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  return (
    msg.includes('client is offline') ||
    msg.includes('failed to get document because the client is offline') ||
    msg.includes('network-request-failed') ||
    msg.includes('unavailable')
  );
}

export async function reconnectFirestore(): Promise<void> {
  try {
    await enableNetwork(db);
  } catch {
    // Ignore network toggle errors
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void reconnectFirestore();
  });
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

