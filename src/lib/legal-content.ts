/**
 * Structured content for the native app's Terms / Privacy / Guidelines /
 * Help Center / Contact screens.
 *
 * This file does NOT contain any legal or help text itself. It only
 * contains the *shape* (section order, headings, which translation keys
 * make up each paragraph/bullet/card) that already exists in the real
 * web pages (src/app/terms, src/app/privacy, src/app/guidelines,
 * src/app/help, src/app/contact). All actual copy is read live from
 * `translations` in `@/lib/translations` at request time, in whatever
 * language was requested - exactly the same source the web pages
 * themselves read from via useLanguage()/t().
 *
 * Every "part" below is either:
 *  - a real TranslationKey (e.g. "terms.h.introduction"), resolved via
 *    the same fallback the site's own LanguageContext uses
 *    (translations[lang][key] ?? translations.en[key] ?? key), or
 *  - a short literal fragment (an email address, "%", ".", a dollar
 *    amount, a static score-range label) that isn't a translation key
 *    in any language. Resolving a part that doesn't exist in `en` either
 *    just falls back to returning the string itself - so literals are
 *    a no-op through the exact same resolver, nothing special-cased.
 */
import { Language, translations } from "@/lib/translations";

export type LegalPageId =
  | "terms"
  | "privacy"
  | "guidelines"
  | "help"
  | "contact"
  | "about"
  | "careers"
  | "charity"
  | "press"
  | "investors"
  | "faq";

export const LEGAL_PAGE_IDS: LegalPageId[] = [
  "terms",
  "privacy",
  "guidelines",
  "help",
  "contact",
  "about",
  "careers",
  "charity",
  "press",
  "investors",
  "faq",
];

type CardItem = {
  title?: string[];
  text?: string[];
  /** Ordered extra fragments: a price, a feature list, an email, a step list, table values, etc. */
  meta?: string[];
};

export type ContentBlock =
  | { type: "heading"; parts: string[] }
  | { type: "paragraph"; parts: string[]; style?: "callout" }
  | { type: "bullets"; items: string[][] }
  | { type: "cards"; items: CardItem[] }
  | { type: "table"; headers: string[][]; rows: { label: string[]; values: string[][] }[] }
  | { type: "faq"; items: { question: string[]; answer: string[] }[] };

export interface SectionConfig {
  id: string;
  number?: string;
  title: string[];
  body: ContentBlock[];
}

export interface PageConfig {
  title: string[];
  subtitle?: string[];
  sections: SectionConfig[];
}

// ─── Resolver ────────────────────────────────────────────────────────────

/**
 * Same fallback LanguageContext.tsx uses for t(): requested language,
 * then English, then the raw key/literal itself.
 */
function resolvePart(lang: Language, part: string): string {
  return (
    translations[lang]?.[part as keyof (typeof translations)[Language]] ??
    translations.en[part as keyof (typeof translations)["en"]] ??
    part
  );
}

/** Concatenates resolved parts into one string, without a stray space before punctuation-only parts. */
function joinParts(lang: Language, parts: string[]): string {
  let out = "";
  for (const raw of parts) {
    const val = resolvePart(lang, raw);
    if (!val) continue;
    if (out.length > 0 && !/^[.,;:!?)]/.test(val)) {
      out += " ";
    }
    out += val;
  }
  return out.trim();
}

// Note: each variant below gives its list its own field name (items /
// cards / faqItems) rather than reusing "items" everywhere. The native
// Android client deserializes this with Gson via plain (non-polymorphic)
// data classes - see LegalApi.kt - and Gson can't tell, from one shared
// "items" field name alone, whether to parse a JSON array as
// List<String> (bullets) or List<Card> (cards) for a given block. Distinct
// field names sidestep that instead of adding a custom type adapter.
export type ResolvedBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string; style?: "callout" }
  | { type: "bullets"; items: string[] }
  | { type: "cards"; cards: { title?: string; text?: string; meta?: string[] }[] }
  | { type: "table"; headers: string[]; rows: { label: string; values: string[] }[] }
  | { type: "faq"; faqItems: { question: string; answer: string }[] };

export interface ResolvedSection {
  id: string;
  number?: string;
  title: string;
  body: ResolvedBlock[];
}

export function resolvePage(config: PageConfig, lang: Language) {
  return {
    title: joinParts(lang, config.title),
    subtitle: config.subtitle ? joinParts(lang, config.subtitle) : undefined,
    sections: config.sections.map((s) => resolveSection(s, lang)),
  };
}

function resolveSection(section: SectionConfig, lang: Language): ResolvedSection {
  return {
    id: section.id,
    number: section.number,
    title: joinParts(lang, section.title),
    body: section.body.map((block) => resolveBlock(block, lang)),
  };
}

function resolveBlock(block: ContentBlock, lang: Language): ResolvedBlock {
  switch (block.type) {
    case "heading":
      return { type: "heading", text: joinParts(lang, block.parts) };
    case "paragraph":
      return { type: "paragraph", text: joinParts(lang, block.parts), style: block.style };
    case "bullets":
      return { type: "bullets", items: block.items.map((i) => joinParts(lang, i)) };
    case "cards":
      return {
        type: "cards",
        cards: block.items.map((c) => ({
          title: c.title ? joinParts(lang, c.title) : undefined,
          text: c.text ? joinParts(lang, c.text) : undefined,
          meta: c.meta?.map((m) => resolvePart(lang, m)),
        })),
      };
    case "table":
      return {
        type: "table",
        headers: block.headers.map((h) => joinParts(lang, h)),
        rows: block.rows.map((r) => ({
          label: joinParts(lang, r.label),
          values: r.values.map((v) => joinParts(lang, v)),
        })),
      };
    case "faq":
      return {
        type: "faq",
        faqItems: block.items.map((f) => ({
          question: joinParts(lang, f.question),
          answer: joinParts(lang, f.answer),
        })),
      };
  }
}

// ─── Small builders to keep the section configs below terse ──────────────

const H = (...parts: string[]): ContentBlock => ({ type: "heading", parts });
const P = (...parts: string[]): ContentBlock => ({ type: "paragraph", parts });
const CALLOUT = (...parts: string[]): ContentBlock => ({ type: "paragraph", parts, style: "callout" });
const BULLETS = (...items: string[][]): ContentBlock => ({ type: "bullets", items });
const CARDS = (...items: CardItem[]): ContentBlock => ({ type: "cards", items });
const card = (title: string[], text?: string[], meta?: string[]): CardItem => ({ title, text, meta });

// ─── Terms of Service (src/app/terms/page.tsx SECTIONS, 01-15) ───────────

export const TERMS_CONFIG: PageConfig = {
  title: ["terms.title"],
  subtitle: ["terms.subtitle"],
  sections: [
    {
      id: "introduction",
      number: "01",
      title: ["terms.h.introduction"],
      body: [
        P("terms.intro.p1Prefix", "terms.intro.p1Bold", "terms.intro.p1Suffix"),
        P("terms.intro.p2Prefix", "footer.privacyPolicy", "terms.intro.p2And", "help.footer.guidelines", "."),
        P("terms.intro.p3"),
        CALLOUT("terms.intro.calloutBold", "terms.intro.calloutText"),
        CALLOUT("terms.governingVersionBold", "terms.governingVersionText"),
      ],
    },
    {
      id: "eligibility",
      number: "02",
      title: ["terms.h.eligibility"],
      body: [
        P("terms.eligibility.intro"),
        BULLETS(
          ["terms.eligibility.item1Prefix", "terms.eligibility.item1Bold", "terms.eligibility.item1Suffix"],
          ["terms.eligibility.item2"],
          ["terms.eligibility.item3"],
          ["terms.eligibility.item4"],
          ["terms.eligibility.item5"]
        ),
        P("terms.eligibility.outro"),
      ],
    },
    {
      id: "registration",
      number: "03",
      title: ["terms.h.registration"],
      body: [
        P("terms.registration.intro"),
        BULLETS(
          ["terms.registration.item1"],
          ["terms.registration.item2"],
          ["terms.registration.item3"],
          ["terms.registration.item4"],
          ["terms.registration.item5"]
        ),
        P("terms.registration.outro"),
        CALLOUT("terms.registration.calloutBold", "terms.registration.calloutText"),
      ],
    },
    {
      id: "freedom-of-speech",
      number: "04",
      title: ["terms.h.freedomOfSpeech"],
      body: [
        P("terms.freedomOfSpeech.p1Bold", "terms.freedomOfSpeech.p1Suffix"),
        P("terms.freedomOfSpeech.p2"),
        P("terms.freedomOfSpeech.p3"),
        BULLETS(
          ["terms.freedomOfSpeech.item1"],
          ["terms.freedomOfSpeech.item2"],
          ["terms.freedomOfSpeech.item3"],
          ["terms.freedomOfSpeech.item4"],
          ["terms.freedomOfSpeech.item5"],
          ["terms.freedomOfSpeech.item6"]
        ),
        CALLOUT("terms.freedomOfSpeech.calloutBold", "terms.freedomOfSpeech.calloutText"),
      ],
    },
    {
      id: "user-conduct",
      number: "05",
      title: ["terms.h.userConduct"],
      body: [
        P("terms.userConduct.intro"),
        BULLETS(
          ["terms.userConduct.item1"],
          ["terms.userConduct.item2"],
          ["terms.userConduct.item3"],
          ["terms.userConduct.item4"],
          ["terms.userConduct.item5"],
          ["terms.userConduct.item6"],
          ["terms.userConduct.item7"],
          ["terms.userConduct.item8"]
        ),
        P("terms.userConduct.outro"),
      ],
    },
    {
      id: "content",
      number: "06",
      title: ["terms.h.content"],
      body: [
        P("terms.content.p1Bold", "terms.content.p1Suffix"),
        P("terms.content.p2"),
        P("terms.content.p3"),
        P("terms.content.p4"),
      ],
    },
    {
      id: "intellectual-property",
      number: "07",
      title: ["terms.h.intellectualProperty"],
      body: [P("terms.ip.p1"), P("terms.ip.p2")],
    },
    {
      id: "privacy",
      number: "08",
      title: ["terms.h.privacy"],
      body: [
        P("terms.privacySection.p1Prefix", "footer.privacyPolicy", "terms.privacySection.p1Suffix"),
        P("terms.privacySection.p2"),
        P("terms.privacySection.p3"),
      ],
    },
    {
      id: "moderation",
      number: "09",
      title: ["terms.h.moderation"],
      body: [
        P("terms.moderation.p1"),
        P("terms.moderation.p2Bold", "terms.moderation.p2Suffix"),
        P("terms.moderation.p3"),
        BULLETS(
          ["terms.moderation.item1"],
          ["terms.moderation.item2"],
          ["terms.moderation.item3"],
          ["terms.moderation.item4"]
        ),
        P("terms.moderation.outro"),
      ],
    },
    {
      id: "disputes",
      number: "10",
      title: ["terms.h.disputes"],
      body: [
        P("terms.disputes.p1Prefix", "terms.disputes.p1Bold", "terms.disputes.p1Suffix"),
        P("terms.disputes.p2"),
        BULLETS(["terms.disputes.item1"], ["terms.disputes.item2"], ["terms.disputes.item3"]),
        P("terms.disputes.contactPrefix", "support@zrp.one", "terms.disputes.contactSuffix"),
      ],
    },
    {
      id: "termination",
      number: "11",
      title: ["terms.h.termination"],
      body: [P("terms.termination.p1"), P("terms.termination.p2"), P("terms.termination.p3")],
    },
    {
      id: "liability",
      number: "12",
      title: ["terms.h.liability"],
      body: [
        CARDS(
          card(["terms.liability.asIsTitle"], ["terms.liability.asIsText"]),
          card(["terms.liability.accuracyTitle"], ["terms.liability.accuracyText"]),
          card(["terms.liability.limitationTitle"], ["terms.liability.limitationText"])
        ),
        P("terms.liability.p1"),
        P("terms.liability.p2Bold", "terms.liability.p2Suffix"),
      ],
    },
    {
      id: "charity",
      number: "13",
      title: ["terms.h.charity"],
      body: [H("terms.charity.title"), P("terms.charity.p1"), P("terms.charity.p2")],
    },
    {
      id: "changes",
      number: "14",
      title: ["terms.h.changes"],
      body: [
        P("terms.changes.p1"),
        P("terms.changes.p2"),
        BULLETS(["terms.changes.item1"], ["terms.changes.item2"], ["terms.changes.item3Prefix"]),
        P("terms.changes.outro"),
      ],
    },
    {
      id: "contact",
      number: "15",
      title: ["terms.h.contact"],
      body: [
        P("terms.contact.p1"),
        CARDS(
          card(["terms.contact.generalSupport"], undefined, ["support@zrp.one"]),
          card(["terms.contact.privacyInquiries"], undefined, ["privacy@zrp.one"])
        ),
        P("terms.contact.p2"),
      ],
    },
  ],
};

// ─── Privacy Policy (src/app/privacy/page.tsx SECTIONS, 01-16) ───────────

export const PRIVACY_CONFIG: PageConfig = {
  title: ["privacy.title"],
  subtitle: ["privacy.subtitle"],
  sections: [
    {
      id: "introduction",
      number: "01",
      title: ["privacy.h.introduction"],
      body: [
        P("privacy.intro.p1Prefix", "privacy.intro.p1Bold", "privacy.intro.p1Suffix"),
        P("privacy.intro.p2"),
        P("privacy.intro.p3"),
        CALLOUT("privacy.intro.calloutBold", "privacy.intro.calloutText"),
        CALLOUT("privacy.governingVersionBold", "privacy.governingVersionText"),
      ],
    },
    {
      id: "controller",
      number: "02",
      title: ["privacy.h.controller"],
      body: [
        P("privacy.controller.p1Bold", "privacy.controller.p1Suffix"),
        CARDS(
          card(["privacy.controller.privacyInquiries"], undefined, ["privacy@zrp.one"]),
          card(["privacy.controller.generalSupport"], undefined, ["support@zrp.one"])
        ),
        CALLOUT("privacy.controller.calloutBold", "privacy.controller.calloutText"),
      ],
    },
    {
      id: "data-collected",
      number: "03",
      title: ["privacy.h.dataCollected"],
      body: [
        P("privacy.dataCollected.intro"),
        CARDS(
          card(["privacy.dataCollected.accountTitle"], ["privacy.dataCollected.accountText"]),
          card(["privacy.dataCollected.profileTitle"], ["privacy.dataCollected.profileText"]),
          card(["privacy.dataCollected.contentTitle"], ["privacy.dataCollected.contentText"]),
          card(["privacy.dataCollected.interactionsTitle"], ["privacy.dataCollected.interactionsText"]),
          card(["privacy.dataCollected.deviceTitle"], ["privacy.dataCollected.deviceText"]),
          card(["privacy.dataCollected.cookiesTitle"], ["privacy.dataCollected.cookiesText"])
        ),
        CALLOUT("privacy.dataCollected.calloutText"),
      ],
    },
    {
      id: "data-use",
      number: "04",
      title: ["privacy.h.dataUse"],
      body: [
        P("privacy.dataUse.intro"),
        BULLETS(
          ["privacy.dataUse.item1"],
          ["privacy.dataUse.item2"],
          ["privacy.dataUse.item3"],
          ["privacy.dataUse.item4"],
          ["privacy.dataUse.item5"],
          ["privacy.dataUse.item6"],
          ["privacy.dataUse.item7"],
          ["privacy.dataUse.item8"]
        ),
        CALLOUT("privacy.dataUse.calloutBold", "privacy.dataUse.calloutText"),
      ],
    },
    {
      id: "legal-basis",
      number: "05",
      title: ["privacy.h.legalBasis"],
      body: [
        P("privacy.legalBasis.intro"),
        CARDS(
          card(["privacy.legalBasis.contractualTitle"], ["privacy.legalBasis.contractualText"]),
          card(["privacy.legalBasis.legitimateTitle"], ["privacy.legalBasis.legitimateText"]),
          card(["privacy.legalBasis.consentTitle"], ["privacy.legalBasis.consentText"]),
          card(["privacy.legalBasis.obligationTitle"], ["privacy.legalBasis.obligationText"])
        ),
      ],
    },
    {
      id: "cookies",
      number: "06",
      title: ["privacy.h.cookies"],
      body: [
        P("privacy.cookies.intro"),
        CARDS(
          card(["privacy.cookies.essentialTitle"], ["privacy.cookies.essentialText"]),
          card(["privacy.cookies.functionalTitle"], ["privacy.cookies.functionalText"]),
          card(["privacy.cookies.analyticsTitle"], ["privacy.cookies.analyticsText"]),
          card(["privacy.cookies.advertisingTitle"], ["privacy.cookies.advertisingText"])
        ),
        P("privacy.cookies.outro"),
      ],
    },
    {
      id: "sharing",
      number: "07",
      title: ["privacy.h.sharing"],
      body: [
        P("privacy.sharing.p1"),
        P("privacy.sharing.p2"),
        CALLOUT("privacy.sharing.calloutText"),
        P("privacy.sharing.p3"),
      ],
    },
    {
      id: "retention",
      number: "08",
      title: ["privacy.h.retention"],
      body: [P("privacy.retention.p1"), P("privacy.retention.p2"), CALLOUT("privacy.retention.calloutText")],
    },
    {
      id: "transfers",
      number: "09",
      title: ["privacy.h.transfers"],
      body: [
        P("privacy.transfers.p1"),
        P("privacy.transfers.p2"),
        P("privacy.transfers.p3"),
        P("privacy.transfers.p4"),
        CALLOUT("privacy.transfers.calloutText"),
      ],
    },
    {
      id: "rights",
      number: "10",
      title: ["privacy.h.rights"],
      body: [
        P("privacy.rights.intro"),
        CARDS(
          card(["privacy.rights.accessTitle"], ["privacy.rights.accessText"]),
          card(["privacy.rights.rectificationTitle"], ["privacy.rights.rectificationText"]),
          card(["privacy.rights.erasureTitle"], ["privacy.rights.erasureText"]),
          card(["privacy.rights.restrictionTitle"], ["privacy.rights.restrictionText"]),
          card(["privacy.rights.portabilityTitle"], ["privacy.rights.portabilityText"]),
          card(["privacy.rights.objectionTitle"], ["privacy.rights.objectionText"]),
          card(["privacy.rights.withdrawTitle"], ["privacy.rights.withdrawText"]),
          card(["privacy.rights.complaintTitle"], ["privacy.rights.complaintText"])
        ),
        P("privacy.rights.contactPrefix", "privacy@zrp.one", "privacy.rights.contactSuffix"),
      ],
    },
    {
      id: "security",
      number: "11",
      title: ["privacy.h.security"],
      body: [
        P("privacy.security.intro"),
        CARDS(
          card(["privacy.security.encryptionTitle"], ["privacy.security.encryptionText"]),
          card(["privacy.security.accessTitle"], ["privacy.security.accessText"]),
          card(["privacy.security.monitoringTitle"], ["privacy.security.monitoringText"]),
          card(["privacy.security.improvementsTitle"], ["privacy.security.improvementsText"])
        ),
        CALLOUT("privacy.security.calloutText"),
      ],
    },
    {
      id: "children",
      number: "12",
      title: ["privacy.h.children"],
      body: [P("privacy.children.p1"), P("privacy.children.p2Prefix", "privacy@zrp.one", ".")],
    },
    {
      id: "moderation",
      number: "13",
      title: ["privacy.h.moderation"],
      body: [
        P("privacy.moderation.p1"),
        P("privacy.moderation.p2"),
        CARDS(card(["privacy.moderation.bannerTitle"], ["privacy.moderation.bannerText"])),
      ],
    },
    {
      id: "charity",
      number: "14",
      title: ["privacy.h.charity"],
      body: [
        CARDS(
          card(
            ["privacy.charity.title"],
            ["privacy.charity.p1", "privacy.charity.p2"],
            ["35%", "privacy.charity.profitLabel"]
          )
        ),
      ],
    },
    {
      id: "changes",
      number: "15",
      title: ["privacy.h.changes"],
      body: [
        P("privacy.changes.p1"),
        P("privacy.changes.p2"),
        CALLOUT("privacy.changes.calloutPrefix", "zrp.one/privacy", "."),
      ],
    },
    {
      id: "contact",
      number: "16",
      title: ["privacy.h.contact"],
      body: [
        P("privacy.contact.p1"),
        CARDS(
          card(["privacy.contact.privacyLabel"], undefined, ["privacy@zrp.one"]),
          card(["privacy.contact.supportLabel"], undefined, ["support@zrp.one"])
        ),
        P("privacy.contact.p2"),
      ],
    },
  ],
};

// ─── Community Guidelines (src/app/guidelines/page.tsx) ──────────────────
// This page is itself deliberately drawn from the Terms of Service's own
// User Conduct / Content / Moderation sections (see the comment at the top
// of guidelines/page.tsx) - mirrored here the same way.

export const GUIDELINES_CONFIG: PageConfig = {
  title: ["help.footer.guidelines"],
  sections: [
    {
      id: "intro",
      title: ["help.footer.guidelines"],
      body: [P("guidelines.intro")],
    },
    {
      id: "user-conduct",
      title: ["terms.h.userConduct"],
      body: [
        P("terms.userConduct.intro"),
        BULLETS(
          ["terms.userConduct.item1"],
          ["terms.userConduct.item2"],
          ["terms.userConduct.item3"],
          ["terms.userConduct.item4"],
          ["terms.userConduct.item5"],
          ["terms.userConduct.item6"],
          ["terms.userConduct.item7"],
          ["terms.userConduct.item8"]
        ),
        P("terms.userConduct.outro"),
      ],
    },
    {
      id: "content",
      title: ["terms.h.content"],
      body: [
        P("terms.content.p1Bold", "terms.content.p1Suffix"),
        P("terms.content.p2"),
        P("terms.content.p3"),
        P("terms.content.p4"),
      ],
    },
    {
      id: "reporting",
      title: ["guidelines.reportTitle"],
      body: [P("guidelines.reportBody")],
    },
    {
      id: "moderation",
      title: ["terms.h.moderation"],
      body: [
        P("terms.moderation.p1"),
        P("terms.moderation.p2Bold", "terms.moderation.p2Suffix"),
        P("terms.moderation.p3"),
        BULLETS(
          ["terms.moderation.item1"],
          ["terms.moderation.item2"],
          ["terms.moderation.item3"],
          ["terms.moderation.item4"]
        ),
        P("terms.moderation.outro"),
      ],
    },
  ],
};

// ─── Contact (src/app/contact/page.tsx) ───────────────────────────────────
// The real page has no form - three static info cards. Modeled as-is.

export const CONTACT_CONFIG: PageConfig = {
  title: ["contact.title"],
  subtitle: ["contact.subtitle"],
  sections: [
    {
      id: "general-support",
      title: ["contact.generalSupport"],
      body: [P("contact.generalSupportDesc"), CARDS(card([], undefined, ["support@zrp.one"]))],
    },
    {
      id: "report-issue",
      title: ["contact.reportIssue"],
      body: [P("contact.reportIssueDesc"), CARDS(card([], undefined, ["security@zrp.one"]))],
    },
    {
      id: "more-help",
      title: ["contact.moreHelp"],
      // The web page's version has {faq}/{help} as live links inline in the
      // sentence; the route resolves this one via resolveMoreHelpText()
      // below (same two label keys the web page renders as link text),
      // since a native screen doesn't need in-text hyperlinks here - the
      // FAQ lives inside the Help Center screen and both are one tap away
      // from Settings regardless.
      body: [],
    },
  ],
};

// Contact needs a tiny bit of custom resolution for the {faq}/{help}
// template placeholders in contact.moreHelpDesc (the web page does this by
// splitting on the placeholders and rendering live <Link>s - see
// contact/page.tsx). Exposed separately so the route can do the
// substitution using the same two label keys the web page uses, then splice
// it into the "more-help" section as a plain paragraph.
export function resolveMoreHelpText(lang: Language): string {
  const template = resolvePart(lang, "contact.moreHelpDesc");
  const faqLabel = resolvePart(lang, "contact.faqLabel");
  const helpLabel = resolvePart(lang, "contact.helpCenterLabel");
  return template.replace(/\{faq\}/g, faqLabel).replace(/\{help\}/g, helpLabel);
}

// ─── About (src/app/about/page.tsx) ───────────────────────────────────────
// Paragraphs are grouped the same way the web page's own JSX does (a
// plain sentence immediately followed by its bold clause, so joinParts
// reassembles one natural paragraph) - about.p3Bold is deliberately
// skipped since about.p3 already contains that exact phrase in plain
// text (the web page bolds a substring of its own paragraph, which this
// content model can't express inline; duplicating it as a second part
// would repeat the phrase instead).
export const ABOUT_CONFIG: PageConfig = {
  title: ["about.title"],
  subtitle: ["about.subtitle"],
  sections: [
    {
      id: "story",
      title: ["about.storySectionTitle"],
      body: [
        P("about.p1", "about.p1Bold"),
        P("about.p2"),
        P("about.p3"),
        P("about.p4", "about.p4Bold", "about.p5"),
        P("about.p5Em", "about.p5EmQuote", "about.p5Rest"),
        P("about.p6"),
        P("about.tagline"),
      ],
    },
    {
      id: "values",
      title: ["about.valuesSectionTitle"],
      body: [
        CARDS(
          card(["about.value1Title"], ["about.value1Desc"]),
          card(["about.value2Title"], ["about.value2Desc"]),
          card(["about.value3Title"], ["about.value3Desc"]),
        ),
      ],
    },
  ],
};

// ─── Careers (src/app/careers/page.tsx) ───────────────────────────────────
// The hero's own two CTAs (mailto:careers@zrp.one, a link back to
// /about) and the closing section's mailto button aren't reproduced as
// tappable actions - matching CONTACT_CONFIG's own precedent, every
// address here is plain informational text (LegalCardView's `meta`
// lines render as plain Text, not a link) rather than a second,
// divergent way to leave the app beyond LegalScreen's own "no link
// back to zrp.one" design.
export const CAREERS_CONFIG: PageConfig = {
  title: ["careers.heroTitle1", "careers.heroTitle2"],
  subtitle: ["careers.heroSubtitle"],
  sections: [
    {
      id: "values",
      title: ["careers.valuesHeading"],
      body: [
        CARDS(
          card(["🗽", "careers.value1Title"], ["careers.value1Desc"]),
          card(["🔒", "careers.value2Title"], ["careers.value2Desc"]),
          card(["🧡", "careers.value3Title"], ["careers.value3Desc"]),
        ),
      ],
    },
    {
      id: "open-positions",
      title: ["careers.openPositionsHeading"],
      body: [
        CARDS(
          card(["careers.noOpenRolesTitle"], ["careers.noOpenRolesDesc"], ["careers@zrp.one"]),
        ),
      ],
    },
    {
      id: "what-we-look-for",
      title: ["careers.lookingForHeading"],
      body: [
        BULLETS(
          ["careers.lookFor1"],
          ["careers.lookFor2"],
          ["careers.lookFor3"],
          ["careers.lookFor4"],
        ),
      ],
    },
    {
      id: "closing",
      title: ["careers.closingTitle"],
      body: [P("careers.closingDesc"), CARDS(card([], undefined, ["careers@zrp.one"]))],
    },
  ],
};

// ─── Charity (src/app/charity/page.tsx) ───────────────────────────────────
// This config covers only the page's static informational content - the
// hero, the "how it works" steps, the fixed 35/25/20/20 cause-budget
// split (a real allocation policy, not live data), and the transparency
// intro paragraph. The live disbursement ledger itself (CharityLedger.tsx,
// GET /api/transparency/charity - real committed vs. disbursed totals and
// per-beneficiary records) is genuinely dynamic data with its own
// real-time API contract, not resolvable text like every other block
// here - Android renders it as a separate trailingContent section
// appended after this config's own content in LegalScreen (see
// CharityLedgerSection.kt), fetched from the same public endpoint.
export const CHARITY_CONFIG: PageConfig = {
  title: ["charity.heroTitle1", "charity.heroTitle2"],
  subtitle: ["charity.heroSubtitleP1", "charity.heroSubtitleBold", "charity.heroSubtitleP2"],
  sections: [
    {
      id: "how-it-works",
      title: ["charity.howItWorksHeading"],
      body: [
        P("charity.quarterlyBadge"),
        CARDS(
          card(["💰", "charity.step1Title"], ["charity.step1Desc", "charity.step1Bold", "charity.step1DescEnd"]),
          card(["⚖️", "charity.step2Title"], ["charity.step2Desc", "charity.step2Bold"]),
          card(["🤝", "charity.step3Title"], ["charity.step3Desc", "charity.step3Note"]),
        ),
      ],
    },
    {
      id: "where-it-goes",
      title: ["charity.whereGoesHeading"],
      body: [
        P("charity.whereGoesDesc"),
        CARDS(
          card(["👶", "charity.cause1Title"], ["charity.cause1Desc"], ["35%"]),
          card(["📚", "charity.cause2Title"], ["charity.cause2Desc"], ["25%"]),
          card(["🏥", "charity.cause3Title"], ["charity.cause3Desc"], ["20%"]),
          card(["🌍", "charity.cause4Title"], ["charity.cause4Desc"], ["20%"]),
        ),
      ],
    },
    {
      id: "transparency-intro",
      title: ["charity.transparencyHeading"],
      body: [
        P(
          "charity.transparencyDescP1",
          "charity.transparencyDescBold",
          "charity.transparencyDescP2",
          "charity.transparencyDescBold2",
        ),
        CALLOUT("charity.firstReportNote"),
      ],
    },
    {
      id: "cta",
      title: ["charity.ctaHeading"],
      body: [P("charity.ctaDescP1", "charity.ctaDescBold", "charity.ctaDescP2")],
    },
  ],
};

// ─── Help Center (src/app/help/page.tsx sections, 01-17) ─────────────────

function faqItems(count: number): { question: string[]; answer: string[] }[] {
  return Array.from({ length: count }, (_, i) => ({
    question: [`help.faqSection.q${i + 1}`],
    answer: [`help.faqSection.a${i + 1}`],
  }));
}

export const HELP_CONFIG: PageConfig = {
  title: ["help.hero.titleLine1"],
  subtitle: ["help.hero.subtitle"],
  sections: [
    {
      id: "account-types",
      number: "01",
      title: ["help.section.accountTypes.title"],
      body: [
        P("help.accountTypes.intro"),
        CARDS(
          card(["help.plan.free"], ["help.plan.free.desc"], [
            "$0",
            "help.plan.perMonth",
            "help.plan.free.feature1",
            "help.plan.free.feature2",
            "help.plan.free.feature3",
          ]),
          card(["help.plan.pro"], ["help.plan.pro.desc"], [
            "$9.99",
            "help.plan.perMonth",
            "help.plan.pro.feature1",
            "help.plan.pro.feature2",
            "help.plan.pro.feature3",
          ]),
          card(["help.plan.business"], ["help.plan.business.desc"], [
            "$49.99",
            "help.plan.perMonth",
            "help.plan.business.feature1",
            "help.plan.business.feature2",
            "help.plan.business.feature3",
          ]),
          card(["help.plan.enterprise"], ["help.plan.enterprise.desc"], [
            "help.plan.enterprisePrice",
            "help.plan.enterprise.feature1",
            "help.plan.enterprise.feature2",
            "help.plan.enterprise.feature3",
          ])
        ),
        CARDS(card(["help.accountTypes.impactTitle"], ["help.accountTypes.impactDesc"])),
      ],
    },
    {
      id: "business-features",
      number: "02",
      title: ["help.section.businessFeatures.title"],
      body: [
        P("help.businessFeatures.intro"),
        CARDS(
          card(["help.businessFeatures.f1Title"], ["help.businessFeatures.f1Desc"]),
          card(["help.businessFeatures.f2Title"], ["help.businessFeatures.f2Desc"]),
          card(["help.businessFeatures.f3Title"], ["help.businessFeatures.f3Desc"]),
          card(["help.businessFeatures.f4Title"], ["help.businessFeatures.f4Desc"]),
          card(["help.businessFeatures.f5Title"], ["help.businessFeatures.f5Desc"]),
          card(["help.businessFeatures.f6Title"], ["help.businessFeatures.f6Desc"])
        ),
      ],
    },
    {
      id: "account-limits",
      number: "03",
      title: ["help.section.accountLimits.title"],
      body: [
        P("help.accountLimits.intro"),
        {
          type: "table",
          headers: [
            ["help.accountLimits.tableFeature"],
            ["help.plan.free"],
            ["help.plan.pro"],
            ["help.plan.business"],
            ["help.plan.enterprise"],
          ],
          rows: [
            {
              label: ["help.planFeature.name.postLength"],
              values: [
                ["help.planFeature.postLength.free"],
                ["help.planFeature.postLength.pro"],
                ["help.planFeature.postLength.business"],
                ["help.plan.unlimited"],
              ],
            },
            {
              label: ["help.planFeature.name.imagesPerPost"],
              values: [["1"], ["4"], ["10"], ["help.plan.unlimited"]],
            },
            {
              label: ["help.planFeature.name.videoUpload"],
              values: [["32 MB"], ["100 MB"], ["500 MB"], ["2 GB"]],
            },
            {
              label: ["help.planFeature.name.polls"],
              values: [["✓"], ["✓"], ["✓"], ["✓"]],
            },
            {
              label: ["help.planFeature.name.scheduledPosts"],
              values: [
                ["help.planFeature.scheduledPosts.free"],
                ["help.planFeature.scheduledPosts.pro"],
                ["help.planFeature.scheduledPosts.business"],
                ["help.plan.unlimited"],
              ],
            },
            {
              label: ["help.planFeature.name.analytics"],
              values: [
                ["help.planFeature.analytics.free"],
                ["help.planFeature.analytics.pro"],
                ["help.planFeature.analytics.business"],
                ["help.planFeature.analytics.enterprise"],
              ],
            },
            {
              label: ["help.planFeature.name.verifiedBadge"],
              values: [["-"], ["✓"], ["✓"], ["✓"]],
            },
            {
              label: ["help.planFeature.name.customProfileUrl"],
              values: [["-"], ["✓"], ["✓"], ["✓"]],
            },
            {
              label: ["help.planFeature.name.recruitmentProfiles"],
              values: [["-"], ["-"], ["✓"], ["✓"]],
            },
            {
              label: ["help.planFeature.name.articlePublishing"],
              values: [["-"], ["-"], ["✓"], ["✓"]],
            },
            {
              label: ["help.planFeature.name.teamManagement"],
              values: [["-"], ["-"], ["✓"], ["✓"]],
            },
            {
              label: ["help.planFeature.name.apiAccess"],
              values: [["-"], ["-"], ["✓"], ["✓"]],
            },
            {
              label: ["help.planFeature.name.prioritySupport"],
              values: [["-"], ["✓"], ["✓"], ["24/7"]],
            },
            {
              label: ["help.planFeature.name.charityContribution"],
              values: [["35%"], ["35%"], ["35%"], ["35%"]],
            },
          ],
        },
        CALLOUT("help.accountLimits.note"),
      ],
    },
    {
      id: "upgrade",
      number: "04",
      title: ["help.section.upgrade.title"],
      body: [
        P("help.upgrade.intro"),
        CARDS(
          card(["help.upgrade.step1Title"], ["help.upgrade.step1Text"]),
          card(["help.upgrade.step2Title"], ["help.upgrade.step2Text"]),
          card(["help.upgrade.step3Title"], ["help.upgrade.step3Text"]),
          card(["help.upgrade.step4Title"], ["help.upgrade.step4Text"])
        ),
        CARDS(card(["help.upgrade.billingTitle"], ["help.upgrade.billingDesc"], ["help.upgrade.contactSupport"])),
      ],
    },
    {
      id: "creator-economy",
      number: "05",
      title: ["help.section.creatorEconomy.title"],
      body: [
        P("help.creatorEconomy.intro"),
        CARDS(
          card(["help.creatorEconomy.f1Title"], ["help.creatorEconomy.f1Desc"]),
          card(["help.creatorEconomy.f2Title"], ["help.creatorEconomy.f2Desc"]),
          card(["help.creatorEconomy.f3Title"], ["help.creatorEconomy.f3Desc"]),
          card(["help.creatorEconomy.f4Title"], ["help.creatorEconomy.f4Desc"])
        ),
        CARDS(card(["help.creatorEconomy.web3Title"], ["help.creatorEconomy.web3Desc"])),
      ],
    },
    {
      id: "corporate-accounts",
      number: "06",
      title: ["help.section.corporateAccounts.title"],
      body: [
        P("help.corporateAccounts.intro"),
        BULLETS(
          ["help.corporateAccounts.c1"],
          ["help.corporateAccounts.c2"],
          ["help.corporateAccounts.c3"],
          ["help.corporateAccounts.c4"],
          ["help.corporateAccounts.c5"],
          ["help.corporateAccounts.c6"],
          ["help.corporateAccounts.c7"],
          ["help.corporateAccounts.c8"]
        ),
        P("help.corporateAccounts.enterpriseQuestion", "help.corporateAccounts.talkToZrp"),
      ],
    },
    {
      id: "support",
      number: "07",
      title: ["help.section.support.title"],
      body: [
        P("help.support.intro"),
        CARDS(
          card(["help.support.step1Title"], ["help.support.step1Text"]),
          card(["help.support.step2Title"], ["help.support.step2Text"]),
          card(["help.support.step3Title"], ["help.support.step3Text"])
        ),
        CARDS(card(["help.support.openSupportBtn"], undefined, ["support@zrp.one"])),
      ],
    },
    {
      id: "reporting",
      number: "08",
      title: ["help.section.reporting.title"],
      body: [
        P("help.reporting.intro"),
        CARDS(
          card(["help.reporting.reportTitle"], undefined, [
            "help.reporting.reportStep1",
            "help.reporting.reportStep2",
            "help.reporting.reportStep3",
            "help.reporting.reportStep4",
            "help.reporting.reportStep5",
          ]),
          card(["help.reporting.blockTitle"], undefined, [
            "help.reporting.blockStep1",
            "help.reporting.blockStep2",
            "help.reporting.blockStep3",
            "help.reporting.blockStep4",
            "help.reporting.blockStep5",
          ])
        ),
        CALLOUT("help.reporting.note"),
      ],
    },
    {
      id: "deletion",
      number: "09",
      title: ["help.section.deletion.title"],
      body: [
        P("help.deletion.intro"),
        CARDS(
          card(["help.deletion.step1Title"], ["help.deletion.step1Text"]),
          card(["help.deletion.step2Title"], ["help.deletion.step2Text"]),
          card(["help.deletion.step3Title"], ["help.deletion.step3Text"]),
          card(["help.deletion.step4Title"], ["help.deletion.step4Text"])
        ),
        CARDS(
          card(
            ["help.deletion.importantTitle"],
            ["help.deletion.importantPrefix", "help.deletion.importantLink", "help.deletion.importantSuffix"]
          )
        ),
      ],
    },
    {
      id: "moderation",
      number: "10",
      title: ["help.section.moderation.title"],
      body: [
        P("help.moderation.intro"),
        CARDS(
          card(["help.moderation.f1Title"], ["help.moderation.f1Desc"]),
          card(["help.moderation.f2Title"], ["help.moderation.f2Desc"]),
          card(["help.moderation.f3Title"], ["help.moderation.f3Desc"]),
          card(["help.moderation.f4Title"], ["help.moderation.f4Desc"])
        ),
        CARDS(card(["help.moderation.bannerTitle"], ["help.moderation.bannerDesc"])),
      ],
    },
    {
      id: "privacy",
      number: "11",
      title: ["help.section.privacy.title"],
      body: [
        P("help.privacySection.intro"),
        CARDS(
          card(["help.privacySection.c1Title"], ["help.privacySection.c1Text"]),
          card(["help.privacySection.c2Title"], ["help.privacySection.c2Text"]),
          card(["help.privacySection.c3Title"], ["help.privacySection.c3Text"]),
          card(["help.privacySection.c4Title"], ["help.privacySection.c4Text"])
        ),
      ],
    },
    {
      id: "trust-passport",
      number: "12",
      title: ["help.section.trustPassport.title"],
      body: [
        CARDS(card(["help.trustPassport.introTitle"], ["help.trustPassport.introDesc"])),
        P("help.trustPassport.scorePrefix", "help.trustPassport.scoreBold", "help.trustPassport.scoreSuffix"),
        H("help.trustPassport.contributeHeading"),
        CARDS(
          card(["help.trustPassport.emailTitle"], ["help.trustPassport.emailText"]),
          card(["help.trustPassport.profileTitle"], ["help.trustPassport.profileText"]),
          card(["help.trustPassport.historyTitle"], ["help.trustPassport.historyText"]),
          card(["help.trustPassport.communityTitle"], ["help.trustPassport.communityText"]),
          card(["help.trustPassport.verificationTitle"], ["help.trustPassport.verificationText"]),
          card(["help.trustPassport.transparencyTitle"], ["help.trustPassport.transparencyText"])
        ),
        H("help.trustPassport.levelsHeading"),
        CARDS(
          card(["help.trustPassport.levelBuilding"], undefined, ["0-34"]),
          card(["help.trustPassport.levelModerate"], undefined, ["35-54"]),
          card(["help.trustPassport.levelGood"], undefined, ["55-74"]),
          card(["help.trustPassport.levelHigh"], undefined, ["75-89"]),
          card(["help.trustPassport.levelExcellent"], undefined, ["90-100"])
        ),
        CARDS(
          card(["help.trustPassport.notMeanTitle"], undefined, [
            "help.trustPassport.notMean1",
            "help.trustPassport.notMean2",
            "help.trustPassport.notMean3",
            "help.trustPassport.notMean4",
            "help.trustPassport.notMean5",
            "help.trustPassport.notMean6",
          ])
        ),
        CARDS(card(["help.trustPassport.privacyByDesignTitle"], ["help.trustPassport.privacyByDesignText"])),
        CARDS(card(["help.trustPassport.scoreCanChangeTitle"], ["help.trustPassport.scoreCanChangeText"])),
        CARDS(
          card(
            ["help.trustPassport.whereFindTitle"],
            [
              "help.trustPassport.whereFindPrefix",
              "help.trustPassport.whereFindBold",
              "help.trustPassport.whereFindSuffix",
            ],
            ["help.trustPassport.whereFindNote"]
          )
        ),
      ],
    },
    {
      id: "marketplace",
      number: "13",
      title: ["help.section.marketplace.title"],
      body: [
        P("help.marketplace.intro"),
        CARDS(
          card(["help.marketplace.f1Title"], ["help.marketplace.f1Desc"]),
          card(["help.marketplace.f2Title"], ["help.marketplace.f2Desc"]),
          card(["help.marketplace.f3Title"], ["help.marketplace.f3Desc"]),
          card(["help.marketplace.f4Title"], ["help.marketplace.f4Desc"])
        ),
        CALLOUT("help.marketplace.note"),
      ],
    },
    {
      id: "music",
      number: "14",
      title: ["help.section.music.title"],
      body: [
        P("help.music.intro"),
        H("help.music.listeningHeading"),
        P("help.music.listeningIntro"),
        CARDS(
          card(["help.music.f1Title"], ["help.music.f1Desc"]),
          card(["help.music.f2Title"], ["help.music.f2Desc"]),
          card(["help.music.f3Title"], ["help.music.f3Desc"]),
          card(["help.music.f4Title"], ["help.music.f4Desc"])
        ),
        H("help.music.publishingHeading"),
        CALLOUT("help.music.publishingIntro"),
        CARDS(
          card(["help.music.creatorTitle"], ["help.music.creatorText"]),
          card(["help.music.artistTitle"], ["help.music.artistText"])
        ),
        H("help.music.studioHeading"),
        P("help.music.studioIntro"),
        BULLETS(
          ["help.music.studioC1"],
          ["help.music.studioC2"],
          ["help.music.studioC3"],
          ["help.music.studioC4"],
          ["help.music.studioC5"],
          ["help.music.studioC6"]
        ),
        P("help.music.albumNote"),
        H("help.music.uploaderPolicyHeading"),
        P("help.music.uploaderPolicyIntro"),
        CARDS(
          card(["help.music.rightsTitle"], ["help.music.rightsText"]),
          card(["help.music.responsibilitiesTitle"], ["help.music.responsibilitiesText"]),
          card(["help.music.artworkTitle"], ["help.music.artworkText"]),
          card(["help.music.prohibitedTitle"], ["help.music.prohibitedText"])
        ),
        CALLOUT("help.music.reportText"),
      ],
    },
    {
      id: "opportunity",
      number: "15",
      title: ["help.section.opportunity.title"],
      body: [
        P("help.opportunity.intro"),
        H("help.opportunity.postingHeading"),
        CARDS(
          card(["help.opportunity.f1Title"], ["help.opportunity.f1Desc"]),
          card(["help.opportunity.f2Title"], ["help.opportunity.f2Desc"]),
          card(["help.opportunity.f3Title"], ["help.opportunity.f3Desc"])
        ),
        H("help.opportunity.applyingHeading"),
        P("help.opportunity.applyIntro"),
        BULLETS(
          ["help.opportunity.applyC1"],
          ["help.opportunity.applyC2"],
          ["help.opportunity.applyC3"],
          ["help.opportunity.applyC4"]
        ),
        H("help.opportunity.countryManagerHeading"),
        P("help.opportunity.countryManagerIntro"),
      ],
    },
    {
      id: "aid",
      number: "16",
      title: ["help.section.aid.title"],
      body: [
        P("help.aid.intro"),
        P("help.aid.categoriesIntro"),
        H("help.aid.publishingHeading"),
        CALLOUT("help.aid.publishingIntro"),
        CARDS(card(["help.aid.verifiedHowTitle"], ["help.aid.verifiedHowText"])),
        H("help.aid.campaignHeading"),
        BULLETS(
          ["help.aid.campaignC1"],
          ["help.aid.campaignC2"],
          ["help.aid.campaignC3"],
          ["help.aid.campaignC4"]
        ),
        H("help.aid.supportingHeading"),
        P("help.aid.supportingIntro"),
        CALLOUT("help.aid.reportIntro"),
      ],
    },
    {
      id: "faq",
      number: "17",
      title: ["help.section.faq.title"],
      body: [{ type: "faq", items: faqItems(36) }],
    },
  ],
};

// ─── Press Kit (src/app/press/page.tsx) ───────────────────────────────────
// Brand-asset downloads (logo/favicon/icon PNGs with a device-save link) are
// not reproduced as tappable actions - there's no native equivalent to the
// web page's <a download> file links in this content model, and unlike the
// static copy on the rest of the page, the image files themselves aren't
// text to resolve. The color palette and typography descriptions (the parts
// that are genuinely informational, not a file transfer) are kept. The
// closing "Mission Statement" section has no heading key of its own on the
// web page either (it's a bare blockquote), so it's folded into the Press
// Contact section rather than inventing a new title key.
export const PRESS_CONFIG: PageConfig = {
  title: ["press.heroTitle"],
  subtitle: ["press.heroSubtitle"],
  sections: [
    {
      id: "overview",
      title: ["press.overviewHeading"],
      body: [
        P("ZRP Social", "press.overviewIntro"),
        BULLETS(
          ["press.pillar1Title", ":", "press.pillar1Desc"],
          ["press.pillar2Title", ":", "press.pillar2Desc"],
          ["press.pillar3Title", ":", "press.pillar3Bold", "press.pillar3Desc"]
        ),
        CALLOUT("35%", "press.profitsGoTo", "press.profitsGoToCauses"),
      ],
    },
    {
      id: "key-features",
      title: ["press.keyFeaturesHeading"],
      body: [
        CARDS(
          card(["press.feature1Title"], ["press.feature1Desc"]),
          card(["press.feature2Title"], ["press.feature2Desc"]),
          card(["press.feature3Title"], ["press.feature3Desc"]),
          card(["press.feature4Title"], ["press.feature4Desc"]),
          card(["press.feature5Title"], ["press.feature5Desc"]),
          card(["press.feature6Title"], ["press.feature6Desc"])
        ),
      ],
    },
    {
      id: "charity-commitment",
      title: ["press.charityCommitmentHeading"],
      body: [
        P("ZRP Social", "press.notJustAnotherNetwork", "press.notJustAnotherNetworkBold", "press.notJustAnotherNetworkRest"),
        CARDS(
          card(["35%"], ["press.netProfitsLabel"]),
          card(["👶📚🏥🌍"], ["press.fourCausesLabel"])
        ),
        CALLOUT("press.transparencyNote"),
      ],
    },
    {
      id: "platform-stats",
      title: ["press.platformStatsHeading"],
      body: [P("press.dataAsOf"), CARDS(card(["195,000+"], ["press.statUsersLabel"]))],
    },
    {
      id: "brand-assets",
      title: ["press.brandAssetsHeading"],
      body: [
        P("press.brandAssetsDesc"),
        H("press.colorPaletteHeading"),
        CARDS(
          card(["ZRP Red"], undefined, ["#FF2D2D"]),
          card(["Dark Red"], undefined, ["#B10000"]),
          card(["White"], undefined, ["#FFFFFF"]),
          card(["Silver"], undefined, ["#BDDBDB"]),
          card(["Charcoal"], undefined, ["#0D0D0D"]),
          card(["Deep Black"], undefined, ["#050505"])
        ),
        H("press.typographyHeading"),
        CARDS(card(["Orbitron"], ["press.orbitronDesc"]), card(["Inter"], ["press.interDesc"])),
      ],
    },
    {
      id: "press-contact",
      title: ["press.pressContactHeading"],
      body: [
        CARDS(
          card(["press.emailLabel"], undefined, ["press@zrp.one"]),
          card(["press.websiteLabel"], undefined, ["zrp.one"])
        ),
        P("press.mediaInquiriesNote"),
        CALLOUT("press.missionQuote"),
        P("press.missionAttribution"),
      ],
    },
  ],
};

// ─── Investors (src/app/investors/page.tsx) ───────────────────────────────
// Both CTA links (mailto:investors@zrp.one, a Link back to /about) follow
// the same precedent as CAREERS_CONFIG/CONTACT_CONFIG: informational text,
// not a tappable action. The closing quote has no heading key of its own on
// the web page (a bare blockquote), so it's folded into the Investor
// Contact section instead of inventing a new title key.
export const INVESTORS_CONFIG: PageConfig = {
  title: ["investors.heroTitle"],
  subtitle: ["investors.heroSubtitle"],
  sections: [
    {
      id: "vision",
      title: ["investors.visionHeading"],
      body: [
        P("investors.visionP1"),
        P("investors.visionP2"),
        CARDS(
          card(["🇨🇭", "investors.why1Title"], ["investors.why1Desc"]),
          card(["🌍", "investors.why2Title"], ["investors.why2Desc"]),
          card(["⚡", "investors.why3Title"], ["investors.why3Desc"])
        ),
      ],
    },
    {
      id: "platform",
      title: ["investors.platformHeading"],
      body: [
        P("investors.platformSubtitle"),
        CARDS(
          card(["investors.platform1Title"], ["investors.platform1Desc"]),
          card(["investors.platform2Title"], ["investors.platform2Desc"]),
          card(["investors.platform3Title"], ["investors.platform3Desc"]),
          card(["investors.platform4Title"], ["investors.platform4Desc"]),
          card(["investors.platform5Title"], ["investors.platform5Desc"]),
          card(["investors.platform6Title"], ["investors.platform6Desc"])
        ),
      ],
    },
    {
      id: "growth",
      title: ["investors.growthHeading"],
      body: [
        P("investors.growthDesc"),
        CARDS(
          card(["195K+"], ["investors.statUsersLabel"]),
          card(["investors.statLiveValue"], ["investors.statLiveLabel"]),
          card(["investors.statGrowingValue"], ["investors.statGrowingLabel"])
        ),
        CALLOUT("investors.figuresNote"),
      ],
    },
    {
      id: "opportunities",
      title: ["investors.opportunitiesHeading"],
      body: [
        P("investors.opportunitiesSubtitle"),
        CARDS(
          card(["💻", "investors.opp1Title"], ["investors.opp1Desc"]),
          card(["🌍", "investors.opp2Title"], ["investors.opp2Desc"]),
          card(["👥", "investors.opp3Title"], ["investors.opp3Desc"]),
          card(["🚀", "investors.opp4Title"], ["investors.opp4Desc"])
        ),
      ],
    },
    {
      id: "investor-types",
      title: ["investors.typesHeading"],
      body: [
        BULLETS(
          ["investors.type1"],
          ["investors.type2"],
          ["investors.type3"],
          ["investors.type4"],
          ["investors.type5"],
          ["investors.type6"]
        ),
      ],
    },
    {
      id: "charity",
      title: ["investors.charityHeading"],
      body: [P("investors.charityDesc"), CARDS(card(["35%"], ["investors.charityStatLabel"]))],
    },
    {
      id: "investor-contact",
      title: ["investors.contactHeading"],
      body: [
        P("investors.contactDesc"),
        CARDS(card([], undefined, ["investors@zrp.one"])),
        CALLOUT("investors.disclaimer"),
        CALLOUT("investors.closingQuote"),
      ],
    },
  ],
};

// ─── FAQ (src/app/faq/page.tsx) ────────────────────────────────────────────
// This is the standalone public /faq page - 57 questions across 12
// categories, distinct from HELP_CONFIG's own smaller 36-item
// help.faqSection (a different, older FAQ embedded inside the Help
// Center). Each question becomes its own section (its title IS the
// question, matching how every other section here already renders as
// its own titled block - functionally the same "one question, one
// expandable-feeling unit" shape the web page's accordion gives each
// item). A category heading is prepended as an H() block into the
// first section of that category rather than a separate empty
// section, since a bare heading-only section has no real content of
// its own. Quick-link category jump anchors and the live question/
// category counts are UI-only chrome on the web page - not
// resolvable content, so not reproduced.
export const FAQ_CONFIG: PageConfig = {
  title: ["faq.pageTitle"],
  subtitle: ["faq.pageSubtitle"],
  sections: [
    // ── Getting Started ──
    {
      id: "what-is-zrp",
      title: ["faq.whatIsZrp.q"],
      body: [
        H("faq.cat.gettingStarted"),
        P("faq.whatIsZrp.p1Bold", "faq.whatIsZrp.p1"),
        P("faq.whatIsZrp.p2"),
        P("faq.whatIsZrp.p3"),
        CALLOUT("faq.whatIsZrp.noteBold", "faq.whatIsZrp.noteText"),
      ],
    },
    {
      id: "how-to-register",
      title: ["faq.howToRegister.q"],
      body: [
        P("faq.howToRegister.intro"),
        BULLETS(
          ["faq.howToRegister.step1Prefix", "faq.howToRegister.step1Link", "faq.howToRegister.step1Rest"],
          ["faq.howToRegister.step2"],
          ["faq.howToRegister.step3"],
          ["faq.howToRegister.step4"],
          ["faq.howToRegister.step5"],
          ["faq.howToRegister.step6"]
        ),
        P("faq.howToRegister.note"),
      ],
    },
    {
      id: "how-to-login",
      title: ["faq.howToLogin.q"],
      body: [
        P("faq.howToLogin.intro"),
        BULLETS(
          ["faq.howToLogin.step1Prefix", "faq.howToLogin.step1Link", "faq.howToLogin.step1Rest"],
          ["faq.howToLogin.step2"],
          ["faq.howToLogin.step3"],
          ["faq.howToLogin.step4"]
        ),
        P("faq.howToLogin.note"),
      ],
    },
    {
      id: "password-reset",
      title: ["faq.passwordReset.q"],
      body: [
        P("faq.passwordReset.intro"),
        BULLETS(
          ["faq.passwordReset.step1Prefix", "faq.passwordReset.step1Link", "faq.passwordReset.step1Rest"],
          ["faq.passwordReset.step2"],
          ["faq.passwordReset.step3"],
          ["faq.passwordReset.step4"],
          ["faq.passwordReset.step5"],
          ["faq.passwordReset.step6"]
        ),
        P("faq.passwordReset.note"),
      ],
    },
    // ── Profile & Media ──
    {
      id: "avatar-size",
      title: ["faq.avatarSize.q"],
      body: [
        H("faq.cat.profileMedia"),
        P("faq.avatarSize.intro"),
        BULLETS(
          ["faq.mediaLabel.maxFileSize", "faq.avatarSize.maxFileSizeVal"],
          ["faq.mediaLabel.supportedFormats", "faq.avatarSize.formatsVal"],
          ["faq.mediaLabel.recommendedResolution", "faq.avatarSize.resolutionVal"],
          ["faq.mediaLabel.recommendedRatio", "faq.avatarSize.ratioVal"]
        ),
        P("faq.avatarSize.note"),
      ],
    },
    {
      id: "banner-size",
      title: ["faq.bannerSize.q"],
      body: [
        P("faq.bannerSize.intro"),
        BULLETS(
          ["faq.mediaLabel.maxFileSize", "faq.bannerSize.maxFileSizeVal"],
          ["faq.mediaLabel.supportedFormats", "faq.bannerSize.formatsVal"],
          ["faq.mediaLabel.recommendedResolution", "faq.bannerSize.resolutionVal"],
          ["faq.mediaLabel.recommendedRatio", "faq.bannerSize.ratioVal"]
        ),
      ],
    },
    {
      id: "post-image-size",
      title: ["faq.postImageSize.q"],
      body: [
        P("faq.postImageSize.intro"),
        BULLETS(
          ["faq.mediaLabel.maxFileSize", "faq.postImageSize.maxFileSizeVal"],
          ["faq.mediaLabel.supportedFormats", "faq.postImageSize.formatsVal"],
          ["faq.mediaLabel.recommendedResolution", "faq.postImageSize.resolutionVal"],
          ["faq.mediaLabel.recommendedRatio", "faq.postImageSize.ratioVal"]
        ),
      ],
    },
    {
      id: "post-video-size",
      title: ["faq.postVideoSize.q"],
      body: [
        P("faq.postVideoSize.intro"),
        BULLETS(
          ["faq.mediaLabel.maxFileSize", "faq.postVideoSize.maxFileSizeVal"],
          ["faq.mediaLabel.supportedFormats", "faq.postVideoSize.formatsVal"],
          ["faq.mediaLabel.recommendedResolution", "faq.postVideoSize.resolutionVal"],
          ["faq.mediaLabel.recommendedEncoding", "faq.postVideoSize.encodingVal"],
          ["faq.mediaLabel.recommendedDuration", "faq.postVideoSize.durationVal"]
        ),
        P("faq.postVideoSize.note"),
      ],
    },
    {
      id: "chat-image-size",
      title: ["faq.chatImageSize.q"],
      body: [
        BULLETS(
          ["faq.mediaLabel.maxFileSize", "faq.chatImageSize.maxFileSizeVal"],
          ["faq.mediaLabel.supportedFormats", "faq.chatImageSize.formatsVal"],
          ["faq.mediaLabel.recommendedResolution", "faq.chatImageSize.resolutionVal"]
        ),
        P("faq.chatImageSize.note"),
      ],
    },
    // ── Posts & Interactions ──
    {
      id: "how-to-post",
      title: ["faq.howToPost.q"],
      body: [
        H("faq.cat.postsInteractions"),
        P("faq.howToPost.intro"),
        BULLETS(
          ["faq.howToPost.step1"],
          ["faq.howToPost.step2"],
          ["faq.howToPost.step3"],
          ["faq.howToPost.step4"],
          ["faq.howToPost.step5"],
          ["faq.howToPost.step6"]
        ),
        P("faq.howToPost.note"),
      ],
    },
    {
      id: "how-to-schedule-post",
      title: ["faq.schedulePost.q"],
      body: [
        P("faq.schedulePost.intro"),
        BULLETS(["faq.schedulePost.step1"], ["faq.schedulePost.step2"], ["faq.schedulePost.step3"], ["faq.schedulePost.step4"]),
        P("faq.schedulePost.note"),
      ],
    },
    {
      id: "how-to-comment",
      title: ["faq.howToComment.q"],
      body: [
        P("faq.howToComment.intro"),
        BULLETS(["faq.howToComment.step1"], ["faq.howToComment.step2"], ["faq.howToComment.step3"], ["faq.howToComment.step4"]),
        P("faq.howToComment.note"),
      ],
    },
    {
      id: "hashtags-mentions",
      title: ["faq.hashtagsMentions.q"],
      body: [
        P("faq.hashtagsMentions.hashtagsBold", "faq.hashtagsMentions.hashtagsText"),
        P("faq.hashtagsMentions.exampleLabel", "#ZRP"),
        P("faq.hashtagsMentions.mentionsBold", "faq.hashtagsMentions.mentionsText"),
        P("faq.hashtagsMentions.exampleLabel", "@username"),
        P("faq.hashtagsMentions.note"),
      ],
    },
    {
      id: "how-to-pin-post",
      title: ["faq.pinPost.q"],
      body: [
        BULLETS(["faq.pinPost.step1"], ["faq.pinPost.step2"], ["faq.pinPost.step3"], ["faq.pinPost.step4"]),
        P("faq.pinPost.note"),
      ],
    },
    // ── Messaging & Calls ──
    {
      id: "how-to-message",
      title: ["faq.howToMessage.q"],
      body: [
        H("faq.cat.messagingCalls"),
        BULLETS(["faq.howToMessage.step1"], ["faq.howToMessage.step2"], ["faq.howToMessage.step3"], ["faq.howToMessage.step4"]),
        P("faq.howToMessage.note"),
      ],
    },
    {
      id: "how-to-call",
      title: ["faq.howToCall.q"],
      body: [
        BULLETS(["faq.howToCall.step1"], ["faq.howToCall.step2"], ["faq.howToCall.step3"], ["faq.howToCall.step4"]),
        P("faq.howToCall.note"),
      ],
    },
    {
      id: "read-receipts",
      title: ["faq.readReceipts.q"],
      body: [
        P("faq.readReceipts.intro"),
        BULLETS(
          ["faq.readReceipts.singleBold", "faq.readReceipts.singleText"],
          ["faq.readReceipts.doubleBold", "faq.readReceipts.doubleText"]
        ),
      ],
    },
    // ── Privacy & Safety ──
    {
      id: "privacy-policy-faq",
      title: ["faq.privacyPolicyFaq.q"],
      body: [
        H("faq.cat.privacySafety"),
        P("faq.privacyPolicyFaq.intro"),
        BULLETS(
          ["faq.privacyPolicyFaq.item1"],
          ["faq.privacyPolicyFaq.item2"],
          ["faq.privacyPolicyFaq.item3"],
          ["faq.privacyPolicyFaq.item4"],
          ["faq.privacyPolicyFaq.item5"]
        ),
        P("faq.privacyPolicyFaq.readMore", "faq.privacyPolicyFaq.readMoreLink", "."),
      ],
    },
    {
      id: "how-to-report",
      title: ["faq.howToReport.q"],
      body: [
        BULLETS(
          ["faq.howToReport.step1"],
          ["faq.howToReport.step2"],
          ["faq.howToReport.step3"],
          ["faq.howToReport.step4"],
          ["faq.howToReport.step5"],
          ["faq.howToReport.step6"]
        ),
        P("faq.howToReport.note"),
      ],
    },
    {
      id: "how-to-block",
      title: ["faq.howToBlock.q"],
      body: [
        BULLETS(["faq.howToBlock.step1"], ["faq.howToBlock.step2"], ["faq.howToBlock.step3"], ["faq.howToBlock.step4"]),
        P("faq.howToBlock.note"),
      ],
    },
    {
      id: "delete-account-faq",
      title: ["faq.deleteAccountFaq.q"],
      body: [
        P("faq.deleteAccountFaq.intro"),
        BULLETS(
          ["faq.deleteAccountFaq.step1Prefix", "faq.deleteAccountFaq.step1Link", "."],
          ["faq.deleteAccountFaq.step2"],
          ["faq.deleteAccountFaq.step3"],
          ["faq.deleteAccountFaq.step4"],
          ["faq.deleteAccountFaq.step5"]
        ),
        CALLOUT("faq.deleteAccountFaq.warningBold", "faq.deleteAccountFaq.warningText"),
        P("faq.deleteAccountFaq.seeMorePrefix", "faq.deleteAccountFaq.seeMoreLink", "faq.deleteAccountFaq.seeMoreSuffix"),
      ],
    },
    // ── ZRP Trust Passport ──
    {
      id: "what-is-trust-passport",
      title: ["faq.whatIsTrustPassport.q"],
      body: [
        H("faq.cat.trustPassport"),
        P("faq.whatIsTrustPassport.p1Bold", "faq.whatIsTrustPassport.p1"),
        P("faq.whatIsTrustPassport.p2Prefix", "faq.whatIsTrustPassport.p2Bold", "faq.whatIsTrustPassport.p2"),
        CALLOUT("faq.whatIsTrustPassport.calloutBold", "faq.whatIsTrustPassport.calloutText"),
      ],
    },
    {
      id: "trust-score-calculation",
      title: ["faq.trustScoreCalc.q"],
      body: [
        P("faq.trustScoreCalc.p1"),
        P("faq.trustScoreCalc.p2"),
        BULLETS(
          ["faq.trustScoreCalc.item1"],
          ["faq.trustScoreCalc.item2"],
          ["faq.trustScoreCalc.item3"],
          ["faq.trustScoreCalc.item4"],
          ["faq.trustScoreCalc.item5"],
          ["faq.trustScoreCalc.item6"],
          ["faq.trustScoreCalc.item7"],
          ["faq.trustScoreCalc.item8"]
        ),
        P("faq.trustScoreCalc.note"),
      ],
    },
    {
      id: "trust-levels",
      title: ["faq.trustLevels.q"],
      body: [
        P("faq.trustLevels.intro"),
        CARDS(
          card(["faq.trustLevels.level1Name"], ["faq.trustLevels.level1Desc"], ["0-34"]),
          card(["faq.trustLevels.level2Name"], ["faq.trustLevels.level2Desc"], ["35-54"]),
          card(["faq.trustLevels.level3Name"], ["faq.trustLevels.level3Desc"], ["55-74"]),
          card(["faq.trustLevels.level4Name"], ["faq.trustLevels.level4Desc"], ["75-89"]),
          card(["faq.trustLevels.level5Name"], ["faq.trustLevels.level5Desc"], ["90-100"])
        ),
      ],
    },
    {
      id: "trust-score-change",
      title: ["faq.trustScoreChange.q"],
      body: [P("faq.trustScoreChange.p1"), P("faq.trustScoreChange.p2"), P("faq.trustScoreChange.note")],
    },
    {
      id: "trust-score-not-popularity",
      title: ["faq.trustNotPopularity.q"],
      body: [
        P("faq.trustNotPopularity.noBold", "faq.trustNotPopularity.p1"),
        P("faq.trustNotPopularity.p2"),
        P("faq.trustNotPopularity.p3"),
      ],
    },
    {
      id: "trust-score-not-identity",
      title: ["faq.trustNotIdentity.q"],
      body: [
        P("faq.trustNotIdentity.p1Prefix", "faq.trustNotIdentity.p1Bold", "faq.trustNotIdentity.p1Suffix"),
        P("faq.trustNotIdentity.p2"),
        CALLOUT("faq.trustNotIdentity.warningBold", "faq.trustNotIdentity.warningText"),
      ],
    },
    {
      id: "trust-passport-private-data",
      title: ["faq.trustPrivateData.q"],
      body: [
        P("faq.trustPrivateData.p1"),
        P("faq.trustPrivateData.p2"),
        BULLETS(
          ["faq.trustPrivateData.item1"],
          ["faq.trustPrivateData.item2"],
          ["faq.trustPrivateData.item3"],
          ["faq.trustPrivateData.item4"],
          ["faq.trustPrivateData.item5"],
          ["faq.trustPrivateData.item6"],
          ["faq.trustPrivateData.item7"]
        ),
        P("faq.trustPrivateData.note"),
      ],
    },
    {
      id: "trust-passport-location",
      title: ["faq.trustLocation.q"],
      body: [
        P("faq.trustLocation.p1Prefix", "faq.trustLocation.p1Bold", "."),
        P("faq.trustLocation.p2"),
        P("faq.trustLocation.note"),
      ],
    },
    {
      id: "trust-passport-verification",
      title: ["faq.trustVerification.q"],
      body: [
        P("faq.trustVerification.p1"),
        P("faq.trustVerification.p2Prefix", "faq.trustVerification.p2Bold", "."),
        CARDS(
          card(["faq.trustVerification.verifCardTitle"], ["faq.trustVerification.verifCardDesc"]),
          card(["faq.trustVerification.passportCardTitle"], ["faq.trustVerification.passportCardDesc"])
        ),
      ],
    },
    {
      id: "trust-passport-not-moderation",
      title: ["faq.trustNotModeration.q"],
      body: [P("faq.trustNotModeration.p1"), P("faq.trustNotModeration.p2"), P("faq.trustNotModeration.p3")],
    },
    {
      id: "trust-passport-guarantee",
      title: ["faq.trustGuarantee.q"],
      body: [P("faq.trustGuarantee.p1"), P("faq.trustGuarantee.p2"), CALLOUT("faq.trustGuarantee.calloutText")],
    },
    // ── Charity & Impact ──
    {
      id: "charity-model",
      title: ["faq.charityModel.q"],
      body: [
        H("faq.cat.charityImpact"),
        P("faq.charityModel.p1Prefix", "faq.charityModel.p1Bold", "faq.charityModel.p1Suffix"),
        P("faq.charityModel.p2"),
        BULLETS(["faq.charityModel.item1"], ["faq.charityModel.item2"], ["faq.charityModel.item3"], ["faq.charityModel.item4"]),
        CALLOUT("faq.charityModel.calloutBold", "faq.charityModel.calloutText"),
      ],
    },
    {
      id: "impact-badge",
      title: ["faq.impactBadge.q"],
      body: [P("faq.impactBadge.p1"), P("faq.impactBadge.note")],
    },
    // ── ZRP Market Plus ──
    {
      id: "what-is-market-plus",
      title: ["faq.whatIsMarketPlus.q"],
      body: [
        H("faq.cat.marketPlus"),
        P("faq.whatIsMarketPlus.p1Bold", "faq.whatIsMarketPlus.p1"),
        P("faq.whatIsMarketPlus.p2"),
        P("faq.whatIsMarketPlus.note"),
      ],
    },
    {
      id: "how-to-list-market",
      title: ["faq.howToListMarket.q"],
      body: [
        P("faq.howToListMarket.intro"),
        BULLETS(
          ["faq.howToListMarket.step1"],
          ["faq.howToListMarket.step2"],
          ["faq.howToListMarket.step3"],
          ["faq.howToListMarket.step4"],
          ["faq.howToListMarket.step5"]
        ),
        P("faq.howToListMarket.note"),
      ],
    },
    {
      id: "market-plus-limits",
      title: ["faq.marketLimits.q"],
      body: [
        P("faq.marketLimits.intro"),
        BULLETS(
          ["faq.marketLimits.freeLabel", ":", "faq.marketLimits.freeDesc"],
          ["faq.marketLimits.proLabel", ":", "faq.marketLimits.proDesc"],
          ["faq.marketLimits.businessLabel", ":", "faq.marketLimits.businessDesc"],
          ["faq.marketLimits.enterpriseLabel", ":", "faq.marketLimits.enterpriseDesc"]
        ),
        P("faq.marketLimits.note"),
      ],
    },
    {
      id: "market-plus-moderation",
      title: ["faq.marketModeration.q"],
      body: [P("faq.marketModeration.p1"), P("faq.marketModeration.p2"), P("faq.marketModeration.note")],
    },
    {
      id: "contact-seller-market",
      title: ["faq.contactSeller.q"],
      body: [P("faq.contactSeller.p1"), P("faq.contactSeller.p2")],
    },
    // ── Web3 & Digital ──
    {
      id: "web3-zrp",
      title: ["faq.web3Zrp.q"],
      body: [
        H("faq.cat.web3Digital"),
        P("faq.web3Zrp.p1"),
        P("faq.web3Zrp.p2"),
        P("faq.web3Zrp.p3"),
        CALLOUT("faq.web3Zrp.calloutBold", "faq.web3Zrp.calloutText"),
      ],
    },
    {
      id: "digital-payments",
      title: ["faq.digitalPayments.q"],
      body: [P("faq.digitalPayments.p1"), P("faq.digitalPayments.p2"), P("faq.digitalPayments.p3"), P("faq.digitalPayments.note")],
    },
    {
      id: "wallets",
      title: ["faq.wallets.q"],
      body: [
        P("faq.wallets.p1"),
        P("faq.wallets.p2"),
        BULLETS(["faq.wallets.item1"], ["faq.wallets.item2"], ["faq.wallets.item3"], ["faq.wallets.item4"]),
        CALLOUT("faq.wallets.warningBold", "faq.wallets.warningText"),
      ],
    },
    {
      id: "blockchain-transactions",
      title: ["faq.blockchainTx.q"],
      body: [P("faq.blockchainTx.p1"), P("faq.blockchainTx.p2"), P("faq.blockchainTx.note")],
    },
    {
      id: "crypto-risk",
      title: ["faq.cryptoRisk.q"],
      body: [P("faq.cryptoRisk.p1"), P("faq.cryptoRisk.p2"), P("faq.cryptoRisk.note")],
    },
    {
      id: "digital-identity",
      title: ["faq.digitalIdentity.q"],
      body: [P("faq.digitalIdentity.p1"), P("faq.digitalIdentity.p2"), P("faq.digitalIdentity.note")],
    },
    {
      id: "zrp-token",
      title: ["faq.zrpToken.q"],
      body: [P("faq.zrpToken.p1"), P("faq.zrpToken.p2"), CALLOUT("faq.zrpToken.calloutBold", "faq.zrpToken.calloutText")],
    },
    // ── Administration ──
    {
      id: "admin-roles",
      title: ["faq.adminRoles.q"],
      body: [
        H("faq.cat.administration"),
        P("faq.adminRoles.p1"),
        P("faq.adminRoles.userLabel", ":", "faq.adminRoles.userDesc"),
        P("faq.adminRoles.modLabel", ":", "faq.adminRoles.modDesc"),
        P("faq.adminRoles.adminLabel", ":", "faq.adminRoles.adminDesc"),
        P("faq.adminRoles.note"),
      ],
    },
    {
      id: "verified-badge",
      title: ["faq.verifiedBadge.q"],
      body: [
        BULLETS(
          ["faq.verifiedBadge.verifiedLabel", ":", "faq.verifiedBadge.verifiedDesc"],
          ["faq.verifiedBadge.orgLabel", ":", "faq.verifiedBadge.orgDesc"],
          ["faq.verifiedBadge.govLabel", ":", "faq.verifiedBadge.govDesc"],
          ["faq.verifiedBadge.teamLabel", ":", "faq.verifiedBadge.teamDesc"]
        ),
        CALLOUT("faq.verifiedBadge.calloutBold", "faq.verifiedBadge.calloutText"),
        P("faq.verifiedBadge.note"),
      ],
    },
    {
      id: "enterprise-plan",
      title: ["faq.enterprisePlan.q"],
      body: [
        P("faq.enterprisePlan.p1"),
        BULLETS(
          ["faq.enterprisePlan.item1"],
          ["faq.enterprisePlan.item2"],
          ["faq.enterprisePlan.item3"],
          ["faq.enterprisePlan.item4"],
          ["faq.enterprisePlan.item5"],
          ["faq.enterprisePlan.item6"]
        ),
        P("faq.enterprisePlan.note"),
      ],
    },
    // ── Support & Tickets ──
    {
      id: "support-tickets-faq",
      title: ["faq.supportTickets.q"],
      body: [
        H("faq.cat.supportTickets"),
        BULLETS(
          ["faq.supportTickets.step1Prefix", "faq.supportTickets.step1Link", "faq.supportTickets.step1Suffix"],
          ["faq.supportTickets.step2"],
          ["faq.supportTickets.step3"],
          ["faq.supportTickets.step4"],
          ["faq.supportTickets.step5"]
        ),
        P("faq.supportTickets.note"),
      ],
    },
    {
      id: "track-support-tickets",
      title: ["faq.trackTickets.q"],
      body: [
        BULLETS(
          ["faq.trackTickets.step1Prefix", "faq.trackTickets.step1Link", "."],
          ["faq.trackTickets.step2"],
          ["faq.trackTickets.step3"],
          ["faq.trackTickets.step4"]
        ),
      ],
    },
    {
      id: "admin-ticket-management",
      title: ["faq.adminTicketMgmt.q"],
      body: [
        P("faq.adminTicketMgmt.p1"),
        BULLETS(
          ["faq.adminTicketMgmt.item1"],
          ["faq.adminTicketMgmt.item2"],
          ["faq.adminTicketMgmt.item3"],
          ["faq.adminTicketMgmt.item4"],
          ["faq.adminTicketMgmt.item5"],
          ["faq.adminTicketMgmt.item6"]
        ),
        P("faq.adminTicketMgmt.note"),
      ],
    },
    {
      id: "ticket-statuses",
      title: ["faq.ticketStatuses.q"],
      body: [
        BULLETS(
          ["OPEN", ":", "faq.ticketStatuses.openDesc"],
          ["IN_PROGRESS", ":", "faq.ticketStatuses.inProgressDesc"],
          ["AWAITING_REPLY", ":", "faq.ticketStatuses.awaitingReplyDesc"],
          ["RESOLVED", ":", "faq.ticketStatuses.resolvedDesc"],
          ["CLOSED", ":", "faq.ticketStatuses.closedDesc"]
        ),
      ],
    },
    // ── Legal & Account ──
    {
      id: "terms-faq",
      title: ["faq.termsFaq.q"],
      body: [
        H("faq.cat.legalAccount"),
        P("faq.termsFaq.p1Prefix", "faq.termsFaq.p1Link", "."),
        P("faq.termsFaq.note"),
      ],
    },
    {
      id: "community-guidelines-faq",
      title: ["faq.communityGuidelines.q"],
      body: [P("faq.communityGuidelines.p1"), P("faq.communityGuidelines.p2")],
    },
    {
      id: "account-suspension",
      title: ["faq.accountSuspension.q"],
      body: [
        P("faq.accountSuspension.p1"),
        P("faq.accountSuspension.p2"),
        BULLETS(
          ["faq.accountSuspension.item1"],
          ["faq.accountSuspension.item2"],
          ["faq.accountSuspension.item3"],
          ["faq.accountSuspension.item4"],
          ["faq.accountSuspension.item5"]
        ),
        P("faq.accountSuspension.note"),
      ],
    },
    {
      id: "appeal-moderation",
      title: ["faq.appealModeration.q"],
      body: [
        P("faq.appealModeration.p1"),
        BULLETS(
          ["faq.appealModeration.step1"],
          ["faq.appealModeration.step2"],
          ["faq.appealModeration.step3"],
          ["faq.appealModeration.step4"],
          ["faq.appealModeration.step5"]
        ),
        P("faq.appealModeration.note"),
      ],
    },
  ],
};

export const LEGAL_CONFIGS: Record<LegalPageId, PageConfig> = {
  terms: TERMS_CONFIG,
  privacy: PRIVACY_CONFIG,
  guidelines: GUIDELINES_CONFIG,
  help: HELP_CONFIG,
  contact: CONTACT_CONFIG,
  about: ABOUT_CONFIG,
  careers: CAREERS_CONFIG,
  charity: CHARITY_CONFIG,
  press: PRESS_CONFIG,
  investors: INVESTORS_CONFIG,
  faq: FAQ_CONFIG,
};
