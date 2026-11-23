import '../models/models.dart';

class DemoPersonaSpec {
  final String id;
  final String displayName;
  final String displayNameBn;
  final String handle;
  final String role;
  final String? avatar;
  final String? restaurantName;
  final String? restaurantType;
  final String area;
  final bool verified;
  final String bio;
  final String bioBn;
  final String? openingHours;
  final double? rating;
  final int? reviewCount;
  final bool online;
  final bool isOfficial;
  final String categoryKey;

  const DemoPersonaSpec({
    required this.id,
    required this.displayName,
    required this.displayNameBn,
    required this.handle,
    required this.role,
    this.avatar,
    this.restaurantName,
    this.restaurantType,
    required this.area,
    required this.verified,
    required this.bio,
    required this.bioBn,
    this.openingHours,
    this.rating,
    this.reviewCount,
    required this.online,
    this.isOfficial = false,
    required this.categoryKey,
  });
}

class CommunityRoomSeedMessage {
  final String idSuffix;
  final String personaId;
  final String text;
  final int offsetMinutesAgo;
  final String? replyToSuffix;
  final Map<String, List<String>>? reactions;

  const CommunityRoomSeedMessage({
    required this.idSuffix,
    required this.personaId,
    required this.text,
    required this.offsetMinutesAgo,
    this.replyToSuffix,
    this.reactions,
  });
}

class CommunityRoomSpec {
  final String id;
  final String slug;
  final String name;
  final String nameBn;
  final String description;
  final String descriptionBn;
  final String iconKey; // 'community' | 'restaurant' | 'volunteer'
  final int pinnedOrder;
  final int baseMemberCount;
  final int baseOnlineCount;
  final List<CommunityRoomSeedMessage> messages;

  const CommunityRoomSpec({
    required this.id,
    required this.slug,
    required this.name,
    required this.nameBn,
    required this.description,
    required this.descriptionBn,
    required this.iconKey,
    required this.pinnedOrder,
    required this.baseMemberCount,
    required this.baseOnlineCount,
    required this.messages,
  });
}

const DemoPersonaSpec rizikTeamPersona = DemoPersonaSpec(
  id: 'demo_team',
  displayName: 'Rizik Team',
  displayNameBn: 'Rizik টিম',
  handle: '@rizik_team',
  role: 'admin',
  avatar: null,
  restaurantName: null,
  restaurantType: null,
  area: 'Dhaka',
  verified: true,
  bio:
      'Official Rizik community support desk. Reach out for food safety tips, verification questions, or volunteer onboarding.',
  bioBn:
      'অফিশিয়াল রিজিক কমিউনিটি সহায়তা ডেস্ক। খাদ্য নিরাপত্তা, যাচাই বা স্বেচ্ছাসেবক সংক্রান্ত যেকোনো প্রশ্নে বার্তা দিন।',
  openingHours: '24/7 Community Desk',
  rating: null,
  reviewCount: null,
  online: true,
  isOfficial: true,
  categoryKey: 'team',
);

const List<DemoPersonaSpec> demoPersonas = [
  DemoPersonaSpec(
    id: 'demo_persona_kacchi_sultan',
    displayName: 'Puran Dhaka Kacchi Ghar',
    displayNameBn: 'পুরান ঢাকা কাচ্চি ঘর',
    handle: '@kacchi_ghar_demo',
    role: 'restaurantOwner',
    avatar: '/images/kacchi-biryani.jpg',
    restaurantName: 'Puran Dhaka Kacchi Ghar',
    restaurantType: 'restaurant',
    area: 'Old Dhaka',
    verified: true,
    bio:
        'Traditional wood-fired kacchi biryani & borhani kitchen in Chawkbazar. Evening surplus packs prepared cleanly at 9:45 PM.',
    bioBn:
        'চকবাজারের ঐতিহ্যবাহী কাচ্চি বিরিয়ানি ও বোরহানি রান্নাঘর। প্রতিদিন রাত ৯:৪৫টায় অতিরিক্ত তাজা প্যাক বিতরণ করা হয়।',
    openingHours: '11:30 AM - 11:00 PM',
    rating: 4.9,
    reviewCount: 84,
    online: true,
    categoryKey: 'biryani',
  ),
  DemoPersonaSpec(
    id: 'demo_persona_mishti_mouchak',
    displayName: 'Banglar Mishti Bitan',
    displayNameBn: 'বাংলার মিষ্টি বিতান',
    handle: '@mishti_bitan_demo',
    role: 'restaurantOwner',
    avatar: '/images/mishti-sweets.jpg',
    restaurantName: 'Banglar Mishti Bitan',
    restaurantType: 'sweet_shop',
    area: 'Dhanmondi',
    verified: true,
    bio:
        'Freshly made roshogolla, mishti doi, nimki & singara in Dhanmondi 27. Daily leftover boxes sealed for nearby shelters.',
    bioBn:
        'ধানমন্ডি ২৭-এর তাজা রসগোল্লা, মিষ্টি দই ও নিমকির দোকান। প্রতিদিন রাতে আশ্রয়কেন্দ্রের জন্য সিল করা বক্স রাখা হয়।',
    openingHours: '8:30 AM - 10:30 PM',
    rating: 4.8,
    reviewCount: 62,
    online: true,
    categoryKey: 'mishti',
  ),
  DemoPersonaSpec(
    id: 'demo_persona_bakery_gulshan',
    displayName: 'Sonali Oven Bakery',
    displayNameBn: 'সোনালী ওভেন বেকারি',
    handle: '@sonali_oven_demo',
    role: 'restaurantOwner',
    avatar: '/images/dhaka-bakery-bread.jpg',
    restaurantName: 'Sonali Oven Bakery',
    restaurantType: 'bakery',
    area: 'Banani',
    verified: true,
    bio:
        'Neighborhood bakery crafting whole-wheat loaves, milk buns, and savory patties. Same-day unsold breads shared at 9:15 PM.',
    bioBn:
        'বনানীর পাউরুটি, বন ও পেস্ট্রির বেকারি। প্রতিদিনের অবিক্রীত তাজা রুটি রাত ৯:১৫টায় কমিউনিটিতে দেওয়া হয়।',
    openingHours: '7:30 AM - 10:00 PM',
    rating: 4.7,
    reviewCount: 49,
    online: true,
    categoryKey: 'bakery',
  ),
  DemoPersonaSpec(
    id: 'demo_persona_kabab_mirpur',
    displayName: 'Shaheed Kabab & Paratha',
    displayNameBn: 'শহীদ কাবাব অ্যান্ড পরোটা',
    handle: '@shaheed_kabab_demo',
    role: 'restaurantOwner',
    avatar: '/images/seekh-kabab.jpg',
    restaurantName: 'Shaheed Kabab & Paratha',
    restaurantType: 'restaurant',
    area: 'Mirpur',
    verified: true,
    bio:
        'Charcoal seekh kabab, beef boti & flaky Mughlai paratha corner in Mirpur-10. Extra skewers packed warm after 10:15 PM.',
    bioBn:
        'মিরপুর-১০ এর শিক কাবাব ও পরোটার দোকান। রাত ১০:১৫টার পর অতিরিক্ত গরম খাবার বক্সে প্যাক করে দেওয়া হয়।',
    openingHours: '4:00 PM - 11:30 PM',
    rating: 4.6,
    reviewCount: 41,
    online: false,
    categoryKey: 'kabab',
  ),
  DemoPersonaSpec(
    id: 'demo_persona_cha_mohammadpur',
    displayName: "Mama'r Cha & Tiffin Stall",
    displayNameBn: 'মামার চা ও টিফিন স্টল',
    handle: '@mamar_cha_demo',
    role: 'restaurantOwner',
    avatar: '/images/cha-tea-stall.jpg',
    restaurantName: "Mama'r Cha & Tiffin Stall",
    restaurantType: 'cafe',
    area: 'Mohammadpur',
    verified: false,
    bio:
        'Busy neighborhood tea, bun-maska & vegetable khichuri stall near Town Hall. Extra morning & evening tiffin portions shared.',
    bioBn:
        'মোহাম্মদপুর টাউন হলের পাশে চা, বন-মাখন ও খিচুড়ির দোকান। সকাল ও সন্ধ্যার অতিরিক্ত টিফিন প্রতিবেশীদের সাথে ভাগ করা হয়।',
    openingHours: '6:30 AM - 10:00 PM',
    rating: 4.5,
    reviewCount: 23,
    online: true,
    categoryKey: 'tea',
  ),
  DemoPersonaSpec(
    id: 'demo_persona_catering_uttara',
    displayName: 'Dawat Wedding Caterers',
    displayNameBn: 'দাওয়াত ওয়েডিং ক্যাটারার্স',
    handle: '@dawat_catering_demo',
    role: 'restaurantOwner',
    avatar: '/images/wedding-buffet-bd.jpg',
    restaurantName: 'Dawat Wedding Caterers',
    restaurantType: 'catering',
    area: 'Uttara',
    verified: true,
    bio:
        'Large banquet & wedding buffet kitchen serving Sector 7 & Airport Rd halls. Untouched hot trays coordinated via Flash Rescue.',
    bioBn:
        'উত্তরা সেক্টর ৭-এর বিয়ে ও অনুষ্ঠানের ক্যাটারিং কিচেন। অক্ষত গরম খাবারের ট্রে দ্রুত স্বেচ্ছাসেবকদের মাধ্যমে পৌঁছানো হয়।',
    openingHours: '10:00 AM - 11:30 PM',
    rating: 4.9,
    reviewCount: 53,
    online: false,
    categoryKey: 'catering',
  ),
  DemoPersonaSpec(
    id: 'demo_persona_hotel_gulshan',
    displayName: 'Padma Regency Hotel Kitchen',
    displayNameBn: 'পদ্মা রিজেন্সি হোটেল কিচেন',
    handle: '@padma_kitchen_demo',
    role: 'restaurantOwner',
    avatar: '/images/kitchen-packing-bd.jpg',
    restaurantName: 'Padma Regency Hotel Kitchen',
    restaurantType: 'hotel_kitchen',
    area: 'Gulshan',
    verified: true,
    bio:
        'HACCP-compliant hotel banquet & breakfast buffet kitchen. Sealed vegetarian & rice meal trays released nightly at 10:00 PM.',
    bioBn:
        'হাইজিন মেনে চলা হোটেল বাফেট রান্নাঘর। প্রতি রাতে ১০টায় সিল করা ভাত, সবজি ও কারির ট্রে আশ্রয়কেন্দ্রে দেওয়া হয়।',
    openingHours: '6:00 AM - 11:30 PM',
    rating: 4.8,
    reviewCount: 37,
    online: true,
    categoryKey: 'hotel',
  ),
  DemoPersonaSpec(
    id: 'demo_persona_vol_tanvir',
    displayName: 'Tanvir',
    displayNameBn: 'তানভীর',
    handle: '@tanvir_rider_demo',
    role: 'volunteer',
    avatar: '/images/portrait-man-2.jpg',
    area: 'Dhanmondi',
    verified: true,
    bio:
        'Cycle & motorbike food rescue volunteer around Dhanmondi, Kalabagan & New Market. Free evenings 8:30–11:00 PM.',
    bioBn:
        'ধানমন্ডি, কলাবাগান ও নিউমার্কেট এলাকায় রাত ৮:৩০–১১:০০টা পর্যন্ত খাবার উদ্ধারে স্বেচ্ছাসেবী রাইডার।',
    openingHours: 'Evenings 8:30 PM - 11:00 PM',
    online: true,
    categoryKey: 'volunteer',
  ),
  DemoPersonaSpec(
    id: 'demo_persona_vol_nusrat',
    displayName: 'Nusrat',
    displayNameBn: 'নুসরাত',
    handle: '@nusrat_vol_demo',
    role: 'volunteer',
    avatar: '/images/portrait-woman-1.jpg',
    area: 'Mirpur',
    verified: true,
    bio:
        'University student & Mirpur rescue lead. Helps inspect hygiene packaging and route evening packs to day-laborer families.',
    bioBn:
        'মিরপুর এলাকার স্বেচ্ছাসেবক সমন্বয়ক। খাবারের হাইজিন ও প্যাকিং যাচাই করে পরিবারগুলোর কাছে পৌঁছে দেন।',
    openingHours: 'Daily 5:00 PM - 10:30 PM',
    online: true,
    categoryKey: 'volunteer',
  ),
  DemoPersonaSpec(
    id: 'demo_persona_vol_sabbir',
    displayName: 'Sabbir',
    displayNameBn: 'সাব্বির',
    handle: '@sabbir_dispatch_demo',
    role: 'volunteer',
    avatar: '/images/portrait-man-3.jpg',
    area: 'Banani',
    verified: false,
    bio:
        'Weekend volunteer helping pick up Banani & Mohakhali bakery surplus on foot and Rickshaw van.',
    bioBn:
        'বনানী ও মহাখালী এলাকায় সপ্তাহান্তে বেকারি ও হোটেলের অতিরিক্ত খাবার সংগ্রহে সহায়তা করেন।',
    openingHours: 'Fri-Sat 6:00 PM - 10:30 PM',
    online: false,
    categoryKey: 'volunteer',
  ),
  DemoPersonaSpec(
    id: 'demo_persona_rec_farhana',
    displayName: 'Farhana',
    displayNameBn: 'ফারহানা',
    handle: '@farhana_dhaka_demo',
    role: 'recipient',
    avatar: '/images/portrait-woman-2.jpg',
    area: 'Mohammadpur',
    verified: false,
    bio:
        'Helps coordinate shared community meals for three neighboring single-parent households in Mohammadpur.',
    bioBn:
        'মোহাম্মদপুরে তিনটি প্রতিবেশী পরিবারের জন্য যৌথ খাবারের বক্স সংগ্রহ ও সমন্বয়ে সাহায্য করেন।',
    online: true,
    categoryKey: 'recipient',
  ),
  DemoPersonaSpec(
    id: 'demo_persona_rec_rafiq',
    displayName: 'Rafiq',
    displayNameBn: 'রফিক',
    handle: '@rafiq_bd_demo',
    role: 'recipient',
    avatar: null,
    area: 'Old Dhaka',
    verified: false,
    bio:
        'Night-shift worker in Old Dhaka who picks up single meal packs near Chawkbazar and checks Halal options.',
    bioBn:
        'পুরান ঢাকার চকবাজার এলাকায় নৈশ কর্মীদের জন্য একক খাবার প্যাক সংগ্রহ করেন।',
    online: false,
    categoryKey: 'recipient',
  ),
  DemoPersonaSpec(
    id: 'demo_persona_ngo_ashar_alo',
    displayName: "Ashar Alo Children's Home",
    displayNameBn: 'আশার আলো শিশু নিবাস',
    handle: '@ashar_alo_demo',
    role: 'ngo',
    avatar: '/images/community-distribution-bd.jpg',
    restaurantName: "Ashar Alo Children's Home",
    area: 'Uttara',
    verified: true,
    bio:
        'Residential shelter caring for 42 school-going children in Uttara Sector 11. Welcomes clean cooked rice, curry, fruit & bakery donations.',
    bioBn:
        'উত্তরা সেক্টর ১১-তে ৪২ জন শিশুর আবাসিক আশ্রয়কেন্দ্র। পরিষ্কার রান্না করা ভাত, তরকারি, ফল ও বেকারি খাবার সাদরে গ্রহণ করা হয়।',
    openingHours: '8:00 AM - 10:30 PM',
    online: true,
    categoryKey: 'ngo',
  ),
  DemoPersonaSpec(
    id: 'demo_persona_org_mahmud',
    displayName: 'Mahmud · Dhaka Food Drive',
    displayNameBn: 'মাহমুদ · ঢাকা ফুড ড্রাইভ',
    handle: '@mahmud_org_demo',
    role: 'organizer',
    avatar: '/images/wedding-celebration-bd.jpg',
    area: 'Gulshan',
    verified: true,
    bio:
        'Community organizer running Friday neighborhood khichuri drives & wedding buffet rescue teams across Gulshan, Banani, and Korail.',
    bioBn:
        'গুলশান, বনানী ও কড়াইল এলাকায় সাপ্তাহিক খিচুড়ি বিতরণ ও বিয়ের উদ্বৃত্ত খাবার উদ্ধার দলের সংগঠক।',
    openingHours: '9:00 AM - 11:00 PM',
    online: true,
    categoryKey: 'organizer',
  ),
];

final Map<String, DemoPersonaSpec> allDemoPersonasMap = {
  for (final p in [rizikTeamPersona, ...demoPersonas]) p.id: p,
};

UserDirectoryEntry personaToDirectoryEntry(DemoPersonaSpec p) {
  return UserDirectoryEntry(
    uid: p.id,
    displayName: p.displayName,
    handle: p.handle,
    photoURL: p.avatar,
    role: p.role,
    restaurantName: p.restaurantName,
    restaurantType: p.restaurantType,
    area: p.area,
    verified: p.verified,
    discoverable: true,
    online: p.online,
    lastSeen: DateTime.now().toIso8601String(),
    isDemo: true,
    bio: p.bio,
    bioBn: p.bioBn,
    openingHours: p.openingHours,
    rating: p.rating,
    reviewCount: p.reviewCount,
  );
}

const List<CommunityRoomSpec> communityRoomSpecs = [
  CommunityRoomSpec(
    id: 'room_rizik_community',
    slug: 'rizik-community',
    name: 'Rizik Community',
    nameBn: 'রিজিক কমিউনিটি',
    description: 'Dhaka-wide food sharing, Flash Rescue alerts & neighbor updates',
    descriptionBn: 'ঢাকা জুড়ে খাবার শেয়ারিং, ফ্ল্যাশ রেসকিউ ও প্রতিবেশীদের আপডেট',
    iconKey: 'community',
    pinnedOrder: 1,
    baseMemberCount: 148,
    baseOnlineCount: 19,
    messages: [
      CommunityRoomSeedMessage(
        idSuffix: '01',
        personaId: 'demo_persona_org_mahmud',
        text:
            'Assalamu Alaikum everyone! Welcome to Rizik Community — feel free to drop pickup alerts or coordinate evening meal rescues here.',
        offsetMinutesAgo: 3820,
        reactions: {
          '❤️': ['demo_persona_vol_tanvir', 'demo_persona_ngo_ashar_alo'],
          '🙏': ['demo_persona_rec_farhana'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '02',
        personaId: 'demo_persona_kacchi_sultan',
        text:
            'আজকে রাতে চকবাজারে আমাদের প্রায় ১৮ বক্স মুরগি ও খাসির কাচ্চি থাকতে পারে। রাত ৯:৪৫ এর দিকে Flash Rescue পোস্ট দেব।',
        offsetMinutesAgo: 3640,
        reactions: {
          '🔥': ['demo_persona_vol_tanvir', 'demo_persona_rec_rafiq'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '03',
        personaId: 'demo_persona_rec_rafiq',
        text:
            'আলহামদুলিল্লাহ, পুরান ঢাকা এলাকায় থাকলে আমি ২টি বক্স সংগ্রহ করতে পারব, সব খাবার সম্পূর্ণ হালাল তো?',
        offsetMinutesAgo: 3615,
        replyToSuffix: '02',
      ),
      CommunityRoomSeedMessage(
        idSuffix: '04',
        personaId: 'demo_persona_kacchi_sultan',
        text: 'জি ভাই, ১০০% হালাল এবং পরিষ্কার ফয়েল বক্সে প্যাক করা থাকবে।',
        offsetMinutesAgo: 3595,
        replyToSuffix: '03',
        reactions: {
          '👍': ['demo_persona_rec_rafiq'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '05',
        personaId: 'demo_persona_bakery_gulshan',
        text:
            'Good evening Dhaka! Sonali Oven in Banani has 14 loaves of fresh whole-wheat bread & soft buns ready by 9:15 PM.',
        offsetMinutesAgo: 2920,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '06',
        personaId: 'demo_persona_vol_sabbir',
        text:
            'বনানী রোড ১১ এর আশেপাশেই আছি! ৯:১৫ তে এসে রিকশা ভ্যানে তুলে নিতে পারব, আশ্রয়কেন্দ্রে পৌঁছে দেব।',
        offsetMinutesAgo: 2890,
        replyToSuffix: '05',
        reactions: {
          '🙏': ['demo_persona_bakery_gulshan', 'demo_persona_org_mahmud'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '07',
        personaId: 'demo_persona_ngo_ashar_alo',
        text:
            'Ashar Alo Children’s Home (Uttara Sec 11) would love bakery buns for tomorrow’s breakfast for 42 kids if any extra remains!',
        offsetMinutesAgo: 2850,
        reactions: {
          '❤️': [
            'demo_persona_bakery_gulshan',
            'demo_persona_vol_sabbir',
            'demo_persona_vol_nusrat',
          ],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '08',
        personaId: 'demo_persona_catering_uttara',
        text:
            'উত্তরা সেক্টর ৭-এ একটি বিয়ের অনুষ্ঠান থেকে আনটাচড পোলাও ও চিকেন রোস্টের ৩৫টি প্যাকেট আসছে রাত ১০:৩০টায়। কেউ কি সংগ্রহ করবেন?',
        offsetMinutesAgo: 2210,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '09',
        personaId: 'demo_persona_ngo_ashar_alo',
        text:
            'আমরা ৫ মিনিটের দূরত্বেই আছি! Dawat Catering-এর সাথে সরাসরি মেসেজে যোগাযোগ করছি। অনেক ধন্যবাদ!',
        offsetMinutesAgo: 2195,
        replyToSuffix: '08',
        reactions: {
          '🎉': ['demo_persona_catering_uttara', 'demo_persona_org_mahmud'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '10',
        personaId: 'demo_persona_mishti_mouchak',
        text:
            'Dhanmondi 27 update: Banglar Mishti Bitan just packed 10 sealed boxes of nimki & fresh shondesh boxes.',
        offsetMinutesAgo: 1740,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '11',
        personaId: 'demo_persona_vol_tanvir',
        text:
            'ধানমন্ডি ২৭ থেকে সাইকেলে পিকআপ নিয়ে কলাবাগান বস্তি এলাকায় দিয়ে আসতে পারব ১৫ মিনিটে।',
        offsetMinutesAgo: 1720,
        replyToSuffix: '10',
        reactions: {
          '🔥': ['demo_persona_mishti_mouchak'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '12',
        personaId: 'demo_persona_cha_mohammadpur',
        text:
            'টাউন হলের কাছে আমাদের আজকে ২০ কাপ দুধ চা ও সবজি খিচুড়ি বেঁচে গেছে — কেউ নিলে ফ্রি দিয়ে দিচ্ছি।',
        offsetMinutesAgo: 1440,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '13',
        personaId: 'demo_persona_rec_farhana',
        text:
            'আঙ্কেল আমি আর আমার দুই প্রতিবেশী মিলে ৬ বক্স খিচুড়ি নিতে আসছি ১০ মিনিটের মধ্যে! খুব উপকার হলো।',
        offsetMinutesAgo: 1425,
        replyToSuffix: '12',
        reactions: {
          '❤️': ['demo_persona_cha_mohammadpur', 'demo_persona_vol_nusrat'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '14',
        personaId: 'demo_persona_hotel_gulshan',
        text:
            'Reminder from Padma Regency Kitchen: Please bring your Rizik QR pickup code at the North Service Gate between 10:00 and 10:30 PM.',
        offsetMinutesAgo: 1080,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '15',
        personaId: 'demo_persona_vol_nusrat',
        text:
            'মিরপুর-১০ ও কাজীপাড়া এলাকায় আজ সন্ধ্যা ৭টার পর দুইজন স্বেচ্ছাসেবক আছি। কোনো রেস্তোরাঁয় অতিরিক্ত খাবার থাকলে পিং করবেন।',
        offsetMinutesAgo: 890,
        reactions: {
          '👍': ['demo_persona_kabab_mirpur', 'demo_persona_org_mahmud'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '16',
        personaId: 'demo_persona_kabab_mirpur',
        text:
            'নুসরাত আপু, আজকে রাত ১০:১৫ এর দিকে ১৫টি নান ও শিক কাবাব র‍্যাপ থাকতে পারে — আপনাকে আগে জানাব।',
        offsetMinutesAgo: 860,
        replyToSuffix: '15',
      ),
      CommunityRoomSeedMessage(
        idSuffix: '17',
        personaId: 'demo_persona_org_mahmud',
        text:
            'Quick food safety tip: Keep hot rice/curry above 60°C or pack in clean covered foil boxes before scheduling pickup. Thanks everyone!',
        offsetMinutesAgo: 540,
        reactions: {
          '👍': [
            'demo_persona_hotel_gulshan',
            'demo_persona_kacchi_sultan',
            'demo_persona_vol_tanvir',
          ],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '18',
        personaId: 'demo_persona_rec_farhana',
        text:
            'রিজিক অ্যাপের মাধ্যমে কাল বাচ্চাদের জন্য প্রথমবার তাজা রুটি আর জ্যাম পেলাম, সবগুলো প্যাক খুব পরিষ্কার ছিল।',
        offsetMinutesAgo: 375,
        reactions: {
          '❤️': ['demo_persona_bakery_gulshan', 'demo_persona_org_mahmud'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '19',
        personaId: 'demo_persona_hotel_gulshan',
        text:
            'Tonight we also have 12 sealed vegetarian pasta & grilled veggie trays at Gulshan-2! Zero cost, pickup before 10:45 PM.',
        offsetMinutesAgo: 210,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '20',
        personaId: 'demo_persona_vol_sabbir',
        text: 'গুলশান-২ থেকে সংগ্রহ করে কড়াইল কমিউনিটি ক্লিনিকের সামনে দিয়ে আসতে পারি।',
        offsetMinutesAgo: 190,
        replyToSuffix: '19',
      ),
      CommunityRoomSeedMessage(
        idSuffix: '21',
        personaId: 'demo_persona_mishti_mouchak',
        text:
            'আজ সন্ধ্যা ৭টায় ধানমন্ডিতে ৩ লিটার দই ও ২০ পিস সিঙ্গাড়া তৈরি আছে — কেউ কি কাছাকাছি আছেন?',
        offsetMinutesAgo: 95,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '22',
        personaId: 'demo_persona_vol_tanvir',
        text: 'জি, আমি ১০ মিনিটে চলে আসছি ধানমন্ডি ২৭ এর দোকানে!',
        offsetMinutesAgo: 82,
        replyToSuffix: '21',
        reactions: {
          '🙏': ['demo_persona_mishti_mouchak'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '23',
        personaId: 'demo_persona_ngo_ashar_alo',
        text:
            'শুভ সন্ধ্যা সবাইকে! আমাদের ৪২ জন শিশুর পক্ষ থেকে সব রেস্তোরাঁ ও স্বেচ্ছাসেবকদের আন্তরিক ধন্যবাদ।',
        offsetMinutesAgo: 35,
        reactions: {
          '❤️': [
            'demo_persona_kacchi_sultan',
            'demo_persona_catering_uttara',
            'demo_persona_bakery_gulshan',
          ],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '24',
        personaId: 'demo_persona_org_mahmud',
        text:
            'Let’s make tonight another zero-waste evening across Dhaka! Tap any name above to message directly or check Home for Flash Rescue batches.',
        offsetMinutesAgo: 12,
        reactions: {
          '🔥': ['demo_persona_vol_tanvir', 'demo_persona_vol_nusrat'],
        },
      ),
    ],
  ),
  CommunityRoomSpec(
    id: 'room_restaurant_corner',
    slug: 'restaurant-corner',
    name: 'Restaurant Corner',
    nameBn: 'রেস্তোরাঁ কর্নার',
    description: 'Kitchens, bakeries & caterers sharing packing tips and surplus timing',
    descriptionBn: 'রেস্তোরাঁ, বেকারি ও ক্যাটারিং কিচেনের প্যাকিং ও সময়সূচি আলোচনা',
    iconKey: 'restaurant',
    pinnedOrder: 2,
    baseMemberCount: 64,
    baseOnlineCount: 9,
    messages: [
      CommunityRoomSeedMessage(
        idSuffix: '01',
        personaId: 'demo_persona_hotel_gulshan',
        text:
            'Welcome kitchen partners! Use this room to swap food-grade packaging ideas, QR handover workflows, and end-of-day prep tips.',
        offsetMinutesAgo: 4100,
        reactions: {
          '👍': ['demo_persona_kacchi_sultan', 'demo_persona_bakery_gulshan'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '02',
        personaId: 'demo_persona_kacchi_sultan',
        text:
            'পুরান ঢাকায় আমরা এখন অ্যালুমিনিয়াম ফয়েল বক্স ব্যবহার করছি — এতে কাচ্চি ১ ঘণ্টা পর্যন্ত গরম থাকে আর ছড়ায় না।',
        offsetMinutesAgo: 3880,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '03',
        personaId: 'demo_persona_bakery_gulshan',
        text:
            'Great tip! For bakery items in humid Dhaka weather, zip-sealed paper bags keep buns soft without getting soggy.',
        offsetMinutesAgo: 3720,
        replyToSuffix: '02',
      ),
      CommunityRoomSeedMessage(
        idSuffix: '04',
        personaId: 'demo_persona_mishti_mouchak',
        text:
            'মিষ্টি ও রসমালাইয়ের জন্য প্লাস্টিকের এয়ারটাইট বাটি সবচেয়ে নিরাপদ, বিশেষ করে রিকশায় নেওয়ার সময়।',
        offsetMinutesAgo: 3250,
        reactions: {
          '❤️': ['demo_persona_catering_uttara'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '05',
        personaId: 'demo_persona_catering_uttara',
        text:
            'বিয়ে বা অনুষ্ঠানের বুফে থেকে খাবার দিলে সবসময় আগে "Untouched / গরম রাখা" চেকলিস্ট দেখে নিই। এতে অতিথি ও আশ্রয়কেন্দ্র দুই পক্ষই নিশ্চিন্ত থাকে।',
        offsetMinutesAgo: 2940,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '06',
        personaId: 'demo_persona_kabab_mirpur',
        text:
            'মিরপুর-১০ এ আমরা রাত ১০:১৫টার পর ফ্ল্যাশ রেসকিউ চালু করি — ৩০ মিনিটের মধ্যেই সব বক্স ক্লেইম হয়ে যায়!',
        offsetMinutesAgo: 2510,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '07',
        personaId: 'demo_persona_cha_mohammadpur',
        text:
            'ছোট দোকানের জন্য কি QR কোড স্ক্যান করা বাধ্যতামূলক, নাকি ৬ ডিজিটের কোড টাইপ করলেই হবে?',
        offsetMinutesAgo: 2150,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '08',
        personaId: 'demo_persona_hotel_gulshan',
        text:
            'দুভাবেই করা যায়! ক্যামেরা থাকলে QR স্ক্যান করবেন, নাহলে সংগ্রাহকের ৬-ডিজিট কোড Donor Hub-এ লিখে দিলেই হস্তান্তর সম্পন্ন হয়।',
        offsetMinutesAgo: 2110,
        replyToSuffix: '07',
        reactions: {
          '👍': ['demo_persona_cha_mohammadpur'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '09',
        personaId: 'demo_persona_bakery_gulshan',
        text:
            'Labeling allergen tags (Dairy / Gluten / Nuts) on our evening batch cuts down Inbox questions by half.',
        offsetMinutesAgo: 1840,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '10',
        personaId: 'demo_persona_catering_uttara',
        text:
            'এ সপ্তাহে উত্তরা ও এয়ারপোর্ট রোডে ৩টি বড় বিয়ে আছে — কোনো এনজিও যদি ৫০+ প্লেটের জন্য রেডি থাকতে চান জানাবেন।',
        offsetMinutesAgo: 1580,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '11',
        personaId: 'demo_persona_ngo_ashar_alo',
        text:
            'আশার আলো শিশু নিবাস থেকে আমরা যেকোনো দিন সন্ধ্যা ৭টা থেকে রাত ১০:৩০ পর্যন্ত ৫০ প্লেট পর্যন্ত গ্রহণ করতে পারব!',
        offsetMinutesAgo: 1520,
        replyToSuffix: '10',
        reactions: {
          '🙏': ['demo_persona_catering_uttara', 'demo_persona_org_mahmud'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '12',
        personaId: 'demo_persona_kacchi_sultan',
        text:
            'চকবাজারে ছুটির দিনগুলোতে (শুক্র-শনি) প্রায় ২৫-৩০ বক্স বাড়তি থাকে। স্বেচ্ছাসেবক দলকে আগে থেকেই জানাই।',
        offsetMinutesAgo: 1210,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '13',
        personaId: 'demo_persona_mishti_mouchak',
        text:
            'হাইজিন রেটিং ৪.৮+ ধরে রাখতে আমরা রান্না শেষ হওয়ার সময় ("Prepared At") সবসময় সঠিকভাবে দিই।',
        offsetMinutesAgo: 980,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '14',
        personaId: 'demo_persona_hotel_gulshan',
        text:
            'Yes! Clear consume-within windows (e.g. 4 hours for rice & meat, 12 hours for dry bread) really build community trust.',
        offsetMinutesAgo: 930,
        replyToSuffix: '13',
      ),
      CommunityRoomSeedMessage(
        idSuffix: '15',
        personaId: 'demo_persona_kabab_mirpur',
        text: 'কাবাবের সাথে দেওয়া সালাদ আর সস আলাদা ছোট প্যাকেটে দিলে খাবার অনেকক্ষণ ভালো থাকে।',
        offsetMinutesAgo: 720,
        reactions: {
          '🔥': ['demo_persona_kacchi_sultan'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '16',
        personaId: 'demo_persona_cha_mohammadpur',
        text: 'সকাল ১০টার পর বাড়তি পরোটা আর ডাল-ভাজি থাকলেও কি লিস্টিং করা যাবে?',
        offsetMinutesAgo: 540,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '17',
        personaId: 'demo_persona_org_mahmud',
        text:
            'অবশ্যই মামা! সকাল, দুপুর বা রাত — যেকোনো সময় তাজা অতিরিক্ত খাবার পোস্ট করতে পারবেন।',
        offsetMinutesAgo: 510,
        replyToSuffix: '16',
      ),
      CommunityRoomSeedMessage(
        idSuffix: '18',
        personaId: 'demo_persona_bakery_gulshan',
        text:
            'Anyone looking for eco-friendly kraft paper boxes at wholesale rates in Banani? Happy to share our supplier.',
        offsetMinutesAgo: 340,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '19',
        personaId: 'demo_persona_mishti_mouchak',
        text: 'আমাদের জন্য ইনবক্সে সাপ্লায়ারের তথ্যটা একটু পাঠাবেন প্লিজ, ধানমন্ডি শাখায় লাগবে।',
        offsetMinutesAgo: 315,
        replyToSuffix: '18',
      ),
      CommunityRoomSeedMessage(
        idSuffix: '20',
        personaId: 'demo_persona_catering_uttara',
        text:
            'আজকে রাতে আমাদের রান্নাঘরে পরিষ্কার-পরিচ্ছন্নতা ও তাপমাত্রা চেক শেষ — ২টি স্বেচ্ছাসেবক টিম যুক্ত হয়েছে।',
        offsetMinutesAgo: 185,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '21',
        personaId: 'demo_persona_kacchi_sultan',
        text: 'আজকে ৯:৪৫ এর ব্যাচে ১২টি চিকেন তেহারি ও ৮টি বোরহানি বোতল থাকছে।',
        offsetMinutesAgo: 90,
        reactions: {
          '👍': ['demo_persona_hotel_gulshan'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '22',
        personaId: 'demo_persona_hotel_gulshan',
        text:
            'Great collaboration this week everyone — zero untouched trays went to waste across our Banani-Gulshan kitchens!',
        offsetMinutesAgo: 25,
        reactions: {
          '🎉': [
            'demo_persona_bakery_gulshan',
            'demo_persona_mishti_mouchak',
            'demo_persona_kacchi_sultan',
          ],
        },
      ),
    ],
  ),
  CommunityRoomSpec(
    id: 'room_volunteers',
    slug: 'volunteers',
    name: 'Volunteers',
    nameBn: 'স্বেচ্ছাসেবক দল',
    description: 'Pickup coordination, rider routes, shifts & shelter drop-offs',
    descriptionBn: 'পিকআপ সমন্বয়, রাইডার রুট, শিফট ও আশ্রয়কেন্দ্রে পৌঁছে দেওয়া',
    iconKey: 'volunteer',
    pinnedOrder: 3,
    baseMemberCount: 92,
    baseOnlineCount: 14,
    messages: [
      CommunityRoomSeedMessage(
        idSuffix: '01',
        personaId: 'demo_persona_org_mahmud',
        text: 'স্বাগতম টিম! এখানে প্রতিদিনের বাইক, সাইকেল ও ভ্যান পিকআপ রুটগুলো সমন্বয় করা হবে।',
        offsetMinutesAgo: 3960,
        reactions: {
          '❤️': ['demo_persona_vol_tanvir', 'demo_persona_vol_nusrat'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '02',
        personaId: 'demo_persona_vol_tanvir',
        text:
            'আজ রাত ৯টা থেকে ১১টা ধানমন্ডি-নিউমার্কেট-আজিমপুর রুটে আমার সাইকেলে ইনসুলেটেড ব্যাগ নিয়ে রেডি আছি।',
        offsetMinutesAgo: 3500,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '03',
        personaId: 'demo_persona_vol_nusrat',
        text: 'আমি আর মিরপুর-১০ এর দুইজন ভলান্টিয়ার আজ মিরপুর থেকে কল্যাণপুর পয়েন্ট কভার করব।',
        offsetMinutesAgo: 3420,
        reactions: {
          '🔥': ['demo_persona_vol_tanvir'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '04',
        personaId: 'demo_persona_vol_sabbir',
        text:
            'বনানী-মহাখালী রেলগেট এলাকায় সন্ধ্যার বেকারি পিকআপের জন্য কেউ সাথে থাকলে দ্রুত হয়, আমার সাথে একটি বড় ক্রেট আছে।',
        offsetMinutesAgo: 2880,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '05',
        personaId: 'demo_persona_org_mahmud',
        text:
            'সাব্বির, গুলশান দিক থেকে আরেকজন রাইডার তোমার সাথে ৮:৪৫-এ যোগ দিচ্ছে। ইনবক্সে নম্বরটা দেখে নিও।',
        offsetMinutesAgo: 2840,
        replyToSuffix: '04',
      ),
      CommunityRoomSeedMessage(
        idSuffix: '06',
        personaId: 'demo_persona_ngo_ashar_alo',
        text:
            'উত্তরা সেক্টর ১১ গেটে রাত ১০:৩০ পর্যন্ত আমাদের কেয়ারটেকার অবস্থান করবেন। যেকোনো ড্রপ-অফে নক করলেই গেট খুলে দেবেন।',
        offsetMinutesAgo: 2450,
        reactions: {
          '👍': ['demo_persona_catering_uttara', 'demo_persona_org_mahmud'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '07',
        personaId: 'demo_persona_vol_tanvir',
        text:
            'পিকআপের সময় সবসময় ২টি জিনিস চেক করি: ১) খাবার গরম বা সিল করা আছে কিনা, ২) QR কোড কনফার্ম হলো কিনা।',
        offsetMinutesAgo: 2100,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '08',
        personaId: 'demo_persona_vol_nusrat',
        text: 'সহমত! QR কোড স্ক্যান করলে Donor Hub ও আমাদের Volunteer Hours স্বয়ংক্রিয়ভাবে আপডেট হয়ে যায়।',
        offsetMinutesAgo: 2070,
        replyToSuffix: '07',
      ),
      CommunityRoomSeedMessage(
        idSuffix: '09',
        personaId: 'demo_persona_catering_uttara',
        text: 'এয়ারপোর্ট রোডের একটি হল থেকে ২৫ প্লেট বিরিয়ানি নেওয়ার জন্য কে সবচেয়ে কাছে আছেন?',
        offsetMinutesAgo: 1750,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '10',
        personaId: 'demo_persona_org_mahmud',
        text:
            'আমাদের উত্তরা ভ্যান ১০ মিনিটেই পৌঁছে যাচ্ছে! Ashar Alo Children’s Home-এ নামিয়ে দেওয়া হবে।',
        offsetMinutesAgo: 1735,
        replyToSuffix: '09',
        reactions: {
          '🎉': ['demo_persona_ngo_ashar_alo', 'demo_persona_catering_uttara'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '11',
        personaId: 'demo_persona_vol_sabbir',
        text: 'বৃষ্টি হলে সাইকেলে পানিরোধী কাভার অবশ্যই সাথে রাখবেন সবাই, গত পরশু খুব কাজে দিয়েছে।',
        offsetMinutesAgo: 1410,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '12',
        personaId: 'demo_persona_vol_tanvir',
        text: 'গতকাল রাতে ৩টি দোকান থেকে ৪২টি মিল বক্স ঢাকা মেডিকেল সংলগ্ন এলাকায় পৌঁছে দেওয়া সম্পন্ন ✅',
        offsetMinutesAgo: 1120,
        reactions: {
          '🙏': [
            'demo_persona_org_mahmud',
            'demo_persona_vol_nusrat',
            'demo_persona_mishti_mouchak',
          ],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '13',
        personaId: 'demo_persona_vol_nusrat',
        text: 'অসাধারণ কাজ তানভীর! মিরপুরেও কাল ১৮টি কাবাব র‍্যাপ ও রুটি পৌঁছে দিয়েছি।',
        offsetMinutesAgo: 1090,
        replyToSuffix: '12',
      ),
      CommunityRoomSeedMessage(
        idSuffix: '14',
        personaId: 'demo_persona_hotel_gulshan',
        text:
            'Volunteers picking up from Padma Regency tonight can park right at the North Loading Bay — security knows Rizik riders.',
        offsetMinutesAgo: 840,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '15',
        personaId: 'demo_persona_vol_sabbir',
        text: 'Noted! Heading there around 10:05 PM after Sonali Oven Bakery pickup.',
        offsetMinutesAgo: 810,
        replyToSuffix: '14',
      ),
      CommunityRoomSeedMessage(
        idSuffix: '16',
        personaId: 'demo_persona_org_mahmud',
        text:
            'এই শুক্রবার বিকেল ৪টায় ধানমন্ডি লেক পয়েন্টে নতুন স্বেচ্ছাসেবকদের ওরিয়েন্টেশন শিফট আছে — Volunteers ট্যাবে সাইন আপ করতে পারেন।',
        offsetMinutesAgo: 620,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '17',
        personaId: 'demo_persona_rec_farhana',
        text:
            'স্বেচ্ছাসেবক ভাই-বোনেরা এত যত্ন করে বক্সগুলো পৌঁছে দেন যে সত্যিই মন ভরে যায়। আপনাদের সবার জন্য দোয়া রইল।',
        offsetMinutesAgo: 440,
        reactions: {
          '❤️': [
            'demo_persona_vol_tanvir',
            'demo_persona_vol_nusrat',
            'demo_persona_vol_sabbir',
          ],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '18',
        personaId: 'demo_persona_vol_nusrat',
        text: 'আজকে রাতে Shaheed Kabab & Paratha থেকে মিরপুর-১০ ও মিরপুর-১১ তে কারা পিকআপ নেবেন?',
        offsetMinutesAgo: 260,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '19',
        personaId: 'demo_persona_vol_tanvir',
        text: 'আমি আজ ধানমন্ডি শেষ করে সাড়ে ১০টার দিকে মিরপুর-১ দিকে সাহায্য করতে পারব যদি দরকার হয়।',
        offsetMinutesAgo: 230,
        replyToSuffix: '18',
      ),
      CommunityRoomSeedMessage(
        idSuffix: '20',
        personaId: 'demo_persona_vol_sabbir',
        text: 'মহাখালী থেকে ২টি বড় থার্মাল ব্যাগ খালি আছে, কারো লাগলে জানাবেন।',
        offsetMinutesAgo: 145,
      ),
      CommunityRoomSeedMessage(
        idSuffix: '21',
        personaId: 'demo_persona_vol_tanvir',
        text: 'ধানমন্ডি ২৭ Banglar Mishti Bitan পিকআপ সম্পন্ন! এখন কলাবাগানের দিকে রওনা দিলাম।',
        offsetMinutesAgo: 68,
        reactions: {
          '👍': ['demo_persona_org_mahmud'],
        },
      ),
      CommunityRoomSeedMessage(
        idSuffix: '22',
        personaId: 'demo_persona_org_mahmud',
        text:
            'সবাই সাবধানে চলাচল করবেন এবং ডেলিভারি শেষে ইনবক্সে বা শিফট কার্ডে কনফার্ম করে দেবেন। শুভরাত্রি ও ধন্যবাদ!',
        offsetMinutesAgo: 18,
        reactions: {
          '🙏': [
            'demo_persona_vol_tanvir',
            'demo_persona_vol_nusrat',
            'demo_persona_vol_sabbir',
          ],
        },
      ),
    ],
  ),
];

String _detectIntent(String rawText) {
  final lower = rawText.toLowerCase();
  if (RegExp(r'\b(halal|haram|pork|beef|veg|vegetarian|diet|hygiene|clean|fresh)\b')
          .hasMatch(lower) ||
      RegExp(r'(হালাল|পরিষ্কার|তাজা|নিরাপদ|হাইজিন|নিরামিষ|গরু|মুরগি)')
          .hasMatch(rawText)) {
    return 'halal';
  }
  if (RegExp(r'\b(when|time|hour|open|close|closing|schedule|pm|am|tonight|today|late)\b')
          .hasMatch(lower) ||
      RegExp(r'(কখন|সময়|কয়টা|রাত|সকাল|বিকাল|সন্ধ্যা|বন্ধ|খোলা)')
          .hasMatch(rawText)) {
    return 'pickup_time';
  }
  if (RegExp(r'\b(where|location|address|map|area|road|direction|gate|near|how to reach)\b')
          .hasMatch(lower) ||
      RegExp(r'(কোথায়|ঠিকানা|লোকেশন|এলাকা|রাস্তা|গেট|ম্যাপ|কোন দিক)')
          .hasMatch(rawText)) {
    return 'location';
  }
  if (RegExp(r'\b(price|cost|free|money|pay|bdt|taka|tk|charge|fee)\b')
          .hasMatch(lower) ||
      RegExp(r'(দাম|টাকা|ফ্রি|বিনামূল্যে|খরচ|মূল্য|কত)').hasMatch(rawText)) {
    return 'price';
  }
  if (RegExp(r'\b(available|left|have|stock|portion|box|boxes|plate|food|still|any|claim|reserve)\b')
          .hasMatch(lower) ||
      RegExp(r'(আছে|বাকি|পাওয়া|খাবার|বক্স|প্যাকেট|প্লেট|সংগ্রহ|নিতে|লাগবে)')
          .hasMatch(rawText)) {
    return 'availability';
  }
  if (RegExp(r'\b(thank|thanks|thx|jazak|shukriya|appreciate|great|awesome|ok|okay|nice)\b')
          .hasMatch(lower) ||
      RegExp(r'(ধন্যবাদ|শুকরিয়া|জাযাকাল্লাহ|ভালো|দারুণ|ঠিক আছে|ওকে)')
          .hasMatch(rawText)) {
    return 'thanks';
  }
  return 'fallback';
}

String generatePersonaAutoReply(
  DemoPersonaSpec persona,
  String userMessageText,
  String appLang,
) {
  final intent = _detectIntent(userMessageText);
  final hasBangla = RegExp(r'[\u0980-\u09FF]').hasMatch(userMessageText);
  final useBn = hasBangla || appLang == 'bn';
  final name = useBn ? persona.displayNameBn : persona.displayName;
  final hours = persona.openingHours ?? '9:00 AM - 10:00 PM';
  final isRestaurant =
      persona.role == 'restaurantOwner' || persona.role == 'donor';

  if (persona.id == 'demo_team') {
    if (useBn) {
      switch (intent) {
        case 'location':
          return 'রিজিক ঢাকা জুড়ে ধানমন্ডি, পুরান ঢাকা, বনানী, গুলশান, মিরপুর, মোহাম্মদপুর ও উত্তরায় কাজ করে। নিকটস্থ ব্যাচ দেখতে "খুঁজুন" ট্যাব দেখুন।';
        case 'price':
          return 'রিজিক-এ উদ্ধারকৃত সব অতিরিক্ত খাবার সম্পূর্ণ বিনামূল্যে (৳০) প্রতিবেশী ও আশ্রয়কেন্দ্রের সাথে ভাগ করা হয়।';
        case 'thanks':
          return 'আপনাকেও অসংখ্য ধন্যবাদ রিজিকের অংশ হওয়ার জন্য! কোনো সহায়তার প্রয়োজন হলে এখানে জানাবেন।';
        case 'pickup_time':
          return 'বেশিরভাগ রেস্তোরাঁ রাত ৯:০০টা থেকে ১১:০০টার মধ্যে অতিরিক্ত খাবার পোস্ট করে। তাৎক্ষণিক ব্যাচের জন্য ফ্ল্যাশ রেসকিউ ফিল্টার দেখুন।';
        default:
          return 'বার্তার জন্য ধন্যবাদ! এটি একটি ডেমো সহায়তা চ্যাট। কাছের তাজা খাবার দেখতে হোম ফিড দেখুন অথবা নতুন চ্যাট থেকে রেস্তোরাঁ ও স্বেচ্ছাসেবকদের খুঁজুন।';
      }
    }
    switch (intent) {
      case 'location':
        return 'Rizik operates across Dhaka neighborhoods including Old Dhaka, Dhanmondi, Banani, Gulshan, Mirpur, Mohammadpur, and Uttara. Check the Discover tab for nearby batches!';
      case 'price':
        return 'All surplus meals shared on Rizik are 100% free (৳0) for neighbors, volunteers, and community shelters.';
      case 'thanks':
        return 'Thank you for helping reduce food waste across Dhaka! Let us know anytime if you need help.';
      case 'pickup_time':
        return 'Most partner kitchens post surplus packs between 9:00 PM and 11:00 PM. Watch the Flash Rescue strip for urgent closing batches.';
      default:
        return 'Thanks for messaging the Rizik Team! Browse active Dhaka batches on Home, join Community Rooms, or tap "New chat" to message real users and demo partners.';
    }
  }

  if (persona.role == 'volunteer') {
    if (useBn) {
      if (intent == 'availability' || intent == 'pickup_time') {
        return 'আমি ($name) সাধারণত ${persona.area} এলাকায় $hours এর দিকে পিকআপ রুট কভার করি। কোনো ব্যাচ রেডি হলে আমাকে জানালে সাহায্য করতে পারি!';
      }
      if (intent == 'location') {
        return 'আমি বর্তমানে ${persona.area} ও আশেপাশের এলাকায় সাইকেল/রাইডে খাবার পৌঁছে দিই।';
      }
      if (intent == 'thanks') {
        return 'কোনো ব্যাপার না! সবাই মিলে খাবার অপচয় কমাতে পারাই আমাদের আনন্দ।';
      }
      return 'হ্যালো! আমি $name (${persona.area} স্বেচ্ছাসেবক)। আজ সন্ধ্যার পিকআপ বা আশ্রয়কেন্দ্রের রুটে কীভাবে সাহায্য করতে পারি?';
    }
    if (intent == 'availability' || intent == 'pickup_time') {
      return "Hi! I'm $name, volunteering around ${persona.area} ($hours). Let me know which kitchen needs a pickup rider!";
    }
    if (intent == 'location') {
      return 'I cover pickup & drop-off routes around ${persona.area} and nearby neighborhoods.';
    }
    if (intent == 'thanks') {
      return 'Happy to help anytime! Safe food rescues for everyone.';
    }
    return 'Hey neighbor! This is $name (${persona.area} volunteer). Message me details if you have a surplus batch to coordinate.';
  }

  if (persona.role == 'ngo') {
    if (useBn) {
      if (intent == 'availability' || intent == 'pickup_time') {
        return '$name (উত্তরা সেক্টর ১১)-এ আমাদের ৪২ জন শিশুর জন্য প্রতিদিন রাত ১০:৩০ পর্যন্ত পরিষ্কার খাবার গ্রহণ করা হয়।';
      }
      if (intent == 'location') {
        return 'আমাদের ঠিকানা উত্তরা সেক্টর ১১-তে (মেইন রোড সংলগ্ন)। গেটে আমাদের কেয়ারটেকার সবসময় থাকেন।';
      }
      if (intent == 'halal') {
        return 'অনুগ্রহ করে পরিষ্কার ঢাকনাযুক্ত পাত্রে সম্পূর্ণ হালাল ও সদ্য রান্না করা খাবার দেবেন।';
      }
      if (intent == 'thanks') {
        return 'আমাদের শিশুদের পাশে থাকার জন্য আন্তরিক ধন্যবাদ ও ভালোবাসা!';
      }
      return '$name-এ বার্তা দেওয়ার জন্য ধন্যবাদ! শিশুদের জন্য কোনো রান্না করা খাবার, ফল বা বেকারি আইটেম থাকলে জানাবেন।';
    }
    if (intent == 'availability' || intent == 'pickup_time') {
      return 'At $name (Uttara Sector 11), we care for 42 children and welcome clean food drop-offs until 10:30 PM daily.';
    }
    if (intent == 'location') {
      return 'We are located in Uttara Sector 11. Our caretaker is ready at the main gate to receive meal trays.';
    }
    if (intent == 'halal') {
      return 'We accept clean, covered Halal meals and fresh bakery items safe for school-age children.';
    }
    if (intent == 'thanks') {
      return 'Thank you so much on behalf of all the children at our shelter!';
    }
    return 'Thank you for contacting $name! Let us know how many portions are ready and what time works best for drop-off.';
  }

  if (persona.role == 'organizer') {
    if (useBn) {
      if (intent == 'availability' || intent == 'pickup_time') {
        return 'আমাদের ঢাকা ফুড ড্রাইভ দল প্রতি সন্ধ্যায় গুলশান-বনানী ও শুক্রবারের কমিউনিটি ড্রাইভ পরিচালনা করে ($hours)।';
      }
      if (intent == 'location') {
        return 'আমাদের মূল সমন্বয় পয়েন্ট গুলশান ও বনানীতে, তবে বড় বিয়ের খাবার হলে পুরো ঢাকায় ভ্যান পাঠাই।';
      }
      if (intent == 'thanks') {
        return 'ধন্যবাদ! "স্বেচ্ছাসেবক দল" রুমে যোগ দিলে লাইভ রুটগুলো দেখতে পাবেন।';
      }
      return 'হ্যালো! আমি $name। কোনো ইভেন্ট, বিয়ের খাবার উদ্ধার বা স্বেচ্ছাসেবা নিয়ে সাহায্য লাগলে জানান।';
    }
    if (intent == 'availability' || intent == 'pickup_time') {
      return 'Our Dhaka Food Drive team coordinates evening pickups ($hours) and Friday community meal drives.';
    }
    if (intent == 'location') {
      return 'We coordinate primarily around Gulshan and Banani, and dispatch cargo vans across Dhaka for large wedding leftovers.';
    }
    if (intent == 'thanks') {
      return 'Thank you! Hop into the Volunteers room anytime to see live dispatch updates.';
    }
    return "Hi! I'm $name. Reach out if you're planning a food drive, wedding rescue, or volunteer shift.";
  }

  if (persona.role == 'recipient') {
    if (useBn) {
      if (intent == 'location') {
        return 'আমি ${persona.area} এলাকায় থাকি, কাছাকাছি হলে হেঁটে বা রিকশায় গিয়ে নিতে পারি।';
      }
      if (intent == 'thanks') return 'আপনাকেও অনেক ধন্যবাদ! খুব উপকার হলো।';
      return 'সালাম! আমি $name (${persona.area})। আজ সন্ধ্যা বা রাতে কি কাছাকাছি কোনো খাবার প্যাক পাওয়া যাবে?';
    }
    if (intent == 'location') {
      return "I'm in ${persona.area}, so nearby pickup points work best for me.";
    }
    if (intent == 'thanks') return 'Thank you very much! That helps a lot.';
    return "Hi! I'm $name from ${persona.area}. Are any single meal packs available for pickup nearby today?";
  }

  if (isRestaurant) {
    if (useBn) {
      switch (intent) {
        case 'availability':
          return '$name-এ আজ রাতে তাজা অতিরিক্ত বক্স থাকার সম্ভাবনা আছে! আমাদের সাধারণ প্যাকিং সময় $hours এর শেষ ভাগে — হোম ফিডে Flash Rescue দেখে ক্লেইম করতে পারেন।';
        case 'price':
          return 'রিজিক-এর মাধ্যমে $name-এর সব উদ্বৃত্ত খাবারের প্যাক সম্পূর্ণ বিনামূল্যে (৳০) শেয়ার করা হয়।';
        case 'location':
          return 'আমাদের রান্নাঘর ${persona.area} এলাকায় অবস্থিত। পিকআপ কনফার্ম হলে QR কোডসহ সঠিক প্রবেশপথ দেখানো হবে।';
        case 'pickup_time':
          return 'আমাদের দোকানের সময় $hours। সাধারণত বন্ধ হওয়ার ৩০–৪৫ মিনিট আগে অতিরিক্ত খাবার ফয়েল বক্সে প্যাক করা হয়।';
        case 'halal':
          return 'জি, $name-এর সব খাবার ১০০% হালাল ও পরিষ্কার ঢাকনাযুক্ত ফুড-গ্রেড বক্সে প্যাক করা থাকে।';
        case 'thanks':
          return 'আপনাকেও অনেক ধন্যবাদ! খাবার অপচয় রোধে আমাদের সাথে থাকার জন্য কৃতজ্ঞ।';
        default:
          return '$name (${persona.area}) থেকে আপনার ডেমো বার্তা পেয়েছি! সময়: $hours। আজকের তাজা ব্যাচ দেখতে Discover ট্যাব দেখুন।';
      }
    }
    switch (intent) {
      case 'availability':
        return '$name usually has fresh evening surplus packs toward closing ($hours). Keep an eye on the Discover tab & Flash Rescue strip to reserve a box!';
      case 'price':
        return 'All surplus food shared by $name through Rizik is 100% free (৳0) for neighbors and verified shelters.';
      case 'location':
        return 'Our kitchen is located in ${persona.area}, Dhaka. Once you reserve a batch, bring your 6-digit QR pickup code at the side counter.';
      case 'pickup_time':
        return 'Our kitchen hours are $hours. Surplus boxes are typically sealed cleanly 30–45 minutes before closing.';
      case 'halal':
        return 'Yes! Everything from $name is 100% Halal and packed hygienically in covered food-grade containers.';
      case 'thanks':
        return "You're very welcome! Glad we could help share good food instead of wasting it.";
      default:
        return 'Thanks for messaging $name (${persona.area})! Hours: $hours. Ask about pickup time, availability, location, or Halal details.';
    }
  }

  return useBn
      ? '$name আপনার বার্তা পেয়েছে (ডেমো স্বয়ংক্রিয় উত্তর)।'
      : '$name received your message (demo auto-reply).';
}
