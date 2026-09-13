import type { TranslationKey } from "@/lib/translations";

// ─── Professional Profile Categories ──────────────────────────────────
// A broad, worldwide set of professional/business categories a person
// can attach to their profile, matching X's "professional profile"
// feature. Grouped by theme below for maintainability, but exported as
// one flat, alphabetized-within-group list - the picker UI searches
// and renders this as a single flat, scrollable list, same as X's own.
//
// This intentionally doesn't attempt to be a perfect 1:1 clone of any
// other platform's exact taxonomy (which tend to run into the many
// hundreds of hyper-specific entries) - it's a genuinely broad,
// sensibly-organized set covering the major categories a real profile
// worldwide would plausibly want, across every major industry.

// ─── Display translation for categories ────────────────────────────────
// The strings below are the canonical, stored values (saved on the user
// record, matched/filtered by exact string) - never change them, that
// would silently break existing profiles' saved category. Only how a
// category is *displayed* is localized: the picker and every place that
// renders a selected category (profile header, settings) look it up via
// t(categoryToTranslationKey(category)) instead of rendering the raw
// English string directly.
//
// Each category gets a deterministic key "professionalCategory.<key>",
// derived by turning "&"/","/"-" into spaces and camelCasing the
// remaining words, e.g. "Software Development" ->
// "professionalCategory.softwareDevelopment", "E-Commerce" ->
// "professionalCategory.eCommerce". Translations for every key below
// live in translations.ts (see the newkeys_categorypicker.json handoff
// this scheme was generated alongside) - if you add a category here,
// add its translation key everywhere too.
export function categoryToTranslationKey(category: string): TranslationKey {
  const words = category
    .replace(/[&,-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  const camel = words
    .map((w, i) =>
      i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join("");
  return `professionalCategory.${camel}` as TranslationKey;
}

export const PROFESSIONAL_CATEGORIES: string[] = [
  // ─── Technology & Digital ───────────────────────────────────────
  "Software Development",
  "Information Technology",
  "Blockchain",
  "Cryptocurrency & Web3",
  "Artificial Intelligence",
  "Cybersecurity",
  "Cloud Computing",
  "Data Science & Analytics",
  "Gaming & Esports",
  "Telecommunications",
  "Hardware & Electronics",
  "SaaS & Cloud Software",
  "Web Design & Development",

  // ─── Finance & Business ──────────────────────────────────────────
  "Financial Services",
  "Banking",
  "Insurance",
  "Investment & Trading",
  "Accounting & Tax Services",
  "Venture Capital & Private Equity",
  "Real Estate",
  "Business Consulting",
  "Human Resources",
  "Legal Services",
  "Recruitment & Staffing",

  // ─── Marketing, Media & Creative ─────────────────────────────────
  "Marketing & Advertising",
  "Public Relations",
  "Journalism & News Media",
  "Broadcasting",
  "Film & Television",
  "Music",
  "Photography",
  "Graphic Design",
  "Content Creation",
  "Publishing",
  "Podcasting",
  "Animation & VFX",

  // ─── Retail, Food & Hospitality ───────────────────────────────────
  "Retail",
  "E-Commerce",
  "Restaurant",
  "Food & Beverage",
  "Catering",
  "Hotel & Lodging",
  "Travel & Tourism",
  "Event Venue",
  "Event Planning",
  "Dance & Night Club",
  "Bar & Pub",
  "Bakery & Confectionery",
  "Grocery & Supermarket",

  // ─── Health, Beauty & Wellness ────────────────────────────────────
  "Healthcare",
  "Medical Practice",
  "Dentistry",
  "Mental Health Services",
  "Pharmacy",
  "Fitness & Personal Training",
  "Beauty, Cosmetic & Personal Care",
  "Spa & Wellness",
  "Nutrition & Dietetics",
  "Veterinary Services",

  // ─── Industrial, Trades & Transport ───────────────────────────────
  "Automotive",
  "Aviation",
  "Marine",
  "Logistics & Supply Chain",
  "Shipping & Freight",
  "Manufacturing",
  "Commercial & Industrial",
  "Construction",
  "Architecture",
  "Interior Design",
  "Home & Garden",
  "Home Improvement & Renovation",
  "Electrical Services",
  "Plumbing",
  "Cleaning Services",
  "Security Services",

  // ─── Education, Government & Nonprofit ────────────────────────────
  "Education",
  "Higher Education",
  "Online Courses & E-Learning",
  "Government",
  "Public Administration",
  "Non-Profit & Charity",
  "Religious Organization",
  "Political Organization",
  "Research & Science",
  "Library & Archives",

  // ─── Sports, Entertainment & Recreation ───────────────────────────
  "Sports",
  "Entertainment & Recreation",
  "Performing Arts",
  "Museum & Gallery",
  "Amusement Park & Attraction",
  "Outdoor & Adventure",

  // ─── Agriculture, Energy & Environment ────────────────────────────
  "Agriculture & Farming",
  "Energy & Utilities",
  "Renewable Energy",
  "Mining & Metals",
  "Environmental Services",

  // ─── Fashion & Consumer Goods ──────────────────────────────────────
  "Fashion & Apparel",
  "Jewelry & Accessories",
  "Consumer Goods",
  "Furniture & Home Goods",

  // ─── Professional & Other Services ────────────────────────────────
  "Professional Services",
  "Photography Studio",
  "Printing Services",
  "Translation & Localization",
  "Personal Services",
  "Pet Services",
  "Author & Writer",
  "Influencer & Creator",
  "Freelancer",
  "Other",
];
