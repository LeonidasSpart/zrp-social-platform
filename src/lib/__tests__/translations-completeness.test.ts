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
  // Advanced Search: international tech loanwords that French (and
  // several other Latin-script languages, already caught by this same
  // exception via the shared English value) genuinely renders
  // unchanged - "Hashtag(s)" and "GIF(s)" are acronyms/coinages with no
  // native equivalent, and "Photos" happens to be spelled identically
  // in French.
  "Hashtags",
  "Photos",
  "GIFs",
  "Videos",
  "Media",
  "All media",
  "Trending",
  "Filters",
  "Relevance",
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
  // Pure numeric/format template with no actual words to translate
  "{count}/{max}",
  // Placeholder examples shown in form fields
  "https://your-site.com",
  "https://your-website.com",
  "https://...",
  "https://…",
  "user@example.com",
  // The brand itself
  "ZRP",
  "ZRP Social",
  "ZRP Shorts",
  "ZRP PLAY",
  "ZRP Launchpad",
  // Third-party payment brand names - never translated in any language
  "PayPal",
  // ISO banking standard acronyms - identical in every language (French/
  // CJK values legitimately differ only in spacing/colon width, which
  // already makes them distinct from this exact English string).
  "IBAN:",
  "BIC:",
  // Investor page (investors.* namespace): a bare digit or a lone
  // sentence-final period used to close a fragment-pair sentence around an
  // inline link (investors.traction.noteEnd/impact.bodyAfter/
  // businessModel.pricingNoteEnd) - not language content, so identical
  // across every language by construction.
  ".",
  "4",
  "39",
  // Registered-user count - some languages' translators kept the Western
  // thousands-separator style rather than adapting it, which is a valid
  // locale choice, not a missed translation.
  "195,000+",
  // A comma list of product/platform proper nouns (Web, PWA, Android, iOS)
  // - none of which translate - the exact same pattern as the JPEG/MP4
  // format lists above.
  "Web, PWA, Android, iOS",
  // ZRP-native Launchpad (zrpCreate.* fee-disclosure copy and the
  // tokenDetail.* venue-identity badge): deliberately shipped as an
  // accurate English fallback rather than a mechanically-translated string
  // that could misstate ZRP's real on-chain fee model or a token's real
  // origin - "accurate in English" over "wrong in the user's own
  // language", same policy already applied elsewhere in this file. Revisit
  // once these get real per-language review.
  "Launch a token on ZRP's own bonding curve - tradable immediately, no liquidity needed upfront. ZRP charges a creation fee and a small protocol fee on every buy/sell, enforced entirely on-chain.",
  "ZRP's creation fee and trading fees are enforced on-chain and shown above before you confirm - never a surprise after the fact.",
  "Launched on ZRP",
  "Launched on Pump.fun (legacy)",
  "ZRP direct mint",
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
    "adminLiveGifts.colActions", // "Actions" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.colDate", // "Date" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.colTotal", // "Total" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.colAnimation", // "Animation" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminAnnouncements.typeMaintenance", // "Maintenance" is a genuine French word, not an untranslated copy
    "adminAnnouncements.formBodyLabel", // "Message" is a genuine French word, not an untranslated copy
    "adminAnnouncements.formTypeLabel", // "Type" is a genuine French word, not an untranslated copy
    "liveAudio.visibilityPublic", // legitimate international/borrowed cognate, not an untranslated copy
    "investors.traction.heading",
    "investors.types.familyOffice",
    "investors.platform.music.title",
    "investors.platform.news.title",
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
    "communities.category.nature",
    "communities.create.descriptionLabel",
    "communities.create.hashtagLabel",
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
    "lists.create.descriptionLabel",
    "terms.nav.introduction",
    "tipModal.charCount",
    "transparency.reasonSpam",
    "trust.categoryZrp",
    "trust.outOf100",
    // "vote"/"votes" and "Mentions" are the actual French words for
    // these concepts (regular -s plural, same spelling as English) -
    // not untranslated leftovers.
    "poll.totalVoteSingular",
    "poll.totalVotePlural",
    "poll.optionVoteCount",
    "emailPreferences.prefMentions",
    "adminNewsNetwork.title",
    "adminNewsNetwork.sourceHealth",
    "adminNewsNetwork.tabSources",
    "adminNewsNetwork.tabPublications",
    "adminNewsNetwork.sourcesUnit",
    "adminSubscriptions.colActions",
    "adminSubscriptionDetail.colDate",
    "adminNewsNetwork.scoreLabel",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.createToken.descriptionLabel", // "Description" is a genuine cognate/established loanword in this language
    "launchpad.daoDetail.quorumLabel", // "Quorum" is a genuine cognate/established loanword in this language
    "launchpad.daoDetail.statusActive", // "ACTIVE" status label kept identical (short/invariant form)
    "launchpad.daoPropose.descriptionLabel", // "Description" is a genuine cognate/established loanword in this language
    "launchpad.daoProposalDetail.statusActive", // "ACTIVE" status label kept identical (short/invariant form)
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingPositions.statusActive", // "Active" status label kept identical (short/invariant form)
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.descriptionLabel", // "Description" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingCreate.collectionLabel", // "Collection" is a genuine cognate/established loanword in this language
    "launchpad.nftCreate.imageLabel", // "Image" is a genuine cognate/established loanword in this language
    "launchpad.nftCreate.descriptionLabel", // "Description" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingPositions.statusActive", // "Active" status label kept identical (short/invariant form)
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.curve.volumeLabel", // "Volume" is a genuine cognate (identical French word, same meaning)
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.metricVolume", // "Volume" is a genuine cognate/established loanword in this language
  ],
  de: [
    "adminLiveGifts.colAnimation", // "Animation" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.statAudioVsVideo", // "Audio vs. Video" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminAnnouncements.typeUpdate", // "Update" is a genuine established German loanword, not an untranslated copy
    "liveAudio.visibilityCommunity", // legitimate international/borrowed cognate, not an untranslated copy
    "liveAudio.communityLabel", // legitimate international/borrowed cognate, not an untranslated copy
    "liveAudio.moderatorBadge", // legitimate international/borrowed cognate, not an untranslated copy
    "investors.hero.badge",
    "investors.meta.title",
    "investors.roadmap.heading",
    "investors.platform.marketplace.title",
    "investors.traction.heading",
    "investors.platform.music.title",
    "investors.platform.news.title",
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
    "communities.create.hashtagLabel",
    "communities.create.nameLabel",
    "communities.title",
    "communityCode.e.category1",
    "communityCode.version",
    "contact.faqLabel",
    "explore.tabs.communities",
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
    "lists.create.nameLabel",
    "music.albumDetail.eyebrow",
    "music.artistDetail.singlesHeading",
    "music.common.pause",
    "music.shell.genrePlaceholder",
    "music.shell.genresHeading",
    "music.studio.explicitBadge",
    "music.track.columnAlbum",
    "nav.communities",
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
    // "Bank" is the same word in German.
    "upgradeRequest.bankLabel",
    "adminNewsNetwork.title",
    "adminNewsNetwork.tabFeeds",
    "adminNewsNetwork.pilotOnly",
    "adminNewsNetwork.verificationFailedNamed",
    "adminSubscriptions.filterPlan",
    "adminSubscriptions.filterStatus",
    "adminSubscriptions.colPlan",
    "adminSubscriptions.colStatus",
    "adminSubscriptionDetail.fieldPlan",
    "adminSubscriptionDetail.fieldStatus",
    "adminSubscriptionDetail.planLabel",
    "adminSubscriptionDetail.colPlan",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.createToken.nameLabel", // "Name" is a genuine cognate/established loanword in this language
    "launchpad.createToken.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.createToken.websitePlaceholder", // "Website (optional)" — platform brand name / optional-field label kept identical
    "launchpad.createToken.twitterPlaceholder", // "Twitter/X (optional)" — platform brand name / optional-field label kept identical
    "launchpad.createToken.telegramPlaceholder", // "Telegram (optional)" — platform brand name / optional-field label kept identical
    "launchpad.createToken.discordPlaceholder", // "Discord (optional)" — platform brand name / optional-field label kept identical
    "launchpad.dao.title", // "DAOs" is an acronym/industry term, kept untranslated
    "launchpad.daoDetail.quorumLabel", // "Quorum" is a genuine cognate/established loanword in this language
    "launchpad.daoProposalDetail.statusLabel", // "Status: {status}" template — the fixed/label portion is a genuine cognate
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingPositions.statusUnstaked", // "Unstaked" status label kept identical (short/invariant form)
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.nfts", // "NFTs" is an acronym/industry term, kept untranslated
    "launchpad.home.daos", // "DAOs" is an acronym/industry term, kept untranslated
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.tokenDetail.website", // "Website" is a genuine cognate/established loanword in this language
    "launchpad.ido.capRange", // "Cap: ${softCap} - ${hardCap}" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.nft.title", // "ZRP NFTs" is a genuine cognate/established loanword in this language
    "launchpad.nftCreate.nameLabel", // "Name" is a genuine cognate/established loanword in this language
    "launchpad.nftCreate.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.scanner.supplyLabel", // "Supply" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingPositions.statusUnstaked", // "Unstaked" status label kept identical (short/invariant form)
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  it: [
    "adminLiveGifts.no", // "No" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "liveAudio.visibilityCommunity", // legitimate international/borrowed cognate, not an untranslated copy
    "liveAudio.communityLabel", // legitimate international/borrowed cognate, not an untranslated copy
    "liveAudio.hostBadge", // legitimate international/borrowed cognate, not an untranslated copy
    "investors.roadmap.heading",
    "investors.traction.heading",
    "investors.types.vc",
    "investors.platform.music.title",
    "investors.platform.news.title",
    "hashtag.postSingular",
    "adminNews.slugLabel",
    "adminNews.urlPlaceholder",
    "adminPayments.tx",
    "adminStorage.statInUploadThing",
    "adminUsers.planBusiness",
    "adminUsers.planEnterprise",
    "adminUsers.planFree",
    "adminUsers.planPro",
    "ads.dashboard.ctr",
    "communities.create.hashtagLabel",
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
    "adminNewsNetwork.title",
    "adminNewsNetwork.verificationFailedNamed",
    "adminSubscriptionDetail.no",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.daoDetail.quorumLabel", // "Quorum" is a genuine cognate/established loanword in this language
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.ido.capRange", // "Cap: ${softCap} - ${hardCap}" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftCreate.royaltyLabel", // "Royalty (%)" is a genuine cognate/established loanword in this language
    "launchpad.nftDetail.royalty", // "Royalty: {percent}%" template — the fixed/label portion is a genuine cognate
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.stakeHeading", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.curve.volumeLabel", // "Volume" is a genuine cognate (identical spelling, same meaning)
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.metricVolume", // "Volume" is a genuine cognate/established loanword in this language
  ],
  sq: [
    "investors.platform.music.title",
    "investors.platform.news.title",
    "adminNews.urlPlaceholder",
    "adminUsers.planBusiness",
    "adminUsers.planEnterprise",
    "adminUsers.planPro",
    "ads.dashboard.ctr",
    "auth.welcomeTitle",
    "communities.create.hashtagLabel",
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
    "adminNewsNetwork.title",
    "adminNewsNetwork.pilotOnly",
    "adminNewsNetwork.verificationFailedNamed",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.farming.title", // "Liquidity farming" is a genuine cognate/established loanword in this language
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.liquidityFarming", // "Liquidity farming" is a genuine cognate/established loanword in this language
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.lockDaysValue", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  es: [
    "adminLiveGifts.colTotal", // "Total" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.no", // "No" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "investors.types.familyOffice",
    "investors.platform.music.title",
    "investors.platform.news.title",
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
    "communities.category.general",
    "communities.create.hashtagLabel",
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
    "adminNewsNetwork.title",
    "adminNewsNetwork.tabFeeds",
    "adminNewsNetwork.verificationFailedNamed",
    "adminSubscriptions.filterPlan",
    "adminSubscriptions.colPlan",
    "adminSubscriptionDetail.fieldPlan",
    "adminSubscriptionDetail.no",
    "adminSubscriptionDetail.planLabel",
    "adminSubscriptionDetail.colPlan",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.daoDetail.tokenAmount", // "{value} tokens" template — the fixed/label portion is a genuine cognate
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.stakeHeading", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.depositSymbolFallback", // "tokens" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  ru: [
    "investors.platform.music.title",
    "investors.platform.news.title",
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
    "adminNewsNetwork.title",
    "adminNewsNetwork.verificationFailedNamed",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  ar: [
    "investors.platform.music.title",
    "investors.platform.news.title",
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
    "adminNewsNetwork.title",
    "adminNewsNetwork.verificationFailedNamed",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.nfts", // "NFTs" is an acronym/industry term, kept untranslated
    "launchpad.nft.title", // "ZRP NFTs" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  zh: [
    "investors.platform.music.title",
    "investors.platform.news.title",
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
    "adminNewsNetwork.title",
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  tr: [
    "investors.platform.music.title",
    "investors.platform.news.title",
    "adminNews.urlPlaceholder",
    "adminTicket.planLabel",
    "adminUsers.colPlan",
    "adminUsers.planPro",
    "auth.welcomeTitle",
    "chat.contactVideo",
    "communities.create.hashtagLabel",
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
    "adminNewsNetwork.title",
    "adminNewsNetwork.pilotOnly",
    "adminNewsNetwork.verificationFailedNamed",
    "adminSubscriptions.filterPlan",
    "adminSubscriptions.colPlan",
    "adminSubscriptionDetail.fieldPlan",
    "adminSubscriptionDetail.planLabel",
    "adminSubscriptionDetail.colPlan",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingCreate.minStakeLabel", // "Minimum stake" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.minStakeLabel", // "Minimum stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  id: [
    "adminLiveGifts.colStatus", // "Status" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.colTotal", // "Total" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "liveAudio.hostBadge", // legitimate international/borrowed cognate, not an untranslated copy
    "liveAudio.moderatorBadge", // legitimate international/borrowed cognate, not an untranslated copy
    "investors.platform.marketplace.title",
    "investors.platform.music.title",
    "investors.platform.news.title",
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
    // "Bank" is a standard Indonesian loanword, same spelling as English.
    "upgradeRequest.bankLabel",
    "adminNewsNetwork.title",
    "adminNewsNetwork.pilotOnly",
    "adminNewsNetwork.verificationFailedNamed",
    "adminSubscriptions.filterStatus",
    "adminSubscriptions.filterInterval",
    "adminSubscriptions.colStatus",
    "adminSubscriptionDetail.fieldStatus",
    "adminSubscriptionDetail.fieldInterval",
    "adminSubscriptionDetail.intervalLabel",
    "adminSubscriptionDetail.colInterval",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.dao.proposalCountOne", // "{count} proposal" template — the fixed/label portion is a genuine cognate
    "launchpad.daoProposalDetail.choiceAbstain", // "ABSTAIN" vote-choice label kept identical (short/invariant form)
    "launchpad.daoProposalDetail.abstainLabel", // "Abstain" is a genuine cognate/established loanword in this language
    "launchpad.daoProposalDetail.statusLabel", // "Status: {status}" template — the fixed/label portion is a genuine cognate
    "launchpad.farming.title", // "Liquidity farming" is a genuine cognate/established loanword in this language
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.farmingPositions.statusUnstaked", // "Unstaked" status label kept identical (short/invariant form)
    "launchpad.farmingPositions.unstakeButton", // "Unstake" is a genuine cognate/established loanword in this language
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.liquidityFarming", // "Liquidity farming" is a genuine cognate/established loanword in this language
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingPositions.unstakeNftButton", // "Unstake NFT" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.stakeHeading", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingPositions.statusUnstaked", // "Unstaked" status label kept identical (short/invariant form)
    "launchpad.stakingPositions.unstakeButton", // "Unstake" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.curve.volumeLabel", // "Volume" is a genuine cognate (identical spelling, same meaning)
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.metricVolume", // "Volume" is a genuine cognate/established loanword in this language
  ],
  pt: [
    "adminLiveGifts.colTotal", // "Total" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "investors.types.familyOffice",
    "investors.platform.music.title",
    "investors.platform.news.title",
    "adminNews.slugLabel",
    "adminReports.total",
    "adminUsers.total",
    "ads.dashboard.ctr",
    "chat.offline",
    "communities.create.hashtagLabel",
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
    "adminNewsNetwork.title",
    "adminNewsNetwork.tabFeeds",
    "adminNewsNetwork.verificationFailedNamed",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.dao.title", // "DAOs" is an acronym/industry term, kept untranslated
    "launchpad.daoDetail.tokenAmount", // "{value} tokens" template — the fixed/label portion is a genuine cognate
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.nfts", // "NFTs" is an acronym/industry term, kept untranslated
    "launchpad.home.daos", // "DAOs" is an acronym/industry term, kept untranslated
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.tokenDetail.website", // "Website" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.ido.capRange", // "Cap: ${softCap} - ${hardCap}" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.lockDaysValue", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.nft.title", // "ZRP NFTs" is a genuine cognate/established loanword in this language
    "launchpad.nftCreate.royaltyLabel", // "Royalty (%)" is a genuine cognate/established loanword in this language
    "launchpad.nftDetail.royalty", // "Royalty: {percent}%" template — the fixed/label portion is a genuine cognate
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.depositSymbolFallback", // "tokens" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.curve.volumeLabel", // "Volume" is a genuine cognate (identical spelling, same meaning)
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.metricVolume", // "Volume" is a genuine cognate/established loanword in this language
  ],
  ja: [
    "investors.platform.music.title",
    "investors.platform.news.title",
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
    "adminNewsNetwork.title",
    "adminNewsNetwork.verificationFailedNamed",
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
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
    "adminNewsNetwork.title",
    "adminNewsNetwork.verificationFailedNamed",
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
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
    "adminNewsNetwork.title",
    "adminNewsNetwork.verificationFailedNamed",
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  nl: [
    "adminLiveGifts.colStatus", // "Status" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.statDailyTrend", // "Trend" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminAnnouncements.typeUpdate", // "Update" is a genuine established Dutch loanword, not an untranslated copy
    "adminAnnouncements.formTypeLabel", // "Type" is a genuine established Dutch loanword, not an untranslated copy
    "liveAudio.visibilityCommunity", // legitimate international/borrowed cognate, not an untranslated copy
    "liveAudio.communityLabel", // legitimate international/borrowed cognate, not an untranslated copy
    "liveAudio.hostBadge", // legitimate international/borrowed cognate, not an untranslated copy
    "liveAudio.moderatorBadge", // legitimate international/borrowed cognate, not an untranslated copy
    "investors.roadmap.heading",
    "investors.technology.crossPlatform.title",
    "investors.types.familyOffice",
    "hashtag.postSingular",
    "hashtag.postPlural",
    "action.repost",
    "sharePost.recentChats",
    "adminAds.budgetSummary",
    "adminDash.admins",
    "adminDash.moderators",
    "adminDash.title",
    "adminHelpWithdrawals.wallet",
    "adminJournalists.portfolio",
    "adminMarketplace.title",
    "adminNews.feedbackPrefix",
    "adminNews.slugLabel",
    "adminPayments.tx",
    "adminPosts.title",
    "adminReports.details",
    "adminStorage.statInUploadThing",
    "adminSupport.colStatus",
    "adminSupport.colTicket",
    "adminTicket.adminBadge",
    "adminTicket.statusFieldLabel",
    "adminUsers.admins",
    "adminUsers.colBadge",
    "adminUsers.colPosts",
    "adminUsers.colStatus",
    "adminUsers.mods",
    "adminUsers.roleAdmin",
    "adminUsers.roleModerator",
    "adminWithdrawals.wallet",
    "ads.dashboard.ctr",
    "ambassadors.levels.communityLeader",
    "ambassadors.levels.explorer",
    "ambassadors.region.antarctica",
    "analytics.likes",
    "analytics.posts",
    "analytics.reposts",
    "chat.attachment",
    "chat.contactVideo",
    "chat.live",
    "chat.offline",
    "communities.create.hashtagLabel",
    "communities.title",
    "communityCode.e.category1",
    "contentPerf.likes",
    "contentPerf.reposts",
    "creatorDash.tabContent",
    "creatorDash.tipsLabel",
    "explore.postCount",
    "explore.tabs.communities",
    "explore.tabs.trending",
    "faq.adminRoles.adminLabel",
    "faq.adminRoles.modLabel",
    "faq.cat.marketPlus",
    "faq.cat.trustPassport",
    "faq.hashtagsMentions.hashtagsBold",
    "faq.supportTickets.step1Link",
    "faq.trackTickets.step1Prefix",
    "faq.trustLocation.p1Bold",
    "faq.trustVerification.passportCardTitle",
    "faq.whatIsMarketPlus.p1Bold",
    "faq.whatIsTrustPassport.p1Bold",
    "footer.contact",
    "footer.madeInSwitzerland",
    "footer.zrpNews",
    "group.lastMessagePrefix",
    "help.aid.browseLink",
    "help.cta.badge",
    "help.deletion.step2Title",
    "help.hero.cardStatus",
    "help.hero.statImpactLabel",
    "help.hero.statPrivacyLabel",
    "help.hero.tagCreators",
    "help.hero.tagPrivacy",
    "help.hero.tagSupport",
    "help.hero.tagTrustPassport",
    "help.heroTitle",
    "help.music.browseLink",
    "help.opportunity.browseLink",
    "help.planFeature.name.polls",
    "help.section.aid.title",
    "help.section.businessFeatures.title",
    "help.section.marketplace.title",
    "help.section.music.title",
    "help.section.opportunity.title",
    "help.section.trustPassport.title",
    "help.support.openSupportBtn",
    "help.support.step1Title",
    "help.trustPassport.privacyByDesignTitle",
    "help.trustPassport.whereFindBold",
    "home.openZrpMusic",
    "investors.platform2Title",
    "investors.statLiveValue",
    "investors.type4",
    "journalist.editor.slug",
    "marketplace.filters",
    "marketplace.heroTitle",
    "music.albumDetail.eyebrow",
    "music.albums.title",
    "music.artistDetail.albumsHeading",
    "music.artistDetail.singlesHeading",
    "music.artistDetail.tracksHeading",
    "music.common.shuffle",
    "music.common.volumeAria",
    "music.count.tracksOne",
    "music.count.tracksOther",
    "music.duration.minutes",
    "music.nav.albumsTitle",
    "music.shell.genrePlaceholder",
    "music.shell.genresHeading",
    "music.studio.explicitBadge",
    "music.studio.tabAlbums",
    "music.studio.tabTracks",
    "music.track.columnAlbum",
    "nav.account",
    "nav.admin",
    "nav.aiAssistant",
    "nav.communities",
    "nav.help",
    "nav.home",
    "nav.journalist",
    "nav.marketplace",
    "nav.platform",
    "nav.premium",
    "nav.shorts",
    "newsCategory.community",
    "newsCategory.crypto",
    "newsCategory.gaming",
    "onboarding.bio",
    "onboarding.website",
    "opportunity.heroTitle",
    "opportunity.typeFreelance",
    "opportunity.typeHackathon",
    "opportunity.typeLabel",
    "opportunity.typeTraining",
    "play.duelsTitle",
    "play.heroTitle",
    "play.level",
    "play.typeTrivia",
    "play.vs",
    "play.xp",
    "postDetail.sortLikes",
    "postDetail.sortRecent",
    "postDetail.sortRelevant",
    "press.emailBadge",
    "press.faviconLabel",
    "press.logoLabel",
    "press.notJustAnotherNetwork",
    "press.websiteLabel",
    "pricing.featureSupport",
    "pricing.support247",
    "privacy.badgeSuffix",
    "privacy.contact.privacyLabel",
    "privacy.contact.supportLabel",
    "privacy.dataCollected.contentTitle",
    "privacy.dataCollected.cookiesTitle",
    "privacy.summary.byDesignTitle",
    "professionalCategory.automotive",
    "professionalCategory.blockchain",
    "professionalCategory.catering",
    "professionalCategory.freelancer",
    "professionalCategory.podcasting",
    "professionalCategory.restaurant",
    "profile.likes",
    "profile.media",
    "profile.milestonePosts10",
    "profile.milestonePosts100",
    "profile.milestonePosts500",
    "profile.posts",
    "profile.reposts",
    "profile.tip",
    "profile.trustPassportBadge",
    "profile.trustPassportTitle",
    "reposts.count",
    "reposts.title",
    "rightPanel.postsCount",
    "rightPanel.trending",
    "search.postsTab",
    "settings.bio",
    "settings.dashboard",
    "settings.posts",
    "settings.privacyTitle",
    "settings.video",
    "settings.website",
    "shorts.premiumLockedTitle",
    "shorts.repost",
    "stories.video",
    "support.categoryAccount",
    "support.categoryBug",
    "support.categoryContent",
    "support.categoryPrivacy",
    "support.ticketDetail.priorityUrgent",
    "support.ticketDetail.statusLabel",
    "support.ticketDetail.supportBadge",
    "support.tickets.statusOpen",
    "team.roleAdmin",
    "terms.summary.privacyTitle",
    "time.daysShort",
    "time.minutesShort",
    "tipModal.charCount",
    "transparency.daysValue",
    "transparency.reasonSpam",
    "trust.categoryCommunity",
    "trust.headerTitle",
    "trust.outOf100",
    "trust.statPosts",
    "upgradeRequest.bankLabel",
    "adminNewsNetwork.title",
    "adminNewsNetwork.tabFeeds",
    "adminNewsNetwork.pilotOnly",
    "adminNewsNetwork.postsUnit",
    "adminNewsNetwork.verificationFailedNamed",
    "adminSubscriptions.filterStatus",
    "adminSubscriptions.filterInterval",
    "adminSubscriptions.colStatus",
    "adminSubscriptionDetail.fieldStatus",
    "adminSubscriptionDetail.fieldInterval",
    "adminSubscriptionDetail.intervalLabel",
    "adminSubscriptionDetail.colInterval",
    "adminNewsNetwork.scoreLabel",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.daoCreate.quorumLabel", // "Quorum (tokens)" is a genuine cognate/established loanword in this language
    "launchpad.daoDetail.quorumLabel", // "Quorum" is a genuine cognate/established loanword in this language
    "launchpad.daoDetail.tokenAmount", // "{value} tokens" template — the fixed/label portion is a genuine cognate
    "launchpad.daoProposalDetail.statusLabel", // "Status: {status}" template — the fixed/label portion is a genuine cognate
    "launchpad.farming.title", // "Liquidity farming" is a genuine cognate/established loanword in this language
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.farmingPositions.statusUnstaked", // "Unstaked" status label kept identical (short/invariant form)
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.liquidityFarming", // "Liquidity farming" is a genuine cognate/established loanword in this language
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.tokenDetail.website", // "Website" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.ido.capRange", // "Cap: ${softCap} - ${hardCap}" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.lockDaysValue", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.nftCreate.royaltyLabel", // "Royalty (%)" is a genuine cognate/established loanword in this language
    "launchpad.nftDetail.royalty", // "Royalty: {percent}%" template — the fixed/label portion is a genuine cognate
    "launchpad.scanner.supplyLabel", // "Supply" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.stakingPositions.statusUnstaked", // "Unstaked" status label kept identical (short/invariant form)
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.depositSymbolFallback", // "tokens" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.statusBonding", // "Bonding" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.curve.volumeLabel", // "Volume" is a genuine cognate (identical spelling, same meaning)
    "launchpad.home.filterTrending", // "Trending" is a genuine cognate/established loanword in this language
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.metricVolume", // "Volume" is a genuine cognate/established loanword in this language
  ],
  pl: [
    "adminLiveGifts.colStatus", // "Status" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.statDailyTrend", // "Trend" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "liveAudio.moderatorBadge", // legitimate international/borrowed cognate, not an untranslated copy
    "hashtag.postSingular",
    "adminJournalists.portfolio",
    "adminNews.slugLabel",
    "adminPayments.tx",
    "adminSupport.colStatus",
    "adminTicket.planLabel",
    "adminTicket.statusFieldLabel",
    "adminUsers.colPlan",
    "adminUsers.colStatus",
    "adminUsers.roleModerator",
    "ads.dashboard.ctr",
    "ambassadors.region.oceania",
    "chat.offline",
    "communities.create.hashtagLabel",
    "communityCode.e.category1",
    "contact.faqLabel",
    "faq.adminRoles.modLabel",
    "faq.cat.marketPlus",
    "faq.cat.trustPassport",
    "faq.trustLocation.p1Bold",
    "faq.trustVerification.passportCardTitle",
    "faq.whatIsMarketPlus.p1Bold",
    "faq.whatIsTrustPassport.p1Bold",
    "footer.faq",
    "footer.zrpNews",
    "group.lastMessagePrefix",
    "help.hero.cardStatus",
    "help.hero.tagTrustPassport",
    "help.heroTitle",
    "help.section.aid.title",
    "help.section.marketplace.title",
    "help.section.music.title",
    "help.section.opportunity.title",
    "help.section.trustPassport.title",
    "help.trustPassport.whereFindBold",
    "investors.platform2Title",
    "journalist.editor.slug",
    "marketplace.heroTitle",
    "music.albumDetail.eyebrow",
    "music.duration.minutes",
    "music.studio.explicitBadge",
    "music.track.columnAlbum",
    "nav.admin",
    "nav.aiAssistant",
    "nav.premium",
    "opportunity.heroTitle",
    "opportunity.typeFreelance",
    "opportunity.typeHackathon",
    "play.heroTitle",
    "play.vs",
    "play.xp",
    "press.emailBadge",
    "press.faviconLabel",
    "press.logoLabel",
    "pricing.support247",
    "professionalCategory.blockchain",
    "professionalCategory.catering",
    "professionalCategory.freelancer",
    "profile.trustPassportTitle",
    "support.ticketDetail.statusLabel",
    "tipModal.charCount",
    "transparency.reasonSpam",
    "trust.headerTitle",
    "trust.outOf100",
    "upgradeRequest.bankLabel",
    "adminNewsNetwork.title",
    "adminNewsNetwork.verificationFailedNamed",
    "adminSubscriptions.filterPlan",
    "adminSubscriptions.filterStatus",
    "adminSubscriptions.colPlan",
    "adminSubscriptions.colStatus",
    "adminSubscriptionDetail.fieldPlan",
    "adminSubscriptionDetail.fieldStatus",
    "adminSubscriptionDetail.planLabel",
    "adminSubscriptionDetail.colPlan",
    "adminSubscriptionDetail.actorSystem",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.createToken.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.daoProposalDetail.statusLabel", // "Status: {status}" template — the fixed/label portion is a genuine cognate
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.lockDaysValue", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.nftCreate.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  ro: [
    "adminLiveGifts.colStatus", // "Status" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.colTotal", // "Total" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "liveAudio.visibilityPublic", // legitimate international/borrowed cognate, not an untranslated copy
    "liveAudio.moderatorBadge", // legitimate international/borrowed cognate, not an untranslated copy
    "investors.types.familyOffice",
    "investors.platform.music.title",
    "investors.platform.news.title",
    "adminMarketplace.title",
    "adminNews.feedbackPrefix",
    "adminNews.slugLabel",
    "adminPayments.tx",
    "adminReports.total",
    "adminSupport.colStatus",
    "adminTicket.adminBadge",
    "adminTicket.planLabel",
    "adminTicket.statusFieldLabel",
    "adminUsers.colPlan",
    "adminUsers.colStatus",
    "adminUsers.roleAdmin",
    "adminUsers.roleModerator",
    "adminUsers.total",
    "ads.dashboard.ctr",
    "ads.new.bidTypeCpc",
    "ads.new.costPerClick",
    "ambassadors.region.africa",
    "ambassadors.region.antarctica",
    "ambassadors.region.asia",
    "ambassadors.region.oceania",
    "chat.attachment",
    "chat.contactVideo",
    "chat.live",
    "chat.offline",
    "communities.category.general",
    "communities.create.hashtagLabel",
    "communityCode.e.category1",
    "creatorDash.studioTitle",
    "faq.adminRoles.adminLabel",
    "faq.adminRoles.modLabel",
    "faq.cat.marketPlus",
    "faq.cat.trustPassport",
    "faq.deleteAccountFaq.warningBold",
    "faq.trustLocation.p1Bold",
    "faq.trustNotIdentity.warningBold",
    "faq.trustVerification.passportCardTitle",
    "faq.web3Zrp.calloutBold",
    "faq.whatIsMarketPlus.p1Bold",
    "faq.whatIsTrustPassport.p1Bold",
    "footer.contact",
    "footer.legalHeading",
    "footer.zrpNews",
    "group.lastMessagePrefix",
    "help.deletion.importantTitle",
    "help.hero.cardStatus",
    "help.hero.statImpactLabel",
    "help.hero.tagTrustPassport",
    "help.heroTitle",
    "help.plan.popular",
    "help.section.aid.title",
    "help.section.marketplace.title",
    "help.section.music.title",
    "help.section.opportunity.title",
    "help.section.trustPassport.title",
    "help.trustPassport.whereFindBold",
    "investors.platform2Title",
    "investors.statLiveValue",
    "investors.type4",
    "journalist.editor.slug",
    "marketplace.heroTitle",
    "music.albumDetail.eyebrow",
    "music.duration.minutes",
    "music.studio.explicitBadge",
    "music.track.columnAlbum",
    "nav.admin",
    "nav.aiAssistant",
    "nav.help",
    "nav.marketplace",
    "nav.premium",
    "newsCategory.crypto",
    "newsCategory.gaming",
    "opportunity.heroTitle",
    "opportunity.typeFreelance",
    "opportunity.typeHackathon",
    "play.heroTitle",
    "play.scopeGlobal",
    "play.vs",
    "play.xp",
    "press.emailBadge",
    "press.faviconLabel",
    "press.logoLabel",
    "pricing.support247",
    "pricing.supportStandard",
    "professionalCategory.blockchain",
    "professionalCategory.catering",
    "professionalCategory.freelancer",
    "professionalCategory.podcasting",
    "professionalCategory.restaurant",
    "professionalCategory.retail",
    "profile.media",
    "profile.trustPassportTitle",
    "settings.video",
    "stories.video",
    "support.categoryGeneral",
    "support.ticketDetail.statusLabel",
    "team.roleAdmin",
    "team.roleEditor",
    "terms.badgeSuffix",
    "time.hoursShort",
    "time.minutesShort",
    "tipModal.charCount",
    "transparency.hoursValue",
    "transparency.reasonSpam",
    "trust.headerTitle",
    "trust.outOf100",
    "adminNewsNetwork.title",
    "adminNewsNetwork.pilotOnly",
    "adminNewsNetwork.verificationFailedNamed",
    "adminSubscriptions.filterPlan",
    "adminSubscriptions.filterStatus",
    "adminSubscriptions.filterInterval",
    "adminSubscriptions.colPlan",
    "adminSubscriptions.colStatus",
    "adminSubscriptions.kpiActive",
    "adminSubscriptionDetail.fieldPlan",
    "adminSubscriptionDetail.fieldStatus",
    "adminSubscriptionDetail.fieldInterval",
    "adminSubscriptionDetail.planLabel",
    "adminSubscriptionDetail.intervalLabel",
    "adminSubscriptionDetail.colPlan",
    "adminSubscriptionDetail.colInterval",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.farmingPositions.unstakeButton", // "Unstake" is a genuine cognate/established loanword in this language
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.nftStaking", // "NFT staking" is a genuine cognate/established loanword in this language
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.tokenDetail.website", // "Website" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingPositions.unstakeNftButton", // "Unstake NFT" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.stakeHeading", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingPositions.unstakeButton", // "Unstake" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  cs: [
    "investors.types.familyOffice",
    "investors.platform.music.title",
    "investors.platform.news.title",
    "adminJournalists.portfolio",
    "adminNews.slugLabel",
    "adminPayments.tx",
    "adminUsers.colRole",
    "ads.dashboard.ctr",
    "chat.contactVideo",
    "chat.offline",
    "communities.create.hashtagLabel",
    "communityCode.e.category1",
    "faq.cat.marketPlus",
    "faq.cat.trustPassport",
    "faq.trustLocation.p1Bold",
    "faq.trustVerification.passportCardTitle",
    "faq.whatIsMarketPlus.p1Bold",
    "faq.whatIsTrustPassport.p1Bold",
    "footer.zrpNews",
    "group.lastMessagePrefix",
    "help.hero.cardStatus",
    "help.hero.tagTrustPassport",
    "help.heroTitle",
    "help.section.aid.title",
    "help.section.marketplace.title",
    "help.section.music.title",
    "help.section.trustPassport.title",
    "help.trustPassport.whereFindBold",
    "investors.platform2Title",
    "journalist.editor.slug",
    "marketplace.heroTitle",
    "music.albumDetail.eyebrow",
    "music.duration.minutes",
    "music.studio.explicitBadge",
    "music.track.columnAlbum",
    "nav.aiAssistant",
    "nav.premium",
    "onboarding.bio",
    "opportunity.heroTitle",
    "opportunity.typeFreelance",
    "opportunity.typeHackathon",
    "play.heroTitle",
    "play.vs",
    "play.xp",
    "press.emailBadge",
    "press.faviconLabel",
    "press.logoLabel",
    "pricing.support247",
    "privacy.dataCollected.cookiesTitle",
    "professionalCategory.blockchain",
    "professionalCategory.catering",
    "professionalCategory.freelancer",
    "professionalCategory.podcasting",
    "profile.trustPassportTitle",
    "settings.bio",
    "settings.video",
    "stories.video",
    "team.colRole",
    "team.role",
    "team.roleEditor",
    "tipModal.charCount",
    "transparency.reasonSpam",
    "trust.headerTitle",
    "trust.outOf100",
    "adminNewsNetwork.title",
    "adminNewsNetwork.verificationFailedNamed",
    "adminSubscriptions.filterInterval",
    "adminSubscriptionDetail.fieldInterval",
    "adminSubscriptionDetail.intervalLabel",
    "adminSubscriptionDetail.colInterval",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.createToken.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.nftStaking", // "NFT staking" is a genuine cognate/established loanword in this language
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.lockDaysValue", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.nftCreate.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.nftCreate.royaltyLabel", // "Royalty (%)" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  hu: [
    "adminLiveGifts.statDailyTrend", // "Trend" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "investors.types.familyOffice",
    "investors.platform.music.title",
    "investors.platform.news.title",
    "adminNews.slugLabel",
    "adminTicket.adminBadge",
    "adminUsers.roleAdmin",
    "ads.dashboard.ctr",
    "chat.offline",
    "communities.create.hashtagLabel",
    "communityCode.e.category1",
    "faq.adminRoles.adminLabel",
    "faq.cat.marketPlus",
    "faq.cat.trustPassport",
    "faq.trustLocation.p1Bold",
    "faq.trustVerification.passportCardTitle",
    "footer.zrpNews",
    "group.lastMessagePrefix",
    "help.hero.cardStatus",
    "help.hero.tagTrustPassport",
    "help.heroTitle",
    "help.section.aid.title",
    "help.section.marketplace.title",
    "help.section.music.title",
    "help.section.opportunity.title",
    "help.section.trustPassport.title",
    "help.trustPassport.whereFindBold",
    "investors.platform2Title",
    "journalist.editor.slug",
    "marketplace.heroTitle",
    "music.albumDetail.eyebrow",
    "music.studio.explicitBadge",
    "music.track.columnAlbum",
    "nav.admin",
    "nav.aiAssistant",
    "nav.platform",
    "opportunity.heroTitle",
    "opportunity.typeHackathon",
    "play.heroTitle",
    "play.vs",
    "play.xp",
    "press.emailBadge",
    "press.faviconLabel",
    "pricing.supportStandard",
    "profile.trustPassportTitle",
    "team.roleAdmin",
    "tipModal.charCount",
    "transparency.reasonSpam",
    "trust.headerTitle",
    "trust.outOf100",
    "upgradeRequest.bankLabel",
    "adminNewsNetwork.title",
    "adminNewsNetwork.pilotOnly",
    "adminNewsNetwork.verificationFailedNamed",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingCreate.minStakeLabel", // "Minimum stake" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.poolSubtitle", // "${symbol} farming pool" template — the fixed/label portion is a genuine cognate
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.farmingPositions.unstakeButton", // "Unstake" is a genuine cognate/established loanword in this language
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.nftStaking", // "NFT staking" is a genuine cognate/established loanword in this language
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.subtitlePoolType", // "NFT staking pool" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.minStakeLabel", // "Minimum stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.poolSuffix", // "staking pool" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.stakeHeading", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingPositions.unstakeButton", // "Unstake" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  sv: [
    "adminLiveGifts.colStatus", // "Status" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.statDailyTrend", // "Trend" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    // "Version" is a legitimate Swedish cognate (identical spelling); this key only became a
    // byte-for-byte English copy once the frontend dash audit normalized its original en-dash
    // version range to a plain hyphen, matching English's own "1.0-8.8.2026" - not a translation gap.
    "press.versionBadge",
    "liveAudio.visibilityCommunity", // legitimate international/borrowed cognate, not an untranslated copy
    "liveAudio.communityLabel", // legitimate international/borrowed cognate, not an untranslated copy
    "liveAudio.moderatorBadge", // legitimate international/borrowed cognate, not an untranslated copy
    "investors.types.familyOffice",
    "investors.platform.music.title",
    "investors.platform.news.title",
    "adminJournalists.portfolio",
    "adminMarketplace.title",
    "adminNews.feedbackPrefix",
    "adminNews.slugLabel",
    "adminPayments.tx",
    "adminSupport.colStatus",
    "adminTicket.adminBadge",
    "adminTicket.planLabel",
    "adminTicket.statusFieldLabel",
    "adminUsers.colPlan",
    "adminUsers.colStatus",
    "adminUsers.roleAdmin",
    "adminUsers.roleModerator",
    "ads.dashboard.ctr",
    "ads.new.totalBudget",
    "chat.contactVideo",
    "chat.live",
    "chat.offline",
    "communities.title",
    "communityCode.versionLabel",
    "explore.tabs.communities",
    "faq.adminRoles.adminLabel",
    "faq.adminRoles.modLabel",
    "faq.cat.administration",
    "faq.cat.marketPlus",
    "faq.cat.trustPassport",
    "faq.supportTickets.step1Link",
    "faq.trustLocation.p1Bold",
    "faq.trustVerification.passportCardTitle",
    "faq.whatIsMarketPlus.p1Bold",
    "faq.whatIsTrustPassport.p1Bold",
    "footer.supportHeading",
    "footer.zrpNews",
    "group.lastMessagePrefix",
    "help.cta.badge",
    "help.hero.cardStatus",
    "help.hero.statTrustValue",
    "help.hero.tagSupport",
    "help.hero.tagTrustPassport",
    "help.heroTitle",
    "help.section.aid.title",
    "help.section.marketplace.title",
    "help.section.music.title",
    "help.section.opportunity.title",
    "help.section.trustPassport.title",
    "help.trustPassport.whereFindBold",
    "investors.platform2Title",
    "investors.statLiveValue",
    "investors.type4",
    "journalist.editor.slug",
    "marketplace.heroTitle",
    "music.albumDetail.eyebrow",
    "music.duration.minutes",
    "music.shell.genrePlaceholder",
    "music.studio.explicitBadge",
    "music.track.columnAlbum",
    "nav.admin",
    "nav.administration",
    "nav.aiAssistant",
    "nav.communities",
    "nav.journalist",
    "nav.marketplace",
    "nav.premium",
    "news.change24h",
    "newsCategory.community",
    "newsCategory.gaming",
    "opportunity.heroTitle",
    "opportunity.typeHackathon",
    "play.heroTitle",
    "play.xp",
    "postDetail.sortRelevant",
    "press.emailBadge",
    "press.faviconLabel",
    "pricing.featureSupport",
    "pricing.supportStandard",
    "privacy.contact.supportLabel",
    "privacy.dataCollected.cookiesTitle",
    "professionalCategory.catering",
    "professionalCategory.podcasting",
    "profile.media",
    "profile.trustPassportTitle",
    "settings.tabSupport",
    "settings.video",
    "stories.video",
    "support.ticketDetail.priorityNormal",
    "support.ticketDetail.statusLabel",
    "support.ticketDetail.supportBadge",
    "team.roleAdmin",
    "tipModal.charCount",
    "trust.categoryCommunity",
    "trust.headerTitle",
    "trust.outOf100",
    "upgradeRequest.bankLabel",
    "adminNewsNetwork.title",
    "adminNewsNetwork.pilotOnly",
    "adminNewsNetwork.verificationFailedNamed",
    "adminSubscriptions.filterPlan",
    "adminSubscriptions.filterStatus",
    "adminSubscriptions.colPlan",
    "adminSubscriptions.colStatus",
    "adminSubscriptionDetail.fieldPlan",
    "adminSubscriptionDetail.fieldStatus",
    "adminSubscriptionDetail.planLabel",
    "adminSubscriptionDetail.colPlan",
    "adminSubscriptionDetail.actorSystem",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.createToken.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.createToken.supplyLabel", // "Total supply" is a genuine cognate/established loanword in this language
    "launchpad.daoDetail.tokenAmount", // "{value} tokens" template — the fixed/label portion is a genuine cognate
    "launchpad.daoProposalDetail.statusLabel", // "Status: {status}" template — the fixed/label portion is a genuine cognate
    "launchpad.farming.title", // "Liquidity farming" is a genuine cognate/established loanword in this language
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.farmingPositions.statusUnstaked", // "Unstaked" status label kept identical (short/invariant form)
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.liquidityFarming", // "Liquidity farming" is a genuine cognate/established loanword in this language
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.tokenDetail.totalSupply", // "Total supply" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.ido.capRange", // "Cap: ${softCap} - ${hardCap}" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.lockDaysValue", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.nftCreate.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.nftCreate.royaltyLabel", // "Royalty (%)" is a genuine cognate/established loanword in this language
    "launchpad.scanner.supplyLabel", // "Supply" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.stakingPositions.statusUnstaked", // "Unstaked" status label kept identical (short/invariant form)
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.depositSymbolFallback", // "tokens" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  da: [
    "adminLiveGifts.colStatus", // "Status" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.colAnimation", // "Animation" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.statDailyTrend", // "Trend" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminAnnouncements.formTypeLabel", // "Type" is a genuine established Danish loanword, not an untranslated copy
    "liveAudio.moderatorBadge", // legitimate international/borrowed cognate, not an untranslated copy
    "investors.roadmap.heading",
    "investors.platform.marketplace.title",
    "investors.traction.heading",
    "investors.types.familyOffice",
    "investors.platform.music.title",
    "investors.platform.news.title",
    "action.post",
    "sharePost.send",
    "adminAds.budgetSummary",
    "adminAmbassadors.motivationLabel",
    "adminDash.title",
    "adminHelpWithdrawals.wallet",
    "adminJournalists.portfolio",
    "adminNews.feedbackPrefix",
    "adminNews.slugLabel",
    "adminPayments.tx",
    "adminReports.note",
    "adminSupport.colStatus",
    "adminTicket.adminBadge",
    "adminTicket.planLabel",
    "adminTicket.statusFieldLabel",
    "adminUsers.colBadge",
    "adminUsers.colPlan",
    "adminUsers.colStatus",
    "adminUsers.roleAdmin",
    "adminUsers.roleModerator",
    "adminWithdrawals.wallet",
    "ads.dashboard.ctr",
    "chat.contactVideo",
    "chat.live",
    "chat.offline",
    "chat.sendVoiceMessage",
    "chat.uploadVideoAria",
    "communities.create.hashtagLabel",
    "communityCode.e.category1",
    "communityCode.e.category4",
    "communityCode.versionLabel",
    "composer.postButton",
    "contact.faqLabel",
    "contentPerf.engagementTooltipSingular",
    "creatorDash.studioTitle",
    "faq.adminRoles.adminLabel",
    "faq.adminRoles.modLabel",
    "faq.cat.administration",
    "faq.cat.marketPlus",
    "faq.cat.trustPassport",
    "faq.hashtagsMentions.hashtagsBold",
    "faq.supportTickets.step1Link",
    "faq.trustLocation.p1Bold",
    "faq.trustVerification.passportCardTitle",
    "faq.whatIsMarketPlus.p1Bold",
    "faq.whatIsTrustPassport.p1Bold",
    "footer.faq",
    "footer.supportHeading",
    "footer.zrpNews",
    "group.lastMessagePrefix",
    "help.hero.cardStatus",
    "help.hero.tagModeration",
    "help.hero.tagSupport",
    "help.hero.tagTrustPassport",
    "help.heroTitle",
    "help.search.forQuery",
    "help.section.aid.title",
    "help.section.marketplace.title",
    "help.section.music.title",
    "help.section.opportunity.title",
    "help.section.trustPassport.title",
    "help.trustPassport.whereFindBold",
    "investors.platform2Title",
    "investors.statLiveValue",
    "investors.type4",
    "journalist.editor.slug",
    "marketplace.heroTitle",
    "music.albumDetail.eyebrow",
    "music.common.pause",
    "music.common.shuffle",
    "music.duration.minutes",
    "music.shell.genrePlaceholder",
    "music.studio.explicitBadge",
    "music.track.columnAlbum",
    "nav.admin",
    "nav.administration",
    "nav.aiAssistant",
    "nav.help",
    "nav.journalist",
    "nav.platform",
    "nav.premium",
    "newsCategory.gaming",
    "onboarding.bio",
    "onboarding.upload",
    "opportunity.heroTitle",
    "opportunity.remote",
    "opportunity.typeFreelance",
    "opportunity.typeHackathon",
    "opportunity.typeJob",
    "opportunity.typeLabel",
    "play.heroTitle",
    "play.xp",
    "press.download",
    "press.emailBadge",
    "press.faviconLabel",
    "press.logoLabel",
    "press.versionBadge",
    "pricing.featureSupport",
    "pricing.support247",
    "pricing.supportStandard",
    "privacy.contact.supportLabel",
    "privacy.dataCollected.cookiesTitle",
    "professionalCategory.blockchain",
    "professionalCategory.broadcasting",
    "professionalCategory.catering",
    "professionalCategory.freelancer",
    "professionalCategory.restaurant",
    "profile.trustPassportTitle",
    "settings.bio",
    "settings.dashboard",
    "settings.tabSupport",
    "settings.video",
    "shorts.upload.postShort",
    "sidebar.postButton",
    "stories.video",
    "support.categoryModeration",
    "support.ticketDetail.priorityNormal",
    "support.ticketDetail.statusLabel",
    "support.ticketDetail.supportBadge",
    "team.roleAdmin",
    "time.daysShort",
    "tipModal.charCount",
    "transparency.daysValue",
    "transparency.reasonMisinformation",
    "transparency.reasonSpam",
    "trust.headerTitle",
    "trust.outOf100",
    "upgradeRequest.bankLabel",
    "upgradeRequest.referenceLabel",
    "adminNewsNetwork.title",
    "adminNewsNetwork.tabFeeds",
    "adminNewsNetwork.pilotOnly",
    "adminNewsNetwork.verificationFailedNamed",
    "adminSubscriptions.filterPlan",
    "adminSubscriptions.filterStatus",
    "adminSubscriptions.filterInterval",
    "adminSubscriptions.colPlan",
    "adminSubscriptions.colStatus",
    "adminSubscriptionDetail.fieldPlan",
    "adminSubscriptionDetail.fieldStatus",
    "adminSubscriptionDetail.fieldInterval",
    "adminSubscriptionDetail.planLabel",
    "adminSubscriptionDetail.intervalLabel",
    "adminSubscriptionDetail.colPlan",
    "adminSubscriptionDetail.colInterval",
    "adminSubscriptionDetail.actorSystem",
    "adminNewsNetwork.scoreLabel",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.createToken.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.daoCreate.submitButton", // "Start DAO" is a genuine cognate/established loanword in this language
    "launchpad.daoDetail.tokenAmount", // "{value} tokens" template — the fixed/label portion is a genuine cognate
    "launchpad.daoProposalDetail.choiceFor", // "FOR" vote-choice label kept identical (short/invariant form)
    "launchpad.daoProposalDetail.forLabel", // "For" is a genuine cognate/established loanword in this language
    "launchpad.daoProposalDetail.statusLabel", // "Status: {status}" template — the fixed/label portion is a genuine cognate
    "launchpad.farming.title", // "Liquidity farming" is a genuine cognate/established loanword in this language
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.farmingPositions.statusUnstaked", // "Unstaked" status label kept identical (short/invariant form)
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.liquidityFarming", // "Liquidity farming" is a genuine cognate/established loanword in this language
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.ido.capRange", // "Cap: ${softCap} - ${hardCap}" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.lockDaysValue", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.nftCreate.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.nftCreate.royaltyLabel", // "Royalty (%)" is a genuine cognate/established loanword in this language
    "launchpad.scanner.supplyLabel", // "Supply" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.stakingPositions.statusUnstaked", // "Unstaked" status label kept identical (short/invariant form)
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.depositSymbolFallback", // "tokens" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  hr: [
    "adminLiveGifts.colStatus", // "Status" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.statDailyTrend", // "Trend" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "liveAudio.moderatorBadge", // legitimate international/borrowed cognate, not an untranslated copy
    "investors.platform.music.title",
    "investors.platform.news.title",
    "adminJournalists.portfolio",
    "adminPayments.tx",
    "adminSupport.colStatus",
    "adminTicket.planLabel",
    "adminTicket.statusFieldLabel",
    "adminUsers.colPlan",
    "adminUsers.colStatus",
    "adminUsers.roleModerator",
    "ads.dashboard.ctr",
    "communities.create.hashtagLabel",
    "communityCode.e.category1",
    "faq.adminRoles.modLabel",
    "faq.cat.marketPlus",
    "faq.cat.trustPassport",
    "faq.trustLocation.p1Bold",
    "faq.trustVerification.passportCardTitle",
    "faq.whatIsMarketPlus.p1Bold",
    "faq.whatIsTrustPassport.p1Bold",
    "footer.zrpNews",
    "group.lastMessagePrefix",
    "help.hero.tagTrustPassport",
    "help.heroTitle",
    "help.section.marketplace.title",
    "help.section.music.title",
    "help.section.trustPassport.title",
    "help.trustPassport.whereFindBold",
    "investors.platform2Title",
    "marketplace.heroTitle",
    "music.albumDetail.eyebrow",
    "music.duration.minutes",
    "music.studio.explicitBadge",
    "music.track.columnAlbum",
    "nav.aiAssistant",
    "nav.premium",
    "opportunity.heroTitle",
    "play.heroTitle",
    "play.xp",
    "press.emailBadge",
    "press.faviconLabel",
    "pricing.support247",
    "professionalCategory.blockchain",
    "professionalCategory.catering",
    "professionalCategory.freelancer",
    "professionalCategory.podcasting",
    "profile.trustPassportTitle",
    "shorts.premiumLockedTitle",
    "stories.video",
    "support.ticketDetail.statusLabel",
    "time.daysShort",
    "time.hoursShort",
    "tipModal.charCount",
    "transparency.daysValue",
    "transparency.hoursValue",
    "transparency.reasonSpam",
    "trust.headerTitle",
    "trust.outOf100",
    "adminNewsNetwork.title",
    "adminNewsNetwork.pilotOnly",
    "adminNewsNetwork.verificationFailedNamed",
    "adminSubscriptions.filterPlan",
    "adminSubscriptions.filterStatus",
    "adminSubscriptions.filterInterval",
    "adminSubscriptions.colPlan",
    "adminSubscriptions.colStatus",
    "adminSubscriptionDetail.fieldPlan",
    "adminSubscriptionDetail.fieldStatus",
    "adminSubscriptionDetail.fieldInterval",
    "adminSubscriptionDetail.planLabel",
    "adminSubscriptionDetail.intervalLabel",
    "adminSubscriptionDetail.colPlan",
    "adminSubscriptionDetail.colInterval",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.daoProposalDetail.statusLabel", // "Status: {status}" template — the fixed/label portion is a genuine cognate
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.farmingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.farmingPositions.unstakeButton", // "Unstake" is a genuine cognate/established loanword in this language
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.nftStaking", // "NFT staking" is a genuine cognate/established loanword in this language
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.lockDaysValue", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.nftStakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingPositions.unstakeNftButton", // "Unstake NFT" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.stakingDetail.stakeHeading", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingPositions.unstakeButton", // "Unstake" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  bg: [
    "investors.types.familyOffice",
    "investors.platform.music.title",
    "investors.platform.news.title",
    "adminNews.slugLabel",
    "ads.dashboard.ctr",
    "faq.cat.marketPlus",
    "faq.cat.trustPassport",
    "faq.trustLocation.p1Bold",
    "faq.trustVerification.passportCardTitle",
    "faq.whatIsMarketPlus.p1Bold",
    "faq.whatIsTrustPassport.p1Bold",
    "footer.zrpNews",
    "group.lastMessagePrefix",
    "help.hero.tagTrustPassport",
    "help.heroTitle",
    "help.section.aid.title",
    "help.section.marketplace.title",
    "help.section.music.title",
    "help.section.opportunity.title",
    "help.section.trustPassport.title",
    "help.trustPassport.whereFindBold",
    "investors.platform2Title",
    "journalist.editor.slug",
    "journalist.editor.slugPlaceholder",
    "marketplace.heroTitle",
    "nav.aiAssistant",
    "opportunity.heroTitle",
    "play.heroTitle",
    "play.xp",
    "press.emailBadge",
    "press.faviconLabel",
    "pricing.support247",
    "profile.trustPassportTitle",
    "tipModal.charCount",
    "trust.headerTitle",
    "trust.outOf100",
    "adminNewsNetwork.title",
    "adminNewsNetwork.verificationFailedNamed",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  el: [
    "investors.types.familyOffice",
    "investors.platform.music.title",
    "investors.platform.news.title",
    "adminJournalists.portfolio",
    "adminMarketplace.title",
    "adminNews.slugLabel",
    "adminUsers.colEmail",
    "ads.dashboard.ctr",
    "auth.email",
    "communities.create.hashtagLabel",
    "faq.cat.marketPlus",
    "faq.cat.trustPassport",
    "faq.trustLocation.p1Bold",
    "faq.trustVerification.passportCardTitle",
    "footer.zrpNews",
    "group.lastMessagePrefix",
    "help.hero.tagTrustPassport",
    "help.heroTitle",
    "help.section.aid.title",
    "help.section.businessFeatures.title",
    "help.section.marketplace.title",
    "help.section.music.title",
    "help.section.opportunity.title",
    "help.section.trustPassport.title",
    "help.trustPassport.whereFindBold",
    "investors.platform2Title",
    "investors.type4",
    "journalist.editor.slug",
    "journalist.editor.slugPlaceholder",
    "marketplace.heroTitle",
    "music.artistDetail.singlesHeading",
    "nav.aiAssistant",
    "nav.marketplace",
    "nav.premium",
    "newsCategory.gaming",
    "opportunity.heroTitle",
    "opportunity.typeHackathon",
    "play.heroTitle",
    "play.typeTrivia",
    "play.xp",
    "press.emailBadge",
    "press.emailLabel",
    "press.faviconLabel",
    "pricing.support247",
    "privacy.dataCollected.cookiesTitle",
    "professionalCategory.blockchain",
    "professionalCategory.catering",
    "professionalCategory.gamingEsports",
    "professionalCategory.podcasting",
    "profile.trustPassportTitle",
    "team.colEmail",
    "tipModal.charCount",
    "trust.headerTitle",
    "trust.outOf100",
    "adminNewsNetwork.title",
    "adminNewsNetwork.verificationFailedNamed",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.dao.title", // "DAOs" is an acronym/industry term, kept untranslated
    "launchpad.daoDetail.tokenAmount", // "{value} tokens" template — the fixed/label portion is a genuine cognate
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.farmingPositions.unstakeButton", // "Unstake" is a genuine cognate/established loanword in this language
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.nfts", // "NFTs" is an acronym/industry term, kept untranslated
    "launchpad.home.nftStaking", // "NFT staking" is a genuine cognate/established loanword in this language
    "launchpad.home.daos", // "DAOs" is an acronym/industry term, kept untranslated
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingPositions.unstakeNftButton", // "Unstake NFT" is a genuine cognate/established loanword in this language
    "launchpad.nft.title", // "ZRP NFTs" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.stakeHeading", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingPositions.unstakeButton", // "Unstake" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  // Norwegian, Serbian (Latin), Bosnian and Macedonian: each list below
  // was computed from the real diff against English and hand-reviewed -
  // every entry is a brand/product name (ZRP Help/Opportunity/PLAY/HELP/
  // Market Plus/Shorts), a short admin/nav label, or a format-only value
  // (e.g. "/ 100", "{count}/1000", "{name}: {msg}", "24/7", "CTR").
  no: [
    "adminLiveGifts.colStatus", // "Status" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.statDailyTrend", // "Trend" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminAnnouncements.formTypeLabel", // "Type" is a genuine established Norwegian loanword, not an untranslated copy
    "liveAudio.moderatorBadge", // legitimate international/borrowed cognate, not an untranslated copy
    "investors.platform.music.title",
    "investors.platform.news.title",
    "sharePost.send",
    "nav.admin", "action.repost", "settings.video", "chat.sendVoiceMessage",
    "chat.contactVideo", "group.lastMessagePrefix", "adminPayments.tx",
    "analytics.platformAndroid", "analytics.platformIos", "adminUsers.roleModerator",
    "adminUsers.colStatus", "transparency.reasonSpam", "footer.zrpNews",
    "ambassadors.region.asia", "communityCode.e.category1", "investors.platform2Title",
    "investors.type4", "press.emailBadge", "press.logoLabel", "faq.cat.trustPassport",
    "faq.whatIsTrustPassport.p1Bold", "faq.trustLocation.p1Bold",
    "faq.trustVerification.passportCardTitle", "faq.adminRoles.modLabel",
    "help.hero.tagTrustPassport", "help.search.forQuery", "help.section.trustPassport.title",
    "help.section.aid.title", "help.section.opportunity.title", "help.music.studioHeading",
    "help.section.music.title", "help.trustPassport.whereFindBold", "marketplace.heroTitle",
    "faq.cat.marketPlus", "faq.whatIsMarketPlus.p1Bold", "help.section.marketplace.title",
    "profile.trustPassportTitle", "stories.video", "nav.shorts", "nav.journalist",
    "support.ticketDetail.statusLabel", "support.ticketDetail.priorityNormal",
    "newsCategory.gaming", "pricing.supportStandard", "creatorDash.studioTitle",
    "creatorDash.tipsLabel", "trust.headerTitle", "trust.outOf100", "shorts.repost",
    "adminSupport.colStatus", "adminTicket.statusFieldLabel", "nav.play", "play.heroTitle",
    "play.xp", "nav.opportunity", "opportunity.heroTitle", "opportunity.typeHackathon",
    "opportunity.typeLabel", "help.heroTitle", "nav.premium", "nav.creatorStudio",
    "nav.aiAssistant", "music.common.pause", "music.shell.studioLabel",
    "music.duration.minutes", "music.studio.explicitBadge", "music.track.columnAlbum",
    "music.albumDetail.eyebrow", "tipModal.charCount", "professionalCategory.restaurant",
    "professionalCategory.catering", "upgradeRequest.bankLabel",
    "adminNewsNetwork.title",
    "adminNewsNetwork.pilotOnly",
    "adminNewsNetwork.verificationFailedNamed",
    "adminSubscriptions.filterStatus",
    "adminSubscriptions.colStatus",
    "adminSubscriptionDetail.fieldStatus",
    "adminSubscriptionDetail.actorSystem",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.createToken.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.daoCreate.submitButton", // "Start DAO" is a genuine cognate/established loanword in this language
    "launchpad.daoDetail.quorumLabel", // "Quorum" is a genuine cognate/established loanword in this language
    "launchpad.daoProposalDetail.choiceFor", // "FOR" vote-choice label kept identical (short/invariant form)
    "launchpad.daoProposalDetail.forLabel", // "For" is a genuine cognate/established loanword in this language
    "launchpad.daoProposalDetail.statusLabel", // "Status: {status}" template — the fixed/label portion is a genuine cognate
    "launchpad.farming.title", // "Liquidity farming" is a genuine cognate/established loanword in this language
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.farmingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.farmingPositions.unstakeButton", // "Unstake" is a genuine cognate/established loanword in this language
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.liquidityFarming", // "Liquidity farming" is a genuine cognate/established loanword in this language
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.lockDaysValue", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.nftStakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingPositions.unstakeNftButton", // "Unstake NFT" is a genuine cognate/established loanword in this language
    "launchpad.nftCreate.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.nftCreate.royaltyLabel", // "Royalty (%)" is a genuine cognate/established loanword in this language
    "launchpad.nftDetail.royalty", // "Royalty: {percent}%" template — the fixed/label portion is a genuine cognate
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.stakingDetail.stakeHeading", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingPositions.unstakeButton", // "Unstake" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  sr: [
    "adminLiveGifts.colStatus", // "Status" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.statDailyTrend", // "Trend" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "investors.platform.music.title",
    "investors.platform.news.title",
    "nav.admin", "settings.video", "chat.contactVideo", "group.lastMessagePrefix",
    "adminPayments.tx", "analytics.platformAndroid", "analytics.platformIos",
    "adminUsers.roleModerator", "adminUsers.colStatus", "investors.platform2Title",
    "press.emailBadge", "press.logoLabel", "faq.adminRoles.modLabel",
    "help.section.aid.title", "help.section.opportunity.title", "help.music.studioHeading",
    "help.section.music.title", "marketplace.heroTitle", "faq.cat.marketPlus",
    "faq.whatIsMarketPlus.p1Bold", "help.section.marketplace.title", "stories.video",
    "nav.shorts", "support.ticketDetail.statusLabel", "pricing.support247",
    "ads.dashboard.ctr", "trust.outOf100", "adminSupport.colStatus",
    "adminTicket.statusFieldLabel", "adminJournalists.portfolio",
    "play.heroTitle", "play.xp", "opportunity.heroTitle",
    "help.heroTitle", "nav.aiAssistant", "music.shell.studioLabel", "music.duration.minutes",
    "music.studio.explicitBadge", "music.track.columnAlbum", "music.albumDetail.eyebrow",
    "tipModal.charCount",
    "adminNewsNetwork.title",
    "adminNewsNetwork.pilotOnly",
    "adminNewsNetwork.verificationFailedNamed",
    "adminSubscriptions.filterStatus",
    "adminSubscriptions.filterInterval",
    "adminSubscriptions.colStatus",
    "adminSubscriptionDetail.fieldStatus",
    "adminSubscriptionDetail.fieldInterval",
    "adminSubscriptionDetail.intervalLabel",
    "adminSubscriptionDetail.colInterval",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.daoProposalDetail.statusLabel", // "Status: {status}" template — the fixed/label portion is a genuine cognate
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.farmingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.farmingPositions.unstakeButton", // "Unstake" is a genuine cognate/established loanword in this language
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.nftStaking", // "NFT staking" is a genuine cognate/established loanword in this language
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.lockDaysValue", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.nftStakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingPositions.unstakeNftButton", // "Unstake NFT" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.stakingDetail.stakeHeading", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingPositions.unstakeButton", // "Unstake" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  bs: [
    "adminLiveGifts.colStatus", // "Status" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.statDailyTrend", // "Trend" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "liveAudio.moderatorBadge", // legitimate international/borrowed cognate, not an untranslated copy
    "investors.platform.music.title",
    "investors.platform.news.title",
    "settings.video", "chat.contactVideo", "group.lastMessagePrefix", "adminPayments.tx",
    "analytics.platformAndroid", "analytics.platformIos",
    "adminUsers.roleModerator", "adminUsers.colPlan", "adminUsers.colStatus",
    "contact.faqLabel", "transparency.reasonSpam", "footer.faq",
    "communityCode.e.category1", "investors.platform2Title", "press.emailBadge",
    "press.logoLabel", "press.faviconLabel", "faq.adminRoles.modLabel",
    "help.hero.cardStatus", "help.section.aid.title", "help.section.opportunity.title",
    "help.music.studioHeading", "help.section.music.title", "marketplace.heroTitle",
    "faq.cat.marketPlus", "faq.whatIsMarketPlus.p1Bold", "help.section.marketplace.title",
    "stories.video", "nav.shorts", "support.ticketDetail.statusLabel",
    "journalist.editor.slug", "ads.dashboard.ctr",
    "trust.outOf100", "shorts.premiumLockedTitle",
    "adminSupport.colStatus", "adminTicket.planLabel", "adminTicket.statusFieldLabel",
    "adminJournalists.portfolio", "adminNews.slugLabel", "play.heroTitle",
    "play.xp", "opportunity.heroTitle", "help.heroTitle",
    "nav.premium", "nav.aiAssistant",
    "music.shell.studioLabel", "music.duration.minutes", "music.studio.explicitBadge",
    "music.track.columnAlbum", "music.albumDetail.eyebrow", "tipModal.charCount",
    "professionalCategory.blockchain", "communities.create.hashtagLabel",
    "adminNewsNetwork.title",
    "adminNewsNetwork.pilotOnly",
    "adminNewsNetwork.verificationFailedNamed",
    "adminSubscriptions.filterPlan",
    "adminSubscriptions.filterStatus",
    "adminSubscriptions.filterInterval",
    "adminSubscriptions.colPlan",
    "adminSubscriptions.colStatus",
    "adminSubscriptionDetail.fieldPlan",
    "adminSubscriptionDetail.fieldStatus",
    "adminSubscriptionDetail.fieldInterval",
    "adminSubscriptionDetail.planLabel",
    "adminSubscriptionDetail.intervalLabel",
    "adminSubscriptionDetail.colPlan",
    "adminSubscriptionDetail.colInterval",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.daoProposalDetail.statusLabel", // "Status: {status}" template — the fixed/label portion is a genuine cognate
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.farmingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.farmingPositions.unstakeButton", // "Unstake" is a genuine cognate/established loanword in this language
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.nftStaking", // "NFT staking" is a genuine cognate/established loanword in this language
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.lockDaysValue", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.nftStakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingPositions.unstakeNftButton", // "Unstake NFT" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.stakingDetail.stakeHeading", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingPositions.unstakeButton", // "Unstake" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  mk: [
    "investors.platform.music.title",
    "investors.platform.news.title",
    "group.lastMessagePrefix", "investors.platform2Title", "press.emailBadge",
    "help.section.aid.title", "help.section.opportunity.title", "help.music.studioHeading",
    "help.section.music.title", "marketplace.heroTitle", "faq.cat.marketPlus",
    "faq.whatIsMarketPlus.p1Bold", "help.section.marketplace.title", "pricing.support247",
    "ads.dashboard.ctr", "trust.outOf100", "play.heroTitle", "play.xp",
    "opportunity.heroTitle", "help.heroTitle", "nav.aiAssistant", "music.shell.studioLabel",
    "tipModal.charCount",
    "adminNewsNetwork.title",
    "adminNewsNetwork.verificationFailedNamed",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  // The 5-language 29->34 expansion (Ukrainian, Finnish, Slovak,
  // Slovenian, Lithuanian): "ZRP Market Plus"/"News"/"Music" as
  // sub-heading labels, template-only strings ({name}: {msg}, {n} XP,
  // {count}/1000, "/ 100"), and short international tech/social-media
  // terms real speakers of each language use untranslated (CTR, vs,
  // Bio, Video, Status, Portfolio, Blockchain, Slug, Album, Interval,
  // Premium, Freelancer/Freelance, Hackathon, Trivia, Podcasting,
  // Catering, Genre, Moderator, Offline, Repost, Tx, Tip, Spam,
  // ONLINE) - the same category of cognate the existing fr/de/id/etc.
  // lists above already allow, reviewed one language at a time.
  uk: [
    "group.lastMessagePrefix", "investors.platform.news.title", "investors.platform.music.title",
    "press.emailBadge", "marketplace.heroTitle", "faq.cat.marketPlus", "faq.whatIsMarketPlus.p1Bold",
    "help.section.marketplace.title", "ads.dashboard.ctr", "trust.outOf100", "play.xp",
    "music.studio.explicitBadge", "tipModal.charCount", "adminNewsNetwork.verificationFailedNamed",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  fi: [
    "profile.media", "settings.video", "chat.contactVideo", "group.lastMessagePrefix",
    "analytics.platformWeb", "press.emailBadge", "press.logoLabel", "press.faviconLabel",
    "marketplace.heroTitle", "faq.cat.marketPlus", "faq.whatIsMarketPlus.p1Bold",
    "help.section.marketplace.title", "stories.video", "ads.dashboard.ctr", "trust.outOf100",
    "adminJournalists.portfolio", "play.vs", "play.xp", "opportunity.typeFreelance",
    "opportunity.typeHackathon", "nav.premium", "music.shell.genrePlaceholder",
    "music.duration.minutes", "music.studio.explicitBadge", "tipModal.charCount",
    "professionalCategory.catering", "professionalCategory.freelancer",
    "communities.create.hashtagLabel", "adminNewsNetwork.verificationFailedNamed",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.farming.title", // "Liquidity farming" is a genuine cognate/established loanword in this language
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.liquidityFarming", // "Liquidity farming" is a genuine cognate/established loanword in this language
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.stakeHeading", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  sk: [
    "adminLiveGifts.statDailyTrend", // "Trend" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "action.repost", "onboarding.bio", "settings.video", "settings.bio", "chat.offline",
    "chat.contactVideo", "group.lastMessagePrefix", "team.roleEditor", "adminPayments.tx",
    "analytics.platformWeb", "profile.tip", "transparency.hoursValue", "transparency.daysValue",
    "transparency.reasonSpam", "communityCode.e.category1", "press.emailBadge", "press.logoLabel",
    "press.faviconLabel", "help.hero.cardStatus", "marketplace.heroTitle", "faq.cat.marketPlus",
    "faq.whatIsMarketPlus.p1Bold", "help.section.marketplace.title", "stories.video",
    "journalist.editor.slug", "journalist.editor.slugPlaceholder", "ads.dashboard.ctr",
    "trust.outOf100", "shorts.repost", "adminNews.slugLabel", "play.typeTrivia", "play.vs",
    "play.xp", "opportunity.typeFreelance", "opportunity.typeHackathon", "music.duration.minutes",
    "music.studio.explicitBadge", "music.track.columnAlbum", "music.albumDetail.eyebrow",
    "tipModal.charCount", "professionalCategory.blockchain", "professionalCategory.podcasting",
    "professionalCategory.catering", "professionalCategory.freelancer", "time.minutesShort",
    "time.hoursShort", "time.daysShort", "communities.create.hashtagLabel",
    "adminNewsNetwork.verificationFailedNamed", "adminSubscriptions.filterInterval",
    "adminSubscriptionDetail.fieldInterval", "adminSubscriptionDetail.intervalLabel",
    "adminSubscriptionDetail.colInterval",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.createToken.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.nftStaking", // "NFT staking" is a genuine cognate/established loanword in this language
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.lockDaysValue", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.nftCreate.symbolLabel", // "Symbol" is a genuine cognate/established loanword in this language
    "launchpad.nftCreate.royaltyLabel", // "Royalty (%)" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  sl: [
    "adminLiveGifts.colStatus", // "Status" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "adminLiveGifts.statDailyTrend", // "Trend" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "liveAudio.moderatorBadge", // legitimate international/borrowed cognate, not an untranslated copy
    "settings.video", "chat.contactVideo", "group.lastMessagePrefix", "adminUsers.roleModerator",
    "adminUsers.colStatus", "investors.platform.music.title", "press.emailBadge",
    "press.faviconLabel", "faq.adminRoles.modLabel", "marketplace.heroTitle", "faq.cat.marketPlus",
    "faq.whatIsMarketPlus.p1Bold", "help.section.marketplace.title", "stories.video",
    "support.ticketDetail.statusLabel", "journalist.editor.slug", "ads.dashboard.ctr",
    "trust.outOf100", "shorts.premiumLockedTitle", "adminSupport.colStatus",
    "adminTicket.statusFieldLabel", "adminJournalists.portfolio", "adminNews.slugLabel",
    "play.xp", "nav.premium", "music.duration.minutes", "music.studio.explicitBadge",
    "music.track.columnAlbum", "music.albumDetail.eyebrow", "tipModal.charCount",
    "professionalCategory.blockchain", "professionalCategory.catering",
    "adminNewsNetwork.verificationFailedNamed", "adminSubscriptions.filterStatus",
    "adminSubscriptions.filterInterval", "adminSubscriptions.colStatus",
    "adminSubscriptionDetail.fieldStatus", "adminSubscriptionDetail.fieldInterval",
    "adminSubscriptionDetail.intervalLabel", "adminSubscriptionDetail.colInterval",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.nftStaking", // "NFT staking" is a genuine cognate/established loanword in this language
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.lockDaysValue", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  lt: [
    "group.lastMessagePrefix", "press.emailBadge", "marketplace.heroTitle", "faq.cat.marketPlus",
    "faq.whatIsMarketPlus.p1Bold", "help.section.marketplace.title", "ads.dashboard.ctr",
    "trust.outOf100", "play.xp", "nav.premium", "music.duration.minutes",
    "music.studio.explicitBadge", "tipModal.charCount", "adminNewsNetwork.verificationFailedNamed",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  // The 4-language 34->38 expansion (Estonian, Irish, Latvian, Maltese) -
  // same category of reviewed cognate/format exception as every list
  // above, verified against already-shipped French/German precedent for
  // the identical key before being allowlisted here.
  et: [
    "adminLiveGifts.statDailyTrend", // "Trend" is a genuine cognate/established loanword in this language (adminLiveGifts admin surface)
    "group.lastMessagePrefix", "communityCode.version", "investors.platform.shorts.title",
    "press.emailBadge", "press.logoLabel", "press.faviconLabel",
    "faq.avatarSize.maxFileSizeVal", "faq.avatarSize.formatsVal", "faq.avatarSize.resolutionVal", "faq.avatarSize.ratioVal",
    "faq.bannerSize.maxFileSizeVal", "faq.bannerSize.formatsVal", "faq.bannerSize.resolutionVal", "faq.bannerSize.ratioVal",
    "faq.postImageSize.maxFileSizeVal", "faq.postImageSize.formatsVal", "faq.postImageSize.resolutionVal", "faq.postImageSize.ratioVal",
    "faq.postVideoSize.maxFileSizeVal", "faq.postVideoSize.formatsVal", "faq.postVideoSize.encodingVal",
    "faq.chatImageSize.maxFileSizeVal", "faq.chatImageSize.formatsVal", "faq.chatImageSize.resolutionVal",
    "ads.dashboard.ctr", "trust.outOf100", "play.xp", "music.duration.minutes",
    "music.track.columnAlbum", "music.albumDetail.eyebrow", "tipModal.charCount",
    "adminNewsNetwork.verificationFailedNamed",
    "marketplace.heroTitle", "faq.cat.marketPlus", "faq.whatIsMarketPlus.p1Bold",
    "help.section.marketplace.title", "music.studio.explicitBadge",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.farming.title", // "Liquidity farming" is a genuine cognate/established loanword in this language
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.nftStaking", // "NFT staking" is a genuine cognate/established loanword in this language
    "launchpad.home.liquidityFarming", // "Liquidity farming" is a genuine cognate/established loanword in this language
    "launchpad.home.swap", // "Swap" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  ga: [
    "group.lastMessagePrefix", "communityCode.version", "investors.platform.news.title",
    "investors.traction.stat1Value", "press.emailBadge", "press.faviconLabel",
    "faq.avatarSize.maxFileSizeVal", "faq.avatarSize.formatsVal", "faq.avatarSize.resolutionVal", "faq.avatarSize.ratioVal",
    "faq.bannerSize.maxFileSizeVal", "faq.bannerSize.formatsVal", "faq.bannerSize.resolutionVal", "faq.bannerSize.ratioVal",
    "faq.postImageSize.maxFileSizeVal", "faq.postImageSize.formatsVal", "faq.postImageSize.resolutionVal", "faq.postImageSize.ratioVal",
    "faq.postVideoSize.maxFileSizeVal", "faq.postVideoSize.formatsVal", "faq.postVideoSize.encodingVal",
    "faq.chatImageSize.maxFileSizeVal", "faq.chatImageSize.formatsVal", "faq.chatImageSize.resolutionVal",
    "ads.dashboard.ctr", "trust.outOf100", "adminStorage.statInUploadThing", "play.xp",
    "tipModal.charCount", "adminNewsNetwork.verificationFailedNamed",
    "marketplace.heroTitle", "faq.cat.marketPlus", "faq.whatIsMarketPlus.p1Bold",
    "help.section.marketplace.title",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  lv: [
    "group.lastMessagePrefix", "communityCode.version", "investors.platform.shorts.title",
    "press.emailBadge", "press.faviconLabel",
    "faq.avatarSize.maxFileSizeVal", "faq.avatarSize.formatsVal", "faq.avatarSize.resolutionVal", "faq.avatarSize.ratioVal",
    "faq.bannerSize.maxFileSizeVal", "faq.bannerSize.formatsVal", "faq.bannerSize.resolutionVal", "faq.bannerSize.ratioVal",
    "faq.postImageSize.maxFileSizeVal", "faq.postImageSize.formatsVal", "faq.postImageSize.resolutionVal", "faq.postImageSize.ratioVal",
    "faq.postVideoSize.maxFileSizeVal", "faq.postVideoSize.formatsVal", "faq.postVideoSize.encodingVal",
    "faq.chatImageSize.maxFileSizeVal", "faq.chatImageSize.formatsVal", "faq.chatImageSize.resolutionVal",
    "ads.dashboard.ctr", "trust.outOf100", "adminJournalists.portfolio", "play.xp",
    "music.duration.minutes", "tipModal.charCount", "adminNewsNetwork.verificationFailedNamed",
    "marketplace.heroTitle", "faq.cat.marketPlus", "faq.whatIsMarketPlus.p1Bold",
    "help.section.marketplace.title", "music.studio.explicitBadge",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.curve.progressLabel", // "Progress" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  mt: [
    "group.lastMessagePrefix", "communityCode.version", "investors.platform.shorts.title",
    "investors.traction.heading", "investors.traction.stat1Value", "investors.traction.stat2Date",
    "press.emailBadge", "press.logoLabel", "press.faviconLabel",
    "faq.avatarSize.maxFileSizeVal", "faq.avatarSize.formatsVal", "faq.avatarSize.resolutionVal", "faq.avatarSize.ratioVal",
    "faq.bannerSize.maxFileSizeVal", "faq.bannerSize.formatsVal", "faq.bannerSize.resolutionVal", "faq.bannerSize.ratioVal",
    "faq.postImageSize.maxFileSizeVal", "faq.postImageSize.formatsVal", "faq.postImageSize.resolutionVal", "faq.postImageSize.ratioVal",
    "faq.postVideoSize.maxFileSizeVal", "faq.postVideoSize.formatsVal", "faq.postVideoSize.encodingVal",
    "faq.chatImageSize.maxFileSizeVal", "faq.chatImageSize.formatsVal", "faq.chatImageSize.resolutionVal",
    "privacy.dataCollected.cookiesTitle", "pricing.supportStandard", "ads.dashboard.ctr", "trust.outOf100",
    "adminSupport.colTicket", "play.xp", "opportunity.typeFreelance", "opportunity.typeHackathon",
    "music.duration.minutes", "music.track.columnAlbum", "music.artistDetail.singlesHeading", "music.albumDetail.eyebrow",
    "music.studio.explicitBadge",
    "tipModal.charCount", "professionalCategory.blockchain", "professionalCategory.podcasting",
    "communities.create.hashtagLabel", "adminNewsNetwork.verificationFailedNamed",
    "adminSubscriptions.filterStatus", "adminSubscriptions.colStatus", "adminSubscriptionDetail.fieldStatus",
    "transparency.reasonSpam", "communityCode.e.category1", "marketplace.heroTitle",
    "faq.cat.marketPlus", "faq.whatIsMarketPlus.p1Bold", "help.section.marketplace.title",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.dao.title", // "DAOs" is an acronym/industry term, kept untranslated
    "launchpad.daoDetail.tokenAmount", // "{value} tokens" template — the fixed/label portion is a genuine cognate
    "launchpad.daoProposalDetail.statusLabel", // "Status: {status}" template — the fixed/label portion is a genuine cognate
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.nfts", // "NFTs" is an acronym/industry term, kept untranslated
    "launchpad.home.daos", // "DAOs" is an acronym/industry term, kept untranslated
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nft.title", // "ZRP NFTs" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.depositSymbolFallback", // "tokens" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.progressLabel", // "Progress" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  // The 1-language 38->39 expansion (Romansh / Rumantsch Grischun).
  // Reviewed against French and German precedent for each key: genuine
  // cross-language cognates/technical terms (Spam, CTR, Album, Hashtag,
  // Favicon, an email address, a numeric "/ 100" format, a single-letter
  // content-rating badge) or an internal admin-only name kept
  // untranslated in every other language too (ZRP News Network).
  rm: [
    "group.lastMessagePrefix", "transparency.reasonSpam", "communityCode.e.category1",
    "investors.traction.heading", "press.emailBadge", "press.faviconLabel",
    "privacy.dataCollected.cookiesTitle", "ads.dashboard.ctr", "trust.outOf100",
    "opportunity.typeHackathon", "music.studio.explicitBadge", "music.track.columnAlbum",
    "music.albumDetail.eyebrow", "tipModal.charCount", "professionalCategory.blockchain",
    "professionalCategory.podcasting", "communities.create.hashtagLabel",
    "adminNewsNetwork.title", "adminNewsNetwork.verificationFailedNamed",
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.createToken.decimalsLabel", // "Decimals" is a genuine cognate/established loanword in this language
    "launchpad.dao.title", // "DAOs" is an acronym/industry term, kept untranslated
    "launchpad.daoCreate.quorumLabel", // "Quorum (tokens)" is a genuine cognate/established loanword in this language
    "launchpad.daoDetail.quorumLabel", // "Quorum" is a genuine cognate/established loanword in this language
    "launchpad.daoDetail.tokenAmount", // "{value} tokens" template — the fixed/label portion is a genuine cognate
    "launchpad.daoProposalDetail.statusLabel", // "Status: {status}" template — the fixed/label portion is a genuine cognate
    "launchpad.farming.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.decimalsLabel", // "Decimals" is a genuine cognate/established loanword in this language
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.farmingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.home.title", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.home.nfts", // "NFTs" is an acronym/industry term, kept untranslated
    "launchpad.home.daos", // "DAOs" is an acronym/industry term, kept untranslated
    "launchpad.tokenDetail.decimals", // "Decimals" is a genuine cognate/established loanword in this language
    "launchpad.tokenDetail.website", // "Website" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template — the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.softCapLabel", // "Soft cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoCreate.hardCapLabel", // "Hard cap (USDC)" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.softCapLabel", // "Soft cap" is a genuine cognate/established loanword in this language
    "launchpad.idoDetail.hardCapLabel", // "Hard cap" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.lockDaysValue", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.nftStakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.nft.title", // "ZRP NFTs" is a genuine cognate/established loanword in this language
    "launchpad.nftCreate.royaltyLabel", // "Royalty (%)" is a genuine cognate/established loanword in this language
    "launchpad.nftDetail.royalty", // "Royalty: {percent}%" template — the fixed/label portion is a genuine cognate
    "launchpad.scanner.decimalsLabel", // "Decimals" is a genuine cognate/established loanword in this language
    "launchpad.staking.apyLabel", // template kept — "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.lockDaysShort", // "{days}d" template — the fixed/label portion is a genuine cognate
    "launchpad.stakingDetail.stakeHeading", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.depositSymbolFallback", // "tokens" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated, same precedent as "Launchpad"/"NFT"/"DAO"
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.progressLabel", // "Progress" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range15m", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range1h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range6h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range24h", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range7d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
    "launchpad.history.range30d", // time-range abbreviation (5m/1h/24h/...) kept identical - a universal unit notation, not translated prose
  ],
  bn: [
    "nav.launchpad", // "Launchpad" is the established brand-name exception (see adminLaunchpad.title precedent)
    "launchpad.farming.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.staking.apyLabel", // "{value} APY" template - "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "group.lastMessagePrefix", // "{name}: {msg}" - pure placeholder template, no translatable words
    "adminPayments.tx", // "Tx:" - standard crypto-UI abbreviation for "transaction", kept untranslated
    "analytics.platformIos", // "iOS" is a proper noun/platform name
    "contact.faqLabel", // "FAQ" is a universally-used acronym in Bengali tech UI
    "footer.faq", // "FAQ" is a universally-used acronym in Bengali tech UI
    "investors.platform.news.title", // "ZRP News" is the established brand-name exception
    "investors.platform.music.title", // "ZRP Music" is the established brand-name exception
    "press.emailBadge", // "press@zrp.one" email address, not translatable content
    "faq.cat.trustPassport", // "ZRP Trust Passport" is the established brand-name exception
    "faq.whatIsTrustPassport.p1Bold", // "ZRP Trust Passport" is the established brand-name exception
    "faq.trustLocation.p1Bold", // "ZRP Trust Passport" is the established brand-name exception
    "faq.trustVerification.passportCardTitle", // "Trust Passport" is the established brand-name exception
    "help.hero.tagTrustPassport", // "Trust Passport" is the established brand-name exception
    "help.section.trustPassport.title", // "ZRP Trust Passport" is the established brand-name exception
    "help.section.aid.title", // "ZRP Help" is the established brand-name exception
    "help.section.opportunity.title", // "ZRP Opportunity" is the established brand-name exception
    "help.music.studioHeading", // "Music Studio" is a product sub-brand name
    "help.section.music.title", // "ZRP Music" is the established brand-name exception
    "journalist.editor.slugPlaceholder", // "article-slug" is a literal URL-slug format example, not prose
    "pricing.support247", // "24/7" - numeral/symbol notation, not translatable prose
    "ads.dashboard.ctr", // "CTR" is an acronym/industry term, kept untranslated
    "deleteAccount.confirmWord", // "DELETE" - the UI checks the typed confirmation against this literal word
    "play.xp", // "{n} XP" template - "XP" is a universal gaming acronym, kept untranslated
    "opportunity.heroTitle", // "ZRP OPPORTUNITY" is the established brand-name exception
    "help.heroTitle", // "ZRP HELP" is the established brand-name exception
    "nav.aiAssistant", // "ZRP AI" is the established brand-name exception
    "music.studio.explicitBadge", // "E" - the single-letter explicit-content badge, same convention as music streaming apps worldwide
    "communities.create.hashtagPlaceholder", // "travel" - a literal hashtag example; hashtags are conventionally kept in Latin script for cross-language discoverability
    "adminNewsNetwork.title", // "ZRP News Network" is the established brand-name exception
    "adminNewsNetwork.verificationFailedNamed", // "{name}: {error}" - pure placeholder template, no translatable words
  ],
  fa: [
    "nav.launchpad", // "Launchpad" is the established brand-name exception
    "group.lastMessagePrefix", // "{name}: {msg}" - pure placeholder template, no translatable words
    "analytics.platformAndroid", // "Android" is a proper noun/platform name
    "analytics.platformIos", // "iOS" is a proper noun/platform name
    "investors.platform.news.title", // "ZRP News" is the established brand-name exception
    "investors.platform.music.title", // "ZRP Music" is the established brand-name exception
    "press.emailBadge", // "press@zrp.one" email address, not translatable content
    "faq.cat.trustPassport", // "ZRP Trust Passport" is a named feature, kept in Latin for consistency with other ZRP sub-brands
    "faq.whatIsTrustPassport.p1Bold", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "faq.trustLocation.p1Bold", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "faq.trustVerification.passportCardTitle", // "Trust Passport" is a named feature, kept in Latin per above
    "help.hero.tagTrustPassport", // "Trust Passport" is a named feature, kept in Latin per above
    "help.section.trustPassport.title", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "help.section.aid.title", // "ZRP Help" is the established brand-name exception
    "help.section.opportunity.title", // "ZRP Opportunity" is the established brand-name exception
    "help.music.studioHeading", // "Music Studio" is a product sub-brand name
    "help.section.music.title", // "ZRP Music" is the established brand-name exception
    "help.trustPassport.whereFindBold", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "marketplace.heroTitle", // "ZRP Market Plus" is a product sub-brand name
    "faq.cat.marketPlus", // "ZRP Market Plus" is a product sub-brand name
    "faq.whatIsMarketPlus.p1Bold", // "ZRP Market Plus" is a product sub-brand name
    "help.section.marketplace.title", // "ZRP Market Plus" is a product sub-brand name
    "profile.trustPassportTitle", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "journalist.editor.slugPlaceholder", // "article-slug" is a literal URL-slug format example, not prose
    "pricing.support247", // "24/7" - numeral/symbol notation, not translatable prose
    "ads.dashboard.ctr", // "CTR" is an acronym/industry term, kept untranslated
    "deleteAccount.confirmWord", // "DELETE" - the UI checks the typed confirmation against this literal word
    "trust.headerTitle", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "nav.play", // "Play" is the nav short form of the "ZRP PLAY" sub-brand, kept in Latin to match
    "play.xp", // "{n} XP" template - "XP" is a universal gaming acronym, kept untranslated
    "opportunity.heroTitle", // "ZRP OPPORTUNITY" is the established brand-name exception
    "help.heroTitle", // "ZRP HELP" is the established brand-name exception
    "nav.aiAssistant", // "ZRP AI" is the established brand-name exception
    "music.studio.explicitBadge", // "E" - the single-letter explicit-content badge, same convention as music streaming apps worldwide
    "tipModal.charCount", // "{count}/1000" - pure placeholder/format template, no translatable words
    "communities.create.hashtagPlaceholder", // "travel" - a literal hashtag example; hashtags are conventionally kept in Latin script for cross-language discoverability
    "adminNewsNetwork.verificationFailedNamed", // "{name}: {error}" - pure placeholder template, no translatable words
  ],
  te: [
    "nav.launchpad", // "Launchpad" is the established brand-name exception
    "launchpad.farming.apyLabel", // "{apy} APY" - "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.staking.apyLabel", // "{value} APY" - "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "group.lastMessagePrefix", // "{name}: {msg}" - pure placeholder template, no translatable words
    "adminPayments.tx", // "Tx:" - standard crypto-UI abbreviation for "transaction", kept untranslated
    "analytics.platformAndroid", // "Android" is a proper noun/platform name
    "analytics.platformIos", // "iOS" is a proper noun/platform name
    "contact.faqLabel", // "FAQ" is a universally-used acronym in Telugu tech UI
    "footer.zrpNews", // "ZRP News" is the established brand-name exception
    "footer.faq", // "FAQ" is a universally-used acronym in Telugu tech UI
    "investors.platform.marketplace.title", // "Marketplace & Opportunity" contains the product sub-brand names
    "press.emailBadge", // "press@zrp.one" email address, not translatable content
    "support.footerNoteLink", // "My Tickets" - clickable link label that must match the actual in-app button/page text
    "faq.cat.trustPassport", // "ZRP Trust Passport" is a named feature, kept in Latin for consistency with other ZRP sub-brands
    "faq.howToRegister.step1Link", // "Sign Up" - clickable link label that must match the actual in-app button text
    "faq.howToLogin.step1Link", // "Login" - clickable link label that must match the actual in-app button text
    "faq.passwordReset.step1Link", // "Login" - clickable link label that must match the actual in-app button text
    "faq.privacyPolicyFaq.readMoreLink", // "Privacy Policy" - clickable link label that must match the actual in-app page name
    "faq.deleteAccountFaq.step1Link", // "Settings" - clickable link label that must match the actual in-app page name
    "faq.deleteAccountFaq.seeMoreLink", // "Privacy Policy" - clickable link label that must match the actual in-app page name
    "faq.whatIsTrustPassport.p1Bold", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "faq.trustLocation.p1Bold", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "faq.trustVerification.passportCardTitle", // "Trust Passport" is a named feature, kept in Latin per above
    "faq.supportTickets.step1Link", // "Support" - clickable link label that must match the actual in-app button text
    "faq.trackTickets.step1Link", // "My Tickets" - clickable link label that must match the actual in-app button text
    "faq.termsFaq.p1Link", // "Terms of Service" - clickable link label that must match the actual in-app page name
    "help.hero.tagTrustPassport", // "Trust Passport" is a named feature, kept in Latin per above
    "help.section.businessFeatures.title", // "Business & Enterprise" contains the plan-tier brand names
    "help.section.trustPassport.title", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "help.section.aid.title", // "ZRP Help" is the established brand-name exception
    "help.section.opportunity.title", // "ZRP Opportunity" is the established brand-name exception
    "help.music.studioHeading", // "Music Studio" is a product sub-brand name
    "help.section.music.title", // "ZRP Music" is the established brand-name exception
    "help.trustPassport.whereFindBold", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "marketplace.heroTitle", // "ZRP Market Plus" is a product sub-brand name
    "faq.cat.marketPlus", // "ZRP Market Plus" is a product sub-brand name
    "faq.whatIsMarketPlus.p1Bold", // "ZRP Market Plus" is a product sub-brand name
    "help.section.marketplace.title", // "ZRP Market Plus" is a product sub-brand name
    "profile.trustPassportTitle", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "journalist.editor.slugPlaceholder", // "article-slug" is a literal URL-slug format example, not prose
    "pricing.featureLiveAudio", // "Live Audio" is a ZRP Live sub-feature name
    "pricing.support247", // "24/7" - numeral/symbol notation, not translatable prose
    "ads.dashboard.ctr", // "CTR" is an acronym/industry term, kept untranslated
    "deleteAccount.confirmWord", // "DELETE" - the UI checks the typed confirmation against this literal word
    "creatorDash.studioTitle", // "Creator Studio" is a product feature name kept in English for consistency
    "trust.headerTitle", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "trust.outOf100", // "/ 100" - numeric score format, no translatable text
    "play.vs", // "vs" is a common gaming abbreviation used even in Indian-language game UIs
    "play.xp", // "{n} XP" template - "XP" is a universal gaming acronym, kept untranslated
    "opportunity.heroTitle", // "ZRP OPPORTUNITY" is the established brand-name exception
    "help.heroTitle", // "ZRP HELP" is the established brand-name exception
    "nav.creatorStudio", // "Creator Studio" is a product feature name kept in English for consistency
    "nav.aiAssistant", // "ZRP AI" is the established brand-name exception
    "music.shell.studioLabel", // "Music Studio" is a product sub-brand name
    "music.studio.explicitBadge", // "E" - the single-letter explicit-content badge, same convention as music streaming apps worldwide
    "tipModal.charCount", // "{count}/1000" - pure placeholder/format template, no translatable words
    "communities.create.hashtagPlaceholder", // "travel" - a literal hashtag example; hashtags are conventionally kept in Latin script for cross-language discoverability
    "childSafety.section6.communityCodeLabel", // "Community & Leadership Code" - named legal document title, kept as a proper noun
    "childSafety.section6.termsLabel", // "Terms of Service" - named legal document title, kept as a proper noun
    "adminNewsNetwork.title", // "ZRP News Network" is the established brand-name exception
    "adminNewsNetwork.verificationFailedNamed", // "{name}: {error}" - pure placeholder template, no translatable words
  ],
  mr: [
    "nav.launchpad", // "Launchpad" is the established brand-name exception
    "launchpad.dao.title", // "DAOs" is an acronym/industry term, kept untranslated
    "launchpad.farming.apyLabel", // "{apy} APY" - "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.nfts", // "NFTs" is an acronym/industry term, kept untranslated
    "launchpad.home.daos", // "DAOs" is an acronym/industry term, kept untranslated
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.nft.title", // "ZRP NFTs" is the established brand-name exception
    "launchpad.staking.apyLabel", // "{value} APY" - "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "group.lastMessagePrefix", // "{name}: {msg}" - pure placeholder template, no translatable words
    "adminPayments.tx", // "Tx:" - standard crypto-UI abbreviation for "transaction", kept untranslated
    "analytics.platformAndroid", // "Android" is a proper noun/platform name
    "analytics.platformIos", // "iOS" is a proper noun/platform name
    "contact.faqLabel", // "FAQ" is a universally-used acronym in Marathi tech UI
    "footer.faq", // "FAQ" is a universally-used acronym in Marathi tech UI
    "investors.platform.news.title", // "ZRP News" is the established brand-name exception
    "investors.platform.music.title", // "ZRP Music" is the established brand-name exception
    "press.heroTitle", // "Press Kit" is a standard English business term used as-is
    "press.emailBadge", // "press@zrp.one" email address, not translatable content
    "press.faviconLabel", // "Favicon" is a technical term with no Marathi equivalent
    "support.footerNoteLink", // "My Tickets" - clickable link label that must match the actual in-app button/page text
    "faq.cat.trustPassport", // "ZRP Trust Passport" is a named feature, kept in Latin for consistency with other ZRP sub-brands
    "faq.howToRegister.step1Link", // "Sign Up" - clickable link label that must match the actual in-app button text
    "faq.howToLogin.step1Link", // "Login" - clickable link label that must match the actual in-app button text
    "faq.passwordReset.step1Link", // "Login" - clickable link label that must match the actual in-app button text
    "faq.deleteAccountFaq.step1Link", // "Settings" - clickable link label that must match the actual in-app page name
    "faq.whatIsTrustPassport.p1Bold", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "faq.trustLocation.p1Bold", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "faq.trustVerification.passportCardTitle", // "Trust Passport" is a named feature, kept in Latin per above
    "faq.adminRoles.userLabel", // "User" - literal role/badge tag, kept in English to match the real UI label
    "faq.adminRoles.modLabel", // "Moderator" - literal role/badge tag, kept in English to match the real UI label
    "faq.adminRoles.adminLabel", // "Admin" - literal role/badge tag, kept in English to match the real UI label
    "faq.verifiedBadge.verifiedLabel", // "Verified" - literal role/badge tag, kept in English to match the real UI label
    "faq.verifiedBadge.orgLabel", // "Organization" - literal role/badge tag, kept in English to match the real UI label
    "faq.verifiedBadge.govLabel", // "Government" - literal role/badge tag, kept in English to match the real UI label
    "faq.verifiedBadge.teamLabel", // "ZRP Team" is a named role/brand label, kept in Latin
    "faq.supportTickets.step1Link", // "Support" - clickable link label that must match the actual in-app button text
    "faq.trackTickets.step1Link", // "My Tickets" - clickable link label that must match the actual in-app button text
    "help.hero.tagTrustPassport", // "Trust Passport" is a named feature, kept in Latin per above
    "help.section.trustPassport.title", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "help.section.aid.title", // "ZRP Help" is the established brand-name exception
    "help.section.opportunity.title", // "ZRP Opportunity" is the established brand-name exception
    "help.music.studioHeading", // "Music Studio" is a product sub-brand name
    "help.section.music.title", // "ZRP Music" is the established brand-name exception
    "help.trustPassport.whereFindBold", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "marketplace.heroTitle", // "ZRP Market Plus" is a product sub-brand name
    "faq.cat.marketPlus", // "ZRP Market Plus" is a product sub-brand name
    "faq.whatIsMarketPlus.p1Bold", // "ZRP Market Plus" is a product sub-brand name
    "help.section.marketplace.title", // "ZRP Market Plus" is a product sub-brand name
    "profile.trustPassportTitle", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "profile.trustPassportBadge", // "Trust" is the short badge label for the Trust Passport feature
    "journalist.editor.slugPlaceholder", // "article-slug" is a literal URL-slug format example, not prose
    "pricing.featureLiveAudio", // "Live Audio" is a ZRP Live sub-feature name
    "pricing.support247", // "24/7" - numeral/symbol notation, not translatable prose
    "ads.dashboard.ctr", // "CTR" is an acronym/industry term, kept untranslated
    "deleteAccount.confirmWord", // "DELETE" - the UI checks the typed confirmation against this literal word
    "trust.headerTitle", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "trust.outOf100", // "/ 100" - numeric score format, no translatable text
    "play.xp", // "{n} XP" template - "XP" is a universal gaming acronym, kept untranslated
    "opportunity.heroTitle", // "ZRP OPPORTUNITY" is the established brand-name exception
    "help.heroTitle", // "ZRP HELP" is the established brand-name exception
    "nav.aiAssistant", // "ZRP AI" is the established brand-name exception
    "music.studio.explicitBadge", // "E" - the single-letter explicit-content badge, same convention as music streaming apps worldwide
    "tipModal.charCount", // "{count}/1000" - pure placeholder/format template, no translatable words
    "communities.create.hashtagPlaceholder", // "travel" - a literal hashtag example; hashtags are conventionally kept in Latin script for cross-language discoverability
    "childSafety.section6.communityCodeLabel", // "Community & Leadership Code" - named legal document title, kept as a proper noun
    "childSafety.section6.termsLabel", // "Terms of Service" - named legal document title, kept as a proper noun
    "adminNewsNetwork.verificationFailedNamed", // "{name}: {error}" - pure placeholder template, no translatable words
  ],
  vi: [
    "nav.launchpad", // "Launchpad" is the established brand-name exception
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.apy", // "APY" is a genuine cognate/established loanword in this language
    "launchpad.farmingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.home.airdrop", // "Airdrop" is an international crypto-native neologism kept untranslated
    "launchpad.pool.tokenMintLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.curve.poolAddressLabel", // "Pool" is a genuine cognate/established loanword in this language
    "launchpad.ido.pricePerToken", // "${price} / token" template - the fixed/label portion is a genuine cognate
    "launchpad.idoCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.nftStakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.apyLabel", // "APY" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.stakeHeading", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.stakingDetail.stakeButton", // "Stake" is a genuine cognate/established loanword in this language
    "launchpad.vestingCreate.tokenLabel", // "Token" is a genuine cognate/established loanword in this language
    "auth.email", // "Email" is a universal untranslated loanword in Vietnamese UI (same convention Facebook/Google VN use)
    "settings.video", // "Video" is a standard accepted loanword in Vietnamese
    "group.lastMessagePrefix", // "{name}: {msg}" - pure placeholder template, no translatable words
    "team.colEmail", // "Email" is a universal untranslated loanword in Vietnamese UI
    "analytics.platformWeb", // "Web" is a universal untranslated loanword
    "analytics.platformAndroid", // "Android" is a proper noun/platform name
    "analytics.platformIos", // "iOS" is a proper noun/platform name
    "adminUsers.colEmail", // "Email" is a universal untranslated loanword in Vietnamese UI
    "profile.tip", // "Tip" is a genuine cognate/established loanword in this language
    "contact.faqLabel", // "FAQ" is a universally-used acronym in Vietnamese tech UI
    "transparency.reasonSpam", // "Spam" is a standard loanword, no natural Vietnamese single-word equivalent in casual UI use
    "footer.faq", // "FAQ" is a universally-used acronym in Vietnamese tech UI
    "communityCode.e.category1", // "Spam" is a standard loanword, same as transparency.reasonSpam
    "investors.platform.marketplace.title", // "Marketplace & Opportunity" contains the product sub-brand name
    "investors.platform.news.title", // "ZRP News" is the established brand-name exception
    "investors.platform.music.title", // "ZRP Music" is the established brand-name exception
    "press.heroTitle", // "Press Kit" is a standard English business term used as-is
    "press.emailBadge", // "press@zrp.one" email address, not translatable content
    "press.logoLabel", // "Logo" is a universal untranslated loanword
    "press.faviconLabel", // "Favicon" is a technical term with no Vietnamese equivalent
    "press.emailLabel", // "Email" is a universal untranslated loanword in Vietnamese UI
    "press.websiteLabel", // "Website" is commonly left in English on this page; see journalist.editor note below for the one spot it was localized
    "faq.cat.trustPassport", // "ZRP Trust Passport" is a named feature, kept in Latin for consistency with other ZRP sub-brands
    "faq.whatIsTrustPassport.p1Bold", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "faq.trustLocation.p1Bold", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "faq.trustVerification.passportCardTitle", // "Trust Passport" is a named feature, kept in Latin per above
    "help.hero.tagTrustPassport", // "Trust Passport" is a named feature, kept in Latin per above
    "help.section.businessFeatures.title", // "Business & Enterprise" contains the plan-tier brand names
    "help.section.trustPassport.title", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "help.section.aid.title", // "ZRP Help" is the established brand-name exception
    "help.section.opportunity.title", // "ZRP Opportunity" is the established brand-name exception
    "help.music.studioHeading", // "Music Studio" is a product sub-brand name
    "help.section.music.title", // "ZRP Music" is the established brand-name exception
    "help.trustPassport.whereFindBold", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "nav.marketplace", // "Marketplace" is a common Vietnamese tech-UI loanword (same as Facebook/Shopee usage)
    "marketplace.heroTitle", // "ZRP Market Plus" is a product sub-brand name
    "adminMarketplace.title", // "Marketplace" is a common Vietnamese tech-UI loanword
    "faq.cat.marketPlus", // "ZRP Market Plus" is a product sub-brand name
    "faq.whatIsMarketPlus.p1Bold", // "ZRP Market Plus" is a product sub-brand name
    "help.section.marketplace.title", // "ZRP Market Plus" is a product sub-brand name
    "profile.trustPassportTitle", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "stories.video", // "Video" is a standard accepted loanword in Vietnamese
    "nav.shorts", // "Shorts" is a common English loanword in Vietnamese social-app UI (as in YouTube Shorts)
    "journalist.editor.slug", // "Slug" is used as-is in Vietnamese CMS/blog UIs, a technical CMS term
    "journalist.editor.slugPlaceholder", // "article-slug" is a literal URL-slug format example, not prose
    "pricing.featureLiveAudio", // "Live Audio" is a ZRP Live sub-feature name
    "pricing.support247", // "24/7" - numeral/symbol notation, not translatable prose
    "ads.dashboard.ctr", // "CTR" is an acronym/industry term, kept untranslated
    "deleteAccount.confirmWord", // "DELETE" - the UI checks the typed confirmation against this literal word
    "creatorDash.studioTitle", // "Creator Studio" is a product feature name kept in English for consistency
    "trust.headerTitle", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "trust.outOf100", // "/ 100" - numeric score format, no translatable text
    "adminSupport.colTicket", // "Ticket" is common in Vietnamese support/ticketing UI
    "adminJournalists.portfolio", // "Portfolio" is a widely-used English loanword with no established Vietnamese UI equivalent
    "adminNews.slugLabel", // "Slug" is a technical CMS term, used as-is in Vietnamese CMS/blog UIs
    "play.vs", // "vs" is the common informal Vietnamese usage for "versus" in gaming contexts
    "play.xp", // "{n} XP" template - "XP" is a universal gaming acronym, kept untranslated
    "opportunity.heroTitle", // "ZRP OPPORTUNITY" is the established brand-name exception
    "opportunity.typeFreelance", // "Freelance" is used as-is in everyday Vietnamese tech/work contexts
    "opportunity.typeHackathon", // "Hackathon" is used as-is in everyday Vietnamese tech/work contexts
    "help.heroTitle", // "ZRP HELP" is the established brand-name exception
    "nav.premium", // "Premium" is a widely-used English loanword in Vietnamese app UI
    "nav.creatorStudio", // "Creator Studio" is a product feature name kept in English for consistency
    "nav.aiAssistant", // "ZRP AI" is the established brand-name exception
    "music.shell.studioLabel", // "Music Studio" is a product sub-brand name
    "music.studio.explicitBadge", // "E" - the single-letter explicit-content badge, same convention as music streaming apps worldwide
    "music.track.columnAlbum", // "Album" is the same word in Vietnamese music UI convention
    "music.albumDetail.eyebrow", // "Album" is the same word in Vietnamese music UI convention
    "tipModal.charCount", // "{count}/1000" - pure placeholder/format template, no translatable words
    "professionalCategory.blockchain", // "Blockchain" is used untranslated in Vietnamese tech/professional contexts
    "professionalCategory.freelancer", // "Freelancer" is commonly used as-is in Vietnamese
    "communities.create.hashtagLabel", // "Hashtag" is a standard loanword, used untranslated in Vietnamese social apps
    "adminNewsNetwork.verificationFailedNamed", // "{name}: {error}" - pure placeholder template, no translatable words
  ],
  ur: [
    "nav.launchpad", // "Launchpad" is the established brand-name exception
    "launchpad.dao.title", // "DAOs" is an acronym/industry term, kept untranslated
    "launchpad.farming.apyLabel", // "{apy} APY" - "APY" is the industry-standard acronym, untranslated
    "launchpad.farmingCreate.apyLabel", // "APY (%)" is an acronym/industry term, kept untranslated
    "launchpad.farmingDetail.apy", // "APY" is an acronym/industry term, kept untranslated
    "launchpad.home.nfts", // "NFTs" is an acronym/industry term, kept untranslated
    "launchpad.home.daos", // "DAOs" is an acronym/industry term, kept untranslated
    "launchpad.curve.dexLabel", // "DEX" is an acronym/industry term, kept untranslated
    "launchpad.history.range5m", // time-range abbreviation kept identical - universal unit notation
    "launchpad.history.range15m", // time-range abbreviation kept identical - universal unit notation
    "launchpad.history.range1h", // time-range abbreviation kept identical - universal unit notation
    "launchpad.history.range6h", // time-range abbreviation kept identical - universal unit notation
    "launchpad.history.range24h", // time-range abbreviation kept identical - universal unit notation
    "launchpad.history.range7d", // time-range abbreviation kept identical - universal unit notation
    "launchpad.history.range30d", // time-range abbreviation kept identical - universal unit notation
    "launchpad.nft.title", // "ZRP NFTs" is the established brand-name exception
    "launchpad.staking.apyLabel", // "{value} APY" - "APY" is the industry-standard acronym, untranslated
    "launchpad.stakingCreate.apyLabel", // "APY (%)" is an acronym/industry term, kept untranslated
    "launchpad.stakingDetail.apyLabel", // "APY" is an acronym/industry term, kept untranslated
    "group.lastMessagePrefix", // "{name}: {msg}" - pure placeholder template, no translatable words
    "analytics.platformAndroid", // "Android" is a proper noun/platform name
    "analytics.platformIos", // "iOS" is a proper noun/platform name
    "contact.faqLabel", // "FAQ" is a universally-used acronym in Urdu tech UI
    "footer.faq", // "FAQ" is a universally-used acronym in Urdu tech UI
    "investors.platform.news.title", // "ZRP News" is the established brand-name exception
    "investors.platform.music.title", // "ZRP Music" is the established brand-name exception
    "press.emailBadge", // "press@zrp.one" email address, not translatable content
    "faq.cat.trustPassport", // "ZRP Trust Passport" is a named feature, kept in Latin for consistency with other ZRP sub-brands
    "faq.whatIsTrustPassport.p1Bold", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "faq.trustLocation.p1Bold", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "faq.trustVerification.passportCardTitle", // "Trust Passport" is a named feature, kept in Latin per above
    "help.hero.tagTrustPassport", // "Trust Passport" is a named feature, kept in Latin per above
    "help.section.trustPassport.title", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "help.section.aid.title", // "ZRP Help" is the established brand-name exception
    "help.section.opportunity.title", // "ZRP Opportunity" is the established brand-name exception
    "help.music.studioHeading", // "Music Studio" is a product sub-brand name
    "help.section.music.title", // "ZRP Music" is the established brand-name exception
    "help.trustPassport.whereFindBold", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "marketplace.heroTitle", // "ZRP Market Plus" is a product sub-brand name
    "faq.cat.marketPlus", // "ZRP Market Plus" is a product sub-brand name
    "faq.whatIsMarketPlus.p1Bold", // "ZRP Market Plus" is a product sub-brand name
    "help.section.marketplace.title", // "ZRP Market Plus" is a product sub-brand name
    "profile.trustPassportTitle", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "profile.trustPassportBadge", // "Trust" is the short badge label for the Trust Passport feature
    "journalist.editor.slugPlaceholder", // "article-slug" is a literal URL-slug format example, not prose
    "pricing.featureLiveAudio", // "Live Audio" is a ZRP Live sub-feature name
    "pricing.support247", // "24/7" - numeral/symbol notation, not translatable prose
    "ads.dashboard.ctr", // "CTR" is an acronym/industry term, kept untranslated
    "deleteAccount.confirmWord", // "DELETE" - the UI checks the typed confirmation against this literal word
    "trust.headerTitle", // "ZRP Trust Passport" is a named feature, kept in Latin per above
    "trust.outOf100", // "/ 100" - numeric score format, no translatable text
    "nav.play", // "Play" is the nav short form of the "ZRP PLAY" sub-brand, kept in Latin to match
    "play.xp", // "{n} XP" template - "XP" is a universal gaming acronym, kept untranslated
    "nav.opportunity", // "Opportunity" is the nav short form of the "ZRP OPPORTUNITY" sub-brand, kept in Latin to match
    "nav.help", // "Help" is the nav short form of the "ZRP HELP" sub-brand, kept in Latin to match
    "opportunity.heroTitle", // "ZRP OPPORTUNITY" is the established brand-name exception
    "help.heroTitle", // "ZRP HELP" is the established brand-name exception
    "nav.aiAssistant", // "ZRP AI" is the established brand-name exception
    "music.studio.explicitBadge", // "E" - the single-letter explicit-content badge, same convention as music streaming apps worldwide
    "tipModal.charCount", // "{count}/1000" - pure placeholder/format template, no translatable words
    "communities.create.hashtagPlaceholder", // "travel" - a literal hashtag example; hashtags are conventionally kept in Latin script for cross-language discoverability
    "adminNewsNetwork.verificationFailedNamed", // "{name}: {error}" - pure placeholder template, no translatable words
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
    "launchpad.vestingCreate.depositAmountFallback",
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
    "launchpad.vestingCreate.depositAmountFallback",
  ]),
  // Korean is also SOV: "Open the" + "Support" + "page." (en) becomes
  // "" + "지원" + " 페이지를 열어보세요." (ko) for the same reason.
  ko: new Set([
    "faq.supportTickets.step1Prefix",
    "privacy.intro.p1Prefix",
    "launchpad.vestingCreate.depositAmountFallback",
  ]),
  // launchpad.vestingCreate.depositAmountFallback is the English filler
  // word "the" in a fallback phrase ("Enter the amount to deposit"-style
  // string); these languages have no direct article and the translators
  // independently converged on dropping the word rather than forcing an
  // ungrammatical placeholder, consistent with the pattern above.
  ru: new Set(["launchpad.vestingCreate.depositAmountFallback"]),
  ar: new Set(["launchpad.vestingCreate.depositAmountFallback"]),
  hi: new Set(["launchpad.vestingCreate.depositAmountFallback"]),
  ro: new Set(["launchpad.vestingCreate.depositAmountFallback"]),
  hu: new Set(["launchpad.vestingCreate.depositAmountFallback"]),
  hr: new Set(["launchpad.vestingCreate.depositAmountFallback"]),
  bg: new Set(["launchpad.vestingCreate.depositAmountFallback"]),
  el: new Set(["launchpad.vestingCreate.depositAmountFallback"]),
  sr: new Set(["launchpad.vestingCreate.depositAmountFallback"]),
  bs: new Set(["launchpad.vestingCreate.depositAmountFallback"]),
  mk: new Set(["launchpad.vestingCreate.depositAmountFallback"]),
  uk: new Set(["launchpad.vestingCreate.depositAmountFallback"]),
  fi: new Set(["launchpad.vestingCreate.depositAmountFallback"]),
  et: new Set(["launchpad.vestingCreate.depositAmountFallback"]),
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

  it("no admin page bypasses the shared dictionary with a local English-only COPY object", () => {
    // Regression guard: src/app/admin/news-network/page.tsx and
    // src/app/admin/subscriptions/{page,[userId]/page}.tsx once carried an
    // explicit "TRANSLATION GAP (deliberate)" comment and a hardcoded
    // English-only COPY object instead of the shared dictionary - exactly
    // the bug a Macedonian-language screenshot caught (Admin rendered in
    // English while the rest of the app was translated). Every admin page
    // must pull its copy from useLanguage()/translations.ts; a future page
    // that reaches for a local COPY object instead should fail here before
    // it ships, not get caught by another screenshot.
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const adminDir = path.join(__dirname, "..", "..", "app", "admin");

    function walk(dir: string): string[] {
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === "__tests__" ? [] : walk(full);
        return entry.name.endsWith(".tsx") ? [full] : [];
      });
    }

    const files = walk(adminDir);
    expect(files.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      const relative = path.relative(adminDir, file);
      if (/TRANSLATION GAP/.test(source)) {
        failures.push(`${relative} still carries a "TRANSLATION GAP" marker`);
      }
      const usesTranslationContext = /from ["']@\/contexts\/LanguageContext["']/.test(source);
      if (!usesTranslationContext) {
        failures.push(`${relative} does not import useLanguage from @/contexts/LanguageContext`);
      }
    }
    expect(failures, failures.join("\n")).toHaveLength(0);
  });
});
