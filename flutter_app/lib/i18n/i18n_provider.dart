import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/models.dart';

class I18nProvider extends ChangeNotifier {
  static const _langKey = 'aharforall_lang';
  String _lang = 'en';

  I18nProvider() {
    _load();
  }

  String get lang => _lang;
  bool get isBn => _lang == 'bn';

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_langKey);
      if (saved == 'bn' || saved == 'en') {
        _lang = saved!;
        notifyListeners();
      }
    } catch (_) {}
  }

  Future<void> setLanguage(String code) async {
    if (code != 'en' && code != 'bn') return;
    _lang = code;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_langKey, code);
    } catch (_) {}
  }

  Future<void> toggleLanguage() => setLanguage(isBn ? 'en' : 'bn');

  String t(String key, [Map<String, String>? params]) {
    final dict = isBn ? _bn : _en;
    var val = dict[key] ?? _en[key] ?? key;
    if (params != null) {
      params.forEach((k, v) {
        val = val.replaceAll('{{$k}}', v);
      });
    }
    return val;
  }

  String formatNumber(num n) {
    final s = n.toString();
    if (!isBn) return s;
    const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return s.split('').map((ch) {
      final code = ch.codeUnitAt(0);
      if (code >= 48 && code <= 57) return bnDigits[code - 48];
      return ch;
    }).join();
  }

  String formatCategory(FoodCategory cat) {
    switch (cat) {
      case FoodCategory.cooked:
        return t('cat.cooked');
      case FoodCategory.bakery:
        return t('cat.bakery');
      case FoodCategory.produce:
        return t('cat.produce');
      case FoodCategory.packaged:
        return t('cat.packaged');
    }
  }

  String formatTimeRemaining(String isoEnd) {
    final end = DateTime.tryParse(isoEnd);
    if (end == null) return '';
    final diffMin = end.difference(DateTime.now()).inMinutes;
    if (diffMin <= 0) return t('feed.expired');
    if (diffMin < 60) return '${formatNumber(diffMin)}${t('common.m')}';
    final hrs = diffMin ~/ 60;
    final mins = diffMin % 60;
    return mins > 0
        ? '${formatNumber(hrs)}${t('common.h')} ${formatNumber(mins)}${t('common.m')}'
        : '${formatNumber(hrs)}${t('common.h')}';
  }

  static const Map<String, String> _en = {
    'app.name': 'Rizik',
    'app.tagline': 'রিজিক কখনো ভুল ঠিকানায় পৌঁছায় না, যার জন্য যতটুকু বরাদ্দ, সে ততটুকুই পায়।',
    'common.h': 'h',
    'common.m': 'm',
    'common.close': 'Close',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.submit': 'Submit',
    'common.loading': 'Loading...',
    'common.verifiedDonor': 'Verified donor',
    'nav.home': 'Home',
    'nav.discover': 'Discover',
    'nav.events': 'Events',
    'nav.claims': 'My Claims',
    'nav.donorHub': 'Donor Hub',
    'nav.chat': 'Inbox',
    'nav.more': 'More',
    'nav.clients': 'Clients & Partners',
    'nav.wedding': 'Wedding Pickup',
    'nav.donate': 'Support Us',
    'nav.impact': 'Impact Dashboard',
    'nav.volunteers': 'Volunteer Hub',
    'nav.leaderboard': 'Leaderboard',
    'nav.admin': 'Admin Review',
    'nav.settings': 'Settings',
    'nav.signIn': 'Sign In',
    'nav.logout': 'Log Out',
    'home.heroTitle': 'Rescue fresh surplus food across Dhaka before closing time',
    'home.heroSubtitle':
        'Connect local restaurants, bakeries, and community kitchens with neighbors and volunteers.',
    'home.browseFood': 'Browse Nearby Food',
    'home.donateFood': 'Share Surplus Food',
    'home.mealsShared': 'Meals Shared',
    'home.kgSaved': 'Food Saved (kg)',
    'home.activeDonors': 'Active Kitchens',
    'home.peopleHelped': 'Neighbors Helped',
    'home.featuredDonors': 'Featured Verified Kitchens',
    'home.upcomingEvents': 'Upcoming Distribution Events',
    'home.recentActivity': 'Recent Community Rescues',
    'home.testimonials': 'Community Stories',
    'home.campaignTitle': 'Ramadan & Daily Meal Fund',
    'feed.searchHint': 'Search meals, bakeries, neighborhoods...',
    'feed.filters': 'Filters',
    'feed.feedView': 'Feed',
    'feed.mapView': 'Map',
    'feed.left': 'left',
    'feed.endsIn': 'Ends in',
    'feed.expired': 'Expired',
    'feed.km': 'km',
    'feed.flashOnly': 'Flash Rescue',
    'feed.ramadanOnly': 'Iftar / Sehri',
    'feed.noListings': 'No surplus food matches your filters nearby.',
    'filters.title': 'Filter Surplus Food',
    'cat.all': 'All',
    'cat.cooked': 'Cooked Meal',
    'cat.bakery': 'Bakery',
    'cat.produce': 'Produce',
    'cat.packaged': 'Packaged',
    'detail.requestPickup': 'Request Pickup',
    'detail.messageShop': 'Message Shop',
    'detail.safetyNote': 'Safety & Allergen Note',
    'detail.signInToClaim': 'Sign in to Request Pickup',
    'claims.title': 'My Claims',
    'claims.showCode': 'Show Pickup Code',
    'claims.openChat': 'Open Chat',
    'claims.rateDonor': 'Rate Hygiene & Kitchen',
    'donor.title': 'Donor Hub',
    'donor.postFood': 'Post Surplus Food',
    'donor.verifyHandover': 'Verify QR / Pickup Code',
    'donor.incomingClaims': 'Incoming Claims',
    'donor.myListings': 'My Food Batches',
    'chat.title': 'Messages',
    'chat.findPeople': 'Find People',
    'chat.newChat': 'New chat',
    'chat.typeMessage': 'Write a message...',
    'chat.searchHint': 'Search conversations, shops, @handle...',
    'chat.filterAll': 'All',
    'chat.filterUnread': 'Unread',
    'chat.filterArchived': 'Archived',
    'chat.mute': 'Mute',
    'chat.unmute': 'Unmute',
    'chat.archive': 'Archive',
    'chat.unarchive': 'Unarchive',
    'chat.deleteForMe': 'Delete for me',
    'chat.blockUser': 'Block user',
    'chat.unblockUser': 'Unblock user',
    'chat.reportUser': 'Report user',
    'chat.blockedBanner': 'Blocked conversation. Unblock in Settings to send messages.',
    'chat.demoTag': 'Demo',
    'chat.officialTag': 'Official',
    'chat.autoReplyDemo': 'Auto-reply (demo)',
    'chat.loadOlder': 'Load older messages',
    'chat.offlineQueued': 'Offline — queued & ready to retry',
    'chat.retry': 'Retry',
    'chat.typing': 'Typing...',
    'chat.onlineNow': 'Online now',
    'chat.lastSeen': 'Last seen',
    'chat.forward': 'Forward',
    'chat.forwardTo': 'Forward message to...',
    'chat.reply': 'Reply',
    'chat.sent': 'Sent',
    'chat.delivered': 'Delivered',
    'chat.read': 'Read',
    'chat.today': 'Today',
    'chat.yesterday': 'Yesterday',
    'chat.noConversations': 'No conversations yet.',
    'chat.supportChat': 'Admin Support Chat',
    'people.title': 'Find People & Kitchens',
    'people.searchHint': 'Search name, restaurant, area, @handle...',
    'people.tabAll': 'All',
    'people.tabRestaurants': 'Restaurants',
    'people.tabPeople': 'People',
    'people.tabOnline': 'Online now',
    'people.roleOwner': 'Restaurant Owner',
    'people.roleAdmin': 'Admin',
    'people.roleMember': 'Member',
    'people.loadMore': 'Load more',
    'people.empty': 'No discoverable users match your search.',
    'notif.title': 'Notifications',
    'notif.markAllRead': 'Mark all read',
    'notif.empty': 'No notifications yet.',
    'notif.starterTag': 'Starter',
    'settings.discoverable': 'Discoverable in Find people',
    'settings.blockedUsers': 'Blocked Users',
    'settings.noBlocked': 'No blocked users.',
    'settings.unblock': 'Unblock',
    'settings.resubmit': 'Resubmit Application',
    'auth.loginTitle': 'Welcome back',
    'auth.signupTitle': 'Create your account',
    'auth.googleBtn': 'Continue with Google',
    'auth.demoHeading': 'Quick Demo Accounts',
  };

  static const Map<String, String> _bn = {
    'app.name': 'Rizik',
    'app.tagline': 'রিজিক কখনো ভুল ঠিকানায় পৌঁছায় না, যার জন্য যতটুকু বরাদ্দ, সে ততটুকুই পায়।',
    'common.h': 'ঘ',
    'common.m': 'মি',
    'common.close': 'বন্ধ করুন',
    'common.cancel': 'বাতিল',
    'common.save': 'সংরক্ষণ করুন',
    'common.submit': 'জমা দিন',
    'common.loading': 'লোড হচ্ছে...',
    'common.verifiedDonor': 'যাচাইকৃত দাতা',
    'nav.home': 'হোম',
    'nav.discover': 'খুঁজুন',
    'nav.events': 'ইভেন্ট',
    'nav.claims': 'আমার দাবি',
    'nav.donorHub': 'দাতা হাব',
    'nav.chat': 'ইনবক্স',
    'nav.more': 'আরও',
    'nav.clients': 'পার্টনার ও ক্লায়েন্ট',
    'nav.wedding': 'বিয়ের খাবার সংগ্রহ',
    'nav.donate': 'সহায়তা করুন',
    'nav.impact': 'প্রভাব ড্যাশবোর্ড',
    'nav.volunteers': 'স্বেচ্ছাসেবক হাব',
    'nav.leaderboard': 'লিডারবোর্ড',
    'nav.admin': 'অ্যাডমিন রিভিউ',
    'nav.settings': 'সেটিংস',
    'nav.signIn': 'সাইন ইন',
    'nav.logout': 'লগ আউট',
    'home.heroTitle': 'দোকান বন্ধের আগে ঢাকার তাজা উদ্বৃত্ত খাবার উদ্ধার করুন',
    'home.heroSubtitle':
        'স্থানীয় রেস্তোরাঁ, বেকারি এবং কমিউনিটি রান্নাঘরকে প্রতিবেশী ও স্বেচ্ছাসেবকদের সাথে যুক্ত করুন।',
    'home.browseFood': 'কাছাকাছি খাবার দেখুন',
    'home.donateFood': 'উদ্বৃত্ত খাবার শেয়ার করুন',
    'home.mealsShared': 'খাবার বিতরণ',
    'home.kgSaved': 'খাবার রক্ষা (কেজি)',
    'home.activeDonors': 'সক্রিয় রান্নাঘর',
    'home.peopleHelped': 'সহায়তা প্রাপ্ত মানুষ',
    'home.featuredDonors': 'যাচাইকৃত পার্টনার রান্নাঘর',
    'home.upcomingEvents': 'আসন্ন খাদ্য বিতরণ ইভেন্ট',
    'home.recentActivity': 'সাম্প্রতিক খাবার উদ্ধার',
    'home.testimonials': 'কমিউনিটির গল্প',
    'home.campaignTitle': 'রমজান ও দৈনিক খাবার তহবিল',
    'feed.searchHint': 'খাবার, বেকারি বা এলাকা খুঁজুন...',
    'feed.filters': 'ফিল্টার',
    'feed.feedView': 'তালিকা',
    'feed.mapView': 'মানচিত্র',
    'feed.left': 'বাকি',
    'feed.endsIn': 'শেষ হবে',
    'feed.expired': 'মেয়াদোত্তীর্ণ',
    'feed.km': 'কিমি',
    'feed.flashOnly': 'ফ্ল্যাশ রেসকিউ',
    'feed.ramadanOnly': 'ইফতার / সেহরি',
    'feed.noListings': 'আপনার ফিল্টার অনুযায়ী কাছাকাছি কোনো খাবার নেই।',
    'filters.title': 'উদ্বৃত্ত খাবার ফিল্টার করুন',
    'cat.all': 'সব',
    'cat.cooked': 'রান্না করা খাবার',
    'cat.bakery': 'বেকারি',
    'cat.produce': 'তাজা সবজি ও ফল',
    'cat.packaged': 'প্যাকেটজাত',
    'detail.requestPickup': 'পিকআপ অনুরোধ করুন',
    'detail.messageShop': 'দোকানে বার্তা পাঠান',
    'detail.safetyNote': 'নিরাপত্তা ও অ্যালার্জি নোট',
    'detail.signInToClaim': 'পিকআপের জন্য সাইন ইন করুন',
    'claims.title': 'আমার দাবি',
    'claims.showCode': 'পিকআপ কোড দেখুন',
    'claims.openChat': 'চ্যাট খুলুন',
    'claims.rateDonor': 'রেটিং ও হাইজিন রিভিউ দিন',
    'donor.title': 'দাতা হাব',
    'donor.postFood': 'উদ্বৃত্ত খাবার পোস্ট করুন',
    'donor.verifyHandover': 'কিউআর / কোড যাচাই করুন',
    'donor.incomingClaims': 'আগত দাবিগুলো',
    'donor.myListings': 'আমার খাবারের ব্যাচ',
    'chat.title': 'বার্তা',
    'chat.findPeople': 'মানুষ খুঁজুন',
    'chat.newChat': 'নতুন চ্যাট',
    'chat.typeMessage': 'বার্তা লিখুন...',
    'chat.searchHint': 'কথোপকথন, দোকান বা @হ্যান্ডেল খুঁজুন...',
    'chat.filterAll': 'সব',
    'chat.filterUnread': 'অপঠিত',
    'chat.filterArchived': 'আর্কাইভ করা',
    'chat.mute': 'মিউট করুন',
    'chat.unmute': 'আনমিউট করুন',
    'chat.archive': 'আর্কাইভ করুন',
    'chat.unarchive': 'আর্কাইভ সরান',
    'chat.deleteForMe': 'আমার জন্য মুছুন',
    'chat.blockUser': 'ব্লক করুন',
    'chat.unblockUser': 'আনব্লক করুন',
    'chat.reportUser': 'রিপোর্ট করুন',
    'chat.blockedBanner': 'ব্লক করা কথোপকথন। বার্তা পাঠাতে সেটিংস থেকে আনব্লক করুন।',
    'chat.demoTag': 'ডেমো',
    'chat.officialTag': 'অফিসিয়াল',
    'chat.autoReplyDemo': 'স্বয়ংক্রিয় উত্তর (ডেমো)',
    'chat.loadOlder': 'পুরনো বার্তা লোড করুন',
    'chat.offlineQueued': 'অফলাইন — সারিবদ্ধ, আবার চেষ্টা করতে পারেন',
    'chat.retry': 'আবার চেষ্টা করুন',
    'chat.typing': 'টাইপ করছে...',
    'chat.onlineNow': 'এখন অনলাইন',
    'chat.lastSeen': 'সর্বশেষ দেখা',
    'chat.forward': 'ফরওয়ার্ড করুন',
    'chat.forwardTo': 'বার্তা ফরওয়ার্ড করুন...',
    'chat.reply': 'উত্তর দিন',
    'chat.sent': 'পাঠানো হয়েছে',
    'chat.delivered': 'পৌঁছেছে',
    'chat.read': 'পড়া হয়েছে',
    'chat.today': 'আজ',
    'chat.yesterday': 'গতকাল',
    'chat.noConversations': 'এখনও কোনো কথোপকথন নেই।',
    'chat.supportChat': 'অ্যাডমিন সাপোর্ট চ্যাট',
    'people.title': 'মানুষ ও রান্নাঘর খুঁজুন',
    'people.searchHint': 'নাম, রেস্তোরাঁ, এলাকা বা @হ্যান্ডেল খুঁজুন...',
    'people.tabAll': 'সব',
    'people.tabRestaurants': 'রেস্তোরাঁ',
    'people.tabPeople': 'ব্যক্তি',
    'people.tabOnline': 'এখন অনলাইন',
    'people.roleOwner': 'রেস্তোরাঁ মালিক',
    'people.roleAdmin': 'অ্যাডমিন',
    'people.roleMember': 'সদস্য',
    'people.loadMore': 'আরও লোড করুন',
    'people.empty': 'আপনার অনুসন্ধানে কোনো দৃশ্যমান ব্যবহারকারী পাওয়া যায়নি।',
    'notif.title': 'বিজ্ঞপ্তি',
    'notif.markAllRead': 'সব পঠিত চিহ্নিত করুন',
    'notif.empty': 'এখনও কোনো বিজ্ঞপ্তি নেই।',
    'notif.starterTag': 'শুরু',
    'settings.discoverable': '"মানুষ খুঁজুন"-এ দৃশ্যমান থাকুন',
    'settings.blockedUsers': 'ব্লক করা ব্যবহারকারী',
    'settings.noBlocked': 'কোনো ব্লক করা ব্যবহারকারী নেই।',
    'settings.unblock': 'আনব্লক করুন',
    'settings.resubmit': 'আবেদন পুনরায় জমা দিন',
    'auth.loginTitle': 'আবার স্বাগতম',
    'auth.signupTitle': 'অ্যাকাউন্ট তৈরি করুন',
    'auth.googleBtn': 'গুগল দিয়ে চালিয়ে যান',
    'auth.demoHeading': 'দ্রুত ডেমো অ্যাকাউন্ট',
  };
}
