"use client";

import Link from "next/link";
import Image from "next/image";

const SECTIONS = [
  { id: "introduction", number: "01", title: "Introduction" },
  { id: "controller", number: "02", title: "Data Controller" },
  { id: "data-collected", number: "03", title: "Data We Collect" },
  { id: "data-use", number: "04", title: "How We Use Your Data" },
  { id: "legal-basis", number: "05", title: "Legal Basis" },
  { id: "cookies", number: "06", title: "Cookies & Tracking" },
  { id: "sharing", number: "07", title: "Data Sharing" },
  { id: "retention", number: "08", title: "Data Retention" },
  { id: "transfers", number: "09", title: "International Transfers" },
  { id: "rights", number: "10", title: "Your Rights" },
  { id: "security", number: "11", title: "Data Security" },
  { id: "children", number: "12", title: "Children's Privacy" },
  { id: "moderation", number: "13", title: "Speech & Moderation" },
  { id: "charity", number: "14", title: "Charity Commitment" },
  { id: "changes", number: "15", title: "Changes to This Policy" },
  { id: "contact", number: "16", title: "Contact Us" },
];

export default function PrivacyPage() {
  const lastUpdated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter">
      <main>

        {/* ─────────────────────────────────────────────────────────────
            HERO
        ───────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-16 sm:py-20 px-4">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-zrp-red/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-32 -left-24 w-80 h-80 bg-black/30 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-5xl mx-auto">

            <Link
              href="/"
              className="inline-flex items-center gap-2 text-white/80 hover:text-white transition font-inter text-sm mb-10"
            >
              ← Back to ZRP
            </Link>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">

              <div className="flex-shrink-0">
                <Image
                  src="/logo.png"
                  alt="ZRP Social"
                  width={72}
                  height={72}
                  className="w-[72px] h-[72px] object-contain"
                />
              </div>

              <div>

                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/10 px-3 py-1.5 rounded-full text-xs text-white/90 font-medium mb-4">
                  🇨🇭 ZRP Social · Privacy
                </div>

                <h1 className="text-4xl sm:text-5xl font-extrabold font-orbitron text-white leading-tight">
                  Privacy Policy
                </h1>

                <p className="mt-4 text-white/80 max-w-2xl text-base sm:text-lg leading-relaxed">
                  How ZRP Social collects, uses, protects, and manages your
                  personal data.
                </p>

              </div>

            </div>

            <div className="mt-8 flex flex-wrap gap-3">

              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm text-white/90">
                Last updated: {lastUpdated}
              </div>

              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm text-white/90">
                🇨🇭 Swiss data protection
              </div>

              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm text-white/90">
                🔒 Privacy focused
              </div>

            </div>

          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            PRIVACY PROMISE
        ───────────────────────────────────────────────────────────── */}
        <section className="px-4 pt-10">

          <div className="max-w-5xl mx-auto">

            <div className="rounded-2xl border border-zrp-red/20 bg-zrp-red/5 dark:bg-zrp-red/10 p-5 sm:p-6">

              <div className="flex items-start gap-4">

                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-zrp-red/10 dark:bg-zrp-red/20 flex items-center justify-center text-zrp-red">
                  🔒
                </div>

                <div>

                  <h2 className="font-orbitron font-bold text-zrp-charcoal dark:text-white">
                    Your privacy matters
                  </h2>

                  <p className="mt-2 text-sm sm:text-base leading-relaxed text-zrp-charcoal/70 dark:text-white/70">
                    ZRP Social is built with privacy and user control in mind.
                    This policy explains what information we collect, why we
                    use it, how it may be shared, and the choices and rights
                    available to you.
                  </p>

                  <div className="mt-3">
                    <Link
                      href="/terms"
                      className="text-sm font-semibold text-zrp-red hover:underline"
                    >
                      Read our Terms of Service →
                    </Link>
                  </div>

                </div>

              </div>

            </div>

          </div>

        </section>

        {/* ─────────────────────────────────────────────────────────────
            MAIN CONTENT
        ───────────────────────────────────────────────────────────── */}
        <section className="py-12 sm:py-16 px-4">

          <div className="max-w-6xl mx-auto grid lg:grid-cols-[250px_minmax(0,1fr)] gap-10">

            {/* Desktop contents */}
            <aside className="hidden lg:block">

              <div className="sticky top-24">

                <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/40 border border-zrp-silver/30 dark:border-zrp-charcoal rounded-2xl p-5">

                  <h2 className="font-orbitron font-bold text-sm uppercase tracking-wider text-zrp-charcoal dark:text-white mb-4">
                    Privacy Guide
                  </h2>

                  <nav className="space-y-1">

                    {SECTIONS.map((section) => (
                      <a
                        key={section.id}
                        href={`#${section.id}`}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-zrp-charcoal/65 dark:text-white/60 hover:text-zrp-red hover:bg-zrp-red/5 transition"
                      >
                        <span className="font-orbitron text-[10px] text-zrp-red/70">
                          {section.number}
                        </span>

                        <span>{section.title}</span>
                      </a>
                    ))}

                  </nav>

                </div>

              </div>

            </aside>

            {/* Document */}
            <article className="min-w-0">

              <div className="space-y-8">

                {/* 01 */}
                <section
                  id="introduction"
                  className="privacy-section"
                >
                  <SectionHeader number="01" title="Introduction" />

                  <Text>
                    Welcome to <strong>ZRP Social</strong>. We are a
                    Swiss-based social media platform dedicated to protecting
                    your privacy and supporting your right to freedom of
                    expression.
                  </Text>

                  <Text>
                    This Privacy Policy explains how we collect, use, store,
                    protect, and otherwise process personal data when you use
                    ZRP Social, including our website, applications, and
                    related services.
                  </Text>

                  <Text>
                    We seek to process personal data in accordance with
                    applicable Swiss data protection law and, where applicable,
                    the European Union General Data Protection Regulation
                    (GDPR).
                  </Text>

                  <Callout variant="red">
                    <strong>Our principle:</strong> We aim to collect only the
                    information reasonably necessary to operate, secure, and
                    improve ZRP Social.
                  </Callout>
                </section>

                {/* 02 */}
                <section
                  id="controller"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="02"
                    title="Data Controller"
                  />

                  <Text>
                    <strong>ZRP Social</strong> is responsible for the
                    processing of personal data described in this Privacy
                    Policy, subject to the applicable legal framework.
                  </Text>

                  <div className="grid sm:grid-cols-2 gap-4 mt-6">

                    <ContactCard
                      title="Privacy inquiries"
                      email="privacy@zrp.one"
                    />

                    <ContactCard
                      title="General support"
                      email="support@zrp.one"
                    />

                  </div>

                  <Callout>
                    <strong>Registered address:</strong> ZRP, Switzerland.
                    The full legal entity and postal address should be added
                    here once officially confirmed.
                  </Callout>
                </section>

                {/* 03 */}
                <section
                  id="data-collected"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="03"
                    title="What Data We Collect"
                  />

                  <Text>
                    We collect information that is necessary to provide our
                    services, keep the platform secure, and improve the user
                    experience.
                  </Text>

                  <div className="grid md:grid-cols-2 gap-4">

                    <DataCard
                      icon="👤"
                      title="Account Information"
                      text="Username, email address, display name, and account credentials such as a securely hashed password."
                    />

                    <DataCard
                      icon="📝"
                      title="Profile Information"
                      text="Bio, profile picture, location, country, website, and other information you voluntarily add to your profile."
                    />

                    <DataCard
                      icon="📱"
                      title="Content"
                      text="Posts, comments, images, videos, GIFs, polls, and other content you create or share."
                    />

                    <DataCard
                      icon="💬"
                      title="Interactions"
                      text="Likes, reposts, follows, bookmarks, shares, messages, and other interactions with the platform."
                    />

                    <DataCard
                      icon="🛡️"
                      title="Device & Security Data"
                      text="Information such as IP address, browser type, operating system, and relevant device information used for security and platform operations."
                    />

                    <DataCard
                      icon="🍪"
                      title="Cookies"
                      text="Essential and functional cookies and, where enabled, analytics technologies used to improve the service."
                    />

                  </div>

                  <Callout>
                    We do not intentionally request sensitive information such
                    as government identification or financial information
                    unless it is necessary for a specific service and handled
                    under an appropriate legal basis.
                  </Callout>
                </section>

                {/* 04 */}
                <section
                  id="data-use"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="04"
                    title="How We Use Your Data"
                  />

                  <Text>
                    Depending on the circumstances, we may use personal data to:
                  </Text>

                  <BulletList
                    items={[
                      <>Provide, operate, maintain, and secure ZRP Social.</>,
                      <>Create and manage your account.</>,
                      <>Enable social features such as posts, messaging, follows, and interactions.</>,
                      <>Improve the user experience and develop new features.</>,
                      <>Communicate with you about your account, service updates, and security matters.</>,
                      <>Detect and prevent fraud, abuse, spam, bots, and other harmful activity.</>,
                      <>Enforce our Terms of Service and Community Guidelines.</>,
                      <>Comply with applicable legal obligations.</>,
                    ]}
                  />

                  <Callout variant="red">
                    <strong>We do not sell or rent your personal data.</strong>{" "}
                    We do not use personal data for political manipulation or
                    sell personal profiles to advertisers.
                  </Callout>
                </section>

                {/* 05 */}
                <section
                  id="legal-basis"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="05"
                    title="Legal Basis for Processing"
                  />

                  <Text>
                    Where the GDPR applies, we rely on appropriate legal bases
                    for processing personal data. Depending on the processing,
                    these may include:
                  </Text>

                  <div className="space-y-4">

                    <LegalBasisCard
                      title="Contractual necessity"
                      text="Processing necessary to provide the services you request and perform our agreement with you."
                    />

                    <LegalBasisCard
                      title="Legitimate interests"
                      text="Processing necessary for security, fraud prevention, platform improvement, and the responsible operation of our services, where those interests are not overridden by your rights."
                    />

                    <LegalBasisCard
                      title="Consent"
                      text="Processing based on your consent, such as certain optional cookies or other optional features."
                    />

                    <LegalBasisCard
                      title="Legal obligation"
                      text="Processing required to comply with applicable laws, regulations, or lawful requests."
                    />

                  </div>
                </section>

                {/* 06 */}
                <section
                  id="cookies"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="06"
                    title="Cookies and Tracking"
                  />

                  <Text>
                    We may use cookies and similar technologies to provide
                    essential functionality, remember preferences, maintain
                    security, and understand how the platform is used.
                  </Text>

                  <div className="grid sm:grid-cols-2 gap-4 mt-6">

                    <InfoCard
                      title="Essential cookies"
                      text="Necessary for core functionality, authentication, security, and other essential platform operations."
                    />

                    <InfoCard
                      title="Functional cookies"
                      text="Used to remember preferences and improve your experience."
                    />

                    <InfoCard
                      title="Analytics"
                      text="Where enabled, analytics may help us understand platform usage and improve our services."
                    />

                    <InfoCard
                      title="Advertising"
                      text="ZRP does not use personal data for targeted advertising or sell personal data to advertisers."
                    />

                  </div>

                  <Text>
                    Where required by law, non-essential cookies will only be
                    used after the appropriate consent has been obtained.
                  </Text>
                </section>

                {/* 07 */}
                <section
                  id="sharing"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="07"
                    title="Data Sharing and Third Parties"
                  />

                  <Text>
                    We may work with trusted service providers that process
                    information on our behalf. These providers may support
                    functions such as hosting, infrastructure, security,
                    communications, email delivery, analytics, or other
                    services necessary to operate ZRP Social.
                  </Text>

                  <Text>
                    Where required, we seek to ensure that relevant service
                    providers are contractually required to protect personal
                    data and process it only for authorized purposes.
                  </Text>

                  <Callout variant="red">
                    We do not sell your personal data to advertisers, data
                    brokers, or political organizations.
                  </Callout>

                  <Text>
                    We may also disclose information where required by law, to
                    protect users or the platform, to prevent fraud or abuse,
                    or in connection with legal proceedings.
                  </Text>
                </section>

                {/* 08 */}
                <section
                  id="retention"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="08"
                    title="Data Retention"
                  />

                  <Text>
                    We retain personal data for as long as reasonably necessary
                    for the purposes described in this Privacy Policy,
                    including maintaining your account, providing services,
                    maintaining security, resolving disputes, and complying
                    with legal obligations.
                  </Text>

                  <Text>
                    When you request account deletion, we will delete or
                    anonymize personal data where appropriate, subject to
                    information that we are required or permitted to retain by
                    law or that is reasonably necessary for legitimate
                    operational purposes such as security, fraud prevention,
                    backups, or dispute resolution.
                  </Text>

                  <Callout>
                    Retention periods can differ depending on the type of data
                    and the purpose for which it was collected.
                  </Callout>
                </section>

                {/* 09 */}
                <section
                  id="transfers"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="09"
                    title="International Data Transfers"
                  />

                  <Text>
                    ZRP Social may use infrastructure and service providers
                    located in Switzerland, the European Union, or other
                    jurisdictions depending on the services used.
                  </Text>

                  <Text>
                    Where personal data is transferred internationally, we seek
                    to use appropriate safeguards required by applicable data
                    protection law, which may include adequacy decisions,
                    contractual safeguards, or other recognized mechanisms.
                  </Text>

                  <Callout>
                    The exact locations of data processing may change as our
                    infrastructure and service providers evolve. We will
                    update this policy where material changes require
                    disclosure.
                  </Callout>
                </section>

                {/* 10 */}
                <section
                  id="rights"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="10"
                    title="Your Rights"
                  />

                  <Text>
                    Depending on your location and the applicable law, you may
                    have rights regarding your personal data, including:
                  </Text>

                  <div className="grid sm:grid-cols-2 gap-4">

                    <RightCard
                      title="Access"
                      text="Request access to personal data we hold about you."
                    />

                    <RightCard
                      title="Rectification"
                      text="Ask us to correct inaccurate or incomplete information."
                    />

                    <RightCard
                      title="Erasure"
                      text="Request deletion of personal data where applicable."
                    />

                    <RightCard
                      title="Restriction"
                      text="Request that certain processing of your data be restricted."
                    />

                    <RightCard
                      title="Portability"
                      text="Where applicable, receive certain data in a structured format."
                    />

                    <RightCard
                      title="Objection"
                      text="Object to certain processing, including processing based on legitimate interests."
                    />

                    <RightCard
                      title="Withdraw consent"
                      text="Withdraw consent where processing is based on your consent."
                    />

                    <RightCard
                      title="Complaint"
                      text="You may have the right to lodge a complaint with a competent data protection authority."
                    />

                  </div>

                  <Text>
                    To exercise your rights, contact us at{" "}
                    <a
                      href="mailto:privacy@zrp.one"
                      className="legal-link"
                    >
                      privacy@zrp.one
                    </a>
                    . We may need to verify your identity before completing
                    certain requests.
                  </Text>
                </section>

                {/* 11 */}
                <section
                  id="security"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="11"
                    title="Data Security"
                  />

                  <Text>
                    We take reasonable technical and organizational measures
                    designed to protect personal data against unauthorized
                    access, alteration, disclosure, loss, or destruction.
                  </Text>

                  <div className="grid sm:grid-cols-2 gap-4">

                    <SecurityCard
                      icon="🔐"
                      title="Encryption"
                      text="Encryption in transit and appropriate protection of stored information."
                    />

                    <SecurityCard
                      icon="🛡️"
                      title="Access controls"
                      text="Access to systems and data is restricted according to operational requirements."
                    />

                    <SecurityCard
                      icon="🔎"
                      title="Security monitoring"
                      text="Measures designed to detect suspicious activity and security threats."
                    />

                    <SecurityCard
                      icon="⚙️"
                      title="Security improvements"
                      text="We continuously work to improve our security practices as the platform develops."
                    />

                  </div>

                  <Callout>
                    No internet service can guarantee absolute security. We
                    encourage you to use a strong, unique password and enable
                    additional security features where available.
                  </Callout>
                </section>

                {/* 12 */}
                <section
                  id="children"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="12"
                    title="Children's Privacy"
                  />

                  <Text>
                    ZRP Social is not intended for children below the minimum
                    age required under our Terms of Service and applicable law.
                  </Text>

                  <Text>
                    We do not knowingly collect personal data from children in
                    circumstances where such collection is prohibited. If you
                    believe that a child has provided personal information to
                    us in violation of applicable requirements, please contact
                    us at{" "}
                    <a
                      href="mailto:privacy@zrp.one"
                      className="legal-link"
                    >
                      privacy@zrp.one
                    </a>
                    .
                  </Text>
                </section>

                {/* 13 */}
                <section
                  id="moderation"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="13"
                    title="Freedom of Speech and Content Moderation"
                  />

                  <Text>
                    ZRP Social is built around freedom of expression. We aim to
                    provide users with a platform where they can express
                    opinions, discuss ideas, and participate in public
                    conversation.
                  </Text>

                  <Text>
                    This commitment does not prevent us from taking action
                    where content or conduct violates applicable law, our Terms
                    of Service, or our Community Guidelines.
                  </Text>

                  <div className="rounded-2xl bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack p-6 sm:p-8 text-white">

                    <div className="flex items-start gap-4">

                      <div className="text-3xl">
                        🗽
                      </div>

                      <div>

                        <h3 className="font-orbitron font-bold text-xl">
                          Freedom of expression
                        </h3>

                        <p className="mt-2 text-white/75 leading-relaxed">
                          Political criticism, unpopular opinions, and
                          disagreement with institutions are not, by
                          themselves, reasons to remove content. Moderation is
                          focused on applicable law, platform rules, and user
                          safety.
                        </p>

                      </div>

                    </div>

                  </div>

                </section>

                {/* 14 */}
                <section
                  id="charity"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="14"
                    title="Charity Commitment"
                  />

                  <div className="rounded-2xl border border-zrp-red/20 bg-zrp-red/5 dark:bg-zrp-red/10 p-6 sm:p-8">

                    <div className="flex flex-col sm:flex-row items-start gap-6">

                      <div className="flex-shrink-0">

                        <div className="text-5xl font-orbitron font-bold text-zrp-red">
                          35%
                        </div>

                        <div className="text-xs uppercase tracking-wider text-zrp-charcoal/50 dark:text-white/50 mt-1">
                          Profit commitment
                        </div>

                      </div>

                      <div>

                        <h3 className="text-xl font-orbitron font-bold text-zrp-charcoal dark:text-white">
                          Social impact
                        </h3>

                        <p className="mt-2 text-zrp-charcoal/70 dark:text-white/70 leading-relaxed">
                          ZRP is committed to dedicating 35% of its profits to
                          charitable causes supporting orphans, schools,
                          hospitals, and climate relief.
                        </p>

                        <p className="mt-3 text-sm text-zrp-charcoal/60 dark:text-white/55">
                          This commitment does not affect how your personal data
                          is processed, and we do not use your personal
                          information to target you for charity campaigns.
                        </p>

                      </div>

                    </div>

                  </div>
                </section>

                {/* 15 */}
                <section
                  id="changes"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="15"
                    title="Changes to This Policy"
                  />

                  <Text>
                    We may update this Privacy Policy from time to time to
                    reflect changes in our services, technology, legal
                    requirements, or data processing practices.
                  </Text>

                  <Text>
                    Where appropriate, we will notify users of material changes
                    through email, an in-platform notice, or another prominent
                    communication method.
                  </Text>

                  <Callout>
                    The latest version of this Privacy Policy will always be
                    available at{" "}
                    <Link
                      href="/privacy"
                      className="legal-link"
                    >
                      zrp.one/privacy
                    </Link>
                    .
                  </Callout>
                </section>

                {/* 16 */}
                <section
                  id="contact"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="16"
                    title="Contact Us"
                  />

                  <Text>
                    If you have questions, concerns, or requests regarding your
                    privacy or personal data, please contact our team.
                  </Text>

                  <div className="grid sm:grid-cols-2 gap-4 mt-6">

                    <ContactCard
                      title="Privacy"
                      email="privacy@zrp.one"
                    />

                    <ContactCard
                      title="Support"
                      email="support@zrp.one"
                    />

                  </div>

                  <Text>
                    We are committed to handling privacy requests responsibly
                    and transparently.
                  </Text>
                </section>

                {/* Privacy Summary */}
                <section className="rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/30 p-6 sm:p-8">

                  <div className="flex items-center gap-3 mb-6">

                    <div className="w-10 h-10 rounded-xl bg-zrp-red/10 flex items-center justify-center text-zrp-red">
                      🔒
                    </div>

                    <div>

                      <h2 className="text-2xl font-orbitron font-bold text-zrp-charcoal dark:text-white">
                        Our Privacy Principles
                      </h2>

                      <p className="text-sm text-zrp-charcoal/60 dark:text-white/60 mt-1">
                        The principles behind how ZRP approaches personal data.
                      </p>

                    </div>

                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">

                    <PrincipleCard
                      title="Privacy by design"
                      text="Privacy should be considered when we build and improve our platform."
                    />

                    <PrincipleCard
                      title="Data minimisation"
                      text="We aim to collect information that is relevant to providing and securing our services."
                    />

                    <PrincipleCard
                      title="No data selling"
                      text="We do not sell or rent personal data to advertisers or data brokers."
                    />

                    <PrincipleCard
                      title="User control"
                      text="We aim to provide meaningful controls over your account and personal information."
                    />

                    <PrincipleCard
                      title="Security"
                      text="We use reasonable technical and organizational safeguards to protect information."
                    />

                    <PrincipleCard
                      title="Transparency"
                      text="We explain our data practices and update this policy when material practices change."
                    />

                  </div>

                </section>

              </div>

            </article>

          </div>

        </section>

        {/* ─────────────────────────────────────────────────────────────
            BOTTOM CTA
        ───────────────────────────────────────────────────────────── */}
        <section className="bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-14 px-4">

          <div className="max-w-3xl mx-auto text-center">

            <Image
              src="/logo.png"
              alt="ZRP Social"
              width={56}
              height={56}
              className="w-14 h-14 object-contain mx-auto mb-5"
            />

            <h2 className="text-2xl sm:text-3xl font-bold font-orbitron text-white">
              Have a privacy question?
            </h2>

            <p className="mt-3 text-white/75 font-inter">
              Contact the ZRP team if you have a question about your personal
              data or your privacy rights.
            </p>

            <a
              href="mailto:privacy@zrp.one"
              className="inline-flex items-center justify-center mt-6 px-7 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-100 transition font-inter"
            >
              Contact Privacy Team
            </a>

          </div>

        </section>

      </main>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Reusable Components                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

function SectionHeader({
  number,
  title,
}: {
  number: string;
  title: string;
}) {
  return (
    <div className="flex items-start gap-4 mb-6">

      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-zrp-red/10 dark:bg-zrp-red/15 flex items-center justify-center">
        <span className="font-orbitron font-bold text-xs text-zrp-red">
          {number}
        </span>
      </div>

      <div>

        <h2 className="text-2xl sm:text-3xl font-bold font-orbitron text-zrp-charcoal dark:text-white leading-tight">
          {title}
        </h2>

        <div className="mt-3 w-12 h-0.5 bg-zrp-red rounded-full" />

      </div>

    </div>
  );
}

function Text({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="text-[15px] sm:text-base leading-7 text-zrp-charcoal/75 dark:text-white/70 mb-4">
      {children}
    </p>
  );
}

function BulletList({
  items,
}: {
  items: React.ReactNode[];
}) {
  return (
    <ul className="space-y-3 my-5">

      {items.map((item, index) => (
        <li
          key={index}
          className="flex items-start gap-3 text-[15px] sm:text-base leading-7 text-zrp-charcoal/75 dark:text-white/70"
        >

          <span className="flex-shrink-0 w-5 h-5 mt-1 rounded-full bg-zrp-red/10 dark:bg-zrp-red/15 flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-zrp-red" />
          </span>

          <span>{item}</span>

        </li>
      ))}

    </ul>
  );
}

function Callout({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "red";
}) {
  return (
    <div
      className={
        variant === "red"
          ? "mt-6 rounded-xl border border-zrp-red/25 bg-zrp-red/5 dark:bg-zrp-red/10 px-5 py-4 text-sm leading-6 text-zrp-charcoal/80 dark:text-white/75"
          : "mt-6 rounded-xl border border-zrp-silver/40 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/40 px-5 py-4 text-sm leading-6 text-zrp-charcoal/75 dark:text-white/70"
      }
    >
      {children}
    </div>
  );
}

function DataCard({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/40 p-5">

      <div className="text-2xl mb-3">
        {icon}
      </div>

      <h3 className="font-orbitron font-bold text-base text-zrp-charcoal dark:text-white">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-zrp-charcoal/70 dark:text-white/65">
        {text}
      </p>

    </div>
  );
}

function InfoCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/40 p-5">

      <h3 className="font-orbitron font-bold text-base text-zrp-charcoal dark:text-white">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-zrp-charcoal/70 dark:text-white/65">
        {text}
      </p>

    </div>
  );
}

function LegalBasisCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-white dark:bg-zrp-charcoal/30 p-5">

      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-zrp-red/10 flex items-center justify-center text-zrp-red font-bold text-sm">
        ✓
      </div>

      <div>

        <h3 className="font-orbitron font-bold text-base text-zrp-charcoal dark:text-white">
          {title}
        </h3>

        <p className="mt-1 text-sm leading-6 text-zrp-charcoal/70 dark:text-white/65">
          {text}
        </p>

      </div>

    </div>
  );
}

function SecurityCard({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/40 p-5">

      <div className="text-2xl mb-3">
        {icon}
      </div>

      <h3 className="font-orbitron font-bold text-base text-zrp-charcoal dark:text-white">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-zrp-charcoal/70 dark:text-white/65">
        {text}
      </p>

    </div>
  );
}

function RightCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-white dark:bg-zrp-deepBlack/50 border border-zrp-silver/20 dark:border-zrp-charcoal p-4">

      <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-zrp-red/10 flex items-center justify-center text-zrp-red font-bold">
        ✓
      </span>

      <div>

        <h3 className="font-semibold text-sm text-zrp-charcoal dark:text-white">
          {title}
        </h3>

        <p className="mt-1 text-xs leading-5 text-zrp-charcoal/60 dark:text-white/55">
          {text}
        </p>

      </div>

    </div>
  );
}

function PrincipleCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-zrp-deepBlack/50 border border-zrp-silver/20 dark:border-zrp-charcoal p-4">

      <div className="flex items-center gap-2">

        <span className="w-2 h-2 rounded-full bg-zrp-red" />

        <h3 className="font-orbitron font-bold text-sm text-zrp-charcoal dark:text-white">
          {title}
        </h3>

      </div>

      <p className="mt-2 text-xs leading-5 text-zrp-charcoal/60 dark:text-white/55">
        {text}
      </p>

    </div>
  );
}

function ContactCard({
  title,
  email,
}: {
  title: string;
  email: string;
}) {
  return (
    <div className="rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/40 p-5">

      <div className="text-xs uppercase tracking-wider font-orbitron text-zrp-charcoal/50 dark:text-white/45">
        {title}
      </div>

      <a
        href={`mailto:${email}`}
        className="inline-block mt-2 text-zrp-red font-semibold hover:underline break-all"
      >
        {email}
      </a>

    </div>
  );
}
