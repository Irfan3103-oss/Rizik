import type { FoodCategory, Language } from '../types';

/**
 * Centralized Bangladeshi photography registry for Rizik.
 *
 * HOW TO SWAP ANY IMAGE:
 * 1. Drop a new .jpg / .webp / .png into /public/images/
 * 2. Update the `src` path below (e.g. '/images/my-new-photo.jpg')
 * 3. Every surface referencing that key updates automatically.
 */

export interface ImageAsset {
  src: string;
  alt: {
    en: string;
    bn: string;
  };
}

export function getImageAlt(asset: ImageAsset, lang: Language): string {
  return lang === 'bn' ? asset.alt.bn : asset.alt.en;
}

export const IMAGES = {
  hero: {
    src: '/images/hero-dhaka-sharing.jpg',
    alt: {
      en: 'Freshly prepared Bangladeshi dishes and biryani shared in Dhaka neighborhood markets',
      bn: 'ঢাকার স্থানীয় বাজারে প্রস্তুত তাজা বাংলাদেশি খাবার ও বিরিয়ানি',
    },
  },
  weddingBanner: {
    src: '/images/wedding-buffet-bd.jpg',
    alt: {
      en: 'Traditional Bangladeshi wedding feast trays ready for safe community redistribution',
      bn: 'নিরাপদ বিতরণের জন্য প্রস্তুত ঐতিহ্যবাহী বাংলাদেশি বিয়ের ভোজের খাবার',
    },
  },
  weddingCelebration: {
    src: '/images/wedding-celebration-bd.jpg',
    alt: {
      en: 'Bangladeshi wedding celebration dining table with kacchi biryani and sweets',
      bn: 'কাচ্চি বিরিয়ানি ও মিষ্টিসহ বাংলাদেশি বিয়ের উৎসবের খাবার টেবিল',
    },
  },
  weddingDelivery: {
    src: '/images/community-distribution-bd.jpg',
    alt: {
      en: 'Volunteers distributing warm meal boxes directly to local Bangladeshi community members',
      bn: 'স্থানীয় মানুষের মাঝে গরম খাবারের বক্স বিতরণ করছেন স্বেচ্ছাসেবকরা',
    },
  },
  donateBanner: {
    src: '/images/community-distribution-bd.jpg',
    alt: {
      en: 'Community food distribution drive supporting families across Dhaka neighborhoods',
      bn: 'ঢাকার বিভিন্ন এলাকায় পরিবারগুলোর সহায়তায় কমিউনিটি খাবার বিতরণ কার্যক্রম',
    },
  },
  onboardingSlides: [
    {
      src: '/images/hero-dhaka-sharing.jpg',
      alt: {
        en: 'Traditional Bangladeshi food stalls in Old Dhaka sharing fresh surplus dishes',
        bn: 'পুরান ঢাকার খাবারের দোকান থেকে তাজা অতিরিক্ত খাবার বিতরণ',
      },
    },
    {
      src: '/images/community-distribution-bd.jpg',
      alt: {
        en: 'Volunteers handing out packed meal boxes to neighbors in Bangladesh',
        bn: 'বাংলাদেশে প্রতিবেশীদের হাতে খাবারের প্যাকেট তুলে দিচ্ছেন স্বেচ্ছাসেবকরা',
      },
    },
    {
      src: '/images/dhaka-rickshaws.jpg',
      alt: {
        en: 'Vibrant daytime Dhaka neighborhood street connecting local kitchens and shelters',
        bn: 'স্থানীয় রান্নাঘর ও আশ্রয়কেন্দ্রকে সংযুক্ত করা ঢাকার প্রাণবন্ত সড়ক',
      },
    },
  ] as ImageAsset[],
} as const;

export const FOOD_CATEGORY_IMAGES: Record<FoodCategory, string> = {
  cooked: '/images/kacchi-biryani.jpg',
  bakery: '/images/dhaka-bakery-bread.jpg',
  produce: '/images/dhaka-vegetables.jpg',
  packaged: '/images/singara-snacks.jpg',
};

export const EVENT_GALLERY_IMAGES = [
  '/images/community-distribution-bd.jpg',
  '/images/kitchen-packing-bd.jpg',
  '/images/wedding-buffet-bd.jpg',
  '/images/chawkbazar-iftar.jpg',
  '/images/rice-dal-bhorta.jpg',
  '/images/bhuna-khichuri.jpg',
] as const;

export const TESTIMONIAL_AVATARS = [
  '/images/portrait-man-2.jpg',
  '/images/portrait-woman-1.jpg',
  '/images/portrait-man-3.jpg',
  '/images/portrait-woman-2.jpg',
] as const;
