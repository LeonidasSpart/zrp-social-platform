"use client";

import Link from "next/link";
import {
  ShieldCheck,
  Globe2,
  Smartphone,
  MessageCircle,
  Users,
  Coins,
  Briefcase,
  Megaphone,
  Newspaper,
  Music2,
  Gamepad2,
  Store,
  Award,
  Video,
  Lock,
  Server,
  Layers,
  Languages,
  BadgeCheck,
  Scale,
  TrendingUp,
  Building2,
  UserCheck,
  Landmark,
  Rocket,
  Mail,
} from "lucide-react";

/**
 * Investor Relations page.
 *
 * Content policy for this page specifically: every factual claim below
 * is sourced from this repository (Prisma schema, src/lib/limits.ts,
 * package.json, other public pages already live on zrp.one) or from an
 * explicitly cited external source with a date. Nothing here is
 * projected, estimated, or aspirational unless labeled as such. See the
 * PR description for the section-by-section source list.
 *
 * Deliberately not routed through the site's t() translation system:
 * this is long-form, legally-sensitive investor content, and mechanically
 * translating financial/legal language into 29 languages under time
 * pressure risks introducing meaning it wasn't reviewed for. English is
 * standard for investor relations content even on fully localized
 * corporate sites. Flagged explicitly in the PR as a scoped decision,
 * not an oversight.
 */

const PLATFORM_ECOSYSTEM = [
  {
    icon: MessageCircle,
    title: "Social Feed",
    description:
      "Posts, replies, reactions, reposts, bookmarks, polls, 24-hour Stories, hashtags, quote-posts, and a personalized Discover feed.",
  },
  {
    icon: Video,
    title: "ZRP Shorts",
    description: "A dedicated short-form video surface for discovering and posting vertical video content.",
  },
  {
    icon: Users,
    title: "Communities & Lists",
    description: "Hashtag-driven topic communities with owner/admin/member roles, plus curated public or private user Lists.",
  },
  {
    icon: MessageCircle,
    title: "Messaging & Calls",
    description: "Real-time direct and group messaging, with WebRTC voice and video calling, link previews, and GIF support.",
  },
  {
    icon: Coins,
    title: "Creator Monetization",
    description: "USDC tips settled over Solana, pay-per-view premium posts, and a creator dashboard with withdrawal requests.",
  },
  {
    icon: Briefcase,
    title: "Business Tools",
    description: "Custom profile URLs, recruitment posts, long-form articles, team management, and API key access on paid plans.",
  },
  {
    icon: Store,
    title: "Marketplace & Opportunity",
    description: "Peer-to-peer listings and a dedicated recruitment/opportunity board with applications and saved listings.",
  },
  {
    icon: Megaphone,
    title: "Advertising",
    description: "Self-serve ad campaigns funded in USDC over Solana, with country-level targeting and admin review before they run.",
  },
  {
    icon: Gamepad2,
    title: "ZRP PLAY",
    description: "A server-authoritative mini-games layer with XP, daily challenges, leaderboards, and 1v1 duels across five live game types.",
  },
  {
    icon: Newspaper,
    title: "News",
    description: "An aggregated news feed pulling from external sources into a dedicated in-app reading surface.",
  },
  {
    icon: Music2,
    title: "Music",
    description: "Artist, album, track, and playlist browsing with likes, follows, and listening history.",
  },
  {
    icon: Award,
    title: "Ambassadors & Trust",
    description: "A country-level community-representative program, and a public per-account Trust Passport showing verification and activity signals.",
  },
];

const BUSINESS_MODEL = [
  {
    icon: BadgeCheck,
    title: "Subscriptions",
    what: "Four account tiers: Free, Pro, Business, and Enterprise, each unlocking higher post/media limits, a verified badge, a custom profile URL, article publishing, team management, API access, and faster support.",
    who: "Individual users who want higher limits and a verified badge, and businesses that need team accounts, recruitment tools, or API access.",
    value: "Recurring, predictable revenue tied directly to product usage, not engagement-driven advertising alone.",
  },
  {
    icon: Coins,
    title: "Creator Monetization",
    what: "Creators receive USDC tips from their audience, settled on Solana, and can publish pay-per-view premium posts. Payouts are requested through a creator dashboard.",
    who: "Individual creators are paid directly by the people who follow them.",
    value: "Gives ZRP a direct incentive to grow and retain an active creator base, the same base that drives content and engagement platform-wide.",
  },
  {
    icon: Megaphone,
    title: "Advertising",
    what: "Advertisers fund self-serve campaigns in USDC over Solana, with bid- and budget-based spend, optional country targeting, and admin review before a campaign goes live.",
    who: "Businesses and creators promoting a post to a wider or geographically targeted audience.",
    value: "A second, usage-based revenue line independent of subscriptions, scaling with platform activity.",
  },
];

const ROADMAP = [
  {
    label: "Now",
    items: [
      "29 supported languages across Web, PWA, Android, and iOS, maintained as a shared translation source of truth.",
      "Continued platform hardening: authentication, moderation, and abuse-prevention work across all client surfaces.",
    ],
  },
  {
    label: "Next",
    items: [
      "Expanding ZRP PLAY beyond its five live game types (Trivia, Memory, Logic, Reaction, Sequence), documented internally as a phased game-catalogue roadmap.",
      "Continued build-out of the creator and business toolset already live today (monetization, team accounts, API access).",
    ],
  },
  {
    label: "Longer term",
    items: [
      "Growing ZRP's community, creator, and business ecosystem around the product foundation already shipped.",
      "Evaluating additional product surfaces as the platform and its user base grow.",
    ],
  },
];

const GROWTH_AREAS = [
  { icon: Server, title: "Infrastructure & Scalability", description: "Expanding hosting capacity, caching, and real-time infrastructure as usage grows." },
  { icon: Lock, title: "Security & Trust", description: "Deeper investment in abuse prevention, moderation tooling, and account protection." },
  { icon: Layers, title: "Product Development", description: "Accelerating work already underway across the existing product ecosystem." },
  { icon: Globe2, title: "Global Expansion", description: "Growing ZRP's country and community structure through the Ambassador program and further localization." },
  { icon: Users, title: "Creator & Business Ecosystem", description: "Expanding the tools and monetization paths available to creators and business accounts." },
];

const INVESTOR_TYPES = [
  { icon: UserCheck, label: "Individual investors" },
  { icon: Rocket, label: "Angel investors" },
  { icon: Building2, label: "Strategic investors" },
  { icon: Landmark, label: "Family offices" },
  { icon: TrendingUp, label: "Venture capital" },
  { icon: Briefcase, label: "Corporate partners" },
];

const FAQ = [
  {
    q: "What is ZRP?",
    a: "ZRP Social is a social platform built from Switzerland and Europe: a feed, messaging, communities, short-form video, creator monetization, business tools, marketplace, and more, unified under a single account.",
  },
  {
    q: "Where is ZRP based?",
    a: "ZRP is built from Switzerland with a European approach to privacy, security, and free expression. A full registered legal entity and postal address will be published once officially confirmed.",
  },
  {
    q: "What products does ZRP offer?",
    a: "A core social feed, ZRP Shorts, private and group messaging with voice/video calls, Communities and Lists, ZRP PLAY, a Marketplace, an Opportunity/recruitment board, News, Music, creator monetization tools, business tools, and self-serve advertising. See the Platform Ecosystem section above for detail.",
  },
  {
    q: "Who is ZRP built for?",
    a: "Everyday users looking for a social platform, creators who want to monetize an audience, and businesses that need recruitment, team, or API tools alongside a public presence.",
  },
  {
    q: "How does ZRP generate revenue?",
    a: "Three verified mechanisms today: paid subscription tiers (Pro, Business, Enterprise), creator monetization (tips and premium posts), and self-serve advertising. See the Business Model section above for how each works.",
  },
  {
    q: "What stage is ZRP at?",
    a: "ZRP is live in production today across Web, PWA, Android, and iOS, with the product ecosystem described on this page already shipped and in use.",
  },
  {
    q: "Where is ZRP available?",
    a: "ZRP is available worldwide via the web and as native apps on Android and iOS, with the interface translated into 29 languages.",
  },
  {
    q: "What is ZRP's charitable commitment?",
    a: "ZRP has committed 35% of platform profits to charitable causes (orphan support, education, healthcare, and climate relief), reported quarterly, with the first transparency report scheduled for Q3 2026. Live disbursement records are published at zrp.one/charity.",
  },
  {
    q: "What does ZRP plan to build next?",
    a: "See the Roadmap section above. In short: continued platform hardening, expansion of ZRP PLAY's game catalogue, and further build-out of the creator and business tools already live.",
  },
  {
    q: "How can investors contact ZRP?",
    a: "Email investors@zrp.one. We respond to genuine investor and strategic-partner inquiries directly.",
  },
];

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="max-w-3xl mx-auto text-center mb-12">
      {eyebrow && (
        <p className="text-sm font-semibold text-zrp-red mb-2 font-inter">{eyebrow}</p>
      )}
      <h2 className="text-3xl sm:text-4xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-zrp-charcoal/70 dark:text-white/70 font-inter leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export default function InvestorsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter">
      <div>

        {/* ─────────────────────────────────────────────────────── */}
        {/* HERO */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="relative bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-block bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium text-white/90 mb-6 font-inter">
              Investor Relations
            </span>

            <img src="/logo.png" alt="ZRP Social Logo" className="h-16 mx-auto mb-6 object-contain" />

            <h1 className="text-4xl sm:text-5xl font-extrabold font-orbitron text-white leading-tight">
              The ZRP Investment Opportunity
            </h1>

            <p className="mt-6 text-xl text-white/90 max-w-2xl mx-auto font-inter">
              ZRP Social is a live social platform built from Switzerland, spanning Web, PWA, Android, and iOS
              today. This page sets out what has been built, how it works, and how to start a conversation with
              our team.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <a
                href="mailto:investors@zrp.one"
                className="px-6 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-200 transition font-inter"
              >
                Contact Investor Relations
              </a>
              <Link
                href="/about"
                className="px-6 py-3 bg-transparent border-2 border-white text-white font-semibold rounded-full shadow-lg hover:bg-white/10 transition font-inter"
              >
                Explore ZRP
              </Link>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* WHAT IS ZRP */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-4xl mx-auto">
          <SectionHeading title="What Is ZRP?" />

          <div className="space-y-5 text-zrp-charcoal/80 dark:text-white/70 font-inter leading-relaxed">
            <p>
              ZRP Social is a social platform: a feed, messaging, communities, short-form video, creator
              monetization, business tools, and more, built as one connected product rather than a single
              standalone app. It is built from Switzerland with a European approach to privacy, security, and
              free expression, and is live in production today across Web, Progressive Web App, and native
              Android and iOS apps, translated into 29 languages.
            </p>
            <p>
              ZRP was built around a straightforward premise: people should be able to connect, communicate,
              create, and build communities on a platform that treats privacy, security, and freedom of
              expression as first-order product requirements, not an afterthought. The platform is built with a
              global ambition from a European base, and is designed as a single connected ecosystem, meaning a
              creator's audience, a business's team, and a community's members all live under one account
              system rather than fragmented across separate products.
            </p>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* THE PROBLEM */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-4xl mx-auto">
            <SectionHeading title="The Problem" />
            <div className="space-y-5 text-zrp-charcoal/80 dark:text-white/70 font-inter leading-relaxed">
              <p>
                Social media usage is large and concentrated. As of April 2026, there were an estimated 5.79
                billion social media user identities worldwide (DataReportal, Digital 2026 Global Overview). In
                Europe specifically, that usage is heavily concentrated in a small number of established
                platforms: as of May 2026, a single platform accounted for over 81% of social media website
                visits across Europe (Statista, European social network visit share, May 2026).
              </p>
              <p>
                That concentration means most people's social experience, including their data, their
                moderation policies, and their monetization terms, runs through a small number of large,
                non-European platforms. It also means creators and businesses building on those platforms have
                limited alternatives if they want a European-headquartered, privacy- and free-expression-focused
                product built to different priorities.
              </p>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* THE ZRP APPROACH */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-4xl mx-auto">
          <SectionHeading title="The ZRP Approach" />
          <div className="space-y-5 text-zrp-charcoal/80 dark:text-white/70 font-inter leading-relaxed">
            <p>
              ZRP is built as a connected ecosystem rather than a single social feed. Social content, messaging,
              communities, creator monetization, business tools, and moderation all sit on the same account
              system, so a creator's audience, a business's recruitment posts, and a community's members are
              part of one coherent product rather than separate apps stitched together after the fact.
            </p>
            <p>
              That structure is deliberate: it means new product surfaces (ZRP PLAY, Marketplace, Opportunity,
              News, Music) extend the same user base and account graph instead of starting from zero, and it
              means monetization (subscriptions, creator payouts, advertising) is built on top of infrastructure
              the platform already owns rather than bolted on from a third party.
            </p>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* PLATFORM ECOSYSTEM */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-6xl mx-auto">
            <SectionHeading
              title="The Platform Ecosystem"
              subtitle="Every item below is a shipped, live feature of ZRP today, not a roadmap item."
            />

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {PLATFORM_ECOSYSTEM.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal"
                  >
                    <div className="w-10 h-10 rounded-lg bg-zrp-red/10 dark:bg-zrp-red/20 flex items-center justify-center text-zrp-red">
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <h3 className="mt-5 text-lg font-bold font-orbitron text-zrp-charcoal dark:text-white">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-zrp-charcoal/70 dark:text-white/70 font-inter text-sm leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* TRACTION */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-6xl mx-auto">
          <SectionHeading title="Traction" />

          <div className="grid sm:grid-cols-3 gap-6">
            <div className="text-center p-7 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
              <div className="text-4xl font-bold font-orbitron text-zrp-red">195,000+</div>
              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">Registered users</p>
              <p className="mt-1 text-xs text-zrp-charcoal/50 dark:text-white/50 font-inter">As of August 8, 2026</p>
            </div>
            <div className="text-center p-7 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
              <div className="text-4xl font-bold font-orbitron text-zrp-red">4</div>
              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">Live platforms</p>
              <p className="mt-1 text-xs text-zrp-charcoal/50 dark:text-white/50 font-inter">Web, PWA, Android, iOS</p>
            </div>
            <div className="text-center p-7 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
              <div className="text-4xl font-bold font-orbitron text-zrp-red">29</div>
              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">Supported languages</p>
              <p className="mt-1 text-xs text-zrp-charcoal/50 dark:text-white/50 font-inter">Full UI localization</p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-zrp-charcoal/50 dark:text-white/50 font-inter max-w-2xl mx-auto">
            The registered-user figure is the most recent published on ZRP's public Press Kit and is shown here
            with its original date rather than restated as current. Investors and press can request more recent
            figures directly from Investor Relations. ZRP also publishes live, continuously updated moderation
            and charity-disbursement data at{" "}
            <Link href="/transparency" className="text-zrp-red hover:underline">
              zrp.one/transparency
            </Link>{" "}
            and{" "}
            <Link href="/charity" className="text-zrp-red hover:underline">
              zrp.one/charity
            </Link>
            .
          </p>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* BUSINESS MODEL */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-5xl mx-auto">
            <SectionHeading
              title="Business Model"
              subtitle="Three revenue mechanisms are live in ZRP today. Each is described below by what it is, who pays, and what value it provides. ZRP does not disclose revenue, margin, or profitability figures."
            />

            <div className="space-y-6">
              {BUSINESS_MODEL.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="bg-white dark:bg-zrp-charcoal/80 p-6 sm:p-8 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-zrp-red/10 dark:bg-zrp-red/20 flex items-center justify-center text-zrp-red flex-shrink-0">
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <h3 className="text-xl font-bold font-orbitron text-zrp-charcoal dark:text-white">
                        {item.title}
                      </h3>
                    </div>
                    <dl className="grid sm:grid-cols-3 gap-4 text-sm font-inter">
                      <div>
                        <dt className="font-semibold text-zrp-charcoal dark:text-white mb-1">What it is</dt>
                        <dd className="text-zrp-charcoal/70 dark:text-white/70 leading-relaxed">{item.what}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-zrp-charcoal dark:text-white mb-1">Who pays</dt>
                        <dd className="text-zrp-charcoal/70 dark:text-white/70 leading-relaxed">{item.who}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-zrp-charcoal dark:text-white mb-1">Value it provides</dt>
                        <dd className="text-zrp-charcoal/70 dark:text-white/70 leading-relaxed">{item.value}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>

            {/* Subscription tiers */}
            <div className="mt-10 bg-white dark:bg-zrp-charcoal/80 p-6 sm:p-8 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
              <h4 className="text-lg font-bold font-orbitron text-zrp-charcoal dark:text-white mb-5">
                Subscription tiers
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                {[
                  { name: "Free", price: "$0" },
                  { name: "Pro", price: "$9.99/mo" },
                  { name: "Business", price: "$49.99/mo" },
                  { name: "Enterprise", price: "$99.99/mo" },
                ].map((plan) => (
                  <div
                    key={plan.name}
                    className="p-4 rounded-lg bg-zrp-silver/10 dark:bg-zrp-charcoal/50 border border-zrp-silver/30 dark:border-zrp-charcoal"
                  >
                    <div className="font-orbitron font-bold text-zrp-charcoal dark:text-white">{plan.name}</div>
                    <div className="text-zrp-red font-semibold mt-1">{plan.price}</div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-zrp-charcoal/50 dark:text-white/50 font-inter text-center">
                Full plan comparison at{" "}
                <Link href="/pricing" className="text-zrp-red hover:underline">
                  zrp.one/pricing
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* MARKET OPPORTUNITY */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-4xl mx-auto">
          <SectionHeading title="Market Opportunity" />

          <div className="space-y-6 font-inter">
            <div className="p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/30">
              <h4 className="font-semibold text-zrp-charcoal dark:text-white mb-2">Market fact</h4>
              <p className="text-sm text-zrp-charcoal/80 dark:text-white/70 leading-relaxed">
                An estimated 5.79 billion social media user identities existed worldwide as of April 2026
                (DataReportal, Digital 2026 Global Overview). In Europe, that market is concentrated: as of May
                2026, one platform accounted for over 81% of social media website visits across the region
                (Statista, European social network visit share, May 2026).
              </p>
            </div>
            <div className="p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/30">
              <h4 className="font-semibold text-zrp-charcoal dark:text-white mb-2">ZRP's target market</h4>
              <p className="text-sm text-zrp-charcoal/80 dark:text-white/70 leading-relaxed">
                People and communities looking for a Swiss- and European-built alternative; creators seeking
                direct monetization tools; and businesses that want recruitment, team, and API features alongside
                a public social presence.
              </p>
            </div>
            <div className="p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/30">
              <h4 className="font-semibold text-zrp-charcoal dark:text-white mb-2">ZRP's opportunity</h4>
              <p className="text-sm text-zrp-charcoal/80 dark:text-white/70 leading-relaxed">
                Build and grow a European-headquartered alternative within an already large and growing global
                market, without claiming any specific market share. ZRP makes no market-share projection or
                return forecast on this page.
              </p>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* TECHNOLOGY & INFRASTRUCTURE */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-5xl mx-auto">
            <SectionHeading title="Technology & Infrastructure" />

            <div className="grid sm:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
                <div className="flex items-center gap-3 mb-3">
                  <Smartphone className="w-5 h-5 text-zrp-red" aria-hidden="true" />
                  <h4 className="font-bold font-orbitron text-zrp-charcoal dark:text-white">Cross-platform</h4>
                </div>
                <p className="text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter leading-relaxed">
                  A Next.js 15 web application with a full Progressive Web App, alongside native Android (Kotlin,
                  Jetpack Compose) and native iOS (Swift, SwiftUI) apps, sharing the same backend and account
                  system.
                </p>
              </div>
              <div className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
                <div className="flex items-center gap-3 mb-3">
                  <Server className="w-5 h-5 text-zrp-red" aria-hidden="true" />
                  <h4 className="font-bold font-orbitron text-zrp-charcoal dark:text-white">Real-time infrastructure</h4>
                </div>
                <p className="text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter leading-relaxed">
                  A custom Node server layering Socket.IO over the application for live messaging, typing
                  indicators, presence, and WebRTC call signaling, backed by PostgreSQL via Prisma and an optional
                  Redis layer for caching and rate limiting.
                </p>
              </div>
              <div className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
                <div className="flex items-center gap-3 mb-3">
                  <Coins className="w-5 h-5 text-zrp-red" aria-hidden="true" />
                  <h4 className="font-bold font-orbitron text-zrp-charcoal dark:text-white">On-chain payments</h4>
                </div>
                <p className="text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter leading-relaxed">
                  Creator tips, premium content purchases, and advertising campaigns are funded and settled in
                  USDC over the Solana network, with on-chain transaction verification before any balance is
                  credited.
                </p>
              </div>
              <div className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
                <div className="flex items-center gap-3 mb-3">
                  <Languages className="w-5 h-5 text-zrp-red" aria-hidden="true" />
                  <h4 className="font-bold font-orbitron text-zrp-charcoal dark:text-white">Localization</h4>
                </div>
                <p className="text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter leading-relaxed">
                  A single translation source of truth drives the interface across Web, Android, and iOS in 29
                  languages, including right-to-left support for Arabic.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* SECURITY & TRUST */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-4xl mx-auto">
          <SectionHeading title="Security & Trust" />

          <div className="space-y-5 text-zrp-charcoal/80 dark:text-white/70 font-inter leading-relaxed">
            <p>
              ZRP authenticates every privileged action against the database at read time rather than trusting a
              cached session claim, so a role, plan, or ban change takes effect immediately rather than on next
              login. Passwords are hashed with bcrypt, rate limiting fails closed rather than open when its cache
              layer is unavailable, and every socket event is authorized against the real database record for
              the users involved before anything is relayed.
            </p>
            <p>
              Moderation is built around a structured reporting and appeals system, and ZRP publishes a live,
              public dashboard of its own moderation activity, including report volume, resolution time, and
              appeal outcomes, at{" "}
              <Link href="/transparency" className="text-zrp-red hover:underline">
                zrp.one/transparency
              </Link>
              . Every user also has a public Trust Passport showing verification and account-activity signals.
            </p>
            <p className="text-sm text-zrp-charcoal/60 dark:text-white/60">
              No platform can claim to be immune to abuse or compromise, and ZRP does not make that claim here.
              What ZRP does commit to is continuous investment in these systems, and publishing real moderation
              data rather than a marketing summary of it.
            </p>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* SWISS / EUROPEAN POSITIONING */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <SectionHeading title="Built From Switzerland, With a Global Ambition" />
            <p className="text-zrp-charcoal/80 dark:text-white/70 font-inter leading-relaxed">
              ZRP is built from Switzerland with a European approach to privacy, security, and free expression.
              This is a foundational design and brand choice, reflected throughout the product, not a claim of
              any specific regulatory status, government endorsement, or licensing. ZRP's full registered legal
              entity details will be published once officially confirmed.
            </p>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* SOCIAL IMPACT */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-6xl mx-auto">
          <div className="bg-gradient-to-r from-zrp-red to-zrp-darkRed rounded-xl p-8 sm:p-10 text-white">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-3xl font-bold font-orbitron">Growth With a Purpose</h2>
                <p className="mt-4 text-white/90 font-inter leading-relaxed">
                  ZRP has committed 35% of platform profits to charitable causes: orphan support, education,
                  healthcare, and climate relief, reported quarterly, with the first transparency report scheduled
                  for Q3 2026. This is a company commitment on platform profit, not a claim that investors
                  personally donate any portion of an investment. Real, itemized disbursement records are
                  published live at{" "}
                  <Link href="/charity" className="underline hover:no-underline">
                    zrp.one/charity
                  </Link>
                  .
                </p>
              </div>
              <div className="text-center">
                <div className="text-6xl font-bold font-orbitron">35%</div>
                <p className="mt-2 text-white/80 font-inter">of platform profits committed to charity</p>
                <div className="mt-5 text-3xl" aria-hidden="true">👶 📚 🏥 🌍</div>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* ROADMAP */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-5xl mx-auto">
            <SectionHeading
              title="Roadmap"
              subtitle="Reflects current, documented product direction. No dates are promised beyond what is stated."
            />
            <div className="grid md:grid-cols-3 gap-6">
              {ROADMAP.map((stage) => (
                <div
                  key={stage.label}
                  className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal"
                >
                  <h4 className="text-sm font-bold uppercase tracking-wide text-zrp-red font-inter mb-4">
                    {stage.label}
                  </h4>
                  <ul className="space-y-3">
                    {stage.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-zrp-charcoal/80 dark:text-white/70 font-inter">
                        <span className="text-zrp-red mt-1" aria-hidden="true">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* GROWTH OPPORTUNITIES */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-6xl mx-auto">
          <SectionHeading
            title="What Investment Can Accelerate"
            subtitle="Strategic capital and partnerships would be directed toward the areas below. This describes strategic use of resources, not a projection of returns."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {GROWTH_AREAS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex items-start gap-4 p-6 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal"
                >
                  <div className="w-10 h-10 rounded-lg bg-zrp-red/10 dark:bg-zrp-red/20 flex items-center justify-center text-zrp-red flex-shrink-0">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-zrp-charcoal dark:text-white font-orbitron">{item.title}</h3>
                    <p className="mt-1 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* INVESTOR TYPES */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-4xl mx-auto">
            <SectionHeading title="Who We Are Looking For" />
            <div className="grid sm:grid-cols-2 gap-4">
              {INVESTOR_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <div
                    key={type.label}
                    className="flex items-center gap-3 p-4 bg-white dark:bg-zrp-charcoal/80 rounded-lg border border-zrp-silver/30 dark:border-zrp-charcoal"
                  >
                    <Icon className="w-5 h-5 text-zrp-red flex-shrink-0" aria-hidden="true" />
                    <span className="text-zrp-charcoal/90 dark:text-white/80 font-inter">{type.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* INVESTOR RELATIONS CTA */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-16 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white font-orbitron">
              Building social infrastructure takes technology, capital, and long-term vision.
            </h2>
            <p className="mt-4 text-white/80 font-inter">
              Interested in learning more about ZRP? We would like to hear from investors and strategic partners
              who believe in the long-term opportunity of building a global social platform from Europe.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-4">
              <a
                href="mailto:investors@zrp.one"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-200 transition font-inter"
              >
                <Mail className="w-4 h-4" aria-hidden="true" />
                investors@zrp.one
              </a>
              <Link
                href="/about"
                className="inline-block px-6 py-3 bg-transparent border-2 border-white text-white font-semibold rounded-full hover:bg-white/10 transition font-inter"
              >
                Learn More About ZRP
              </Link>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* FAQ */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-4xl mx-auto">
          <SectionHeading title="Investor FAQ" />
          <div className="space-y-4">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group bg-zrp-silver/10 dark:bg-zrp-charcoal/30 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal p-5"
              >
                <summary className="font-semibold text-zrp-charcoal dark:text-white font-inter cursor-pointer list-none flex items-center justify-between gap-4">
                  {item.q}
                  <span className="text-zrp-red transition-transform group-open:rotate-45 text-xl leading-none" aria-hidden="true">+</span>
                </summary>
                <p className="mt-3 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter leading-relaxed">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* LEGAL / DISCLAIMER */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-3xl mx-auto text-center">
          <Scale className="w-6 h-6 text-zrp-charcoal/40 dark:text-white/40 mx-auto mb-4" aria-hidden="true" />
          <p className="text-xs text-zrp-charcoal/50 dark:text-white/50 font-inter leading-relaxed">
            Information on this page is provided for general informational purposes only and does not constitute
            an offer, solicitation, investment recommendation, or guarantee of financial returns. ZRP does not
            publish revenue, valuation, or profitability figures, and this page makes no such claims. Any
            investment opportunity will be subject to applicable legal and regulatory requirements and will
            require its own diligence, documentation, and legal review, which is not represented as complete by
            this page.
          </p>
        </section>

        <section className="pb-16 px-4 max-w-4xl mx-auto text-center">
          <blockquote className="text-2xl font-orbitron text-zrp-charcoal dark:text-white italic">
            "One world. One community. One ZRP."
          </blockquote>
          <div className="mt-6 text-zrp-charcoal/50 dark:text-white/50 font-inter text-sm">ZRP Social</div>
        </section>

      </div>
    </div>
  );
}
