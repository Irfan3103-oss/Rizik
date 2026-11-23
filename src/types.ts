export type UserRole = 'donor' | 'recipient' | 'admin';
export type AccountType = 'user' | 'restaurantOwner';
export type RestaurantType =
  | 'restaurant'
  | 'bakery'
  | 'sweet_shop'
  | 'cafe'
  | 'catering'
  | 'hotel_kitchen'
  | 'other';
export type RestaurantVerificationStatus = 'pending' | 'approved' | 'rejected';

export interface RestaurantInfo {
  restaurantName: string;
  ownerName: string;
  phone: string;
  email?: string | null;
  address: string;
  area: string;
  city: string;
  lat: number;
  lng: number;
  restaurantType: RestaurantType;
  tradeLicenseNumber?: string | null;
  restaurantPhotoUrl?: string | null;
  licensePhotoUrl?: string | null;
  openingHours: string;
  approxDailySurplus?: string | null;
  acceptedSafetyTerms: boolean;
  verificationStatus: RestaurantVerificationStatus;
  rejectionReason?: string | null;
  submittedAt?: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
}

export interface AdminNotificationItem {
  id: string;
  type: 'newRestaurantOwner' | 'resubmittedRestaurantOwner' | 'newOwnerMessage';
  ownerUid: string;
  restaurantName: string;
  ownerName: string;
  conversationId?: string | null;
  messagePreview?: string | null;
  read: boolean;
  createdAt: string;
}

export interface AdminConversation {
  id: string;
  ownerUid: string;
  ownerName: string;
  restaurantName: string;
  restaurantLogoUrl?: string | null;
  verificationStatus: RestaurantVerificationStatus;
  lastMessage: string;
  lastMessageType: 'text' | 'image' | 'file' | 'system';
  lastSenderRole: 'owner' | 'admin' | 'system';
  lastMessageAt: string;
  ownerUnreadCount: number;
  adminUnreadCount: number;
  ownerTyping?: boolean;
  adminTyping?: boolean;
  isNormalUser?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminChatMessage {
  id: string;
  conversationId: string;
  ownerUid: string;
  senderId: string;
  senderRole: 'owner' | 'admin' | 'system';
  senderName: string;
  text: string;
  messageType: 'text' | 'image' | 'file' | 'system';
  mediaUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileMime?: string | null;
  status: 'sending' | 'sent' | 'read';
  readAt?: string | null;
  createdAt: string;
  clientTempId?: string;
}

export interface RestaurantOwnerApplication {
  uid: string;
  name: string;
  email: string;
  area: string;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
  restaurant: RestaurantInfo;
}

export type Language = 'en' | 'bn';
export type FoodCategory = 'cooked' | 'bakery' | 'produce' | 'packaged';
export type ListingStatus = 'active' | 'paused' | 'claimed' | 'expired';
export type ClaimStatus =
  | 'requested'
  | 'accepted'
  | 'picked_up'
  | 'completed'
  | 'cancelled'
  | 'expired';

export interface User {
  id: string;
  role: UserRole;
  accountType?: AccountType;
  isAdmin?: boolean;
  name: string;
  handle?: string;
  photoURL?: string | null;
  phone: string;
  email: string;
  location: string;
  area: string;
  organizationName?: string | null;
  verified: boolean;
  discoverable?: boolean;
  starterSeeded?: boolean;
  notificationsSeeded?: boolean;
  language: Language;
  savedRadiusKm: number;
  createdAt: string;
  donorProfile?: DonorProfile | null;
  restaurant?: RestaurantInfo | null;
}

export type DirectoryRole =
  | 'user'
  | 'restaurantOwner'
  | 'recipient'
  | 'donor'
  | 'admin'
  | 'volunteer'
  | 'ngo'
  | 'organizer';

export interface UserDirectoryEntry {
  uid: string;
  displayName: string;
  handle: string;
  photoURL?: string | null;
  role: DirectoryRole;
  restaurantName?: string | null;
  restaurantType?: string | null;
  area: string;
  verified: boolean;
  discoverable: boolean;
  online: boolean;
  lastSeen: string;
  isDemo?: boolean;
  bio?: string | null;
  bioBn?: string | null;
  openingHours?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
}

export interface DonorProfile {
  userId: string;
  businessName: string;
  address: string;
  addressBn?: string | null;
  lat: number;
  lng: number;
  hours: string;
  verificationStatus: 'verified' | 'pending' | 'unverified';
  logoUrl?: string | null;
}

export type StorageMethod = 'covered_hot' | 'covered_chilled' | 'sealed_dry' | 'room_temp';

export interface Listing {
  id: string;
  donorId: string;
  donorName: string;
  donorVerified: boolean;
  donorAvgRating?: number | null;
  donorReviewCount?: number;
  donorArea: string;
  donorPhone?: string | null;
  title: string;
  description: string;
  category: FoodCategory;
  dietaryTags: string[];
  quantity: number;
  remainingQuantity: number;
  unit: string;
  photoUrls: string[];
  pickupStart: string;
  pickupEnd: string;
  pickupAddress: string;
  pickupAddressBn?: string | null;
  safetyNote: string;
  preparedAt: string;
  consumeWithinHours: number;
  safeUntil?: string;
  isFlashRescue?: boolean;
  storageMethod?: StorageMethod;
  isRamadanSpecial?: boolean;
  status: ListingStatus;
  lat: number;
  lng: number;
  distanceKm?: number;
  createdAt: string;
}

export interface Claim {
  id: string;
  listingId: string;
  recipientId: string;
  recipientName: string;
  recipientArea: string;
  recipientOrg?: string | null;
  recipientPhone?: string | null;
  donorId: string;
  donorBusinessName: string;
  donorAddress: string;
  donorAddressBn?: string | null;
  donorPhone?: string | null;
  donorVerified: boolean;
  listingTitle: string;
  listingPhoto: string;
  listingCategory: FoodCategory;
  pickupStart: string;
  pickupEnd: string;
  quantityClaimed: number;
  status: ClaimStatus;
  pickupCode: string;
  handoverMethod?: 'qr' | 'manual';
  myRating?: number | null;
  notes?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  acceptedAt?: string | null;
  pickedUpAt?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
  conversationId?: string | null;
}

export type MessageType = 'text' | 'image' | 'voice' | 'call' | 'location' | 'file';
export type CallKind = 'voice' | 'video';
export type CallOutcome = 'completed' | 'missed' | 'declined' | 'cancelled';

export interface Conversation {
  id: string;
  listingId: string;
  claimId: string;
  donorId: string;
  recipientId: string;
  uidA?: string;
  uidB?: string;
  participants?: string[];
  conversationKind?: 'direct' | 'pickup' | 'demo';
  donorRole?: UserRole | string;
  recipientRole?: UserRole | string;
  donorName: string;
  donorLogoUrl?: string | null;
  donorVerified: boolean;
  donorPhone?: string | null;
  donorArea?: string | null;
  donorAddress?: string | null;
  donorAddressBn?: string | null;
  donorHours?: string | null;
  peerOnline?: boolean;
  peerLastSeen?: string | null;
  peerTyping?: boolean;
  peerUid?: string;
  peerHandle?: string | null;
  peerRole?: UserRole | string;
  peerVerified?: boolean;
  peerArea?: string | null;
  peerRestaurantName?: string | null;
  recipientName: string;
  recipientOrg?: string | null;
  recipientLogoUrl?: string | null;
  recipientPhone?: string | null;
  recipientVerified?: boolean;
  recipientArea?: string | null;
  listingTitle: string;
  listingPhoto: string;
  pickupStart: string;
  pickupEnd: string;
  claimStatus: ClaimStatus;
  pickupCode?: string | null;
  isDirect?: boolean;
  isStarter?: boolean;
  isDemo?: boolean;
  demoShopKey?: string | null;
  demoPersonaId?: string | null;
  peerBio?: string | null;
  peerBioBn?: string | null;
  peerRating?: number | null;
  peerReviewCount?: number | null;
  isOfficial?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  isFirestoreBacked?: boolean;
  lastMessage?: string | null;
  lastMessageType?: MessageType | null;
  lastMessageSenderId?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
  isBlocked: boolean;
  blockedByMe?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessageReaction {
  emoji: string;
  userId: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string | null;
  text: string;
  messageType?: MessageType;
  imageUrl?: string | null;
  audioUrl?: string | null;
  durationSec?: number | null;
  callType?: CallKind | null;
  callStatus?: CallOutcome | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileMime?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationLabel?: string | null;
  locationExpiresAt?: string | null;
  isForwarded?: boolean;
  forwardedFrom?: string | null;
  replyToId?: string | null;
  replyToText?: string | null;
  replyToSenderId?: string | null;
  sentAt: string;
  readAt?: string | null;
  deliveredTo?: string[];
  readBy?: string[];
  deletedFor?: string[];
  reactions?: MessageReaction[];
  clientTempId?: string;
  pending?: boolean;
  failed?: boolean;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  isDemoAutoReply?: boolean;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  titleBn?: string | null;
  body: string;
  bodyBn?: string | null;
  payload: Record<string, unknown>;
  read: boolean;
  isStarter?: boolean;
  conversationId?: string | null;
  listingId?: string | null;
  claimId?: string | null;
  linkTab?: string | null;
  senderUid?: string | null;
  senderName?: string | null;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  user: User;
}

export interface HomeSummary {
  impact: {
    mealsShared: number;
    kgSaved: number;
    activeDonors: number;
    peopleHelped: number;
    portionsAvailableNow: number;
  };
  featuredDonors: {
    id: string;
    businessName: string;
    area: string;
    hours: string;
    verified: boolean;
    activeListings: number;
    photoUrl: string;
  }[];
  recentActivity: {
    id: string;
    status: string;
    quantity: number;
    unit: string;
    listingTitle: string;
    donorName: string;
    area: string;
    createdAt: string;
  }[];
  featuredPartners?: Partner[];
  upcomingEvents?: CommunityEvent[];
  testimonials?: Testimonial[];
  campaignProgress?: {
    goalBdt: number;
    raisedBdt: number;
    donorCount: number;
  };
}

export type PartnerCategory =
  | 'restaurants_cafes'
  | 'wedding_venues'
  | 'hotels_catering'
  | 'ngos_charities'
  | 'orphanages_shelters'
  | 'community_groups'
  | 'individual_families';

export interface Partner {
  id: string;
  name: string;
  nameBn: string;
  category: PartnerCategory;
  area: string;
  description: string;
  descriptionBn: string;
  logoUrl?: string | null;
  sinceYear: number;
  mealsContributed: number;
  featured: boolean;
}

export interface Testimonial {
  id: string;
  quote: string;
  quoteBn: string;
  authorName: string;
  authorNameBn: string;
  roleLabel: string;
  roleLabelBn: string;
  orgName: string;
  category: string;
  avatarUrl?: string | null;
}

export interface PartnerApplication {
  id: string;
  organizationName: string;
  category: PartnerCategory;
  contactPerson: string;
  contactInfo: string;
  area: string;
  message?: string | null;
  status: string;
  createdAt: string;
}

export type EventStatus = 'upcoming' | 'ongoing' | 'past' | 'cancelled';
export type VolunteerRole = 'cooking' | 'packing' | 'distribution' | 'transport';
export type AttendanceStatus = 'registered' | 'present' | 'absent';

export interface EventScheduleItem {
  time: string;
  activity: string;
  activityBn: string;
}

export interface CommunityEvent {
  id: string;
  title: string;
  titleBn: string;
  description: string;
  descriptionBn: string;
  organizer: string;
  organizerBn: string;
  area: string;
  locationName: string;
  locationNameBn?: string | null;
  lat: number;
  lng: number;
  eventDate: string;
  startTime: string;
  endTime: string;
  schedule: EventScheduleItem[];
  expectedMeals: number;
  actualMealsServed?: number | null;
  peopleHelped?: number | null;
  volunteersNeeded: number;
  registeredCount: number;
  myRegistration?: EventRegistration | null;
  bannerUrl: string;
  galleryUrls: string[];
  howToHelp: string;
  howToHelpBn: string;
  status: EventStatus;
  createdBy?: string | null;
  createdAt: string;
}

export interface EventRegistration {
  id: string;
  eventId: string;
  userId: string;
  name: string;
  phone: string;
  availability: string;
  preferredRole: VolunteerRole;
  attendanceStatus: AttendanceStatus;
  reminderEnabled: boolean;
  createdAt: string;
}

export type WeddingPickupStatus =
  | 'submitted'
  | 'volunteer_assigned'
  | 'on_the_way'
  | 'collected'
  | 'delivered';

export interface WeddingPickupRequest {
  id: string;
  donorId: string;
  eventType: string;
  venueName: string;
  address: string;
  addressBn?: string | null;
  lat: number;
  lng: number;
  contactPerson: string;
  phone: string;
  eventDate: string;
  readyTime: string;
  approxServings: number;
  foodTypes: string[];
  isHalal: boolean;
  isVeg: boolean;
  storageMethod: string;
  photoUrls: string[];
  specialNotes?: string | null;
  isUrgent: boolean;
  status: WeddingPickupStatus;
  volunteerId?: string | null;
  volunteerName?: string | null;
  ngoClaimerId?: string | null;
  ngoName?: string | null;
  conversationId?: string | null;
  deliveryPhotoUrl?: string | null;
  deliveredMeals?: number | null;
  deliveryNote?: string | null;
  distanceKm?: number;
  createdAt: string;
  updatedAt: string;
}

export type DonationFrequency = 'one_time' | 'monthly';
export type DonationCause =
  | 'general'
  | 'events'
  | 'wedding_pickup'
  | 'platform'
  | 'iftar_packs'
  | 'sadaqah'
  | 'zakat';
export type PaymentMethodId = 'bkash' | 'nagad' | 'rocket' | 'card_sandbox' | 'bank_transfer';

export interface DonationRecord {
  id: string;
  userId?: string | null;
  donorDisplayName: string;
  amountBdt: number;
  frequency: DonationFrequency;
  cause: DonationCause;
  eventId?: string | null;
  eventTitle?: string | null;
  paymentMethod: PaymentMethodId;
  isAnonymous: boolean;
  honorOf?: string | null;
  receiptCode: string;
  status: string;
  createdAt: string;
}

export interface DonationSummary {
  goalBdt: number;
  raisedBdt: number;
  totalDonationsCount: number;
  monthlySupportersCount: number;
  breakdown: {
    key: string;
    percentage: number;
  }[];
  recentDonors: DonationRecord[];
  monthlyReports: {
    monthKey: string;
    monthLabel: string;
    monthLabelBn: string;
    incomeBdt: number;
    spentBdt: number;
    mealsFunded: number;
  }[];
}

export interface DonorReview {
  id: string;
  claimId: string;
  donorId: string;
  reviewerName: string;
  reviewerOrg?: string | null;
  rating: number;
  hygieneOk: boolean;
  comment?: string | null;
  createdAt: string;
}

export interface DonorReviewsResponse {
  avgRating: number | null;
  reviewCount: number;
  hygieneRatePct: number;
  reviews: DonorReview[];
}

export interface ImpactDashboardData {
  mealsShared: number;
  kgSaved: number;
  co2AvoidedKg: number;
  activeDonors: number;
  peopleHelped: number;
  raisedBdt: number;
  donationCount: number;
  mealsFunded: number;
  qrHandovers: number;
  flashListingsNow: number;
  ramadanDonationsBdt: number;
  personal: {
    mealsImpact: number;
    cashDonatedBdt: number;
    volunteerHours: number;
  } | null;
}

export interface ShiftSignup {
  id: string;
  shiftId: string;
  status: 'signed_up' | 'checked_in' | 'completed' | 'cancelled';
  hoursLogged: number;
  createdAt: string;
}

export interface VolunteerShift {
  id: string;
  title: string;
  titleBn: string;
  area: string;
  locationName: string;
  locationNameBn?: string | null;
  role: VolunteerRole;
  shiftDate: string;
  startTime: string;
  endTime: string;
  slotsTotal: number;
  slotsFilled: number;
  eventId?: string | null;
  mySignup: ShiftSignup | null;
}

export interface BadgeProgress {
  id: string;
  unlocked: boolean;
  progress: number;
  target: number;
}

export interface LeaderboardData {
  topDonors: {
    id: string;
    businessName: string;
    area: string;
    verified: boolean;
    logoUrl?: string | null;
    mealsSaved: number;
    avgRating: number;
  }[];
  topVolunteers: {
    id: string;
    name: string;
    area: string;
    organizationName?: string | null;
    hoursLogged: number;
    eventsCount: number;
  }[];
  topAreas: {
    area: string;
    listingsCount: number;
    totalPortions: number;
  }[];
  myBadges: BadgeProgress[];
  myStats: {
    mealsTotal: number;
    volunteerHours: number;
    donationsBdt: number;
    qrHandovers: number;
  };
}

export interface PlatformUserSummary {
  id: string;
  name: string;
  handle?: string;
  role: UserRole;
  accountType: AccountType;
  area: string;
  organizationName?: string | null;
  businessName?: string | null;
  logoUrl?: string | null;
  source: 'firebase' | 'express';
  verified: boolean;
  discoverable?: boolean;
  isOnline?: boolean;
  wsOnline?: boolean;
  hasLoggedIn?: boolean;
  lastActiveAt?: string | null;
  lastSeen?: string | null;
}

export interface DemoPersonaSpec {
  id: string;
  displayName: string;
  displayNameBn?: string;
  handle: string;
  role: DirectoryRole;
  avatar?: string | null;
  restaurantName?: string | null;
  restaurantType?: RestaurantType | string | null;
  area: string;
  verified: boolean;
  bio: string;
  bioBn: string;
  openingHours?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  online: boolean;
  isOfficial?: boolean;
  categoryKey:
    | 'team'
    | 'biryani'
    | 'mishti'
    | 'bakery'
    | 'kabab'
    | 'tea'
    | 'catering'
    | 'hotel'
    | 'volunteer'
    | 'recipient'
    | 'ngo'
    | 'organizer';
}

export interface CommunityRoom {
  id: string;
  slug: string;
  name: string;
  nameBn: string;
  description: string;
  descriptionBn: string;
  iconKey: 'community' | 'restaurant' | 'volunteer';
  pinnedOrder: number;
  memberCount: number;
  onlineCount: number;
  lastMessage: string;
  lastMessageSenderName: string;
  lastMessageAt: string;
  mutedUids: string[];
  isDemoSeeded?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoomMember {
  uid: string;
  displayName: string;
  handle?: string | null;
  photoURL?: string | null;
  role: DirectoryRole;
  area?: string | null;
  online: boolean;
  isDemo?: boolean;
  lastMessageAt?: string | null;
  updatedAt: string;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderHandle?: string | null;
  senderAvatar?: string | null;
  senderRole: DirectoryRole;
  senderArea?: string | null;
  senderVerified: boolean;
  senderIsDemo: boolean;
  text: string;
  messageType: 'text' | 'image';
  mediaUrl?: string | null;
  replyToId?: string | null;
  replyToText?: string | null;
  replyToSenderName?: string | null;
  reactions: Record<string, string[]>;
  reportedBy?: string[];
  deleted?: boolean;
  isDemo?: boolean;
  createdAt: string;
  clientTempId?: string;
  pending?: boolean;
}


