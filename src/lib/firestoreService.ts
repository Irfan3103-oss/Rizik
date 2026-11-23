import type { User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  db,
  type FirestoreListenerError,
  handleFirestoreError,
  isFirestoreOfflineError,
  OperationType,
  parseFirestoreListenerError,
  reconnectFirestore,
} from '../firebase';
import { FOOD_CATEGORY_IMAGES } from '../data/images';
import type {
  AccountType,
  Claim,
  DonationCause,
  DonationFrequency,
  DonationRecord,
  FoodCategory,
  Language,
  Listing,
  PaymentMethodId,
  RestaurantInfo,
  ShiftSignup,
  StorageMethod,
  User,
  UserRole,
} from '../types';
import {
  createNewRestaurantOwnerNotification,
  createResubmittedNotification,
  ensureAdminConversationForOwner,
  normalizeRestaurantInfo,
  sendAdminChatMessage,
} from './adminChatService';
import { createCrossUserNotification } from './notificationService';

function clampStr(val: string | undefined | null, maxLen: number): string {
  return (val ?? '').trim().slice(0, maxLen);
}

function timestampToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string' && val.length > 0) {
    return val;
  }
  return new Date().toISOString();
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `id_${Date.now()}`;
}

const AUTHORITATIVE_ADMIN_EMAIL = 'jafor05101007@student.ndub.edu.bd';
const BLOCKED_ADMIN_EMAIL = 'sheikhsahel513@gmail.com';

async function getDocResilient<T = DocumentData>(
  ref: DocumentReference<T>,
  path: string
): Promise<DocumentSnapshot<T> | null> {
  try {
    return await getDoc(ref);
  } catch (firstErr) {
    if (!isFirestoreOfflineError(firstErr)) {
      handleFirestoreError(firstErr, OperationType.GET, path);
    }
    console.warn(`Firestore offline on get(${path}); attempting network reconnect...`, firstErr);
    await reconnectFirestore();
    await new Promise((r) => setTimeout(r, 300));
    try {
      return await getDoc(ref);
    } catch (retryErr) {
      if (!isFirestoreOfflineError(retryErr)) {
        handleFirestoreError(retryErr, OperationType.GET, path);
      }
      try {
        const cached = await getDocFromCache(ref);
        if (cached.exists()) {
          return cached;
        }
      } catch {
        // Not in local cache yet
      }
      return null;
    }
  }
}

export async function checkIsFirebaseAdmin(
  fbUser: FirebaseUser | null,
  forceRefresh = false
): Promise<boolean> {
  if (!fbUser) return false;
  const normalizedEmail = (fbUser.email ?? '').trim().toLowerCase();
  if (normalizedEmail === BLOCKED_ADMIN_EMAIL) {
    return false;
  }

  try {
    let tokenResult = await fbUser.getIdTokenResult(forceRefresh);
    if (fbUser.emailVerified && tokenResult.claims?.email_verified !== true) {
      tokenResult = await fbUser.getIdTokenResult(true);
    }
    if (tokenResult.claims?.admin === true) {
      return true;
    }
  } catch {
    // Ignore token claim lookup errors
  }

  if (!fbUser.emailVerified) {
    return false;
  }

  let sawOfflineError = false;
  try {
    const adminDoc = await getDoc(doc(db, 'admins', fbUser.uid));
    if (adminDoc.exists() && adminDoc.data()?.enabled === false) {
      return false;
    }
  } catch (err) {
    if (isFirestoreOfflineError(err)) {
      sawOfflineError = true;
    }
  }

  // Server-authoritative Firestore Rules probe: readable ONLY when isAdmin() in firestore.rules evaluates true
  try {
    await getDoc(doc(db, 'admins', 'adminverify'));
    return true;
  } catch (err) {
    if (isFirestoreOfflineError(err) || sawOfflineError) {
      return normalizedEmail === AUTHORITATIVE_ADMIN_EMAIL;
    }
    return false;
  }
}

export interface FirebaseProfilePatch {
  displayName?: string;
  accountType?: AccountType;
  role?: 'user' | 'restaurantOwner' | 'recipient' | 'donor';
  area?: string;
  organizationName?: string;
  businessName?: string;
  hours?: string;
  language?: Language;
  savedRadiusKm?: number;
  discoverable?: boolean;
  phone?: string;
  address?: string;
  restaurant?: RestaurantInfo;
}

function sanitizeRestaurantForFirestore(
  r: RestaurantInfo,
  override?: Partial<RestaurantInfo>
): Record<string, unknown> {
  const merged = { ...r, ...override };
  return {
    restaurantName: clampStr(merged.restaurantName, 120),
    ownerName: clampStr(merged.ownerName, 100),
    phone: clampStr(merged.phone, 32),
    email: clampStr(merged.email, 160) || null,
    address: clampStr(merged.address, 240),
    area: clampStr(merged.area, 80) || 'Dhanmondi',
    city: clampStr(merged.city, 80) || 'Dhaka',
    lat: typeof merged.lat === 'number' && Number.isFinite(merged.lat) ? merged.lat : 23.7465,
    lng: typeof merged.lng === 'number' && Number.isFinite(merged.lng) ? merged.lng : 90.376,
    restaurantType: merged.restaurantType || 'restaurant',
    tradeLicenseNumber: clampStr(merged.tradeLicenseNumber, 80) || null,
    restaurantPhotoUrl:
      typeof merged.restaurantPhotoUrl === 'string' && merged.restaurantPhotoUrl.length <= 248000
        ? merged.restaurantPhotoUrl
        : null,
    licensePhotoUrl:
      typeof merged.licensePhotoUrl === 'string' && merged.licensePhotoUrl.length <= 248000
        ? merged.licensePhotoUrl
        : null,
    openingHours: clampStr(merged.openingHours, 80) || '9:00 AM - 10:00 PM',
    approxDailySurplus: clampStr(merged.approxDailySurplus, 100) || null,
    acceptedSafetyTerms: true,
    verificationStatus: merged.verificationStatus || 'pending',
    rejectionReason: merged.rejectionReason ? clampStr(merged.rejectionReason, 500) : null,
    submittedAt: merged.submittedAt ? clampStr(merged.submittedAt, 64) : new Date().toISOString().slice(0, 64),
    reviewedAt: merged.reviewedAt ?? null,
    reviewedBy: merged.reviewedBy ?? null,
  };
}

export function buildAppUserFromFirestore(
  fbUser: FirebaseUser,
  pubData?: Record<string, unknown> | null,
  privData?: Record<string, unknown> | null,
  isAdmin = false
): User {
  const restaurant = normalizeRestaurantInfo(pubData?.restaurant);
  const rawRole = typeof pubData?.role === 'string' ? pubData.role : 'user';
  const accountType: AccountType =
    rawRole === 'restaurantOwner' || Boolean(restaurant) ? 'restaurantOwner' : 'user';

  const role: UserRole = isAdmin
    ? 'admin'
    : accountType === 'restaurantOwner'
      ? 'donor'
      : rawRole === 'donor'
        ? 'donor'
        : 'recipient';

  const name =
    (typeof pubData?.name === 'string' && pubData.name) ||
    (typeof pubData?.displayName === 'string' && pubData.displayName) ||
    fbUser.displayName ||
    fbUser.email?.split('@')[0] ||
    'Community Member';
  const area =
    restaurant?.area ||
    (typeof pubData?.area === 'string' && pubData.area) ||
    'Dhanmondi';
  const language: Language = pubData?.language === 'bn' ? 'bn' : 'en';
  const savedRadiusKm =
    typeof pubData?.savedRadiusKm === 'number' ? pubData.savedRadiusKm : 10;
  const verified =
    accountType === 'restaurantOwner'
      ? restaurant?.verificationStatus === 'approved' || Boolean(pubData?.verified)
      : Boolean(pubData?.verified);
  const businessName =
    restaurant?.restaurantName ||
    (typeof pubData?.businessName === 'string' ? pubData.businessName : '');
  const hours =
    restaurant?.openingHours ||
    (typeof pubData?.hours === 'string' ? pubData.hours : '');
  const address =
    restaurant?.address ||
    (typeof privData?.address === 'string' ? privData.address : '');
  const phone =
    restaurant?.phone ||
    (typeof privData?.phone === 'string' ? privData.phone : '');
  const email =
    (typeof privData?.email === 'string' && privData.email) ||
    (typeof pubData?.email === 'string' && pubData.email) ||
    fbUser.email ||
    '';
  const orgName =
    typeof pubData?.organizationName === 'string'
      ? pubData.organizationName
      : null;

  const donorVerStatus: 'verified' | 'pending' | 'unverified' =
    accountType === 'restaurantOwner'
      ? restaurant?.verificationStatus === 'approved'
        ? 'verified'
        : restaurant?.verificationStatus === 'rejected'
          ? 'unverified'
          : 'pending'
      : verified
        ? 'verified'
        : 'pending';

  const handle =
    (typeof pubData?.handle === 'string' && pubData.handle) ||
    `@${(name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 14) || 'member')}_${fbUser.uid.slice(-4).toLowerCase()}`;
  const photoURL =
    (typeof pubData?.photoURL === 'string' && pubData.photoURL) ||
    restaurant?.restaurantPhotoUrl ||
    fbUser.photoURL ||
    null;

  return {
    id: fbUser.uid,
    role,
    accountType,
    isAdmin,
    name,
    handle,
    photoURL,
    phone,
    email,
    location: area,
    area,
    organizationName: orgName,
    verified,
    discoverable: typeof pubData?.discoverable === 'boolean' ? pubData.discoverable : true,
    starterSeeded: Boolean(pubData?.starterSeeded),
    notificationsSeeded: Boolean(pubData?.notificationsSeeded),
    language,
    savedRadiusKm,
    createdAt: timestampToIso(pubData?.createdAt),
    restaurant,
    donorProfile:
      role === 'donor' || accountType === 'restaurantOwner'
        ? {
            userId: fbUser.uid,
            businessName: businessName || name,
            address: address || `${area}, Dhaka`,
            lat: restaurant?.lat ?? 23.7465,
            lng: restaurant?.lng ?? 90.376,
            hours: hours || '9:00 AM - 10:00 PM',
            verificationStatus: donorVerStatus,
            logoUrl: restaurant?.restaurantPhotoUrl || fbUser.photoURL || null,
          }
        : null,
  };
}

const inFlightProfileSync = new Map<string, Promise<User>>();

/**
 * Ensures /users/{uid} and /users/{uid}/private/info exist and match the hardened schema.
 */
export function syncFirebaseUserProfile(
  fbUser: FirebaseUser,
  preferredLang: Language = 'en',
  initialProfile?: FirebaseProfilePatch,
  isAdminOverride?: boolean
): Promise<User> {
  const existing = inFlightProfileSync.get(fbUser.uid);
  if (existing) {
    return existing;
  }
  const promise = doSyncFirebaseUserProfile(
    fbUser,
    preferredLang,
    initialProfile,
    isAdminOverride
  ).finally(() => {
    inFlightProfileSync.delete(fbUser.uid);
  });
  inFlightProfileSync.set(fbUser.uid, promise);
  return promise;
}

async function doSyncFirebaseUserProfile(
  fbUser: FirebaseUser,
  preferredLang: Language = 'en',
  initialProfile?: FirebaseProfilePatch,
  isAdminOverride?: boolean
): Promise<User> {
  const uid = fbUser.uid;
  const userDocRef = doc(db, 'users', uid);
  const privateDocRef = doc(db, 'users', uid, 'private', 'info');

  const pubSnap = await getDocResilient(userDocRef, `users/${uid}`);
  if (!pubSnap) {
    const fallbackAdmin =
      typeof isAdminOverride === 'boolean' ? isAdminOverride : await checkIsFirebaseAdmin(fbUser);
    return buildAppUserFromFirestore(
      fbUser,
      {
        uid,
        name: initialProfile?.displayName || fbUser.displayName || undefined,
        displayName: initialProfile?.displayName || fbUser.displayName || undefined,
        email: fbUser.email || '',
        role:
          initialProfile?.role ||
          (initialProfile?.accountType === 'restaurantOwner' ? 'restaurantOwner' : 'user'),
        area: initialProfile?.restaurant?.area || initialProfile?.area || 'Dhanmondi',
        organizationName: initialProfile?.organizationName,
        businessName: initialProfile?.restaurant?.restaurantName || initialProfile?.businessName,
        hours: initialProfile?.restaurant?.openingHours || initialProfile?.hours,
        verified: fbUser.emailVerified,
        discoverable: true,
        language: preferredLang === 'bn' ? 'bn' : 'en',
        savedRadiusKm: 10,
        restaurant: initialProfile?.restaurant,
      },
      {
        uid,
        email: fbUser.email || '',
        phone: initialProfile?.restaurant?.phone || initialProfile?.phone,
        address: initialProfile?.restaurant?.address || initialProfile?.address,
      },
      fallbackAdmin
    );
  }

  const privSnap = await getDocResilient(privateDocRef, `users/${uid}/private/info`);

  const displayName =
    clampStr(initialProfile?.displayName, 100) ||
    clampStr(initialProfile?.restaurant?.ownerName, 100) ||
    clampStr(fbUser.displayName, 100) ||
    clampStr(fbUser.email?.split('@')[0], 100) ||
    'Community Member';

  const safeEmail = clampStr(fbUser.email, 160) || `${uid}@users.rizik.local`;
  let createdNewRestaurantOwner: RestaurantInfo | null = null;

  if (!pubSnap.exists()) {
    const isRestOwner =
      initialProfile?.accountType === 'restaurantOwner' ||
      initialProfile?.role === 'restaurantOwner';

    const storeRole = isRestOwner
      ? 'restaurantOwner'
      : initialProfile?.role === 'donor'
        ? 'donor'
        : 'user';

    const slug =
      displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 14) || 'member';
    const generatedHandle = `@${slug}_${uid.slice(-4).toLowerCase()}`;

    const createPublicPayload: Record<string, unknown> = {
      uid,
      name: displayName,
      displayName,
      handle: generatedHandle,
      role: storeRole,
      area: clampStr(initialProfile?.restaurant?.area || initialProfile?.area, 80) || 'Dhanmondi',
      verified: false,
      discoverable: true,
      starterSeeded: false,
      notificationsSeeded: false,
      language: preferredLang === 'bn' ? 'bn' : 'en',
      savedRadiusKm: 10,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (fbUser.photoURL && fbUser.photoURL.length <= 248000) {
      createPublicPayload.photoURL = fbUser.photoURL;
    }
    const org = clampStr(initialProfile?.organizationName, 120);
    if (org) createPublicPayload.organizationName = org;
    const biz = clampStr(
      initialProfile?.restaurant?.restaurantName || initialProfile?.businessName,
      120
    );
    if (biz) createPublicPayload.businessName = biz;
    const hrs = clampStr(
      initialProfile?.restaurant?.openingHours || initialProfile?.hours,
      80
    );
    if (hrs) createPublicPayload.hours = hrs;

    if (isRestOwner && initialProfile?.restaurant) {
      const sanitizedRest = sanitizeRestaurantForFirestore(initialProfile.restaurant, {
        verificationStatus: 'pending',
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
      });
      createPublicPayload.restaurant = sanitizedRest;
      createdNewRestaurantOwner = initialProfile.restaurant;
    }

    try {
      await setDoc(userDocRef, createPublicPayload);
    } catch (error) {
      if (!isFirestoreOfflineError(error)) {
        handleFirestoreError(error, OperationType.CREATE, `users/${uid}`);
      }
      console.warn(`Firestore offline on create(users/${uid}); using provisional profile.`, error);
    }
  } else {
    const existingData = pubSnap.data() as Record<string, unknown> | undefined;
    const resolvedName =
      clampStr(existingData?.displayName as string | undefined, 100) ||
      clampStr(existingData?.name as string | undefined, 100) ||
      displayName;
    const backfill: Record<string, unknown> = {
      name: clampStr(existingData?.name as string | undefined, 100) || resolvedName,
      displayName: resolvedName,
      updatedAt: serverTimestamp(),
    };
    if (!existingData?.handle) {
      const slug =
        resolvedName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 14) || 'member';
      backfill.handle = `@${slug}_${uid.slice(-4).toLowerCase()}`;
    }
    if (typeof existingData?.discoverable !== 'boolean') {
      backfill.discoverable = true;
    }
    if (!existingData?.area) {
      backfill.area = clampStr(initialProfile?.area, 80) || 'Dhanmondi';
    }
    if (existingData?.language !== 'en' && existingData?.language !== 'bn') {
      backfill.language = preferredLang === 'bn' ? 'bn' : 'en';
    }
    if (typeof existingData?.savedRadiusKm !== 'number') {
      backfill.savedRadiusKm = 10;
    }
    if (typeof existingData?.verified !== 'boolean') {
      backfill.verified = false;
    }
    try {
      await updateDoc(userDocRef, backfill);
    } catch (error) {
      if (!isFirestoreOfflineError(error)) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
      }
      console.warn(`Firestore offline on update(users/${uid}); continuing with cached data.`, error);
    }
  }

  if (privSnap && !privSnap.exists()) {
    const createPrivPayload: Record<string, unknown> = {
      uid,
      email: safeEmail,
      updatedAt: serverTimestamp(),
    };
    const phone = clampStr(initialProfile?.restaurant?.phone || initialProfile?.phone, 32);
    if (phone) createPrivPayload.phone = phone;
    const addr = clampStr(initialProfile?.restaurant?.address || initialProfile?.address, 240);
    if (addr) createPrivPayload.address = addr;

    try {
      await setDoc(privateDocRef, createPrivPayload);
    } catch (error) {
      if (!isFirestoreOfflineError(error)) {
        handleFirestoreError(error, OperationType.CREATE, `users/${uid}/private/info`);
      }
      console.warn(`Firestore offline on create(users/${uid}/private/info).`, error);
    }
  } else if (privSnap && privSnap.data()?.email !== safeEmail) {
    try {
      await updateDoc(privateDocRef, {
        email: safeEmail,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      if (!isFirestoreOfflineError(error)) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/private/info`);
      }
      console.warn(`Firestore offline on update(users/${uid}/private/info).`, error);
    }
  }

  if (createdNewRestaurantOwner) {
    await ensureAdminConversationForOwner({
      ownerUid: uid,
      ownerName: createdNewRestaurantOwner.ownerName || displayName,
      restaurantName: createdNewRestaurantOwner.restaurantName,
      restaurantLogoUrl: createdNewRestaurantOwner.restaurantPhotoUrl,
      verificationStatus: 'pending',
    }).catch(() => {});

    await createNewRestaurantOwnerNotification({
      ownerUid: uid,
      restaurantName: createdNewRestaurantOwner.restaurantName,
      ownerName: createdNewRestaurantOwner.ownerName || displayName,
    }).catch(() => {});
  }

  const [freshPub, freshPriv, isAdmin] = await Promise.all([
    getDocResilient(userDocRef, `users/${uid}`),
    getDocResilient(privateDocRef, `users/${uid}/private/info`),
    typeof isAdminOverride === 'boolean' ? Promise.resolve(isAdminOverride) : checkIsFirebaseAdmin(fbUser),
  ]);

  return buildAppUserFromFirestore(
    fbUser,
    (freshPub?.data() ?? pubSnap.data()) as Record<string, unknown> | undefined,
    (freshPriv?.data() ?? privSnap?.data()) as Record<string, unknown> | undefined,
    isAdmin
  );
}

export async function updateFirebaseUserProfile(
  fbUser: FirebaseUser,
  patch: FirebaseProfilePatch,
  isAdminOverride?: boolean
): Promise<User> {
  const uid = fbUser.uid;
  const userDocRef = doc(db, 'users', uid);
  const privateDocRef = doc(db, 'users', uid, 'private', 'info');

  const publicUpdates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (patch.displayName !== undefined && clampStr(patch.displayName, 100)) {
    const safeName = clampStr(patch.displayName, 100);
    publicUpdates.displayName = safeName;
    publicUpdates.name = safeName;
  }
  if (patch.area !== undefined && clampStr(patch.area, 80)) {
    publicUpdates.area = clampStr(patch.area, 80);
  }
  if (patch.organizationName !== undefined && clampStr(patch.organizationName, 120)) {
    publicUpdates.organizationName = clampStr(patch.organizationName, 120);
  }
  if (patch.businessName !== undefined && clampStr(patch.businessName, 120)) {
    publicUpdates.businessName = clampStr(patch.businessName, 120);
  }
  if (patch.hours !== undefined && clampStr(patch.hours, 80)) {
    publicUpdates.hours = clampStr(patch.hours, 80);
  }
  if (patch.language === 'en' || patch.language === 'bn') {
    publicUpdates.language = patch.language;
  }
  if (
    typeof patch.savedRadiusKm === 'number' &&
    patch.savedRadiusKm >= 1 &&
    patch.savedRadiusKm <= 50
  ) {
    publicUpdates.savedRadiusKm = Math.round(patch.savedRadiusKm);
  }
  if (typeof patch.discoverable === 'boolean') {
    publicUpdates.discoverable = patch.discoverable;
  }

  try {
    await updateDoc(userDocRef, publicUpdates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }

  // Keep zero-PII userDirectory entry in sync with profile edits
  const dirUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (publicUpdates.displayName) dirUpdates.displayName = publicUpdates.displayName;
  if (publicUpdates.area) dirUpdates.area = publicUpdates.area;
  if (publicUpdates.businessName) dirUpdates.restaurantName = publicUpdates.businessName;
  if (typeof patch.discoverable === 'boolean') dirUpdates.discoverable = patch.discoverable;
  if (Object.keys(dirUpdates).length > 1) {
    try {
      await updateDoc(doc(db, 'userDirectory', uid), dirUpdates);
    } catch {
      // Non-fatal if directory doc hasn't initialized yet
    }
  }

  const privateUpdates: Record<string, unknown> = {};
  if (patch.phone !== undefined && clampStr(patch.phone, 32)) {
    privateUpdates.phone = clampStr(patch.phone, 32);
  }
  if (patch.address !== undefined && clampStr(patch.address, 240)) {
    privateUpdates.address = clampStr(patch.address, 240);
  }

  if (Object.keys(privateUpdates).length > 0) {
    privateUpdates.updatedAt = serverTimestamp();
    try {
      await updateDoc(privateDocRef, privateUpdates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/private/info`);
    }
  }

  const [freshPub, freshPriv, isAdmin] = await Promise.all([
    getDoc(userDocRef).catch((error) =>
      handleFirestoreError(error, OperationType.GET, `users/${uid}`)
    ),
    getDoc(privateDocRef).catch((error) =>
      handleFirestoreError(error, OperationType.GET, `users/${uid}/private/info`)
    ),
    typeof isAdminOverride === 'boolean' ? Promise.resolve(isAdminOverride) : checkIsFirebaseAdmin(fbUser),
  ]);

  return buildAppUserFromFirestore(
    fbUser,
    freshPub.data() as Record<string, unknown> | undefined,
    freshPriv.data() as Record<string, unknown> | undefined,
    isAdmin
  );
}

export async function submitRestaurantOwnerResubmission(
  fbUser: FirebaseUser,
  nextInfo: RestaurantInfo,
  resubmittedChatMessage: string
): Promise<User> {
  const uid = fbUser.uid;
  const userDocRef = doc(db, 'users', uid);
  const privateDocRef = doc(db, 'users', uid, 'private', 'info');

  const currentSnap = await getDoc(userDocRef).catch((error) =>
    handleFirestoreError(error, OperationType.GET, `users/${uid}`)
  );
  const existingData = currentSnap.data() as Record<string, unknown> | undefined;
  const existingRest = normalizeRestaurantInfo(existingData?.restaurant);

  const sanitizedRest = sanitizeRestaurantForFirestore(nextInfo, {
    verificationStatus: 'pending',
    rejectionReason: null,
    submittedAt: new Date().toISOString().slice(0, 64),
    reviewedAt: existingRest?.reviewedAt ?? null,
    reviewedBy: existingRest?.reviewedBy ?? null,
  });

  try {
    await updateDoc(userDocRef, {
      name: clampStr(nextInfo.ownerName, 100),
      displayName: clampStr(nextInfo.ownerName, 100),
      area: clampStr(nextInfo.area, 80) || 'Dhanmondi',
      businessName: clampStr(nextInfo.restaurantName, 120),
      hours: clampStr(nextInfo.openingHours, 80),
      restaurant: sanitizedRest,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }

  try {
    await updateDoc(privateDocRef, {
      phone: clampStr(nextInfo.phone, 32),
      address: clampStr(nextInfo.address, 240),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal if PII update skipped
  }

  await createResubmittedNotification({
    ownerUid: uid,
    restaurantName: nextInfo.restaurantName,
    ownerName: nextInfo.ownerName,
  });

  await sendAdminChatMessage({
    conversationId: `admin_${uid}`,
    ownerUid: uid,
    senderId: uid,
    senderRole: 'owner',
    senderName: nextInfo.ownerName,
    restaurantName: nextInfo.restaurantName,
    ownerName: nextInfo.ownerName,
    restaurantLogoUrl: nextInfo.restaurantPhotoUrl,
    verificationStatus: 'pending',
    text: resubmittedChatMessage,
    messageType: 'text',
  }).catch(() => {});

  return syncFirebaseUserProfile(fbUser);
}

export function subscribeMyFirebaseUser(
  fbUser: FirebaseUser,
  onUser: (user: User) => void,
  isAdmin = false,
  onError?: (err: FirestoreListenerError) => void
): Unsubscribe {
  let latestPub: Record<string, unknown> | null = null;
  let latestPriv: Record<string, unknown> | null = null;

  const emit = () => {
    if (latestPub) {
      onUser(buildAppUserFromFirestore(fbUser, latestPub, latestPriv, isAdmin));
    }
  };

  const unsubPub = onSnapshot(
    doc(db, 'users', fbUser.uid),
    (snap) => {
      if (snap.exists()) {
        latestPub = snap.data() as Record<string, unknown>;
        emit();
      }
    },
    (error) => {
      onError?.(parseFirestoreListenerError(error, OperationType.GET, `users/${fbUser.uid}`));
    }
  );

  const unsubPriv = onSnapshot(
    doc(db, 'users', fbUser.uid, 'private', 'info'),
    (snap) => {
      if (snap.exists()) {
        latestPriv = snap.data() as Record<string, unknown>;
        emit();
      }
    },
    (error) => {
      onError?.(
        parseFirestoreListenerError(
          error,
          OperationType.GET,
          `users/${fbUser.uid}/private/info`
        )
      );
    }
  );

  return () => {
    unsubPub();
    unsubPriv();
  };
}

function mapFirestoreListing(id: string, data: Record<string, unknown>): Listing {
  const category: FoodCategory =
    data.category === 'cooked' ||
    data.category === 'bakery' ||
    data.category === 'produce' ||
    data.category === 'packaged'
      ? data.category
      : 'cooked';

  const status =
    data.status === 'active' ||
    data.status === 'paused' ||
    data.status === 'claimed' ||
    data.status === 'expired'
      ? data.status
      : 'active';

  const storageMethod: StorageMethod =
    data.storageMethod === 'covered_hot' ||
    data.storageMethod === 'covered_chilled' ||
    data.storageMethod === 'sealed_dry' ||
    data.storageMethod === 'room_temp'
      ? data.storageMethod
      : 'covered_hot';

  const preparedAt =
    typeof data.preparedAt === 'string' && data.preparedAt
      ? data.preparedAt
      : timestampToIso(data.createdAt);
  const consumeWithinHours =
    typeof data.consumeWithinHours === 'number' ? data.consumeWithinHours : 4;

  return {
    id,
    donorId: String(data.donorId ?? ''),
    donorName: String(data.donorName ?? 'Community Kitchen'),
    donorVerified: Boolean(data.donorVerified),
    donorArea: String(data.donorArea ?? 'Dhanmondi'),
    title: String(data.title ?? ''),
    description: typeof data.description === 'string' ? data.description : '',
    category,
    dietaryTags: Array.isArray(data.dietaryTags)
      ? data.dietaryTags.filter((item): item is string => typeof item === 'string')
      : [],
    quantity: Number(data.quantity ?? 1),
    remainingQuantity: Number(data.remainingQuantity ?? 0),
    unit: String(data.unit ?? 'boxes'),
    photoUrls: [FOOD_CATEGORY_IMAGES[category]],
    pickupStart: String(data.pickupStart ?? new Date().toISOString()),
    pickupEnd: String(
      data.pickupEnd ?? new Date(Date.now() + 3 * 3600_000).toISOString()
    ),
    pickupAddress: String(data.pickupAddress ?? 'Dhaka'),
    safetyNote: typeof data.safetyNote === 'string' ? data.safetyNote : '',
    preparedAt,
    consumeWithinHours,
    safeUntil: new Date(
      new Date(preparedAt).getTime() + consumeWithinHours * 3600_000
    ).toISOString(),
    isFlashRescue: Boolean(data.isFlashRescue),
    storageMethod,
    isRamadanSpecial: Boolean(data.isRamadanSpecial),
    status,
    lat: typeof data.lat === 'number' ? data.lat : 23.7465,
    lng: typeof data.lng === 'number' ? data.lng : 90.376,
    createdAt: timestampToIso(data.createdAt),
  };
}

export function subscribeActiveFirestoreListings(
  onListings: (listings: Listing[]) => void,
  onError?: (err: FirestoreListenerError) => void
): Unsubscribe {
  const q = query(collection(db, 'listings'), where('status', '==', 'active'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) =>
        mapFirestoreListing(d.id, d.data() as Record<string, unknown>)
      );
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onListings(items);
    },
    (error) => {
      onError?.(parseFirestoreListenerError(error, OperationType.LIST, 'listings'));
    }
  );
}

export function subscribeMyDonorListings(
  donorId: string,
  onListings: (listings: Listing[]) => void,
  onError?: (err: FirestoreListenerError) => void
): Unsubscribe {
  const q = query(collection(db, 'listings'), where('donorId', '==', donorId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) =>
        mapFirestoreListing(d.id, d.data() as Record<string, unknown>)
      );
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onListings(items);
    },
    (error) => {
      onError?.(parseFirestoreListenerError(error, OperationType.LIST, 'listings'));
    }
  );
}

export async function createFirestoreListing(
  user: User,
  payload: {
    title: string;
    description?: string;
    category: FoodCategory;
    quantity: number;
    unit: string;
    dietaryTags?: string[];
    pickupStart: string;
    pickupEnd: string;
    pickupAddress: string;
    consumeWithinHours?: number;
    safetyNote?: string;
    isFlashRescue?: boolean;
    storageMethod?: StorageMethod;
    isRamadanSpecial?: boolean;
    lat?: number;
    lng?: number;
  }
): Promise<string> {
  const id = sanitizeId(`fb_lst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const qty = Math.max(1, Math.min(5000, Math.round(payload.quantity)));

  const docData: Record<string, unknown> = {
    donorId: user.id,
    donorName:
      clampStr(user.restaurant?.restaurantName || user.donorProfile?.businessName || user.name, 120) ||
      'Community Kitchen',
    donorVerified: Boolean(
      user.verified || user.restaurant?.verificationStatus === 'approved'
    ),
    donorArea: clampStr(user.area, 80) || 'Dhanmondi',
    title: clampStr(payload.title, 140),
    category: payload.category,
    quantity: qty,
    remainingQuantity: qty,
    unit: clampStr(payload.unit, 32) || 'boxes',
    pickupStart: clampStr(payload.pickupStart, 64),
    pickupEnd: clampStr(payload.pickupEnd, 64),
    pickupAddress: clampStr(payload.pickupAddress, 240) || 'Dhaka',
    preparedAt: new Date().toISOString().slice(0, 64),
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const desc = clampStr(payload.description, 1000);
  if (desc) docData.description = desc;

  if (Array.isArray(payload.dietaryTags) && payload.dietaryTags.length > 0) {
    docData.dietaryTags = payload.dietaryTags
      .map((t) => clampStr(t, 40))
      .filter(Boolean)
      .slice(0, 10);
  }

  const safetyNote = clampStr(payload.safetyNote, 400);
  if (safetyNote) docData.safetyNote = safetyNote;

  if (
    typeof payload.consumeWithinHours === 'number' &&
    payload.consumeWithinHours >= 1 &&
    payload.consumeWithinHours <= 72
  ) {
    docData.consumeWithinHours = Math.round(payload.consumeWithinHours);
  }

  if (payload.storageMethod) {
    docData.storageMethod = payload.storageMethod;
  }
  if (typeof payload.isFlashRescue === 'boolean') {
    docData.isFlashRescue = payload.isFlashRescue;
  }
  if (typeof payload.isRamadanSpecial === 'boolean') {
    docData.isRamadanSpecial = payload.isRamadanSpecial;
  }
  if (typeof payload.lat === 'number' && payload.lat >= -90 && payload.lat <= 90) {
    docData.lat = payload.lat;
  }
  if (typeof payload.lng === 'number' && payload.lng >= -180 && payload.lng <= 180) {
    docData.lng = payload.lng;
  }

  try {
    await setDoc(doc(db, 'listings', id), docData);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `listings/${id}`);
  }

  if (payload.isFlashRescue) {
    const donorDisplayName = String(docData.donorName || user.name);
    const areaLabel = String(docData.donorArea || 'Dhaka');
    void getDocs(
      query(collection(db, 'userDirectory'), where('discoverable', '==', true), limit(25))
    )
      .then((snap) => {
        const areaLower = areaLabel.toLowerCase();
        const targets = snap.docs
          .map((d) => ({ uid: String(d.data()?.uid ?? d.id), area: String(d.data()?.area ?? '') }))
          .filter((entry) => entry.uid && entry.uid !== user.id)
          .sort((a, b) => {
            const aMatch = a.area.toLowerCase() === areaLower ? 0 : 1;
            const bMatch = b.area.toLowerCase() === areaLower ? 0 : 1;
            return aMatch - bMatch;
          })
          .slice(0, 12);

        for (const target of targets) {
          void createCrossUserNotification({
            recipientUid: target.uid,
            senderUid: user.id,
            senderName: donorDisplayName,
            type: 'flash_near_you',
            title: `Flash Rescue near ${areaLabel}!`,
            titleBn: `${areaLabel}-এ ফ্ল্যাশ রেসকিউ শুরু হয়েছে!`,
            body: `${donorDisplayName}: ${qty} ${docData.unit} of ${docData.title} ready for quick pickup.`,
            bodyBn: `${donorDisplayName}: দ্রুত সংগ্রহের জন্য ${qty}টি "${docData.title}" এখন উপলব্ধ।`,
            listingId: id,
            linkTab: 'discover',
          });
        }
      })
      .catch(() => {});
  }

  return id;
}

export async function updateFirestoreListing(
  listingId: string,
  payload: {
    title?: string;
    description?: string;
    remainingQuantity?: number;
    status?: 'active' | 'paused' | 'claimed' | 'expired';
    safetyNote?: string;
    pickupEnd?: string;
    storageMethod?: StorageMethod;
    isFlashRescue?: boolean;
    isRamadanSpecial?: boolean;
  }
): Promise<void> {
  const updates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (payload.title !== undefined && clampStr(payload.title, 140).length >= 2) {
    updates.title = clampStr(payload.title, 140);
  }
  if (payload.description !== undefined) {
    updates.description = clampStr(payload.description, 1000);
  }
  if (typeof payload.remainingQuantity === 'number') {
    updates.remainingQuantity = Math.max(0, Math.round(payload.remainingQuantity));
  }
  if (payload.status) {
    updates.status = payload.status;
  }
  if (payload.safetyNote !== undefined) {
    updates.safetyNote = clampStr(payload.safetyNote, 400);
  }
  if (payload.pickupEnd !== undefined && clampStr(payload.pickupEnd, 64).length >= 4) {
    updates.pickupEnd = clampStr(payload.pickupEnd, 64);
  }
  if (payload.storageMethod) {
    updates.storageMethod = payload.storageMethod;
  }
  if (typeof payload.isFlashRescue === 'boolean') {
    updates.isFlashRescue = payload.isFlashRescue;
  }
  if (typeof payload.isRamadanSpecial === 'boolean') {
    updates.isRamadanSpecial = payload.isRamadanSpecial;
  }

  try {
    await updateDoc(doc(db, 'listings', listingId), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `listings/${listingId}`);
  }
}

export async function deleteFirestoreListing(listingId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'listings', listingId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `listings/${listingId}`);
  }
}

export function subscribeMyFirestoreDonations(
  userId: string,
  onDonations: (donations: DonationRecord[]) => void,
  onError?: (err: FirestoreListenerError) => void
): Unsubscribe {
  const q = query(collection(db, 'donations'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: DonationRecord[] = snapshot.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          userId: String(data.userId ?? userId),
          donorDisplayName: String(data.donorDisplayName ?? 'Kind Neighbor'),
          amountBdt: Number(data.amountBdt ?? 0),
          frequency: (data.frequency === 'monthly' ? 'monthly' : 'one_time') as DonationFrequency,
          cause: (typeof data.cause === 'string' ? data.cause : 'general') as DonationCause,
          paymentMethod: (typeof data.paymentMethod === 'string'
            ? data.paymentMethod
            : 'bkash') as PaymentMethodId,
          isAnonymous: Boolean(data.isAnonymous),
          honorOf: typeof data.honorOf === 'string' ? data.honorOf : null,
          receiptCode: String(data.receiptCode ?? ''),
          status: 'confirmed',
          createdAt: timestampToIso(data.createdAt),
        };
      });
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onDonations(items);
    },
    (error) => {
      onError?.(parseFirestoreListenerError(error, OperationType.LIST, 'donations'));
    }
  );
}

export async function createFirestoreDonation(
  user: User,
  payload: {
    amountBdt: number;
    frequency: DonationFrequency;
    cause: DonationCause;
    paymentMethod: PaymentMethodId;
    isAnonymous: boolean;
    honorOf?: string | null;
    donorName?: string;
  }
): Promise<DonationRecord> {
  const id = sanitizeId(`fb_don_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const receiptCode = `RZK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const amountBdt = Math.max(20, Math.min(5000000, Math.round(payload.amountBdt)));
  const donorDisplayName = payload.isAnonymous
    ? 'Anonymous'
    : clampStr(payload.donorName || user.donorProfile?.businessName || user.name, 120) ||
      'Supporter';

  const docData: Record<string, unknown> = {
    userId: user.id,
    donorDisplayName,
    amountBdt,
    frequency: payload.frequency,
    cause: payload.cause,
    paymentMethod: payload.paymentMethod,
    isAnonymous: Boolean(payload.isAnonymous),
    receiptCode,
    createdAt: serverTimestamp(),
  };

  const honor = clampStr(payload.honorOf, 140);
  if (honor) {
    docData.honorOf = honor;
  }

  try {
    await setDoc(doc(db, 'donations', id), docData);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `donations/${id}`);
  }

  return {
    id,
    userId: user.id,
    donorDisplayName,
    amountBdt,
    frequency: payload.frequency,
    cause: payload.cause,
    paymentMethod: payload.paymentMethod,
    isAnonymous: Boolean(payload.isAnonymous),
    honorOf: honor || null,
    receiptCode,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  };
}

export function subscribeMyFirestoreShiftSignups(
  userId: string,
  onSignups: (byShiftId: Record<string, ShiftSignup>, totalHours: number) => void,
  onError?: (err: FirestoreListenerError) => void
): Unsubscribe {
  const q = query(collection(db, 'shiftSignups'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const map: Record<string, ShiftSignup> = {};
      let totalHours = 0;

      const sortedDocs = [...snapshot.docs].sort((a, b) => {
        const aIso = timestampToIso(a.data().createdAt);
        const bIso = timestampToIso(b.data().createdAt);
        return aIso.localeCompare(bIso);
      });

      for (const d of sortedDocs) {
        const data = d.data() as Record<string, unknown>;
        const shiftId = String(data.shiftId ?? '');
        const status =
          data.status === 'checked_in' ||
          data.status === 'completed' ||
          data.status === 'cancelled'
            ? data.status
            : 'signed_up';
        const hoursLogged = Number(data.hoursLogged ?? 0);

        if (status === 'completed') {
          totalHours += hoursLogged;
        }
        if (shiftId) {
          map[shiftId] = {
            id: d.id,
            shiftId,
            status,
            hoursLogged,
            createdAt: timestampToIso(data.createdAt),
          };
        }
      }
      onSignups(map, Math.round(totalHours * 10) / 10);
    },
    (error) => {
      onError?.(parseFirestoreListenerError(error, OperationType.LIST, 'shiftSignups'));
    }
  );
}

export async function createFirestoreShiftSignup(
  user: User,
  shiftId: string
): Promise<string> {
  const safeShiftId = sanitizeId(shiftId);
  const id = sanitizeId(`fb_ss_${user.id.slice(0, 20)}_${safeShiftId}_${Date.now()}`);
  const docData: Record<string, unknown> = {
    userId: user.id,
    shiftId: safeShiftId,
    userName: clampStr(user.name, 100) || 'Volunteer',
    status: 'signed_up',
    hoursLogged: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'shiftSignups', id), docData);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `shiftSignups/${id}`);
  }
  return id;
}

export async function updateFirestoreShiftSignupStatus(
  signupId: string,
  status: 'checked_in' | 'completed' | 'cancelled',
  hoursLogged = 0
): Promise<void> {
  const safeHours =
    status === 'completed'
      ? Math.max(0.5, Math.min(24, Number(hoursLogged || 2.5)))
      : 0;
  try {
    await updateDoc(doc(db, 'shiftSignups', signupId), {
      status,
      hoursLogged: safeHours,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `shiftSignups/${signupId}`);
  }
}

export async function createFirestoreClaimIfSupported(
  user: User,
  listing: Listing,
  quantityClaimed: number,
  notes?: string
): Promise<Claim | null> {
  let existsInFirestore = false;
  try {
    const snap = await getDoc(doc(db, 'listings', listing.id));
    existsInFirestore = snap.exists() && snap.data()?.status === 'active';
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `listings/${listing.id}`);
  }

  if (!existsInFirestore) {
    return null;
  }

  const claimId = sanitizeId(`fb_clm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const pickupCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  const safeQty = Math.max(1, Math.min(500, Math.round(quantityClaimed)));

  const docData: Record<string, unknown> = {
    listingId: listing.id,
    donorId: sanitizeId(listing.donorId),
    recipientId: user.id,
    recipientName: clampStr(user.name, 100) || 'Neighbor',
    donorBusinessName: clampStr(listing.donorName, 120) || 'Community Kitchen',
    listingTitle: clampStr(listing.title, 140) || 'Surplus Food',
    quantityClaimed: safeQty,
    status: 'requested',
    pickupCode,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const cleanNotes = clampStr(notes, 400);
  if (cleanNotes) {
    docData.notes = cleanNotes;
  }

  try {
    await setDoc(doc(db, 'claims', claimId), docData);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `claims/${claimId}`);
  }

  void createCrossUserNotification({
    recipientUid: sanitizeId(listing.donorId),
    senderUid: user.id,
    senderName: clampStr(user.name, 100) || 'Neighbor',
    type: 'claim_request',
    title: `New claim request for ${listing.title}`,
    titleBn: `${listing.title}-এর জন্য নতুন সংগ্রহের অনুরোধ`,
    body: `${user.name} requested ${safeQty} ${listing.unit || 'portions'}.`,
    bodyBn: `${user.name} ${safeQty}টি অংশ সংগ্রহের অনুরোধ করেছেন।`,
    claimId,
    listingId: listing.id,
    linkTab: 'donor',
  });

  return {
    id: claimId,
    listingId: listing.id,
    recipientId: user.id,
    recipientName: user.name,
    recipientArea: user.area,
    donorId: listing.donorId,
    donorBusinessName: listing.donorName,
    donorAddress: listing.pickupAddress,
    donorVerified: listing.donorVerified,
    listingTitle: listing.title,
    listingPhoto: listing.photoUrls[0] || FOOD_CATEGORY_IMAGES[listing.category],
    listingCategory: listing.category,
    pickupStart: listing.pickupStart,
    pickupEnd: listing.pickupEnd,
    quantityClaimed: safeQty,
    status: 'requested',
    pickupCode,
    notes: cleanNotes || null,
    createdAt: new Date().toISOString(),
  };
}

export function subscribeMyFirestoreClaims(
  uid: string,
  role: 'recipient' | 'donor',
  onClaims: (claims: Claim[]) => void,
  onError?: (err: FirestoreListenerError) => void
): Unsubscribe {
  const field = role === 'donor' ? 'donorId' : 'recipientId';
  const q = query(collection(db, 'claims'), where(field, '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: Claim[] = snapshot.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const status =
          data.status === 'accepted' ||
          data.status === 'picked_up' ||
          data.status === 'completed' ||
          data.status === 'cancelled' ||
          data.status === 'expired'
            ? data.status
            : 'requested';
        return {
          id: d.id,
          listingId: String(data.listingId ?? ''),
          recipientId: String(data.recipientId ?? ''),
          recipientName: String(data.recipientName ?? 'Neighbor'),
          recipientArea: 'Dhaka',
          donorId: String(data.donorId ?? ''),
          donorBusinessName: String(data.donorBusinessName ?? 'Community Kitchen'),
          donorAddress: 'Dhaka',
          donorVerified: false,
          listingTitle: String(data.listingTitle ?? ''),
          listingPhoto: FOOD_CATEGORY_IMAGES.cooked,
          listingCategory: 'cooked',
          pickupStart: new Date().toISOString(),
          pickupEnd: new Date(Date.now() + 3600_000).toISOString(),
          quantityClaimed: Number(data.quantityClaimed ?? 1),
          status,
          pickupCode: String(data.pickupCode ?? ''),
          handoverMethod: data.handoverMethod === 'qr' ? 'qr' : 'manual',
          notes: typeof data.notes === 'string' ? data.notes : null,
          createdAt: timestampToIso(data.createdAt),
        };
      });
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onClaims(items);
    },
    (error) => {
      onError?.(parseFirestoreListenerError(error, OperationType.LIST, 'claims'));
    }
  );
}

export async function updateFirestoreClaimStatus(
  claimId: string,
  status: 'accepted' | 'completed' | 'cancelled',
  handoverMethod: 'qr' | 'manual' = 'manual'
): Promise<void> {
  const claimRef = doc(db, 'claims', claimId);
  let claimMeta: Record<string, unknown> | null = null;
  try {
    const snap = await getDoc(claimRef);
    if (snap.exists()) {
      claimMeta = snap.data() as Record<string, unknown>;
    }
  } catch {
    // Proceed cleanly even if metadata lookup skips
  }

  const updates: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  };
  if (status === 'completed') {
    updates.handoverMethod = handoverMethod;
  }
  try {
    await updateDoc(claimRef, updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `claims/${claimId}`);
  }

  if (claimMeta) {
    const recipientUid = String(claimMeta.recipientId ?? '');
    const donorUid = String(claimMeta.donorId ?? '');
    const donorBusinessName = String(claimMeta.donorBusinessName ?? 'Partner Kitchen');
    const listingTitle = String(claimMeta.listingTitle ?? 'Surplus Food');
    const listingId = typeof claimMeta.listingId === 'string' ? claimMeta.listingId : null;

    if (status === 'accepted' && recipientUid && donorUid) {
      void createCrossUserNotification({
        recipientUid,
        senderUid: donorUid,
        senderName: donorBusinessName,
        type: 'claim_accepted',
        title: `Pickup accepted: ${listingTitle}`,
        titleBn: `পিকআপ অনুমোদিত: ${listingTitle}`,
        body: `${donorBusinessName} confirmed your pickup. Show your QR or pickup code on arrival.`,
        bodyBn: `${donorBusinessName} আপনার অনুরোধ নিশ্চিত করেছে। পৌঁছে আপনার QR বা পিকআপ কোড দেখান।`,
        claimId,
        listingId,
        linkTab: 'claims',
      });
    } else if (status === 'completed' && recipientUid && donorUid) {
      void createCrossUserNotification({
        recipientUid,
        senderUid: donorUid,
        senderName: donorBusinessName,
        type: 'pickup_completed',
        title: `Handover completed: ${listingTitle}`,
        titleBn: `খাবার হস্তান্তর সম্পন্ন: ${listingTitle}`,
        body: `Thank you for rescuing ${listingTitle} with ${donorBusinessName}!`,
        bodyBn: `${donorBusinessName}-এর সাথে ${listingTitle} উদ্ধার করার জন্য ধন্যবাদ!`,
        claimId,
        listingId,
        linkTab: 'claims',
      });
    }
  }
}
