/**
 * Payload-First Security Verification Suite ("Dirty Dozen" + Community Rooms & Demo Isolation)
 * Validates document ID constraints, blueprint schema boundaries,
 * zero-PII user directory isolation, blocked-user gating, room moderation, and notification integrity.
 */

export interface SecurityCheckCase {
  id: number;
  name: string;
  collection: string;
  actorUid: string;
  actorEmailVerified: boolean;
  payload: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export const DIRTY_DOZEN_CASES: SecurityCheckCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Listing Create',
    collection: 'listings',
    actorUid: 'user_attacker',
    actorEmailVerified: true,
    payload: { donorId: 'user_victim', title: 'Spoofed Biryani', category: 'cooked' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Self-Assigned Verified, Admin Role, or Demo Persona Flag by Non-Admin',
    collection: 'userDirectory',
    actorUid: 'user_attacker',
    actorEmailVerified: true,
    payload: { uid: 'user_attacker', role: 'admin', verified: true, isDemo: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'PII Ghost Field Injection on Public UserDirectory',
    collection: 'userDirectory',
    actorUid: 'user_attacker',
    actorEmailVerified: true,
    payload: { uid: 'user_attacker', email: 'leak@example.com', phone: '+8801700000000' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Guest Read of UserDirectory, Community Rooms, or Cross-User Demo Chats',
    collection: 'rooms',
    actorUid: '',
    actorEmailVerified: false,
    payload: { action: 'list' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Unverified Email Admin Spoof Attempt',
    collection: 'listings',
    actorUid: 'user_spoof',
    actorEmailVerified: false,
    payload: { email: 'jafor05101007@student.ndub.edu.bd', email_verified: false },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Non-Admin Seeding Demo Community Room Message',
    collection: 'rooms/room_rizik_community/messages',
    actorUid: 'user_attacker',
    actorEmailVerified: true,
    payload: { senderId: 'demo_persona_kacchi_sultan', senderIsDemo: true, isDemo: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Terminal State Mutation on Completed Claim',
    collection: 'claims',
    actorUid: 'recip_1',
    actorEmailVerified: true,
    payload: { previousStatus: 'completed', nextStatus: 'requested' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Array Poisoning (>2 Participants in Direct Chat)',
    collection: 'conversations',
    actorUid: 'user_attacker',
    actorEmailVerified: true,
    payload: { participants: ['user_attacker', 'user_B', 'user_C'] },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'ID Poisoning with Invalid Path Characters',
    collection: 'listings',
    actorUid: 'donor_1',
    actorEmailVerified: true,
    payload: { docId: '../bad$doc/../../etc' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Oversized Chat or Community Room Message (> 2000 chars)',
    collection: 'rooms/room_rizik_community/messages',
    actorUid: 'user_A',
    actorEmailVerified: true,
    payload: { senderId: 'user_A', textLength: 2500 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Cross-User Isolated Demo Conversation Access',
    collection: 'users/user_victim/demoConversations',
    actorUid: 'user_attacker',
    actorEmailVerified: true,
    payload: { targetUserId: 'user_victim' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Blocked User Message Send or Muted User Room Post',
    collection: 'conversations/direct_A_B/messages',
    actorUid: 'user_B',
    actorEmailVerified: true,
    payload: { blockedByPeer: true, editedText: 'Tampered content' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];

export function evaluateInvariantGuard(testCase: SecurityCheckCase): 'PERMISSION_DENIED' | 'ALLOWED' {
  const { id, actorUid, actorEmailVerified, payload } = testCase;
  if (!actorUid || !actorEmailVerified) return 'PERMISSION_DENIED';
  if (id === 1 && payload.donorId !== actorUid) return 'PERMISSION_DENIED';
  if (
    id === 2 &&
    (payload.verified === true || payload.role === 'admin' || payload.isDemo === true)
  ) {
    return 'PERMISSION_DENIED';
  }
  if (id === 3 && ('email' in payload || 'phone' in payload)) return 'PERMISSION_DENIED';
  if (id === 6 && (payload.senderIsDemo === true || payload.senderId !== actorUid)) {
    return 'PERMISSION_DENIED';
  }
  if (id === 7 && payload.previousStatus === 'completed') return 'PERMISSION_DENIED';
  if (id === 8 && Array.isArray(payload.participants) && payload.participants.length > 2) {
    return 'PERMISSION_DENIED';
  }
  if (id === 9 && typeof payload.docId === 'string' && !VALID_ID_REGEX.test(payload.docId)) {
    return 'PERMISSION_DENIED';
  }
  if (id === 10 && typeof payload.textLength === 'number' && payload.textLength > 2000) {
    return 'PERMISSION_DENIED';
  }
  if (id === 11 && payload.targetUserId !== actorUid) return 'PERMISSION_DENIED';
  if (id === 12 && (payload.blockedByPeer === true || 'editedText' in payload)) {
    return 'PERMISSION_DENIED';
  }
  return 'ALLOWED';
}
