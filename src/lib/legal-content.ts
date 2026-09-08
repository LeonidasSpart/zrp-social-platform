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

export type LegalPageId = "terms" | "privacy" | "guidelines" | "help" | "contact";

export const LEGAL_PAGE_IDS: LegalPageId[] = [
  "terms",
  "privacy",
  "guidelines",
  "help",
  "contact",
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

export const LEGAL_CONFIGS: Record<LegalPageId, PageConfig> = {
  terms: TERMS_CONFIG,
  privacy: PRIVACY_CONFIG,
  guidelines: GUIDELINES_CONFIG,
  help: HELP_CONFIG,
  contact: CONTACT_CONFIG,
};
