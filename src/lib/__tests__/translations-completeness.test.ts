import { describe, it, expect } from "vitest";
import { translations, SUPPORTED_LANGUAGES } from "@/lib/translations";

/*
 * Localization completeness gate.
 *
 * Found via a real audit (screenshots of the Settings page and sidebar
 * rendering English text under an active Arabic locale): the dictionary
 * itself was already 100% key-complete across all languages, but that
 * completeness silently coexisted with two real problems this test is
 * built to catch going forward:
 *
 *   1. A brand-new key added to English and forgotten in one or more
 *      other languages (the dictionary drifting out of parity again).
 *   2. A value that's just a byte-for-byte copy of the English source -
 *      i.e. never actually translated, just carried over - which is
 *      exactly what happened to nav.shorts/nav.play/nav.opportunity/
 *      nav.help and ~1000 other entries before this pass fixed them.
 *
 * This does NOT try to be a translation-quality checker (it can't judge
 * whether a translation reads naturally) - it enforces the two
 * mechanical invariants above, which is what let the original bug ship
 * silently for as long as it did: the dictionary "had" every key, so a
 * naive completeness check would have passed.
 */

// Cast to a plain string-keyed record - every language dict shares the
// exact same key set by construction, but TypeScript's TranslationKey
// union doesn't let us index it with an arbitrary runtime string.
type Dict = Record<string, string>;
const asDict = (d: unknown) => d as Dict;

const englishDict = asDict(translations.en);
const englishKeys = Object.keys(englishDict);

/**
 * Values that are legitimately identical to their English source in
 * EVERY language - reviewed by hand during the localization pass that
 * added this gate. Categories: ZRP's own plan-tier brand names (Free/Pro/
 * Business/Enterprise - product names, not translated adjectives),
 * literal file formats/technical standards/encodings, dimensions/ratios/
 * file sizes, version numbers, placeholder URLs and emails, and the bare
 * "ZRP"/"ZRP Social" brand token.
 */
const INTENTIONALLY_ENGLISH_VALUES = new Set<string>([
  // Plan-tier brand names
  "Free",
  "Pro",
  "Business",
  "Enterprise",
  // File formats / technical standards - not language-specific
  "JPEG, PNG, GIF, WebP",
  "MP4, MOV, AVI, WebM",
  "H.264",
  // Dimensions / ratios / sizes - numerals + symbols only
  "1:1",
  "3:1",
  "3:2",
  "400 × 400 px",
  "1200 × 400 px",
  "1200 × 800 px",
  "800 × 800 px",
  "2 MB",
  "4 MB",
  "32 MB",
  // Version metadata
  "1.0",
  // Placeholder examples shown in form fields
  "https://your-site.com",
  "https://your-website.com",
  "https://...",
  "https://…",
  "user@example.com",
  // The brand itself
  "ZRP",
  "ZRP Social",
]);

/**
 * Per-language allowlists of translation keys whose value is legitimately
 * identical to the English source IN THAT LANGUAGE SPECIFICALLY - reviewed
 * by hand, one language at a time, during the same pass. These are real
 * cognates and loanwords a native speaker would actually use (French
 * "Message"/"Admin"/"Premium", German/Indonesian/Turkish "Video"/
 * "Blockchain"/"Platform", Indonesian "Email"/"Bio"/"Media"/"Global" as
 * everyday loanwords, etc.), plus per-key technical values (URLs, ratios,
 * file-size/format strings, version numbers) that don't need translating
 * in that language's context but weren't universal enough for the global
 * allowlist above (e.g. some languages localize a unit and others don't).
 *
 * This is a FROZEN baseline, not a growing allowlist: anything identical
 * to English in a given language that ISN'T already in that language's
 * list here fails the test below, so a future untranslated key is caught
 * immediately instead of silently shipping.
 */
const PER_LANGUAGE_ENGLISH_COGNATES: Record<string, string[]> = {
  fr: [
    "action.message",
    "adminJournalists.portfolio",
    "adminNews.colActions",
    "adminNews.colArticle",
    "adminNews.colDate",
    "adminNews.urlPlaceholder",
    "adminReports.action",
    "adminReports.total",
    "adminSupport.colTicket",
    "adminUsers.colActions",
    "adminUsers.colBadge",
    "adminUsers.planBusiness",
    "adminUsers.planEnterprise",
    "adminUsers.planPro",
    "adminUsers.total",
    "ads.dashboard.ctr",
    "ads.status.active",
    "ambassadors.region.europe",
    "apiKeys.colActions",
    "auth.welcomeTitle",
    "chat.attachment",
    "communityCode.e.category1",
    "communityCode.f.step4",
    "communityCode.f.step5",
    "communityCode.version",
    "communityCode.versionLabel",
    "composer.article",
    "composer.option",
    "contact.faqLabel",
    "creatorDash.tabAudience",
    "creatorDash.tableDate",
    "creatorDash.tableMessage",
    "faq.avatarSize.formatsVal",
    "faq.avatarSize.ratioVal",
    "faq.avatarSize.resolutionVal",
    "faq.bannerSize.formatsVal",
    "faq.bannerSize.ratioVal",
    "faq.bannerSize.resolutionVal",
    "faq.cat.administration",
    "faq.cat.marketPlus",
    "faq.chatImageSize.formatsVal",
    "faq.chatImageSize.resolutionVal",
    "faq.marketLimits.businessLabel",
    "faq.marketLimits.enterpriseLabel",
    "faq.marketLimits.proLabel",
    "faq.postImageSize.formatsVal",
    "faq.postImageSize.ratioVal",
    "faq.postImageSize.resolutionVal",
    "faq.postVideoSize.encodingVal",
    "faq.postVideoSize.formatsVal",
    "faq.questionsCount",
    "faq.whatIsMarketPlus.p1Bold",
    "faq.whatIsZrp.p1Bold",
    "footer.contact",
    "footer.faq",
    "help.contributionsCount",
    "help.deletion.importantTitle",
    "help.descriptionLabel",
    "help.hero.statImpactLabel",
    "help.imagesLabel",
    "help.plan.business",
    "help.plan.enterprise",
    "help.plan.pro",
    "help.section.marketplace.title",
    "help.statusActive",
    "investors.platform2Title",
    "investors.type4",
    "journalistDash.portfolioPlaceholder",
    "marketplace.description",
    "marketplace.heroTitle",
    "marketplace.photos",
    "marketplace.statusActive",
    "messages.title",
    "music.albumDetail.eyebrow",
    "music.albums.title",
    "music.artistDetail.albumsHeading",
    "music.artistDetail.singlesHeading",
    "music.common.pause",
    "music.common.volumeAria",
    "music.duration.minutes",
    "music.nav.albumsTitle",
    "music.nav.playlistsTitle",
    "music.shell.genrePlaceholder",
    "music.shell.genresHeading",
    "music.studio.explicitBadge",
    "music.studio.tabAlbums",
    "music.track.columnAlbum",
    "nav.admin",
    "nav.administration",
    "nav.messages",
    "nav.notifications",
    "nav.premium",
    "news.source",
    "newsCategory.crypto",
    "newsCategory.culture",
    "newsCategory.europe",
    "newsCategory.science",
    "notifications.title",
    "opportunity.descriptionLabel",
    "opportunity.externalUrlPlaceholder",
    "opportunity.statusActive",
    "opportunity.typeCollaboration",
    "opportunity.typeFreelance",
    "opportunity.typeHackathon",
    "opportunity.typeLabel",
    "play.duelsTitle",
    "play.heroTitle",
    "play.optionPlaceholder",
    "play.questionsLabel",
    "play.xp",
    "press.emailBadge",
    "press.faviconLabel",
    "press.logoLabel",
    "press.versionBadge",
    "pricing.planBusiness",
    "pricing.planPro",
    "pricing.supportStandard",
    "privacy.controller.p1Bold",
    "privacy.dataCollected.cookiesTitle",
    "privacy.dataCollected.interactionsTitle",
    "privacy.h.introduction",
    "privacy.intro.p1Bold",
    "privacy.nav.introduction",
    "privacy.rights.rectificationTitle",
    "professionalCategory.architecture",
    "professionalCategory.aviation",
    "professionalCategory.blockchain",
    "professionalCategory.construction",
    "professionalCategory.marine",
    "professionalCategory.podcasting",
    "settings.images",
    "stories.image",
    "support.categoryBug",
    "support.messageLabel",
    "team.colActions",
    "terms.h.introduction",
    "terms.intro.p1Bold",
    "terms.nav.introduction",
    "tipModal.charCount",
    "transparency.reasonSpam",
    "trust.categoryZrp",
    "trust.outOf100",
  ],
  de: [
    "adminNews.urlPlaceholder",
    "adminStorage.statInUploadThing",
    "adminUsers.badgeTeam",
    "adminUsers.planBusiness",
    "adminUsers.planEnterprise",
    "adminUsers.planFree",
    "adminUsers.planPro",
    "adminUsers.roleModerator",
    "ads.dashboard.ctr",
    "auth.welcomeTitle",
    "communityCode.e.category1",
    "communityCode.version",
    "contact.faqLabel",
    "faq.adminRoles.modLabel",
    "faq.avatarSize.formatsVal",
    "faq.avatarSize.maxFileSizeVal",
    "faq.avatarSize.ratioVal",
    "faq.avatarSize.resolutionVal",
    "faq.bannerSize.formatsVal",
    "faq.bannerSize.maxFileSizeVal",
    "faq.bannerSize.ratioVal",
    "faq.bannerSize.resolutionVal",
    "faq.chatImageSize.formatsVal",
    "faq.chatImageSize.maxFileSizeVal",
    "faq.chatImageSize.resolutionVal",
    "faq.hashtagsMentions.hashtagsBold",
    "faq.marketLimits.businessLabel",
    "faq.marketLimits.enterpriseLabel",
    "faq.marketLimits.freeLabel",
    "faq.marketLimits.proLabel",
    "faq.postImageSize.formatsVal",
    "faq.postImageSize.maxFileSizeVal",
    "faq.postImageSize.ratioVal",
    "faq.postImageSize.resolutionVal",
    "faq.postVideoSize.encodingVal",
    "faq.postVideoSize.formatsVal",
    "faq.postVideoSize.maxFileSizeVal",
    "faq.whatIsZrp.p1Bold",
    "footer.faq",
    "group.lastMessagePrefix",
    "help.hero.tagModeration",
    "help.plan.business",
    "help.plan.enterprise",
    "help.plan.pro",
    "investors.platform2Title",
    "journalistDash.portfolioPlaceholder",
    "music.albumDetail.eyebrow",
    "music.artistDetail.singlesHeading",
    "music.common.pause",
    "music.shell.genrePlaceholder",
    "music.shell.genresHeading",
    "music.studio.explicitBadge",
    "music.track.columnAlbum",
    "opportunity.externalUrlPlaceholder",
    "opportunity.typeHackathon",
    "play.heroTitle",
    "press.emailBadge",
    "press.faviconLabel",
    "press.versionBadge",
    "pricing.planBusiness",
    "pricing.planEnterprise",
    "pricing.planPro",
    "privacy.controller.p1Bold",
    "privacy.dataCollected.cookiesTitle",
    "privacy.intro.p1Bold",
    "professionalCategory.animationVFX",
    "professionalCategory.barPub",
    "professionalCategory.blockchain",
    "professionalCategory.catering",
    "professionalCategory.eCommerce",
    "professionalCategory.fitnessPersonalTraining",
    "professionalCategory.influencerCreator",
    "professionalCategory.investmentTrading",
    "professionalCategory.podcasting",
    "professionalCategory.restaurant",
    "professionalCategory.spaWellness",
    "support.categoryModeration",
    "terms.intro.p1Bold",
    "tipModal.charCount",
    "transparency.reasonSpam",
    "trust.categoryZrp",
    "trust.outOf100",
  ],
  it: [
    "adminNews.slugLabel",
    "adminNews.urlPlaceholder",
    "adminPayments.tx",
    "adminStorage.statInUploadThing",
    "adminUsers.planBusiness",
    "adminUsers.planEnterprise",
    "adminUsers.planFree",
    "adminUsers.planPro",
    "ads.dashboard.ctr",
    "ambassadors.region.africa",
    "ambassadors.region.asia",
    "ambassadors.region.oceania",
    "auth.welcomeTitle",
    "communityCode.e.category1",
    "communityCode.version",
    "contact.faqLabel",
    "faq.avatarSize.formatsVal",
    "faq.avatarSize.maxFileSizeVal",
    "faq.avatarSize.ratioVal",
    "faq.avatarSize.resolutionVal",
    "faq.bannerSize.formatsVal",
    "faq.bannerSize.maxFileSizeVal",
    "faq.bannerSize.ratioVal",
    "faq.bannerSize.resolutionVal",
    "faq.cat.marketPlus",
    "faq.cat.trustPassport",
    "faq.chatImageSize.formatsVal",
    "faq.chatImageSize.maxFileSizeVal",
    "faq.chatImageSize.resolutionVal",
    "faq.marketLimits.businessLabel",
    "faq.marketLimits.enterpriseLabel",
    "faq.marketLimits.freeLabel",
    "faq.marketLimits.proLabel",
    "faq.postImageSize.formatsVal",
    "faq.postImageSize.maxFileSizeVal",
    "faq.postImageSize.ratioVal",
    "faq.postImageSize.resolutionVal",
    "faq.postVideoSize.encodingVal",
    "faq.postVideoSize.formatsVal",
    "faq.postVideoSize.maxFileSizeVal",
    "faq.trustLocation.p1Bold",
    "faq.trustNotPopularity.noBold",
    "faq.trustVerification.passportCardTitle",
    "faq.whatIsMarketPlus.p1Bold",
    "faq.whatIsTrustPassport.p1Bold",
    "faq.whatIsZrp.p1Bold",
    "footer.faq",
    "footer.zrpNews",
    "group.lastMessagePrefix",
    "help.heroTitle",
    "help.plan.business",
    "help.plan.enterprise",
    "help.plan.pro",
    "help.section.aid.title",
    "help.section.marketplace.title",
    "help.section.music.title",
    "help.section.opportunity.title",
    "investors.platform2Title",
    "journalist.editor.slug",
    "journalistDash.portfolioPlaceholder",
    "marketplace.heroTitle",
    "music.duration.minutes",
    "music.studio.explicitBadge",
    "news.change24h",
    "opportunity.externalUrlPlaceholder",
    "opportunity.heroTitle",
    "opportunity.typeHackathon",
    "play.heroTitle",
    "play.xp",
    "press.emailBadge",
    "press.faviconLabel",
    "pricing.planBusiness",
    "pricing.planEnterprise",
    "pricing.planPro",
    "pricing.support247",
    "privacy.controller.p1Bold",
    "privacy.intro.p1Bold",
    "professionalCategory.automotive",
    "professionalCategory.blockchain",
    "professionalCategory.catering",
    "professionalCategory.podcasting",
    "profile.trustPassportTitle",
    "terms.intro.p1Bold",
    "tipModal.charCount",
    "transparency.reasonSpam",
    "trust.categoryZrp",
    "trust.outOf100",
  ],
  sq: [
    "adminNews.urlPlaceholder",
    "adminUsers.planBusiness",
    "adminUsers.planEnterprise",
    "adminUsers.planPro",
    "ads.dashboard.ctr",
    "auth.welcomeTitle",
    "communityCode.version",
    "faq.avatarSize.formatsVal",
    "faq.avatarSize.maxFileSizeVal",
    "faq.avatarSize.ratioVal",
    "faq.avatarSize.resolutionVal",
    "faq.bannerSize.formatsVal",
    "faq.bannerSize.maxFileSizeVal",
    "faq.bannerSize.ratioVal",
    "faq.bannerSize.resolutionVal",
    "faq.chatImageSize.formatsVal",
    "faq.chatImageSize.maxFileSizeVal",
    "faq.chatImageSize.resolutionVal",
    "faq.marketLimits.businessLabel",
    "faq.marketLimits.enterpriseLabel",
    "faq.marketLimits.proLabel",
    "faq.postImageSize.formatsVal",
    "faq.postImageSize.maxFileSizeVal",
    "faq.postImageSize.ratioVal",
    "faq.postImageSize.resolutionVal",
    "faq.postVideoSize.encodingVal",
    "faq.postVideoSize.formatsVal",
    "faq.postVideoSize.maxFileSizeVal",
    "faq.whatIsZrp.p1Bold",
    "group.lastMessagePrefix",
    "help.plan.business",
    "help.plan.enterprise",
    "help.plan.pro",
    "journalistDash.portfolioPlaceholder",
    "music.duration.minutes",
    "music.studio.explicitBadge",
    "news.change24h",
    "opportunity.externalUrlPlaceholder",
    "play.xp",
    "press.emailBadge",
    "pricing.planBusiness",
    "pricing.planEnterprise",
    "pricing.planPro",
    "pricing.support247",
    "privacy.controller.p1Bold",
    "privacy.intro.p1Bold",
    "professionalCategory.automotive",
    "professionalCategory.blockchain",
    "professionalCategory.cloudComputing",
    "professionalCategory.freelancer",
    "terms.intro.p1Bold",
    "tipModal.charCount",
    "trust.categoryZrp",
    "trust.outOf100",
  ],
  es: [
    "adminNews.slugLabel",
    "adminNews.urlPlaceholder",
    "adminPayments.tx",
    "adminReports.total",
    "adminSupport.colTicket",
    "adminTicket.planLabel",
    "adminUsers.colPlan",
    "adminUsers.planBusiness",
    "adminUsers.planEnterprise",
    "adminUsers.planPro",
    "adminUsers.total",
    "ads.dashboard.ctr",
    "ambassadors.region.asia",
    "apiKeys.errTitle",
    "auth.welcomeTitle",
    "communityCode.e.category1",
    "communityCode.version",
    "faq.avatarSize.formatsVal",
    "faq.avatarSize.maxFileSizeVal",
    "faq.avatarSize.ratioVal",
    "faq.avatarSize.resolutionVal",
    "faq.bannerSize.formatsVal",
    "faq.bannerSize.maxFileSizeVal",
    "faq.bannerSize.ratioVal",
    "faq.bannerSize.resolutionVal",
    "faq.chatImageSize.formatsVal",
    "faq.chatImageSize.maxFileSizeVal",
    "faq.chatImageSize.resolutionVal",
    "faq.marketLimits.businessLabel",
    "faq.marketLimits.enterpriseLabel",
    "faq.marketLimits.freeLabel",
    "faq.marketLimits.proLabel",
    "faq.postImageSize.formatsVal",
    "faq.postImageSize.maxFileSizeVal",
    "faq.postImageSize.ratioVal",
    "faq.postImageSize.resolutionVal",
    "faq.postVideoSize.encodingVal",
    "faq.postVideoSize.formatsVal",
    "faq.postVideoSize.maxFileSizeVal",
    "faq.trustNotPopularity.noBold",
    "faq.whatIsZrp.p1Bold",
    "feed.error",
    "footer.legalHeading",
    "group.lastMessagePrefix",
    "help.hero.statNetworkValue",
    "help.plan.business",
    "help.plan.enterprise",
    "help.plan.popular",
    "help.plan.pro",
    "investors.platform2Title",
    "journalist.editor.slug",
    "journalistDash.portfolioPlaceholder",
    "music.duration.minutes",
    "music.studio.explicitBadge",
    "nav.premium",
    "news.change24h",
    "opportunity.externalUrlPlaceholder",
    "play.scopeGlobal",
    "play.typeTrivia",
    "play.xp",
    "press.emailBadge",
    "press.faviconLabel",
    "pricing.planBusiness",
    "pricing.planEnterprise",
    "pricing.planPro",
    "pricing.support247",
    "privacy.controller.p1Bold",
    "privacy.dataCollected.cookiesTitle",
    "privacy.intro.p1Bold",
    "professionalCategory.blockchain",
    "professionalCategory.catering",
    "professionalCategory.podcasting",
    "stories.video",
    "support.categoryGeneral",
    "support.ticketDetail.priorityNormal",
    "team.roleEditor",
    "terms.badgeSuffix",
    "terms.intro.p1Bold",
    "tipModal.charCount",
    "transparency.reasonSpam",
    "trust.categoryZrp",
    "trust.outOf100",
  ],
  ru: [
    "adminNews.urlPlaceholder",
    "adminUsers.planBusiness",
    "adminUsers.planEnterprise",
    "adminUsers.planPro",
    "ads.dashboard.ctr",
    "communityCode.version",
    "faq.avatarSize.formatsVal",
    "faq.avatarSize.ratioVal",
    "faq.avatarSize.resolutionVal",
    "faq.bannerSize.formatsVal",
    "faq.bannerSize.ratioVal",
    "faq.bannerSize.resolutionVal",
    "faq.chatImageSize.formatsVal",
    "faq.chatImageSize.resolutionVal",
    "faq.marketLimits.businessLabel",
    "faq.marketLimits.enterpriseLabel",
    "faq.marketLimits.freeLabel",
    "faq.marketLimits.proLabel",
    "faq.postImageSize.formatsVal",
    "faq.postImageSize.ratioVal",
    "faq.postImageSize.resolutionVal",
    "faq.postVideoSize.encodingVal",
    "faq.postVideoSize.formatsVal",
    "faq.whatIsZrp.p1Bold",
    "group.lastMessagePrefix",
    "help.plan.business",
    "help.plan.enterprise",
    "help.plan.pro",
    "journalistDash.portfolioPlaceholder",
    "music.studio.explicitBadge",
    "onboarding.websitePlaceholder",
    "opportunity.externalUrlPlaceholder",
    "play.heroTitle",
    "play.xp",
    "press.emailBadge",
    "pricing.planBusiness",
    "pricing.planEnterprise",
    "pricing.planPro",
    "pricing.support247",
    "privacy.controller.p1Bold",
    "privacy.intro.p1Bold",
    "settings.websitePlaceholder",
    "team.emailPlaceholder",
    "terms.intro.p1Bold",
    "tipModal.charCount",
    "trust.categoryZrp",
    "trust.outOf100",
  ],
  ar: [
    "adminNews.urlPlaceholder",
    "adminUsers.planBusiness",
    "adminUsers.planEnterprise",
    "adminUsers.planPro",
    "communityCode.version",
    "faq.avatarSize.ratioVal",
    "faq.bannerSize.ratioVal",
    "faq.marketLimits.businessLabel",
    "faq.marketLimits.enterpriseLabel",
    "faq.marketLimits.proLabel",
    "faq.postImageSize.ratioVal",
    "faq.postVideoSize.encodingVal",
    "group.lastMessagePrefix",
    "help.plan.business",
    "help.plan.enterprise",
    "help.plan.pro",
    "journalistDash.portfolioPlaceholder",
    "music.studio.explicitBadge",
    "opportunity.externalUrlPlaceholder",
    "play.xp",
    "press.emailBadge",
    "pricing.planBusiness",
    "pricing.planEnterprise",
    "pricing.planPro",
    "team.emailPlaceholder",
    "tipModal.charCount",
    "trust.categoryZrp",
    "trust.outOf100",
  ],
  zh: [
    "adminNews.urlPlaceholder",
    "adminUsers.planBusiness",
    "adminUsers.planEnterprise",
    "adminUsers.planPro",
    "communityCode.version",
    "faq.avatarSize.maxFileSizeVal",
    "faq.avatarSize.ratioVal",
    "faq.bannerSize.maxFileSizeVal",
    "faq.bannerSize.ratioVal",
    "faq.chatImageSize.maxFileSizeVal",
    "faq.postImageSize.maxFileSizeVal",
    "faq.postImageSize.ratioVal",
    "faq.postVideoSize.encodingVal",
    "faq.postVideoSize.maxFileSizeVal",
    "journalistDash.portfolioPlaceholder",
    "music.studio.explicitBadge",
    "nav.aiAssistant",
    "onboarding.websitePlaceholder",
    "opportunity.externalUrlPlaceholder",
    "press.emailBadge",
    "settings.websitePlaceholder",
    "team.emailPlaceholder",
    "tipModal.charCount",
    "trust.categoryZrp",
    "trust.outOf100",
  ],
  tr: [
    "adminNews.urlPlaceholder",
    "adminTicket.planLabel",
    "adminUsers.colPlan",
    "adminUsers.planPro",
    "auth.welcomeTitle",
    "chat.contactVideo",
    "communityCode.e.category1",
    "communityCode.version",
    "faq.avatarSize.formatsVal",
    "faq.avatarSize.maxFileSizeVal",
    "faq.avatarSize.ratioVal",
    "faq.avatarSize.resolutionVal",
    "faq.bannerSize.formatsVal",
    "faq.bannerSize.maxFileSizeVal",
    "faq.bannerSize.ratioVal",
    "faq.bannerSize.resolutionVal",
    "faq.chatImageSize.formatsVal",
    "faq.chatImageSize.maxFileSizeVal",
    "faq.chatImageSize.resolutionVal",
    "faq.marketLimits.businessLabel",
    "faq.marketLimits.enterpriseLabel",
    "faq.marketLimits.freeLabel",
    "faq.marketLimits.proLabel",
    "faq.postImageSize.formatsVal",
    "faq.postImageSize.maxFileSizeVal",
    "faq.postImageSize.ratioVal",
    "faq.postImageSize.resolutionVal",
    "faq.postVideoSize.encodingVal",
    "faq.postVideoSize.formatsVal",
    "faq.postVideoSize.maxFileSizeVal",
    "faq.whatIsZrp.p1Bold",
    "group.lastMessagePrefix",
    "help.plan.business",
    "help.plan.enterprise",
    "help.plan.pro",
    "journalistDash.portfolioPlaceholder",
    "music.studio.explicitBadge",
    "nav.platform",
    "nav.premium",
    "opportunity.externalUrlPlaceholder",
    "opportunity.typeHackathon",
    "play.vs",
    "play.xp",
    "press.emailBadge",
    "press.faviconLabel",
    "press.logoLabel",
    "pricing.planPro",
    "privacy.controller.p1Bold",
    "privacy.intro.p1Bold",
    "professionalCategory.catering",
    "settings.video",
    "stories.video",
    "support.ticketDetail.priorityNormal",
    "team.emailPlaceholder",
    "terms.intro.p1Bold",
    "tipModal.charCount",
    "transparency.reasonSpam",
    "trust.categoryZrp",
    "trust.outOf100",
  ],
  id: [
    "adminNews.slugLabel",
    "adminNews.urlPlaceholder",
    "adminReports.total",
    "adminSupport.colStatus",
    "adminTicket.adminBadge",
    "adminTicket.statusFieldLabel",
    "adminUsers.colEmail",
    "adminUsers.colStatus",
    "adminUsers.planEnterprise",
    "adminUsers.planPro",
    "adminUsers.roleAdmin",
    "adminUsers.roleModerator",
    "adminUsers.total",
    "ambassadors.region.asia",
    "auth.email",
    "auth.welcomeTitle",
    "chat.contactVideo",
    "communityCode.e.category1",
    "communityCode.version",
    "communityCode.versionDate",
    "contact.faqLabel",
    "faq.adminRoles.adminLabel",
    "faq.adminRoles.modLabel",
    "faq.avatarSize.formatsVal",
    "faq.avatarSize.maxFileSizeVal",
    "faq.avatarSize.ratioVal",
    "faq.avatarSize.resolutionVal",
    "faq.bannerSize.formatsVal",
    "faq.bannerSize.maxFileSizeVal",
    "faq.bannerSize.ratioVal",
    "faq.bannerSize.resolutionVal",
    "faq.cat.web3Digital",
    "faq.chatImageSize.formatsVal",
    "faq.chatImageSize.maxFileSizeVal",
    "faq.chatImageSize.resolutionVal",
    "faq.marketLimits.businessLabel",
    "faq.marketLimits.enterpriseLabel",
    "faq.marketLimits.proLabel",
    "faq.postImageSize.formatsVal",
    "faq.postImageSize.maxFileSizeVal",
    "faq.postImageSize.ratioVal",
    "faq.postImageSize.resolutionVal",
    "faq.postVideoSize.encodingVal",
    "faq.postVideoSize.formatsVal",
    "faq.postVideoSize.maxFileSizeVal",
    "faq.whatIsZrp.p1Bold",
    "footer.faq",
    "group.lastMessagePrefix",
    "help.hero.statNetworkValue",
    "help.plan.business",
    "help.plan.enterprise",
    "help.plan.pro",
    "investors.platform2Title",
    "journalist.editor.slug",
    "journalistDash.portfolioPlaceholder",
    "music.albumDetail.eyebrow",
    "music.common.volumeAria",
    "music.shell.genrePlaceholder",
    "music.studio.explicitBadge",
    "music.track.columnAlbum",
    "nav.admin",
    "nav.platform",
    "nav.premium",
    "onboarding.bio",
    "opportunity.externalUrlPlaceholder",
    "opportunity.typeHackathon",
    "play.heroTitle",
    "play.scopeGlobal",
    "play.vs",
    "play.xp",
    "press.emailBadge",
    "press.emailLabel",
    "press.faviconLabel",
    "press.logoLabel",
    "pricing.planEnterprise",
    "pricing.planPro",
    "pricing.support247",
    "privacy.controller.p1Bold",
    "privacy.intro.p1Bold",
    "professionalCategory.barPub",
    "professionalCategory.blockchain",
    "professionalCategory.eCommerce",
    "professionalCategory.podcasting",
    "profile.media",
    "profile.tip",
    "settings.bio",
    "settings.video",
    "stories.video",
    "support.categoryBug",
    "support.ticketDetail.priorityNormal",
    "support.ticketDetail.statusLabel",
    "team.colEmail",
    "team.emailPlaceholder",
    "team.roleAdmin",
    "terms.intro.p1Bold",
    "tipModal.charCount",
    "transparency.reasonSpam",
    "trust.categoryZrp",
    "trust.outOf100",
  ],
  pt: [
    "adminNews.slugLabel",
    "adminReports.total",
    "adminUsers.total",
    "ads.dashboard.ctr",
    "chat.offline",
    "communityCode.e.category1",
    "faq.cat.marketPlus",
    "faq.whatIsMarketPlus.p1Bold",
    "footer.legalHeading",
    "group.lastMessagePrefix",
    "help.hero.cardStatus",
    "help.hero.statNetworkValue",
    "help.plan.popular",
    "help.section.marketplace.title",
    "investors.platform2Title",
    "investors.type4",
    "journalist.editor.slug",
    "music.artistDetail.singlesHeading",
    "music.common.volumeAria",
    "music.duration.minutes",
    "music.nav.playlistsTitle",
    "music.studio.explicitBadge",
    "nav.premium",
    "onboarding.website",
    "opportunity.typeFreelance",
    "opportunity.typeHackathon",
    "play.itemPlaceholder",
    "play.scopeGlobal",
    "play.vs",
    "play.xp",
    "press.emailBadge",
    "press.faviconLabel",
    "press.websiteLabel",
    "pricing.support247",
    "privacy.dataCollected.cookiesTitle",
    "professionalCategory.blockchain",
    "professionalCategory.catering",
    "professionalCategory.freelancer",
    "professionalCategory.podcasting",
    "settings.website",
    "support.ticketDetail.priorityNormal",
    "team.roleEditor",
    "terms.badgeSuffix",
    "tipModal.charCount",
    "transparency.daysValue",
    "transparency.hoursValue",
    "transparency.reasonSpam",
    "trust.outOf100",
  ],
  ja: [
    "ads.dashboard.ctr",
    "contact.faqLabel",
    "faq.cat.marketPlus",
    "faq.cat.trustPassport",
    "faq.whatIsMarketPlus.p1Bold",
    "faq.whatIsTrustPassport.p1Bold",
    "help.heroTitle",
    "help.music.studioHeading",
    "help.section.aid.title",
    "help.section.marketplace.title",
    "help.section.music.title",
    "help.section.opportunity.title",
    "investors.platform2Title",
    "journalist.editor.slugPlaceholder",
    "marketplace.heroTitle",
    "nav.aiAssistant",
    "opportunity.heroTitle",
    "play.heroTitle",
    "play.vs",
    "play.xp",
    "press.emailBadge",
    "tipModal.charCount",
    "trust.outOf100",
  ],
  ko: [
    "group.lastMessagePrefix",
    "journalist.editor.slugPlaceholder",
    "nav.aiAssistant",
    "play.vs",
    "play.xp",
    "press.emailBadge",
    "tipModal.charCount",
    "trust.outOf100",
  ],
  hi: [
    "adminPayments.tx",
    "group.lastMessagePrefix",
    "journalist.editor.slugPlaceholder",
    "music.studio.explicitBadge",
    "nav.aiAssistant",
    "play.xp",
    "press.emailBadge",
    "pricing.support247",
    "tipModal.charCount",
    "trust.outOf100",
  ],
};

const perLanguageCognateSets: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(PER_LANGUAGE_ENGLISH_COGNATES).map(([code, keys]) => [code, new Set(keys)])
);

/**
 * Translation keys whose value is a deliberately empty string in a
 * specific language - a sentence-fragment key (Prefix/Link/Rest, split so
 * an inline link or bold span can be rendered between fragments) where
 * that language's natural word order doesn't need anything in this
 * particular fragment. Confirmed by reading the sibling fragments: e.g.
 * Turkish moves the verb to the end of the sentence, so
 * "Go to the" + "Sign Up" + "page." (en) becomes "" + "Kayıt Ol" +
 * "sayfasına gidin." (tr) - the leading fragment is correctly empty, not
 * a missed translation.
 */
const INTENTIONALLY_EMPTY_VALUES: Record<string, Set<string>> = {
  tr: new Set([
    "faq.howToRegister.step1Prefix",
    "faq.howToLogin.step1Prefix",
    "faq.passwordReset.step1Prefix",
  ]),
  // Japanese is SOV like Turkish: "Go to the" + "Sign Up" + "page." (en)
  // naturally becomes "" + "サインアップ" + "ページにアクセスします。" (ja) -
  // the leading English verb phrase has no equivalent leading fragment
  // once the sentence is restructured around the trailing verb.
  ja: new Set([
    "faq.howToRegister.step1Prefix",
    "faq.howToLogin.step1Prefix",
    "faq.passwordReset.step1Prefix",
    "faq.deleteAccountFaq.step1Prefix",
    "faq.supportTickets.step1Prefix",
    "faq.trackTickets.step1Prefix",
    "privacy.intro.p1Prefix",
  ]),
  // Korean is also SOV: "Open the" + "Support" + "page." (en) becomes
  // "" + "지원" + " 페이지를 열어보세요." (ko) for the same reason.
  ko: new Set([
    "faq.supportTickets.step1Prefix",
    "privacy.intro.p1Prefix",
  ]),
};

describe("translations dictionary completeness (localization CI gate)", () => {
  it("every supported language has a real dictionary entry", () => {
    for (const { code } of SUPPORTED_LANGUAGES) {
      expect(translations[code], `translations.${code} is missing`).toBeTruthy();
    }
  });

  it("every language has EXACTLY the same key set as English - no missing, no extra", () => {
    const englishKeySet = new Set(englishKeys);
    for (const { code } of SUPPORTED_LANGUAGES) {
      if (code === "en") continue;
      const dict = asDict(translations[code]);
      const keySet = new Set(Object.keys(dict));
      const missing = englishKeys.filter((k) => !keySet.has(k));
      const extra = Array.from(keySet).filter((k) => !englishKeySet.has(k));
      expect(missing, `${code} is missing keys: ${missing.slice(0, 20).join(", ")}`).toHaveLength(0);
      expect(extra, `${code} has extra keys not in English: ${extra.slice(0, 20).join(", ")}`).toHaveLength(0);
    }
  });

  it("no translation value is an empty string, except reviewed sentence-fragment keys", () => {
    for (const { code } of SUPPORTED_LANGUAGES) {
      const dict = asDict(translations[code]);
      const allowedEmpty = INTENTIONALLY_EMPTY_VALUES[code] ?? new Set<string>();
      const empties = Object.entries(dict)
        .filter(([k, v]) => (typeof v !== "string" || v.trim().length === 0) && !allowedEmpty.has(k))
        .map(([k]) => k);
      expect(empties, `${code} has empty values for: ${empties.slice(0, 20).join(", ")}`).toHaveLength(0);
    }
  });

  it("no translation value is a raw, unresolved translation key", () => {
    // A value that's identical to its own key (e.g. "settings.tabSecurity"
    // stored as the value "settings.tabSecurity") means a lookup fell
    // through with nothing resolved - the literal key leaked to the UI.
    for (const { code } of SUPPORTED_LANGUAGES) {
      const dict = asDict(translations[code]);
      const leaked = Object.entries(dict)
        .filter(([k, v]) => v === k)
        .map(([k]) => k);
      expect(leaked, `${code} exposes raw keys as values: ${leaked.join(", ")}`).toHaveLength(0);
    }
  });

  it("no non-English value is an un-reviewed byte-for-byte copy of the English source", () => {
    for (const { code } of SUPPORTED_LANGUAGES) {
      if (code === "en") continue;
      const dict = asDict(translations[code]);
      const cognates = perLanguageCognateSets[code] ?? new Set<string>();
      const unreviewedCopies = englishKeys.filter((k) => {
        const enValue = englishDict[k];
        const value = dict[k];
        if (value !== enValue) return false;
        if (INTENTIONALLY_ENGLISH_VALUES.has(enValue)) return false;
        if (cognates.has(k)) return false;
        return true;
      });
      expect(
        unreviewedCopies,
        `${code} has ${unreviewedCopies.length} untranslated (English-copy) value(s) not in the ` +
          `reviewed exceptions list: ${unreviewedCopies.slice(0, 20).join(", ")}` +
          (unreviewedCopies.length > 20 ? ` (+${unreviewedCopies.length - 20} more)` : "")
      ).toHaveLength(0);
    }
  });

  it("every {placeholder} interpolation token in English exists in every other language's value for the same key", () => {
    const placeholderRe = /\{[a-zA-Z0-9_]+\}/g;
    // {s} is not a real interpolated value - callers pass it as a literal
    // English pluralization suffix (`s: count !== 1 ? "s" : ""`, see
    // apiKeys.keyCount/team.memberCount). English pluralizes by
    // concatenating "-s"; most other languages don't, so a translation
    // correctly omits {s} entirely once it has handled plural/singular
    // some other way (e.g. German's "Mitglied(er)"). Every OTHER
    // placeholder (real data: {name}, {count}, {title}, ...) still must
    // round-trip exactly.
    const OPTIONAL_TOKENS = new Set(["{s}"]);
    for (const { code } of SUPPORTED_LANGUAGES) {
      if (code === "en") continue;
      const dict = asDict(translations[code]);
      const mismatches: string[] = [];
      for (const key of englishKeys) {
        const enTokens = new Set(
          (englishDict[key].match(placeholderRe) ?? []).filter((t) => !OPTIONAL_TOKENS.has(t))
        );
        if (enTokens.size === 0) continue;
        const value = dict[key];
        if (typeof value !== "string") {
          mismatches.push(key);
          continue;
        }
        const valueTokens = new Set(value.match(placeholderRe) ?? []);
        const missing = Array.from(enTokens).filter((t) => !valueTokens.has(t));
        if (missing.length > 0) mismatches.push(`${key} (missing ${missing.join(", ")})`);
      }
      expect(
        mismatches,
        `${code} has placeholder mismatches: ${mismatches.slice(0, 20).join("; ")}`
      ).toHaveLength(0);
    }
  });
});
