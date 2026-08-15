"use client";

import Link from "next/link";
import Image from "next/image";

const SECTIONS = [
  { id: "introduction", number: "01", title: "Introduction" },
  { id: "eligibility", number: "02", title: "Eligibility" },
  { id: "registration", number: "03", title: "Account Registration" },
  { id: "freedom-of-speech", number: "04", title: "Freedom of Speech" },
  { id: "user-conduct", number: "05", title: "User Conduct" },
  { id: "content", number: "06", title: "Content Ownership" },
  { id: "intellectual-property", number: "07", title: "Intellectual Property" },
  { id: "privacy", number: "08", title: "Privacy & Data Protection" },
  { id: "moderation", number: "09", title: "Moderation & Enforcement" },
  { id: "disputes", number: "10", title: "Dispute Resolution" },
  { id: "termination", number: "11", title: "Termination" },
  { id: "liability", number: "12", title: "Disclaimers & Liability" },
  { id: "charity", number: "13", title: "Charity Commitment" },
  { id: "changes", number: "14", title: "Changes to These Terms" },
  { id: "contact", number: "15", title: "Contact Us" },
];

export default function TermsPage() {
  const lastUpdated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter">
      <main>

        {/* Hero */}
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
                  🇨🇭 ZRP Social · Legal
                </div>

                <h1 className="text-4xl sm:text-5xl font-extrabold font-orbitron text-white leading-tight">
                  Terms of Service
                </h1>

                <p className="mt-4 text-white/80 max-w-2xl text-base sm:text-lg leading-relaxed">
                  The rules, responsibilities, and conditions that govern your
                  use of ZRP Social.
                </p>
              </div>

            </div>

            <div className="mt-8 flex flex-wrap gap-3">

              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm text-white/90">
                Last updated: {lastUpdated}
              </div>

              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm text-white/90">
                🇨🇭 Swiss law
              </div>

              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm text-white/90">
                Privacy focused
              </div>

            </div>

          </div>
        </section>

        {/* Intro Notice */}
        <section className="px-4 pt-10">
          <div className="max-w-5xl mx-auto">

            <div className="rounded-2xl border border-zrp-red/20 bg-zrp-red/5 dark:bg-zrp-red/10 p-5 sm:p-6">

              <div className="flex items-start gap-4">

                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-zrp-red/10 dark:bg-zrp-red/20 flex items-center justify-center text-zrp-red">
                  ⚖️
                </div>

                <div>
                  <h2 className="font-orbitron font-bold text-zrp-charcoal dark:text-white">
                    Please read these Terms carefully
                  </h2>

                  <p className="mt-2 text-sm sm:text-base leading-relaxed text-zrp-charcoal/70 dark:text-white/70">
                    These Terms explain your rights and responsibilities when
                    using ZRP Social. By accessing or using the platform, you
                    acknowledge that you have read and agree to these Terms,
                    together with our{" "}
                    <Link
                      href="/privacy"
                      className="text-zrp-red font-semibold hover:underline"
                    >
                      Privacy Policy
                    </Link>{" "}
                    and{" "}
                    <Link
                      href="/guidelines"
                      className="text-zrp-red font-semibold hover:underline"
                    >
                      Community Guidelines
                    </Link>
                    .
                  </p>
                </div>

              </div>

            </div>

          </div>
        </section>

        {/* Main Document */}
        <section className="py-12 sm:py-16 px-4">

          <div className="max-w-6xl mx-auto grid lg:grid-cols-[250px_minmax(0,1fr)] gap-10">

            {/* Contents */}
            <aside className="hidden lg:block">

              <div className="sticky top-24">

                <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/40 border border-zrp-silver/30 dark:border-zrp-charcoal rounded-2xl p-5">

                  <h2 className="font-orbitron font-bold text-sm uppercase tracking-wider text-zrp-charcoal dark:text-white mb-4">
                    Contents
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

            {/* Legal Content */}
            <article className="min-w-0">

              <div className="space-y-8">

                {/* 01 */}
                <section
                  id="introduction"
                  className="scroll-mt-24 bg-white dark:bg-zrp-charcoal/30 rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal p-6 sm:p-8"
                >
                  <SectionHeader number="01" title="Introduction" />

                  <Text>
                    Welcome to <strong>ZRP Social</strong>, a social media
                    platform operated by ZRP ("we," "us," or "our"). These
                    Terms of Service ("Terms") constitute a legally binding
                    agreement between you and ZRP regarding your use of our
                    platform, including all features, content, and services
                    offered through our website and applications.
                  </Text>

                  <Text>
                    By creating an account or accessing our platform, you
                    acknowledge that you have read, understood, and agree to be
                    bound by these Terms, our{" "}
                    <Link href="/privacy" className="legal-link">
                      Privacy Policy
                    </Link>
                    , and our{" "}
                    <Link href="/guidelines" className="legal-link">
                      Community Guidelines
                    </Link>
                    .
                  </Text>

                  <Text>
                    If you do not agree with any part of these Terms, you must
                    not use our platform.
                  </Text>

                  <Callout>
                    <strong>Applicable Law:</strong> These Terms are governed
                    by the laws of Switzerland, and any disputes shall be
                    resolved in accordance with the applicable jurisdictional
                    rules.
                  </Callout>
                </section>

                {/* 02 */}
                <section
                  id="eligibility"
                  className="legal-section"
                >
                  <SectionHeader number="02" title="Eligibility" />

                  <Text>To use ZRP Social, you must:</Text>

                  <BulletList
                    items={[
                      <>
                        Be at least <strong>16 years old</strong> (or the age
                        of digital consent in your jurisdiction).
                      </>,
                      <>
                        Provide accurate and truthful information during
                        registration.
                      </>,
                      <>Not be located in a country subject to sanctions or embargoes.</>,
                      <>Not have been previously banned or suspended from our platform.</>,
                      <>Agree to use the platform solely for lawful purposes.</>,
                    ]}
                  />

                  <Text>
                    By using our platform, you represent and warrant that you
                    meet all eligibility requirements. We reserve the right to
                    refuse or terminate access to any user who does not meet
                    these criteria.
                  </Text>
                </section>

                {/* 03 */}
                <section
                  id="registration"
                  className="legal-section"
                >
                  <SectionHeader number="03" title="Account Registration" />

                  <Text>
                    To access certain features, you must create an account. You
                    agree to:
                  </Text>

                  <BulletList
                    items={[
                      <>Provide accurate, current, and complete information during registration.</>,
                      <>Maintain and update your account information as necessary.</>,
                      <>Keep your password secure and confidential.</>,
                      <>Notify us immediately of any unauthorized access to your account.</>,
                      <>Be responsible for all activities that occur under your account.</>,
                    ]}
                  />

                  <Text>
                    You may not create multiple accounts, impersonate others, or
                    use automated means to create accounts. We reserve the
                    right to verify your identity and request additional
                    information.
                  </Text>

                  <Callout>
                    <strong>Email Verification:</strong> Your email address
                    must be verified before you can fully use the platform.
                  </Callout>
                </section>

                {/* 04 */}
                <section
                  id="freedom-of-speech"
                  className="legal-section"
                >
                  <SectionHeader number="04" title="Freedom of Speech" />

                  <Text>
                    <strong>
                      ZRP Social is built on the principle of freedom of
                      speech.
                    </strong>{" "}
                    We believe that every person has the right to express their
                    opinions and ideas without fear of censorship or
                    retaliation.
                  </Text>

                  <Text>
                    As a Swiss platform, we operate under the framework of
                    Swiss law. We do not moderate or remove content solely
                    because it expresses a political opinion, ideology,
                    religious belief, or unpopular viewpoint.
                  </Text>

                  <Text>
                    However, freedom of speech is not absolute. We reserve the
                    right to moderate or remove content that:
                  </Text>

                  <BulletList
                    items={[
                      <>Violates applicable laws, including applicable restrictions concerning threats, harassment, hate speech, or defamation.</>,
                      <>Incites violence, terrorism, or illegal activities.</>,
                      <>Contains child sexual abuse material or other illegal content.</>,
                      <>Infringes on the intellectual property rights of others.</>,
                      <>Is spam, misleading, or fraudulent.</>,
                      <>Violates our Community Guidelines.</>,
                    ]}
                  />

                  <Callout variant="red">
                    <strong>Our principle:</strong> Criticism of governments
                    or institutions, unpopular opinions, political dissent,
                    and challenging mainstream narratives are not, by
                    themselves, grounds for content removal.
                  </Callout>
                </section>

                {/* 05 */}
                <section
                  id="user-conduct"
                  className="legal-section"
                >
                  <SectionHeader number="05" title="User Conduct" />

                  <Text>
                    You agree to use ZRP Social responsibly and lawfully. You
                    shall not:
                  </Text>

                  <BulletList
                    items={[
                      <>Post, share, or distribute content that is illegal, harmful, obscene, defamatory, or threatening.</>,
                      <>Harass, bully, intimidate, or threaten others.</>,
                      <>Impersonate any person or entity, or falsely claim affiliation with any person or entity.</>,
                      <>Engage in deceptive, fraudulent, or manipulative behavior.</>,
                      <>Share malicious code, viruses, or other harmful software.</>,
                      <>Use automated means, including bots or scrapers, to access or collect data from our platform.</>,
                      <>Interfere with the proper functioning of our platform.</>,
                      <>Violate applicable laws, regulations, or third-party rights.</>,
                    ]}
                  />

                  <Text>
                    We encourage open and respectful debate. Disagreement is
                    welcome; hostility is not. We reserve the right to take
                    action against users who violate these rules.
                  </Text>
                </section>

                {/* 06 */}
                <section
                  id="content"
                  className="legal-section"
                >
                  <SectionHeader
                    number="06"
                    title="Content Ownership and License"
                  />

                  <Text>
                    <strong>
                      You retain full ownership of the content you create and
                      share on ZRP Social.
                    </strong>{" "}
                    This includes text, images, videos, audio, and any other
                    content you post.
                  </Text>

                  <Text>
                    By posting content on our platform, you grant us a
                    worldwide, non-exclusive, royalty-free license to display,
                    store, and distribute your content on the platform and
                    through our services. This license is limited to the
                    purpose of operating, improving, and promoting the
                    platform. We do not claim ownership of your content.
                  </Text>

                  <Text>
                    You retain the right to delete your content at any time.
                    When you delete your content, the license we have to use it
                    ends, except where we need it for legal or operational
                    reasons, such as backups or archiving.
                  </Text>

                  <Text>
                    We do not sell or license your content to third parties for
                    advertising or commercial exploitation.
                  </Text>
                </section>

                {/* 07 */}
                <section
                  id="intellectual-property"
                  className="legal-section"
                >
                  <SectionHeader
                    number="07"
                    title="Intellectual Property"
                  />

                  <Text>
                    The platform, including its design, logos, trademarks, and
                    software, is the intellectual property of ZRP. You may not
                    copy, modify, reproduce, or distribute any part of the
                    platform without our written consent.
                  </Text>

                  <Text>
                    You may not use our trademarks or branding without
                    permission. All rights not expressly granted are reserved.
                  </Text>
                </section>

                {/* 08 */}
                <section
                  id="privacy"
                  className="legal-section"
                >
                  <SectionHeader
                    number="08"
                    title="Privacy and Data Protection"
                  />

                  <Text>
                    Your privacy is a top priority. We collect and process your
                    data in accordance with our{" "}
                    <Link href="/privacy" className="legal-link">
                      Privacy Policy
                    </Link>{" "}
                    and applicable laws, including the Swiss Federal Act on
                    Data Protection (FADP) and, where applicable, the GDPR.
                  </Text>

                  <Text>
                    We do not sell or rent your personal data. We do not use
                    your data for targeted advertising. Your data is stored
                    securely in Switzerland and the European Union.
                  </Text>

                  <Text>
                    You have the right to access, correct, or delete your data
                    at any time. Please see our Privacy Policy for details on
                    how to exercise your rights.
                  </Text>
                </section>

                {/* 09 */}
                <section
                  id="moderation"
                  className="legal-section"
                >
                  <SectionHeader
                    number="09"
                    title="Moderation and Enforcement"
                  />

                  <Text>
                    We strive to maintain a safe and respectful environment. We
                    use a combination of automated tools and human review to
                    enforce these Terms and our Community Guidelines.
                  </Text>

                  <Text>
                    <strong>Our moderation is transparent and fair.</strong>{" "}
                    If we take action against your account or content, such as
                    removal, suspension, or a ban, you will be notified of the
                    reason and have the right to appeal, subject to applicable
                    procedures.
                  </Text>

                  <Text>Actions we may take include:</Text>

                  <BulletList
                    items={[
                      <>Removing content that violates our policies.</>,
                      <>Issuing warnings to users who violate our policies.</>,
                      <>Suspending or banning accounts for serious or repeated violations.</>,
                      <>Reporting illegal activity to law enforcement authorities where legally required or appropriate.</>,
                    ]}
                  />

                  <Text>
                    We reserve the right to moderate content in accordance with
                    these Terms and our Community Guidelines and will strive to
                    be fair, consistent, and transparent in our enforcement.
                  </Text>
                </section>

                {/* 10 */}
                <section
                  id="disputes"
                  className="legal-section"
                >
                  <SectionHeader
                    number="10"
                    title="Dispute Resolution"
                  />

                  <Text>
                    These Terms are governed by the laws of{" "}
                    <strong>Switzerland</strong>, subject to any mandatory
                    rights or protections that may apply to you under
                    applicable law.
                  </Text>

                  <Text>
                    We encourage users to first contact us so that concerns can
                    be addressed directly and amicably.
                  </Text>

                  <BulletList
                    items={[
                      <>First, through informal communication between you and us.</>,
                      <>If appropriate, through mediation or another agreed dispute-resolution process.</>,
                      <>Where necessary, before a competent court having jurisdiction.</>,
                    ]}
                  />

                  <Text>
                    Contact us at{" "}
                    <a
                      href="mailto:support@zrp.one"
                      className="legal-link"
                    >
                      support@zrp.one
                    </a>{" "}
                    before pursuing a formal dispute whenever possible.
                  </Text>
                </section>

                {/* 11 */}
                <section
                  id="termination"
                  className="legal-section"
                >
                  <SectionHeader number="11" title="Termination" />

                  <Text>
                    You may terminate your account at any time by contacting us
                    or using the account deletion feature, if available. Upon
                    termination, we will handle your data in accordance with
                    our Privacy Policy and applicable legal retention
                    obligations.
                  </Text>

                  <Text>
                    We may suspend or terminate your account if we determine
                    that you have violated these Terms or if we are required to
                    do so by law. Where appropriate, we will notify you of the
                    reason.
                  </Text>

                  <Text>
                    Upon termination, you may lose access to your account and
                    content.
                  </Text>
                </section>

                {/* 12 */}
                <section
                  id="liability"
                  className="legal-section"
                >
                  <SectionHeader
                    number="12"
                    title="Disclaimers and Limitation of Liability"
                  />

                  <div className="grid gap-4">

                    <InfoCard
                      title="As-Is and As-Available"
                      text="The platform is provided on an as-is and as-available basis. We do not warrant that the platform will be uninterrupted, error-free, or free of harmful components."
                    />

                    <InfoCard
                      title="Content Accuracy"
                      text="We do not endorse or guarantee the accuracy, completeness, or reliability of content posted by users."
                    />

                    <InfoCard
                      title="Limitation of Liability"
                      text="To the fullest extent permitted by applicable law, ZRP and its affiliates, employees, and agents shall not be liable for indirect, incidental, special, consequential, or punitive damages arising from your use of the platform."
                    />

                  </div>

                  <Text>
                    In no event shall our total liability exceed the amount
                    you have paid to us, if any, during the preceding 12
                    months, to the extent such limitation is permitted by
                    applicable law.
                  </Text>

                  <Text>
                    <strong>User Responsibility:</strong> You are responsible
                    for your interactions with other users and for the content
                    you post.
                  </Text>
                </section>

                {/* 13 */}
                <section
                  id="charity"
                  className="legal-section"
                >
                  <SectionHeader
                    number="13"
                    title="Charity Commitment"
                  />

                  <div className="rounded-2xl bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack p-6 sm:p-8 text-white">

                    <div className="flex flex-col sm:flex-row gap-6 items-start">

                      <div className="text-5xl font-orbitron font-bold text-white">
                        35%
                      </div>

                      <div>
                        <h3 className="font-orbitron font-bold text-xl">
                          Social Impact
                        </h3>

                        <p className="mt-2 text-white/80 leading-relaxed">
                          ZRP is committed to dedicating 35% of its profits to
                          charitable causes supporting orphans, schools,
                          hospitals, and climate relief.
                        </p>
                      </div>

                    </div>

                    <div className="mt-6 pt-5 border-t border-white/15 text-sm text-white/70">
                      We publish transparency information concerning our
                      charitable contributions.
                    </div>

                  </div>
                </section>

                {/* 14 */}
                <section
                  id="changes"
                  className="legal-section"
                >
                  <SectionHeader
                    number="14"
                    title="Changes to These Terms"
                  />

                  <Text>
                    We may update these Terms from time to time to reflect
                    changes in our services, legal requirements, or industry
                    standards.
                  </Text>

                  <Text>
                    We may notify users of significant changes through:
                  </Text>

                  <BulletList
                    items={[
                      <>Email, where an email address has been provided.</>,
                      <>A notice on the platform.</>,
                      <>An updated "Last updated" date at the top of this page.</>,
                    ]}
                  />

                  <Text>
                    If you continue to use the platform after changes take
                    effect, you accept the updated Terms. If you do not agree,
                    you must discontinue use of the platform.
                  </Text>
                </section>

                {/* 15 */}
                <section
                  id="contact"
                  className="legal-section"
                >
                  <SectionHeader number="15" title="Contact Us" />

                  <Text>
                    If you have questions, concerns, or feedback regarding
                    these Terms, please contact us.
                  </Text>

                  <div className="grid sm:grid-cols-2 gap-4 mt-6">

                    <ContactCard
                      title="General Support"
                      email="support@zrp.one"
                    />

                    <ContactCard
                      title="Privacy Inquiries"
                      email="privacy@zrp.one"
                    />

                  </div>

                  <Text>
                    We are committed to addressing concerns as quickly and
                    transparently as reasonably possible.
                  </Text>
                </section>

                {/* Rights Summary */}
                <section className="rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/30 p-6 sm:p-8">

                  <div className="flex items-center gap-3 mb-6">

                    <div className="w-10 h-10 rounded-xl bg-zrp-red/10 flex items-center justify-center text-zrp-red">
                      ✓
                    </div>

                    <div>
                      <h2 className="text-2xl font-orbitron font-bold text-zrp-charcoal dark:text-white">
                        Summary of Your Rights
                      </h2>

                      <p className="text-sm text-zrp-charcoal/60 dark:text-white/60 mt-1">
                        A quick overview of important user rights.
                      </p>
                    </div>

                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">

                    <RightCard
                      title="Post freely"
                      text="Express your opinions within applicable law and our platform rules."
                    />

                    <RightCard
                      title="Own your content"
                      text="You retain ownership of the content you create."
                    />

                    <RightCard
                      title="Delete your data"
                      text="Request deletion of your account and personal data, subject to applicable law."
                    />

                    <RightCard
                      title="Appeal moderation"
                      text="Challenge applicable content or account actions through our appeal process."
                    />

                    <RightCard
                      title="Privacy"
                      text="Your personal data is handled according to our Privacy Policy and applicable law."
                    />

                    <RightCard
                      title="Social impact"
                      text="ZRP is committed to directing 35% of profits toward charitable causes."
                    />

                  </div>

                </section>

              </div>

            </article>

          </div>

        </section>

        {/* Bottom CTA */}
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
              Questions about our Terms?
            </h2>

            <p className="mt-3 text-white/75 font-inter">
              Our support team is available to help clarify questions about
              your account or use of ZRP Social.
            </p>

            <a
              href="mailto:support@zrp.one"
              className="inline-flex items-center justify-center mt-6 px-7 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-100 transition font-inter"
            >
              Contact Support
            </a>

          </div>

        </section>

      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Reusable Components                                                        */
/* -------------------------------------------------------------------------- */

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

function Text({ children }: { children: React.ReactNode }) {
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
