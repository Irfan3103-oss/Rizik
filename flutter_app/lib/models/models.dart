enum UserRole { donor, recipient, admin }

enum AccountType { user, restaurantOwner }

enum FoodCategory { cooked, bakery, produce, packaged }

enum ListingStatus { active, paused, claimed, expired }

enum ClaimStatus { requested, accepted, pickedUp, completed, cancelled, expired }

enum StorageMethod { coveredHot, coveredChilled, sealedDry, roomTemp }

enum MessageType { text, image, voice, call, location, file }

enum DonationFrequency { oneTime, monthly }

enum DonationCause {
  general,
  events,
  weddingPickup,
  platform,
  iftarPacks,
  sadaqah,
  zakat,
}

enum PaymentMethodId { bkash, nagad, rocket, cardSandbox, bankTransfer }

enum EventStatus { upcoming, ongoing, past, cancelled }

enum VolunteerRole { cooking, packing, distribution, transport }

enum AttendanceStatus { registered, present, absent }

enum WeddingPickupStatus {
  submitted,
  volunteerAssigned,
  onTheWay,
  collected,
  delivered,
}

enum RestaurantVerificationStatus { pending, approved, rejected }

String foodCategoryToWire(FoodCategory c) => c.name;

FoodCategory foodCategoryFromWire(String? raw) {
  switch (raw) {
    case 'bakery':
      return FoodCategory.bakery;
    case 'produce':
      return FoodCategory.produce;
    case 'packaged':
      return FoodCategory.packaged;
    default:
      return FoodCategory.cooked;
  }
}

String storageMethodToWire(StorageMethod s) {
  switch (s) {
    case StorageMethod.coveredHot:
      return 'covered_hot';
    case StorageMethod.coveredChilled:
      return 'covered_chilled';
    case StorageMethod.sealedDry:
      return 'sealed_dry';
    case StorageMethod.roomTemp:
      return 'room_temp';
  }
}

StorageMethod storageMethodFromWire(String? raw) {
  switch (raw) {
    case 'covered_chilled':
      return StorageMethod.coveredChilled;
    case 'sealed_dry':
      return StorageMethod.sealedDry;
    case 'room_temp':
      return StorageMethod.roomTemp;
    default:
      return StorageMethod.coveredHot;
  }
}

ClaimStatus claimStatusFromWire(String? raw) {
  switch (raw) {
    case 'accepted':
      return ClaimStatus.accepted;
    case 'picked_up':
      return ClaimStatus.pickedUp;
    case 'completed':
      return ClaimStatus.completed;
    case 'cancelled':
      return ClaimStatus.cancelled;
    case 'expired':
      return ClaimStatus.expired;
    default:
      return ClaimStatus.requested;
  }
}

String claimStatusToWire(ClaimStatus s) {
  if (s == ClaimStatus.pickedUp) return 'picked_up';
  return s.name;
}

String donationCauseToWire(DonationCause c) {
  switch (c) {
    case DonationCause.weddingPickup:
      return 'wedding_pickup';
    case DonationCause.iftarPacks:
      return 'iftar_packs';
    default:
      return c.name;
  }
}

DonationCause donationCauseFromWire(String? raw) {
  switch (raw) {
    case 'events':
      return DonationCause.events;
    case 'wedding_pickup':
      return DonationCause.weddingPickup;
    case 'platform':
      return DonationCause.platform;
    case 'iftar_packs':
      return DonationCause.iftarPacks;
    case 'sadaqah':
      return DonationCause.sadaqah;
    case 'zakat':
      return DonationCause.zakat;
    default:
      return DonationCause.general;
  }
}

String paymentMethodToWire(PaymentMethodId p) {
  switch (p) {
    case PaymentMethodId.cardSandbox:
      return 'card_sandbox';
    case PaymentMethodId.bankTransfer:
      return 'bank_transfer';
    default:
      return p.name;
  }
}

PaymentMethodId paymentMethodFromWire(String? raw) {
  switch (raw) {
    case 'nagad':
      return PaymentMethodId.nagad;
    case 'rocket':
      return PaymentMethodId.rocket;
    case 'card_sandbox':
      return PaymentMethodId.cardSandbox;
    case 'bank_transfer':
      return PaymentMethodId.bankTransfer;
    default:
      return PaymentMethodId.bkash;
  }
}

WeddingPickupStatus weddingStatusFromWire(String? raw) {
  switch (raw) {
    case 'volunteer_assigned':
      return WeddingPickupStatus.volunteerAssigned;
    case 'on_the_way':
      return WeddingPickupStatus.onTheWay;
    case 'collected':
      return WeddingPickupStatus.collected;
    case 'delivered':
      return WeddingPickupStatus.delivered;
    default:
      return WeddingPickupStatus.submitted;
  }
}

String weddingStatusToWire(WeddingPickupStatus s) {
  switch (s) {
    case WeddingPickupStatus.volunteerAssigned:
      return 'volunteer_assigned';
    case WeddingPickupStatus.onTheWay:
      return 'on_the_way';
    default:
      return s.name;
  }
}

class RestaurantInfo {
  final String restaurantName;
  final String ownerName;
  final String phone;
  final String? email;
  final String address;
  final String area;
  final String city;
  final double lat;
  final double lng;
  final String restaurantType;
  final String? tradeLicenseNumber;
  final String? restaurantPhotoUrl;
  final String? licensePhotoUrl;
  final String openingHours;
  final String? approxDailySurplus;
  final bool acceptedSafetyTerms;
  final RestaurantVerificationStatus verificationStatus;
  final String? rejectionReason;
  final String? submittedAt;
  final String? reviewedAt;
  final String? reviewedBy;

  const RestaurantInfo({
    required this.restaurantName,
    required this.ownerName,
    required this.phone,
    this.email,
    required this.address,
    required this.area,
    required this.city,
    required this.lat,
    required this.lng,
    required this.restaurantType,
    this.tradeLicenseNumber,
    this.restaurantPhotoUrl,
    this.licensePhotoUrl,
    required this.openingHours,
    this.approxDailySurplus,
    this.acceptedSafetyTerms = true,
    this.verificationStatus = RestaurantVerificationStatus.pending,
    this.rejectionReason,
    this.submittedAt,
    this.reviewedAt,
    this.reviewedBy,
  });

  factory RestaurantInfo.fromJson(Map<String, dynamic> j) {
    final statusRaw = j['verificationStatus']?.toString();
    final ver = statusRaw == 'approved'
        ? RestaurantVerificationStatus.approved
        : statusRaw == 'rejected'
            ? RestaurantVerificationStatus.rejected
            : RestaurantVerificationStatus.pending;
    return RestaurantInfo(
      restaurantName: (j['restaurantName'] ?? '').toString(),
      ownerName: (j['ownerName'] ?? '').toString(),
      phone: (j['phone'] ?? '').toString(),
      email: j['email']?.toString(),
      address: (j['address'] ?? '').toString(),
      area: (j['area'] ?? 'Dhanmondi').toString(),
      city: (j['city'] ?? 'Dhaka').toString(),
      lat: (j['lat'] as num?)?.toDouble() ?? 23.7465,
      lng: (j['lng'] as num?)?.toDouble() ?? 90.376,
      restaurantType: (j['restaurantType'] ?? 'restaurant').toString(),
      tradeLicenseNumber: j['tradeLicenseNumber']?.toString(),
      restaurantPhotoUrl: j['restaurantPhotoUrl']?.toString(),
      licensePhotoUrl: j['licensePhotoUrl']?.toString(),
      openingHours: (j['openingHours'] ?? '9:00 AM - 10:00 PM').toString(),
      approxDailySurplus: j['approxDailySurplus']?.toString(),
      acceptedSafetyTerms: j['acceptedSafetyTerms'] == true,
      verificationStatus: ver,
      rejectionReason: j['rejectionReason']?.toString(),
      submittedAt: j['submittedAt']?.toString(),
      reviewedAt: j['reviewedAt']?.toString(),
      reviewedBy: j['reviewedBy']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'restaurantName': restaurantName,
        'ownerName': ownerName,
        'phone': phone,
        'email': email,
        'address': address,
        'area': area,
        'city': city,
        'lat': lat,
        'lng': lng,
        'restaurantType': restaurantType,
        'tradeLicenseNumber': tradeLicenseNumber,
        'restaurantPhotoUrl': restaurantPhotoUrl,
        'licensePhotoUrl': licensePhotoUrl,
        'openingHours': openingHours,
        'approxDailySurplus': approxDailySurplus,
        'acceptedSafetyTerms': acceptedSafetyTerms,
        'verificationStatus': verificationStatus.name,
        'rejectionReason': rejectionReason,
        'submittedAt': submittedAt,
      };
}

class DonorProfile {
  final String userId;
  final String businessName;
  final String address;
  final String? addressBn;
  final double lat;
  final double lng;
  final String hours;
  final String verificationStatus;
  final String? logoUrl;

  const DonorProfile({
    required this.userId,
    required this.businessName,
    required this.address,
    this.addressBn,
    required this.lat,
    required this.lng,
    required this.hours,
    required this.verificationStatus,
    this.logoUrl,
  });

  factory DonorProfile.fromJson(Map<String, dynamic> j) => DonorProfile(
        userId: (j['userId'] ?? '').toString(),
        businessName: (j['businessName'] ?? '').toString(),
        address: (j['address'] ?? '').toString(),
        addressBn: j['addressBn']?.toString(),
        lat: (j['lat'] as num?)?.toDouble() ?? 23.7465,
        lng: (j['lng'] as num?)?.toDouble() ?? 90.376,
        hours: (j['hours'] ?? '9:00 AM - 10:00 PM').toString(),
        verificationStatus: (j['verificationStatus'] ?? 'pending').toString(),
        logoUrl: j['logoUrl']?.toString(),
      );
}

class AppUser {
  final String id;
  final UserRole role;
  final AccountType accountType;
  final bool isAdmin;
  final String name;
  final String? handle;
  final String? photoURL;
  final String phone;
  final String email;
  final String location;
  final String area;
  final String? organizationName;
  final bool verified;
  final bool discoverable;
  final String language;
  final double savedRadiusKm;
  final String createdAt;
  final DonorProfile? donorProfile;
  final RestaurantInfo? restaurant;

  const AppUser({
    required this.id,
    required this.role,
    this.accountType = AccountType.user,
    this.isAdmin = false,
    required this.name,
    this.handle,
    this.photoURL,
    required this.phone,
    required this.email,
    required this.location,
    required this.area,
    this.organizationName,
    required this.verified,
    this.discoverable = true,
    this.language = 'en',
    this.savedRadiusKm = 10,
    required this.createdAt,
    this.donorProfile,
    this.restaurant,
  });

  factory AppUser.fromJson(Map<String, dynamic> j) {
    final roleRaw = j['role']?.toString();
    final role = roleRaw == 'admin'
        ? UserRole.admin
        : roleRaw == 'donor'
            ? UserRole.donor
            : UserRole.recipient;
    final accType = j['accountType'] == 'restaurantOwner'
        ? AccountType.restaurantOwner
        : AccountType.user;
    return AppUser(
      id: (j['id'] ?? '').toString(),
      role: role,
      accountType: accType,
      isAdmin: j['isAdmin'] == true || role == UserRole.admin,
      name: (j['name'] ?? 'Community Member').toString(),
      handle: j['handle']?.toString(),
      photoURL: j['photoURL']?.toString(),
      phone: (j['phone'] ?? '').toString(),
      email: (j['email'] ?? '').toString(),
      location: (j['location'] ?? 'Dhaka, Bangladesh').toString(),
      area: (j['area'] ?? 'Dhanmondi').toString(),
      organizationName: j['organizationName']?.toString(),
      verified: j['verified'] == true,
      discoverable: j['discoverable'] != false,
      language: j['language'] == 'bn' ? 'bn' : 'en',
      savedRadiusKm: (j['savedRadiusKm'] as num?)?.toDouble() ?? 10,
      createdAt: (j['createdAt'] ?? DateTime.now().toIso8601String()).toString(),
      donorProfile: j['donorProfile'] is Map<String, dynamic>
          ? DonorProfile.fromJson(j['donorProfile'] as Map<String, dynamic>)
          : null,
      restaurant: j['restaurant'] is Map<String, dynamic>
          ? RestaurantInfo.fromJson(j['restaurant'] as Map<String, dynamic>)
          : null,
    );
  }
}

class AuthSession {
  final String token;
  final AppUser user;
  const AuthSession({required this.token, required this.user});
}

class Listing {
  final String id;
  final String donorId;
  final String donorName;
  final bool donorVerified;
  final double? donorAvgRating;
  final int donorReviewCount;
  final String donorArea;
  final String? donorPhone;
  final String title;
  final String description;
  final FoodCategory category;
  final List<String> dietaryTags;
  final int quantity;
  final int remainingQuantity;
  final String unit;
  final List<String> photoUrls;
  final String pickupStart;
  final String pickupEnd;
  final String pickupAddress;
  final String? pickupAddressBn;
  final String safetyNote;
  final String preparedAt;
  final int consumeWithinHours;
  final String? safeUntil;
  final bool isFlashRescue;
  final StorageMethod storageMethod;
  final bool isRamadanSpecial;
  final ListingStatus status;
  final double lat;
  final double lng;
  final double? distanceKm;
  final String createdAt;

  const Listing({
    required this.id,
    required this.donorId,
    required this.donorName,
    required this.donorVerified,
    this.donorAvgRating,
    this.donorReviewCount = 0,
    required this.donorArea,
    this.donorPhone,
    required this.title,
    required this.description,
    required this.category,
    required this.dietaryTags,
    required this.quantity,
    required this.remainingQuantity,
    required this.unit,
    required this.photoUrls,
    required this.pickupStart,
    required this.pickupEnd,
    required this.pickupAddress,
    this.pickupAddressBn,
    required this.safetyNote,
    required this.preparedAt,
    required this.consumeWithinHours,
    this.safeUntil,
    this.isFlashRescue = false,
    this.storageMethod = StorageMethod.coveredHot,
    this.isRamadanSpecial = false,
    this.status = ListingStatus.active,
    required this.lat,
    required this.lng,
    this.distanceKm,
    required this.createdAt,
  });

  factory Listing.fromJson(Map<String, dynamic> j) {
    final statusRaw = j['status']?.toString();
    final st = statusRaw == 'paused'
        ? ListingStatus.paused
        : statusRaw == 'claimed'
            ? ListingStatus.claimed
            : statusRaw == 'expired'
                ? ListingStatus.expired
                : ListingStatus.active;
    return Listing(
      id: (j['id'] ?? '').toString(),
      donorId: (j['donorId'] ?? '').toString(),
      donorName: (j['donorName'] ?? 'Community Kitchen').toString(),
      donorVerified: j['donorVerified'] == true,
      donorAvgRating: (j['donorAvgRating'] as num?)?.toDouble(),
      donorReviewCount: (j['donorReviewCount'] as num?)?.toInt() ?? 0,
      donorArea: (j['donorArea'] ?? 'Dhanmondi').toString(),
      donorPhone: j['donorPhone']?.toString(),
      title: (j['title'] ?? '').toString(),
      description: (j['description'] ?? '').toString(),
      category: foodCategoryFromWire(j['category']?.toString()),
      dietaryTags: (j['dietaryTags'] as List?)?.map((e) => e.toString()).toList() ?? [],
      quantity: (j['quantity'] as num?)?.toInt() ?? 1,
      remainingQuantity: (j['remainingQuantity'] as num?)?.toInt() ?? 0,
      unit: (j['unit'] ?? 'servings').toString(),
      photoUrls: (j['photoUrls'] as List?)?.map((e) => e.toString()).toList() ?? [],
      pickupStart: (j['pickupStart'] ?? '').toString(),
      pickupEnd: (j['pickupEnd'] ?? '').toString(),
      pickupAddress: (j['pickupAddress'] ?? 'Dhaka').toString(),
      pickupAddressBn: j['pickupAddressBn']?.toString(),
      safetyNote: (j['safetyNote'] ?? '').toString(),
      preparedAt: (j['preparedAt'] ?? '').toString(),
      consumeWithinHours: (j['consumeWithinHours'] as num?)?.toInt() ?? 4,
      safeUntil: j['safeUntil']?.toString(),
      isFlashRescue: j['isFlashRescue'] == true,
      storageMethod: storageMethodFromWire(j['storageMethod']?.toString()),
      isRamadanSpecial: j['isRamadanSpecial'] == true,
      status: st,
      lat: (j['lat'] as num?)?.toDouble() ?? 23.7465,
      lng: (j['lng'] as num?)?.toDouble() ?? 90.376,
      distanceKm: (j['distanceKm'] as num?)?.toDouble(),
      createdAt: (j['createdAt'] ?? DateTime.now().toIso8601String()).toString(),
    );
  }
}

class Claim {
  final String id;
  final String listingId;
  final String recipientId;
  final String recipientName;
  final String recipientArea;
  final String? recipientOrg;
  final String? recipientPhone;
  final String donorId;
  final String donorBusinessName;
  final String donorAddress;
  final String? donorAddressBn;
  final String? donorPhone;
  final bool donorVerified;
  final String listingTitle;
  final String listingPhoto;
  final FoodCategory listingCategory;
  final String pickupStart;
  final String pickupEnd;
  final int quantityClaimed;
  final ClaimStatus status;
  final String pickupCode;
  final String handoverMethod;
  final int? myRating;
  final String? notes;
  final String? cancelReason;
  final String createdAt;
  final String? conversationId;

  const Claim({
    required this.id,
    required this.listingId,
    required this.recipientId,
    required this.recipientName,
    required this.recipientArea,
    this.recipientOrg,
    this.recipientPhone,
    required this.donorId,
    required this.donorBusinessName,
    required this.donorAddress,
    this.donorAddressBn,
    this.donorPhone,
    required this.donorVerified,
    required this.listingTitle,
    required this.listingPhoto,
    required this.listingCategory,
    required this.pickupStart,
    required this.pickupEnd,
    required this.quantityClaimed,
    required this.status,
    required this.pickupCode,
    this.handoverMethod = 'manual',
    this.myRating,
    this.notes,
    this.cancelReason,
    required this.createdAt,
    this.conversationId,
  });

  factory Claim.fromJson(Map<String, dynamic> j) => Claim(
        id: (j['id'] ?? '').toString(),
        listingId: (j['listingId'] ?? '').toString(),
        recipientId: (j['recipientId'] ?? '').toString(),
        recipientName: (j['recipientName'] ?? 'Neighbor').toString(),
        recipientArea: (j['recipientArea'] ?? 'Dhaka').toString(),
        recipientOrg: j['recipientOrg']?.toString(),
        recipientPhone: j['recipientPhone']?.toString(),
        donorId: (j['donorId'] ?? '').toString(),
        donorBusinessName: (j['donorBusinessName'] ?? 'Kitchen').toString(),
        donorAddress: (j['donorAddress'] ?? 'Dhaka').toString(),
        donorAddressBn: j['donorAddressBn']?.toString(),
        donorPhone: j['donorPhone']?.toString(),
        donorVerified: j['donorVerified'] == true,
        listingTitle: (j['listingTitle'] ?? '').toString(),
        listingPhoto: (j['listingPhoto'] ?? '/images/kacchi-biryani.jpg').toString(),
        listingCategory: foodCategoryFromWire(j['listingCategory']?.toString()),
        pickupStart: (j['pickupStart'] ?? '').toString(),
        pickupEnd: (j['pickupEnd'] ?? '').toString(),
        quantityClaimed: (j['quantityClaimed'] as num?)?.toInt() ?? 1,
        status: claimStatusFromWire(j['status']?.toString()),
        pickupCode: (j['pickupCode'] ?? '').toString(),
        handoverMethod: (j['handoverMethod'] ?? 'manual').toString(),
        myRating: (j['myRating'] as num?)?.toInt(),
        notes: j['notes']?.toString(),
        cancelReason: j['cancelReason']?.toString(),
        createdAt: (j['createdAt'] ?? DateTime.now().toIso8601String()).toString(),
        conversationId: j['conversationId']?.toString(),
      );
}

class MessageReaction {
  final String emoji;
  final String userId;
  const MessageReaction({required this.emoji, required this.userId});
}

class Conversation {
  final String id;
  final String listingId;
  final String claimId;
  final String donorId;
  final String recipientId;
  final String? uidA;
  final String? uidB;
  final List<String> participants;
  final String conversationKind; // 'direct' | 'pickup' | 'demo'
  final String donorName;
  final String? donorLogoUrl;
  final bool donorVerified;
  final String? donorPhone;
  final String? donorArea;
  final String? donorHours;
  final bool peerOnline;
  final String? peerLastSeen;
  final bool peerTyping;
  final String? peerUid;
  final String? peerHandle;
  final String? peerRole;
  final bool? peerVerified;
  final String? peerArea;
  final String? peerRestaurantName;
  final String? peerBio;
  final String? peerBioBn;
  final double? peerRating;
  final int? peerReviewCount;
  final String recipientName;
  final String? recipientLogoUrl;
  final String listingTitle;
  final String listingPhoto;
  final String pickupStart;
  final String pickupEnd;
  final ClaimStatus claimStatus;
  final String? pickupCode;
  final bool isDirect;
  final bool isStarter;
  final bool isDemo;
  final String? demoPersonaId;
  final String? demoShopKey;
  final bool isOfficial;
  final bool isMuted;
  final bool isArchived;
  final bool isFirestoreBacked;
  final String? lastMessage;
  final MessageType lastMessageType;
  final String? lastMessageSenderId;
  final String? lastMessageAt;
  final int unreadCount;
  final bool isBlocked;
  final bool blockedByMe;
  final String createdAt;
  final String updatedAt;

  const Conversation({
    required this.id,
    required this.listingId,
    required this.claimId,
    required this.donorId,
    required this.recipientId,
    this.uidA,
    this.uidB,
    this.participants = const [],
    this.conversationKind = 'direct',
    required this.donorName,
    this.donorLogoUrl,
    this.donorVerified = false,
    this.donorPhone,
    this.donorArea,
    this.donorHours,
    this.peerOnline = false,
    this.peerLastSeen,
    this.peerTyping = false,
    this.peerUid,
    this.peerHandle,
    this.peerRole,
    this.peerVerified,
    this.peerArea,
    this.peerRestaurantName,
    this.peerBio,
    this.peerBioBn,
    this.peerRating,
    this.peerReviewCount,
    required this.recipientName,
    this.recipientLogoUrl,
    required this.listingTitle,
    required this.listingPhoto,
    required this.pickupStart,
    required this.pickupEnd,
    this.claimStatus = ClaimStatus.requested,
    this.pickupCode,
    this.isDirect = false,
    this.isStarter = false,
    this.isDemo = false,
    this.demoPersonaId,
    this.demoShopKey,
    this.isOfficial = false,
    this.isMuted = false,
    this.isArchived = false,
    this.isFirestoreBacked = false,
    this.lastMessage,
    this.lastMessageType = MessageType.text,
    this.lastMessageSenderId,
    this.lastMessageAt,
    this.unreadCount = 0,
    this.isBlocked = false,
    this.blockedByMe = false,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Conversation.fromJson(Map<String, dynamic> j) => Conversation(
        id: (j['id'] ?? '').toString(),
        listingId: (j['listingId'] ?? '').toString(),
        claimId: (j['claimId'] ?? '').toString(),
        donorId: (j['donorId'] ?? '').toString(),
        recipientId: (j['recipientId'] ?? '').toString(),
        uidA: j['uidA']?.toString(),
        uidB: j['uidB']?.toString(),
        participants:
            (j['participants'] as List?)?.map((e) => e.toString()).toList() ??
                [],
        conversationKind: (j['conversationKind'] ?? 'direct').toString(),
        donorName: (j['donorName'] ?? 'Donor').toString(),
        donorLogoUrl: j['donorLogoUrl']?.toString(),
        donorVerified: j['donorVerified'] == true,
        donorPhone: j['donorPhone']?.toString(),
        donorArea: j['donorArea']?.toString(),
        donorHours: j['donorHours']?.toString(),
        peerOnline: j['peerOnline'] == true,
        peerLastSeen: j['peerLastSeen']?.toString(),
        peerTyping: j['peerTyping'] == true,
        peerUid: j['peerUid']?.toString(),
        peerHandle: j['peerHandle']?.toString(),
        peerRole: j['peerRole']?.toString(),
        peerVerified: j['peerVerified'] == true,
        peerArea: j['peerArea']?.toString(),
        peerRestaurantName: j['peerRestaurantName']?.toString(),
        peerBio: j['peerBio']?.toString(),
        peerBioBn: j['peerBioBn']?.toString(),
        peerRating: (j['peerRating'] as num?)?.toDouble(),
        peerReviewCount: (j['peerReviewCount'] as num?)?.toInt(),
        recipientName: (j['recipientName'] ?? 'Neighbor').toString(),
        recipientLogoUrl: j['recipientLogoUrl']?.toString(),
        listingTitle: (j['listingTitle'] ?? '').toString(),
        listingPhoto:
            (j['listingPhoto'] ?? '/images/kacchi-biryani.jpg').toString(),
        pickupStart: (j['pickupStart'] ?? '').toString(),
        pickupEnd: (j['pickupEnd'] ?? '').toString(),
        claimStatus: claimStatusFromWire(j['claimStatus']?.toString()),
        pickupCode: j['pickupCode']?.toString(),
        isDirect: j['isDirect'] == true,
        isStarter: j['isStarter'] == true || j['isDemo'] == true,
        isDemo: j['isDemo'] == true,
        demoPersonaId: j['demoPersonaId']?.toString(),
        demoShopKey: j['demoShopKey']?.toString(),
        isOfficial: j['isOfficial'] == true,
        isMuted: j['isMuted'] == true,
        isArchived: j['isArchived'] == true,
        isFirestoreBacked: j['isFirestoreBacked'] == true,
        lastMessage: j['lastMessage']?.toString(),
        lastMessageType: parseMessageType(j['lastMessageType']?.toString()),
        lastMessageSenderId: j['lastMessageSenderId']?.toString(),
        lastMessageAt: j['lastMessageAt']?.toString(),
        unreadCount: (j['unreadCount'] as num?)?.toInt() ?? 0,
        isBlocked: j['isBlocked'] == true,
        blockedByMe: j['blockedByMe'] == true,
        createdAt:
            (j['createdAt'] ?? DateTime.now().toIso8601String()).toString(),
        updatedAt:
            (j['updatedAt'] ?? DateTime.now().toIso8601String()).toString(),
      );
}

MessageType parseMessageType(String? raw) {
  switch (raw) {
    case 'image':
      return MessageType.image;
    case 'voice':
    case 'audio':
      return MessageType.voice;
    case 'call':
    case 'call_log':
      return MessageType.call;
    case 'location':
      return MessageType.location;
    case 'file':
      return MessageType.file;
    default:
      return MessageType.text;
  }
}

class ChatMessage {
  final String id;
  final String conversationId;
  final String senderId;
  final String? senderName;
  final String text;
  final MessageType messageType;
  final String? imageUrl;
  final String? audioUrl;
  final int? durationSec;
  final String? fileUrl;
  final String? fileName;
  final int? fileSize;
  final String? fileMime;
  final double? locationLat;
  final double? locationLng;
  final String? locationLabel;
  final String? locationExpiresAt;
  final bool isForwarded;
  final String? forwardedFrom;
  final String? replyToId;
  final String? replyToText;
  final String sentAt;
  final String? readAt;
  final List<String> deliveredTo;
  final List<String> readBy;
  final List<String> deletedFor;
  final List<MessageReaction> reactions;
  final String? status; // 'sent' | 'delivered' | 'read'
  final bool isDemoAutoReply;
  final bool pending;
  final bool failed;

  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.senderId,
    this.senderName,
    required this.text,
    this.messageType = MessageType.text,
    this.imageUrl,
    this.audioUrl,
    this.durationSec,
    this.fileUrl,
    this.fileName,
    this.fileSize,
    this.fileMime,
    this.locationLat,
    this.locationLng,
    this.locationLabel,
    this.locationExpiresAt,
    this.isForwarded = false,
    this.forwardedFrom,
    this.replyToId,
    this.replyToText,
    required this.sentAt,
    this.readAt,
    this.deliveredTo = const [],
    this.readBy = const [],
    this.deletedFor = const [],
    this.reactions = const [],
    this.status,
    this.isDemoAutoReply = false,
    this.pending = false,
    this.failed = false,
  });

  ChatMessage copyWith({
    String? id,
    String? status,
    bool? pending,
    bool? failed,
    List<MessageReaction>? reactions,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      conversationId: conversationId,
      senderId: senderId,
      senderName: senderName,
      text: text,
      messageType: messageType,
      imageUrl: imageUrl,
      audioUrl: audioUrl,
      durationSec: durationSec,
      fileUrl: fileUrl,
      fileName: fileName,
      fileSize: fileSize,
      fileMime: fileMime,
      locationLat: locationLat,
      locationLng: locationLng,
      locationLabel: locationLabel,
      locationExpiresAt: locationExpiresAt,
      isForwarded: isForwarded,
      forwardedFrom: forwardedFrom,
      replyToId: replyToId,
      replyToText: replyToText,
      sentAt: sentAt,
      readAt: readAt,
      deliveredTo: deliveredTo,
      readBy: readBy,
      deletedFor: deletedFor,
      reactions: reactions ?? this.reactions,
      status: status ?? this.status,
      isDemoAutoReply: isDemoAutoReply,
      pending: pending ?? this.pending,
      failed: failed ?? this.failed,
    );
  }

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: (j['id'] ?? '').toString(),
        conversationId: (j['conversationId'] ?? '').toString(),
        senderId: (j['senderId'] ?? '').toString(),
        senderName: j['senderName']?.toString(),
        text: (j['text'] ?? '').toString(),
        messageType: parseMessageType(j['messageType']?.toString()),
        imageUrl: j['imageUrl']?.toString(),
        audioUrl: j['audioUrl']?.toString(),
        durationSec: (j['durationSec'] as num?)?.toInt(),
        fileUrl: j['fileUrl']?.toString(),
        fileName: j['fileName']?.toString(),
        fileSize: (j['fileSize'] as num?)?.toInt(),
        fileMime: j['fileMime']?.toString(),
        locationLat: (j['locationLat'] as num?)?.toDouble(),
        locationLng: (j['locationLng'] as num?)?.toDouble(),
        locationLabel: j['locationLabel']?.toString(),
        locationExpiresAt: j['locationExpiresAt']?.toString(),
        isForwarded: j['isForwarded'] == true || j['forwardedFrom'] != null,
        forwardedFrom: j['forwardedFrom']?.toString(),
        replyToId: j['replyToId']?.toString(),
        replyToText: j['replyToText']?.toString(),
        sentAt: (j['sentAt'] ?? DateTime.now().toIso8601String()).toString(),
        readAt: j['readAt']?.toString(),
        deliveredTo:
            (j['deliveredTo'] as List?)?.map((e) => e.toString()).toList() ??
                [],
        readBy: (j['readBy'] as List?)?.map((e) => e.toString()).toList() ?? [],
        deletedFor:
            (j['deletedFor'] as List?)?.map((e) => e.toString()).toList() ?? [],
        reactions: (j['reactions'] as List?)
                ?.map((r) => MessageReaction(
                      emoji: (r['emoji'] ?? '').toString(),
                      userId: (r['userId'] ?? '').toString(),
                    ))
                .toList() ??
            [],
        status: j['status']?.toString(),
        isDemoAutoReply: j['isDemoAutoReply'] == true,
        pending: j['pending'] == true,
        failed: j['failed'] == true,
      );
}

class NotificationItem {
  final String id;
  final String userId;
  final String type;
  final String title;
  final String? titleBn;
  final String body;
  final String? bodyBn;
  final bool read;
  final bool isStarter;
  final String? conversationId;
  final String? listingId;
  final String? claimId;
  final String? linkTab;
  final String? senderUid;
  final String? senderName;
  final String createdAt;

  const NotificationItem({
    required this.id,
    required this.userId,
    required this.type,
    required this.title,
    this.titleBn,
    required this.body,
    this.bodyBn,
    required this.read,
    this.isStarter = false,
    this.conversationId,
    this.listingId,
    this.claimId,
    this.linkTab,
    this.senderUid,
    this.senderName,
    required this.createdAt,
  });

  factory NotificationItem.fromJson(Map<String, dynamic> j) => NotificationItem(
        id: (j['id'] ?? '').toString(),
        userId: (j['userId'] ?? '').toString(),
        type: (j['type'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        titleBn: j['titleBn']?.toString(),
        body: (j['body'] ?? '').toString(),
        bodyBn: j['bodyBn']?.toString(),
        read: j['read'] == true,
        isStarter: j['isStarter'] == true,
        conversationId: j['conversationId']?.toString(),
        listingId: j['listingId']?.toString(),
        claimId: j['claimId']?.toString(),
        linkTab: j['linkTab']?.toString(),
        senderUid: j['senderUid']?.toString(),
        senderName: j['senderName']?.toString(),
        createdAt:
            (j['createdAt'] ?? DateTime.now().toIso8601String()).toString(),
      );
}

class Partner {
  final String id;
  final String name;
  final String nameBn;
  final String category;
  final String area;
  final String description;
  final String descriptionBn;
  final String? logoUrl;
  final int sinceYear;
  final int mealsContributed;
  final bool featured;

  const Partner({
    required this.id,
    required this.name,
    required this.nameBn,
    required this.category,
    required this.area,
    required this.description,
    required this.descriptionBn,
    this.logoUrl,
    required this.sinceYear,
    required this.mealsContributed,
    required this.featured,
  });

  factory Partner.fromJson(Map<String, dynamic> j) => Partner(
        id: (j['id'] ?? '').toString(),
        name: (j['name'] ?? '').toString(),
        nameBn: (j['nameBn'] ?? j['name'] ?? '').toString(),
        category: (j['category'] ?? 'restaurants_cafes').toString(),
        area: (j['area'] ?? 'Dhaka').toString(),
        description: (j['description'] ?? '').toString(),
        descriptionBn: (j['descriptionBn'] ?? j['description'] ?? '').toString(),
        logoUrl: j['logoUrl']?.toString(),
        sinceYear: (j['sinceYear'] as num?)?.toInt() ?? 2024,
        mealsContributed: (j['mealsContributed'] as num?)?.toInt() ?? 0,
        featured: j['featured'] == true,
      );
}

class Testimonial {
  final String id;
  final String quote;
  final String quoteBn;
  final String authorName;
  final String authorNameBn;
  final String roleLabel;
  final String roleLabelBn;
  final String orgName;
  final String? avatarUrl;

  const Testimonial({
    required this.id,
    required this.quote,
    required this.quoteBn,
    required this.authorName,
    required this.authorNameBn,
    required this.roleLabel,
    required this.roleLabelBn,
    required this.orgName,
    this.avatarUrl,
  });

  factory Testimonial.fromJson(Map<String, dynamic> j) => Testimonial(
        id: (j['id'] ?? '').toString(),
        quote: (j['quote'] ?? '').toString(),
        quoteBn: (j['quoteBn'] ?? j['quote'] ?? '').toString(),
        authorName: (j['authorName'] ?? '').toString(),
        authorNameBn: (j['authorNameBn'] ?? j['authorName'] ?? '').toString(),
        roleLabel: (j['roleLabel'] ?? '').toString(),
        roleLabelBn: (j['roleLabelBn'] ?? j['roleLabel'] ?? '').toString(),
        orgName: (j['orgName'] ?? '').toString(),
        avatarUrl: j['avatarUrl']?.toString(),
      );
}

class EventScheduleItem {
  final String time;
  final String activity;
  final String activityBn;
  const EventScheduleItem({
    required this.time,
    required this.activity,
    required this.activityBn,
  });

  factory EventScheduleItem.fromJson(Map<String, dynamic> j) => EventScheduleItem(
        time: (j['time'] ?? '').toString(),
        activity: (j['activity'] ?? '').toString(),
        activityBn: (j['activityBn'] ?? j['activity'] ?? '').toString(),
      );
}

class EventRegistration {
  final String id;
  final String eventId;
  final String userId;
  final String name;
  final String phone;
  final String availability;
  final String preferredRole;
  final String attendanceStatus;
  final bool reminderEnabled;

  const EventRegistration({
    required this.id,
    required this.eventId,
    required this.userId,
    required this.name,
    required this.phone,
    required this.availability,
    required this.preferredRole,
    required this.attendanceStatus,
    required this.reminderEnabled,
  });

  factory EventRegistration.fromJson(Map<String, dynamic> j) => EventRegistration(
        id: (j['id'] ?? '').toString(),
        eventId: (j['eventId'] ?? '').toString(),
        userId: (j['userId'] ?? '').toString(),
        name: (j['name'] ?? '').toString(),
        phone: (j['phone'] ?? '').toString(),
        availability: (j['availability'] ?? '').toString(),
        preferredRole: (j['preferredRole'] ?? 'distribution').toString(),
        attendanceStatus: (j['attendanceStatus'] ?? 'registered').toString(),
        reminderEnabled: j['reminderEnabled'] == true,
      );
}

class CommunityEvent {
  final String id;
  final String title;
  final String titleBn;
  final String description;
  final String descriptionBn;
  final String organizer;
  final String organizerBn;
  final String area;
  final String locationName;
  final String? locationNameBn;
  final double lat;
  final double lng;
  final String eventDate;
  final String startTime;
  final String endTime;
  final List<EventScheduleItem> schedule;
  final int expectedMeals;
  final int? actualMealsServed;
  final int? peopleHelped;
  final int volunteersNeeded;
  final int registeredCount;
  final EventRegistration? myRegistration;
  final String bannerUrl;
  final String howToHelp;
  final String howToHelpBn;
  final EventStatus status;

  const CommunityEvent({
    required this.id,
    required this.title,
    required this.titleBn,
    required this.description,
    required this.descriptionBn,
    required this.organizer,
    required this.organizerBn,
    required this.area,
    required this.locationName,
    this.locationNameBn,
    required this.lat,
    required this.lng,
    required this.eventDate,
    required this.startTime,
    required this.endTime,
    required this.schedule,
    required this.expectedMeals,
    this.actualMealsServed,
    this.peopleHelped,
    required this.volunteersNeeded,
    required this.registeredCount,
    this.myRegistration,
    required this.bannerUrl,
    required this.howToHelp,
    required this.howToHelpBn,
    required this.status,
  });

  factory CommunityEvent.fromJson(Map<String, dynamic> j) {
    final stRaw = j['status']?.toString();
    final st = stRaw == 'ongoing'
        ? EventStatus.ongoing
        : stRaw == 'past'
            ? EventStatus.past
            : stRaw == 'cancelled'
                ? EventStatus.cancelled
                : EventStatus.upcoming;
    return CommunityEvent(
      id: (j['id'] ?? '').toString(),
      title: (j['title'] ?? '').toString(),
      titleBn: (j['titleBn'] ?? j['title'] ?? '').toString(),
      description: (j['description'] ?? '').toString(),
      descriptionBn: (j['descriptionBn'] ?? j['description'] ?? '').toString(),
      organizer: (j['organizer'] ?? '').toString(),
      organizerBn: (j['organizerBn'] ?? j['organizer'] ?? '').toString(),
      area: (j['area'] ?? 'Dhaka').toString(),
      locationName: (j['locationName'] ?? '').toString(),
      locationNameBn: j['locationNameBn']?.toString(),
      lat: (j['lat'] as num?)?.toDouble() ?? 23.7465,
      lng: (j['lng'] as num?)?.toDouble() ?? 90.376,
      eventDate: (j['eventDate'] ?? '').toString(),
      startTime: (j['startTime'] ?? '').toString(),
      endTime: (j['endTime'] ?? '').toString(),
      schedule: (j['schedule'] as List?)
              ?.map((s) => EventScheduleItem.fromJson(s as Map<String, dynamic>))
              .toList() ??
          [],
      expectedMeals: (j['expectedMeals'] as num?)?.toInt() ?? 100,
      actualMealsServed: (j['actualMealsServed'] as num?)?.toInt(),
      peopleHelped: (j['peopleHelped'] as num?)?.toInt(),
      volunteersNeeded: (j['volunteersNeeded'] as num?)?.toInt() ?? 10,
      registeredCount: (j['registeredCount'] as num?)?.toInt() ?? 0,
      myRegistration: j['myRegistration'] is Map<String, dynamic>
          ? EventRegistration.fromJson(j['myRegistration'] as Map<String, dynamic>)
          : null,
      bannerUrl: (j['bannerUrl'] ?? '/images/community-distribution-bd.jpg').toString(),
      howToHelp: (j['howToHelp'] ?? '').toString(),
      howToHelpBn: (j['howToHelpBn'] ?? j['howToHelp'] ?? '').toString(),
      status: st,
    );
  }
}

class WeddingPickupRequest {
  final String id;
  final String donorId;
  final String eventType;
  final String venueName;
  final String address;
  final String? addressBn;
  final double lat;
  final double lng;
  final String contactPerson;
  final String phone;
  final String eventDate;
  final String readyTime;
  final int approxServings;
  final List<String> foodTypes;
  final bool isHalal;
  final bool isVeg;
  final String storageMethod;
  final String? specialNotes;
  final bool isUrgent;
  final WeddingPickupStatus status;
  final String? volunteerId;
  final String? volunteerName;
  final String? ngoClaimerId;
  final String? ngoName;
  final String? conversationId;
  final int? deliveredMeals;
  final String? deliveryNote;
  final double? distanceKm;

  const WeddingPickupRequest({
    required this.id,
    required this.donorId,
    required this.eventType,
    required this.venueName,
    required this.address,
    this.addressBn,
    required this.lat,
    required this.lng,
    required this.contactPerson,
    required this.phone,
    required this.eventDate,
    required this.readyTime,
    required this.approxServings,
    required this.foodTypes,
    required this.isHalal,
    required this.isVeg,
    required this.storageMethod,
    this.specialNotes,
    required this.isUrgent,
    required this.status,
    this.volunteerId,
    this.volunteerName,
    this.ngoClaimerId,
    this.ngoName,
    this.conversationId,
    this.deliveredMeals,
    this.deliveryNote,
    this.distanceKm,
  });

  factory WeddingPickupRequest.fromJson(Map<String, dynamic> j) =>
      WeddingPickupRequest(
        id: (j['id'] ?? '').toString(),
        donorId: (j['donorId'] ?? '').toString(),
        eventType: (j['eventType'] ?? 'Wedding').toString(),
        venueName: (j['venueName'] ?? '').toString(),
        address: (j['address'] ?? '').toString(),
        addressBn: j['addressBn']?.toString(),
        lat: (j['lat'] as num?)?.toDouble() ?? 23.7465,
        lng: (j['lng'] as num?)?.toDouble() ?? 90.376,
        contactPerson: (j['contactPerson'] ?? '').toString(),
        phone: (j['phone'] ?? '').toString(),
        eventDate: (j['eventDate'] ?? '').toString(),
        readyTime: (j['readyTime'] ?? '').toString(),
        approxServings: (j['approxServings'] as num?)?.toInt() ?? 50,
        foodTypes: (j['foodTypes'] as List?)?.map((e) => e.toString()).toList() ?? [],
        isHalal: j['isHalal'] != false,
        isVeg: j['isVeg'] == true,
        storageMethod: (j['storageMethod'] ?? 'Covered containers').toString(),
        specialNotes: j['specialNotes']?.toString(),
        isUrgent: j['isUrgent'] == true,
        status: weddingStatusFromWire(j['status']?.toString()),
        volunteerId: j['volunteerId']?.toString(),
        volunteerName: j['volunteerName']?.toString(),
        ngoClaimerId: j['ngoClaimerId']?.toString(),
        ngoName: j['ngoName']?.toString(),
        conversationId: j['conversationId']?.toString(),
        deliveredMeals: (j['deliveredMeals'] as num?)?.toInt(),
        deliveryNote: j['deliveryNote']?.toString(),
        distanceKm: (j['distanceKm'] as num?)?.toDouble(),
      );
}

class DonationRecord {
  final String id;
  final String donorDisplayName;
  final int amountBdt;
  final DonationFrequency frequency;
  final DonationCause cause;
  final PaymentMethodId paymentMethod;
  final bool isAnonymous;
  final String? honorOf;
  final String receiptCode;
  final String status;
  final String createdAt;

  const DonationRecord({
    required this.id,
    required this.donorDisplayName,
    required this.amountBdt,
    required this.frequency,
    required this.cause,
    required this.paymentMethod,
    required this.isAnonymous,
    this.honorOf,
    required this.receiptCode,
    required this.status,
    required this.createdAt,
  });

  factory DonationRecord.fromJson(Map<String, dynamic> j) => DonationRecord(
        id: (j['id'] ?? '').toString(),
        donorDisplayName: (j['donorDisplayName'] ?? 'Supporter').toString(),
        amountBdt: (j['amountBdt'] as num?)?.toInt() ?? 0,
        frequency: j['frequency'] == 'monthly'
            ? DonationFrequency.monthly
            : DonationFrequency.oneTime,
        cause: donationCauseFromWire(j['cause']?.toString()),
        paymentMethod: paymentMethodFromWire(j['paymentMethod']?.toString()),
        isAnonymous: j['isAnonymous'] == true,
        honorOf: j['honorOf']?.toString(),
        receiptCode: (j['receiptCode'] ?? '').toString(),
        status: (j['status'] ?? 'completed').toString(),
        createdAt: (j['createdAt'] ?? DateTime.now().toIso8601String()).toString(),
      );
}

class DonationSummary {
  final int goalBdt;
  final int raisedBdt;
  final int totalDonationsCount;
  final int monthlySupportersCount;
  final List<Map<String, dynamic>> breakdown;
  final List<DonationRecord> recentDonors;

  const DonationSummary({
    required this.goalBdt,
    required this.raisedBdt,
    required this.totalDonationsCount,
    required this.monthlySupportersCount,
    required this.breakdown,
    required this.recentDonors,
  });

  factory DonationSummary.fromJson(Map<String, dynamic> j) => DonationSummary(
        goalBdt: (j['goalBdt'] as num?)?.toInt() ?? 250000,
        raisedBdt: (j['raisedBdt'] as num?)?.toInt() ?? 0,
        totalDonationsCount: (j['totalDonationsCount'] as num?)?.toInt() ?? 0,
        monthlySupportersCount: (j['monthlySupportersCount'] as num?)?.toInt() ?? 0,
        breakdown: (j['breakdown'] as List?)?.cast<Map<String, dynamic>>() ?? [],
        recentDonors: (j['recentDonors'] as List?)
                ?.map((d) => DonationRecord.fromJson(d as Map<String, dynamic>))
                .toList() ??
            [],
      );
}

class HomeSummary {
  final int mealsShared;
  final int kgSaved;
  final int activeDonors;
  final int peopleHelped;
  final int portionsAvailableNow;
  final List<Map<String, dynamic>> featuredDonors;
  final List<Map<String, dynamic>> recentActivity;
  final List<CommunityEvent> upcomingEvents;
  final List<Testimonial> testimonials;
  final int goalBdt;
  final int raisedBdt;
  final int donorCount;

  const HomeSummary({
    required this.mealsShared,
    required this.kgSaved,
    required this.activeDonors,
    required this.peopleHelped,
    required this.portionsAvailableNow,
    required this.featuredDonors,
    required this.recentActivity,
    required this.upcomingEvents,
    required this.testimonials,
    required this.goalBdt,
    required this.raisedBdt,
    required this.donorCount,
  });

  factory HomeSummary.fromJson(Map<String, dynamic> j) {
    final impact = (j['impact'] as Map<String, dynamic>?) ?? {};
    final camp = (j['campaignProgress'] as Map<String, dynamic>?) ?? {};
    return HomeSummary(
      mealsShared: (impact['mealsShared'] as num?)?.toInt() ?? 0,
      kgSaved: (impact['kgSaved'] as num?)?.toInt() ?? 0,
      activeDonors: (impact['activeDonors'] as num?)?.toInt() ?? 0,
      peopleHelped: (impact['peopleHelped'] as num?)?.toInt() ?? 0,
      portionsAvailableNow: (impact['portionsAvailableNow'] as num?)?.toInt() ?? 0,
      featuredDonors:
          (j['featuredDonors'] as List?)?.cast<Map<String, dynamic>>() ?? [],
      recentActivity:
          (j['recentActivity'] as List?)?.cast<Map<String, dynamic>>() ?? [],
      upcomingEvents: (j['upcomingEvents'] as List?)
              ?.map((e) => CommunityEvent.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      testimonials: (j['testimonials'] as List?)
              ?.map((t) => Testimonial.fromJson(t as Map<String, dynamic>))
              .toList() ??
          [],
      goalBdt: (camp['goalBdt'] as num?)?.toInt() ?? 250000,
      raisedBdt: (camp['raisedBdt'] as num?)?.toInt() ?? 0,
      donorCount: (camp['donorCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class ImpactDashboardData {
  final int mealsShared;
  final int kgSaved;
  final int co2AvoidedKg;
  final int activeDonors;
  final int peopleHelped;
  final int raisedBdt;
  final int donationCount;
  final int mealsFunded;
  final int qrHandovers;
  final int flashListingsNow;
  final int ramadanDonationsBdt;
  final Map<String, dynamic>? personal;

  const ImpactDashboardData({
    required this.mealsShared,
    required this.kgSaved,
    required this.co2AvoidedKg,
    required this.activeDonors,
    required this.peopleHelped,
    required this.raisedBdt,
    required this.donationCount,
    required this.mealsFunded,
    required this.qrHandovers,
    required this.flashListingsNow,
    required this.ramadanDonationsBdt,
    this.personal,
  });

  factory ImpactDashboardData.fromJson(Map<String, dynamic> j) =>
      ImpactDashboardData(
        mealsShared: (j['mealsShared'] as num?)?.toInt() ?? 0,
        kgSaved: (j['kgSaved'] as num?)?.toInt() ?? 0,
        co2AvoidedKg: (j['co2AvoidedKg'] as num?)?.toInt() ?? 0,
        activeDonors: (j['activeDonors'] as num?)?.toInt() ?? 0,
        peopleHelped: (j['peopleHelped'] as num?)?.toInt() ?? 0,
        raisedBdt: (j['raisedBdt'] as num?)?.toInt() ?? 0,
        donationCount: (j['donationCount'] as num?)?.toInt() ?? 0,
        mealsFunded: (j['mealsFunded'] as num?)?.toInt() ?? 0,
        qrHandovers: (j['qrHandovers'] as num?)?.toInt() ?? 0,
        flashListingsNow: (j['flashListingsNow'] as num?)?.toInt() ?? 0,
        ramadanDonationsBdt: (j['ramadanDonationsBdt'] as num?)?.toInt() ?? 0,
        personal: j['personal'] as Map<String, dynamic>?,
      );
}

class VolunteerShift {
  final String id;
  final String title;
  final String titleBn;
  final String area;
  final String locationName;
  final String role;
  final String shiftDate;
  final String startTime;
  final String endTime;
  final int slotsTotal;
  final int slotsFilled;
  final Map<String, dynamic>? mySignup;

  const VolunteerShift({
    required this.id,
    required this.title,
    required this.titleBn,
    required this.area,
    required this.locationName,
    required this.role,
    required this.shiftDate,
    required this.startTime,
    required this.endTime,
    required this.slotsTotal,
    required this.slotsFilled,
    this.mySignup,
  });

  factory VolunteerShift.fromJson(Map<String, dynamic> j) => VolunteerShift(
        id: (j['id'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        titleBn: (j['titleBn'] ?? j['title'] ?? '').toString(),
        area: (j['area'] ?? 'Dhaka').toString(),
        locationName: (j['locationName'] ?? '').toString(),
        role: (j['role'] ?? 'distribution').toString(),
        shiftDate: (j['shiftDate'] ?? '').toString(),
        startTime: (j['startTime'] ?? '').toString(),
        endTime: (j['endTime'] ?? '').toString(),
        slotsTotal: (j['slotsTotal'] as num?)?.toInt() ?? 6,
        slotsFilled: (j['slotsFilled'] as num?)?.toInt() ?? 0,
        mySignup: j['mySignup'] as Map<String, dynamic>?,
      );
}

class LeaderboardData {
  final List<Map<String, dynamic>> topDonors;
  final List<Map<String, dynamic>> topVolunteers;
  final List<Map<String, dynamic>> topAreas;
  final List<Map<String, dynamic>> myBadges;
  final Map<String, dynamic> myStats;

  const LeaderboardData({
    required this.topDonors,
    required this.topVolunteers,
    required this.topAreas,
    required this.myBadges,
    required this.myStats,
  });

  factory LeaderboardData.fromJson(Map<String, dynamic> j) => LeaderboardData(
        topDonors: (j['topDonors'] as List?)?.cast<Map<String, dynamic>>() ?? [],
        topVolunteers:
            (j['topVolunteers'] as List?)?.cast<Map<String, dynamic>>() ?? [],
        topAreas: (j['topAreas'] as List?)?.cast<Map<String, dynamic>>() ?? [],
        myBadges: (j['myBadges'] as List?)?.cast<Map<String, dynamic>>() ?? [],
        myStats: (j['myStats'] as Map<String, dynamic>?) ?? {},
      );
}

class PlatformUserSummary {
  final String id;
  final String name;
  final String? handle;
  final UserRole role;
  final String area;
  final String? businessName;
  final String? logoUrl;
  final bool verified;
  final bool isOnline;

  const PlatformUserSummary({
    required this.id,
    required this.name,
    this.handle,
    required this.role,
    required this.area,
    this.businessName,
    this.logoUrl,
    this.verified = false,
    this.isOnline = false,
  });

  factory PlatformUserSummary.fromJson(Map<String, dynamic> j) =>
      PlatformUserSummary(
        id: (j['id'] ?? '').toString(),
        name: (j['name'] ?? 'Member').toString(),
        handle: j['handle']?.toString(),
        role: j['role'] == 'donor'
            ? UserRole.donor
            : j['role'] == 'admin'
                ? UserRole.admin
                : UserRole.recipient,
        area: (j['area'] ?? 'Dhaka').toString(),
        businessName: j['businessName']?.toString(),
        logoUrl: j['logoUrl']?.toString(),
        verified: j['verified'] == true,
        isOnline: j['isOnline'] == true || j['wsOnline'] == true,
      );
}

class RestaurantOwnerApplication {
  final String uid;
  final String name;
  final String email;
  final String area;
  final bool verified;
  final String createdAt;
  final RestaurantInfo restaurant;

  const RestaurantOwnerApplication({
    required this.uid,
    required this.name,
    required this.email,
    required this.area,
    required this.verified,
    required this.createdAt,
    required this.restaurant,
  });
}

class AdminNotificationItem {
  final String id;
  final String type;
  final String ownerUid;
  final String restaurantName;
  final String ownerName;
  final String? conversationId;
  final String? messagePreview;
  final bool read;
  final String createdAt;

  const AdminNotificationItem({
    required this.id,
    required this.type,
    required this.ownerUid,
    required this.restaurantName,
    required this.ownerName,
    this.conversationId,
    this.messagePreview,
    required this.read,
    required this.createdAt,
  });
}

class UserDirectoryEntry {
  final String uid;
  final String displayName;
  final String handle;
  final String? photoURL;
  final String role; // 'user' | 'restaurantOwner' | 'donor' | 'recipient' | 'admin' | 'volunteer' | 'ngo' | 'organizer'
  final String? restaurantName;
  final String? restaurantType;
  final String area;
  final bool verified;
  final bool discoverable;
  final bool online;
  final String lastSeen;
  final bool isDemo;
  final String? bio;
  final String? bioBn;
  final String? openingHours;
  final double? rating;
  final int? reviewCount;

  const UserDirectoryEntry({
    required this.uid,
    required this.displayName,
    required this.handle,
    this.photoURL,
    required this.role,
    this.restaurantName,
    this.restaurantType,
    required this.area,
    required this.verified,
    required this.discoverable,
    required this.online,
    required this.lastSeen,
    this.isDemo = false,
    this.bio,
    this.bioBn,
    this.openingHours,
    this.rating,
    this.reviewCount,
  });

  String get effectiveTitle =>
      (restaurantName != null && restaurantName!.trim().isNotEmpty)
          ? restaurantName!
          : displayName;
}

class BlockedUserEntry {
  final String uid;
  final String name;
  final String? handle;

  const BlockedUserEntry({
    required this.uid,
    required this.name,
    this.handle,
  });
}

class AdminConversation {
  final String id;
  final String ownerUid;
  final String ownerName;
  final String restaurantName;
  final String? restaurantLogoUrl;
  final RestaurantVerificationStatus verificationStatus;
  final String lastMessage;
  final String lastMessageType; // 'text' | 'image' | 'file' | 'system'
  final String lastSenderRole; // 'owner' | 'admin' | 'system'
  final String lastMessageAt;
  final int ownerUnreadCount;
  final int adminUnreadCount;
  final bool ownerTyping;
  final bool adminTyping;
  final String createdAt;
  final String updatedAt;

  const AdminConversation({
    required this.id,
    required this.ownerUid,
    required this.ownerName,
    required this.restaurantName,
    this.restaurantLogoUrl,
    required this.verificationStatus,
    required this.lastMessage,
    required this.lastMessageType,
    required this.lastSenderRole,
    required this.lastMessageAt,
    required this.ownerUnreadCount,
    required this.adminUnreadCount,
    required this.ownerTyping,
    required this.adminTyping,
    required this.createdAt,
    required this.updatedAt,
  });
}

class AdminChatMessage {
  final String id;
  final String conversationId;
  final String ownerUid;
  final String senderId;
  final String senderRole; // 'owner' | 'admin' | 'system'
  final String senderName;
  final String text;
  final String messageType; // 'text' | 'image' | 'file' | 'system'
  final String? mediaUrl;
  final String? fileName;
  final int? fileSize;
  final String? fileMime;
  final String status; // 'sent' | 'read'
  final String? readAt;
  final String createdAt;

  const AdminChatMessage({
    required this.id,
    required this.conversationId,
    required this.ownerUid,
    required this.senderId,
    required this.senderRole,
    required this.senderName,
    required this.text,
    required this.messageType,
    this.mediaUrl,
    this.fileName,
    this.fileSize,
    this.fileMime,
    required this.status,
    this.readAt,
    required this.createdAt,
  });
}

class CommunityRoom {
  final String id;
  final String slug;
  final String name;
  final String nameBn;
  final String description;
  final String descriptionBn;
  final String iconKey; // 'community' | 'restaurant' | 'volunteer'
  final int pinnedOrder;
  final int memberCount;
  final int onlineCount;
  final String lastMessage;
  final String lastMessageSenderName;
  final String lastMessageAt;
  final List<String> mutedUids;
  final bool isDemoSeeded;
  final String createdAt;
  final String updatedAt;

  const CommunityRoom({
    required this.id,
    required this.slug,
    required this.name,
    required this.nameBn,
    required this.description,
    required this.descriptionBn,
    required this.iconKey,
    required this.pinnedOrder,
    required this.memberCount,
    required this.onlineCount,
    required this.lastMessage,
    required this.lastMessageSenderName,
    required this.lastMessageAt,
    this.mutedUids = const [],
    this.isDemoSeeded = false,
    required this.createdAt,
    required this.updatedAt,
  });
}

class RoomMessage {
  final String id;
  final String roomId;
  final String senderId;
  final String senderName;
  final String? senderHandle;
  final String? senderAvatar;
  final String senderRole;
  final String? senderArea;
  final bool senderVerified;
  final bool senderIsDemo;
  final String text;
  final String messageType; // 'text' | 'image'
  final String? mediaUrl;
  final String? replyToId;
  final String? replyToText;
  final String? replyToSenderName;
  final Map<String, List<String>> reactions;
  final List<String> reportedBy;
  final bool deleted;
  final bool isDemo;
  final String createdAt;

  const RoomMessage({
    required this.id,
    required this.roomId,
    required this.senderId,
    required this.senderName,
    this.senderHandle,
    this.senderAvatar,
    required this.senderRole,
    this.senderArea,
    this.senderVerified = false,
    this.senderIsDemo = false,
    required this.text,
    this.messageType = 'text',
    this.mediaUrl,
    this.replyToId,
    this.replyToText,
    this.replyToSenderName,
    this.reactions = const {},
    this.reportedBy = const [],
    this.deleted = false,
    this.isDemo = false,
    required this.createdAt,
  });
}

class RoomMember {
  final String uid;
  final String displayName;
  final String? handle;
  final String? photoURL;
  final String role;
  final String? area;
  final bool online;
  final bool isDemo;
  final String? lastMessageAt;
  final String updatedAt;

  const RoomMember({
    required this.uid,
    required this.displayName,
    this.handle,
    this.photoURL,
    required this.role,
    this.area,
    this.online = false,
    this.isDemo = false,
    this.lastMessageAt,
    required this.updatedAt,
  });
}


