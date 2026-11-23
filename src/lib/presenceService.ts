import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { onDisconnect, onValue, ref, serverTimestamp as rtdbTimestamp, set } from 'firebase/database';
import { db, rtdb } from '../firebase';

const activeCleanups = new Map<string, () => void>();

export async function setFirestoreOnlineStatus(uid: string, online: boolean): Promise<void> {
  if (!uid) return;
  try {
    await updateDoc(doc(db, 'userDirectory', uid), {
      online,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal if userDirectory document is still initializing or offline
  }
}

export function startPresenceTracking(uid: string): () => void {
  const existing = activeCleanups.get(uid);
  if (existing) {
    return existing;
  }

  let disposed = false;
  let rtdbUnsub: (() => void) | null = null;

  const updateStatus = (online: boolean) => {
    if (disposed) return;
    void setFirestoreOnlineStatus(uid, online);
  };

  // Mark online immediately
  updateStatus(true);

  // Optional RTDB .info/connected + onDisconnect mirror when configured
  if (rtdb) {
    try {
      const connectedRef = ref(rtdb, '.info/connected');
      const userPresenceRef = ref(rtdb, `presence/${uid}`);
      rtdbUnsub = onValue(connectedRef, (snap) => {
        if (disposed || snap.val() !== true) return;
        void onDisconnect(userPresenceRef)
          .set({ online: false, lastSeen: rtdbTimestamp() })
          .then(() => set(userPresenceRef, { online: true, lastSeen: rtdbTimestamp() }))
          .catch(() => {});
      });
    } catch {
      rtdbUnsub = null;
    }
  }

  // Heartbeat every 45s while visible
  const intervalId = window.setInterval(() => {
    if (!disposed && document.visibilityState === 'visible' && navigator.onLine) {
      updateStatus(true);
    }
  }, 45_000);

  const onVisibilityChange = () => {
    if (disposed) return;
    updateStatus(document.visibilityState === 'visible' && navigator.onLine);
  };

  const onOnline = () => updateStatus(document.visibilityState === 'visible');
  const onOffline = () => updateStatus(false);
  const onPageHide = () => updateStatus(false);

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onPageHide);

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    window.clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onPageHide);
    if (rtdbUnsub) {
      rtdbUnsub();
      rtdbUnsub = null;
    }
    if (rtdb) {
      try {
        void set(ref(rtdb, `presence/${uid}`), { online: false, lastSeen: rtdbTimestamp() }).catch(
          () => {}
        );
      } catch {
        // Ignore
      }
    }
    void setFirestoreOnlineStatus(uid, false);
    activeCleanups.delete(uid);
  };

  activeCleanups.set(uid, cleanup);
  return cleanup;
}

export async function markPresenceOffline(uid: string): Promise<void> {
  const cleanup = activeCleanups.get(uid);
  if (cleanup) {
    cleanup();
    return;
  }
  await setFirestoreOnlineStatus(uid, false);
}
