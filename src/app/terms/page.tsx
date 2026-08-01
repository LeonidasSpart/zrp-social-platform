"use client";

import Link from "next/link";
import Image from "next/image";

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 md:py-20">
      <div className="mb-8">
        <Link href="/" className="inline-flex items-center gap-2 text-zrp-red hover:underline">
          ← Back to home
        </Link>
      </div>

      <div className="text-center mb-12">
        <div className="flex justify-center mb-6">
          <Image src="/logo.png" alt="ZRP" width={64} height={64} className="w-16 h-16 object-contain" />
        </div>
        <h1 className="text-4xl md:text-5xl font-orbitron font-bold text-zrp-red">Terms of Service</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-3 text-sm">
          Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
          These Terms govern your use of ZRP Social. By using our platform, you agree to these Terms.
        </p>
      </div>

      <div className="prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-6">

        {/* ─── 1. INTRODUCTION ─── */}
        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">1. Introduction</h2>
          <p>
            Welcome to <strong>ZRP Social</strong>, a social media platform operated by ZRP ("we," "us," or "our").
            These Terms of Service ("Terms") constitute a legally binding agreement between you and ZRP regarding your
            use of our platform, including all features, content, and services offered through our website and applications.
          </p>
          <p>
            By creating an account or accessing our platform, you acknowledge that you have read, understood, and agree
            to be bound by these Terms, our <Link href="/privacy" className="text-zrp-red hover:underline">Privacy Policy</Link>,
            and our <Link href="/guidelines" className="text-zrp-red hover:underline">Community Guidelines</Link>.
          </p>
          <p>
            If you do not agree with any part of these Terms, you must not use our platform.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <strong>Applicable Law:</strong> These Terms are governed by the laws of Switzerland, and any disputes
            shall be resolved exclusively in the courts of Switzerland.
          </p>
        </section>

        {/* ─── 2. ELIGIBILITY ─── */}
        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">2. Eligibility</h2>
          <p>To use ZRP Social, you must:</p>
          <ul>
            <li>Be at least <strong>16 years old</strong> (or the age of digital consent in your jurisdiction).</li>
            <li>Provide accurate and truthful information during registration.</li>
            <li>Not be located in a country subject to sanctions or embargoes.</li>
            <li>Not have been previously banned or suspended from our platform.</li>
            <li>Agree to use the platform solely for lawful purposes.</li>
          </ul>
          <p>
            By using our platform, you represent and warrant that you meet all eligibility requirements.
            We reserve the right to refuse or terminate access to any user who does not meet these criteria.
          </p>
        </section>

        {/* ─── 3. ACCOUNT REGISTRATION ─── */}
        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">3. Account Registration</h2>
          <p>
            To access certain features, you must create an account. You agree to:
          </p>
          <ul>
            <li>Provide accurate, current, and complete information during registration.</li>
            <li>Maintain and update your account information as necessary.</li>
            <li>Keep your password secure and confidential.</li>
            <li>Notify us immediately of any unauthorized access to your account.</li>
            <li>Be responsible for all activities that occur under your account.</li>
          </ul>
          <p>
            You may not create multiple accounts, impersonate others, or use automated means to create accounts.
            We reserve the right to verify your identity and request additional information.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <strong>Email Verification:</strong> Your email address must be verified before you can fully use the platform.
          </p>
        </section>

        {/* ─── 4. FREEDOM OF SPEECH ─── */}
        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">4. Freedom of Speech</h2>
          <p>
            <strong>ZRP Social is built on the principle of freedom of speech.</strong> We believe that every person
            has the right to express their opinions and ideas without fear of censorship or retaliation.
          </p>
          <p>
            As a Swiss platform, we operate under the framework of <strong>Swiss law</strong>, which strongly protects
            freedom of expression. We do not moderate or remove content based solely on political opinion, ideology,
            religious belief, or unpopular viewpoints.
          </p>
          <p>
            However, freedom of speech is not absolute. We reserve the right to moderate or remove content that:
          </p>
          <ul>
            <li>Violates applicable laws (e.g., hate speech, defamation, threats, harassment).</li>
            <li>Incites violence, terrorism, or illegal activities.</li>
            <li>Contains child sexual abuse material or other illegal content.</li>
            <li>Infringes on the intellectual property rights of others.</li>
            <li>Is spam, misleading, or fraudulent.</li>
            <li>Violates our Community Guidelines.</li>
          </ul>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <strong>We will never delete content solely for:</strong>
            Criticizing governments or institutions, expressing unpopular opinions, challenging mainstream narratives,
            or exercising political dissent. We defend your right to speak freely.
          </p>
        </section>

        {/* ─── 5. USER CONDUCT ─── */}
        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">5. User Conduct</h2>
          <p>You agree to use ZRP Social responsibly and lawfully. You shall not:</p>
          <ul>
            <li>Post, share, or distribute content that is illegal, harmful, obscene, defamatory, or threatening.</li>
            <li>Harass, bully, intimidate, or threaten others.</li>
            <li>Impersonate any person or entity, or falsely claim affiliation with any person or entity.</li>
            <li>Engage in deceptive, fraudulent, or manipulative behavior.</li>
            <li>Share malicious code, viruses, or other harmful software.</li>
            <li>Use automated means (bots, scrapers) to access or collect data from our platform.</li>
            <li>Interfere with the proper functioning of our platform.</li>
            <li>Violate any applicable laws, regulations, or third‑party rights.</li>
          </ul>
          <p>
            We encourage open and respectful debate. Disagreement is welcome; hostility is not.
            We reserve the right to take action against users who violate these rules.
          </p>
        </section>

        {/* ─── 6. CONTENT OWNERSHIP AND LICENSE ─── */}
        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">6. Content Ownership and License</h2>
          <p>
            <strong>You retain full ownership of the content you create and share on ZRP Social.</strong>
            This includes text, images, videos, audio, and any other content you post.
          </p>
          <p>
            By posting content on our platform, you grant us a <strong>worldwide, non‑exclusive, royalty‑free license</strong>
            to display, store, and distribute your content on the platform and through our services. This license
            is limited to the purpose of operating, improving, and promoting the platform. We do not claim ownership
            of your content.
          </p>
          <p>
            You retain the right to delete your content at any time. When you delete your content, the license
            we have to use it ends, except where we need it for legal or operational reasons (e.g., backups, archiving).
          </p>
          <p>
            We never sell or license your content to third parties for advertising or commercial exploitation.
            Your content remains yours.
          </p>
        </section>

        {/* ─── 7. INTELLECTUAL PROPERTY ─── */}
        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">7. Intellectual Property</h2>
          <p>
            The platform, including its design, logos, trademarks, and software, is the intellectual property of ZRP.
            You may not copy, modify, reproduce, or distribute any part of the platform without our written consent.
          </p>
          <p>
            You may not use our trademarks or branding without permission.
            All rights not expressly granted are reserved.
          </p>
        </section>

        {/* ─── 8. PRIVACY AND DATA PROTECTION ─── */}
        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">8. Privacy and Data Protection</h2>
          <p>
            Your privacy is a top priority. We collect and process your data in accordance with our
            <Link href="/privacy" className="text-zrp-red hover:underline"> Privacy Policy</Link> and applicable laws
            including the Swiss Federal Act on Data Protection (FADP) and the GDPR.
          </p>
          <p>
            We do not sell or rent your personal data. We do not use your data for targeted advertising.
            Your data is stored securely in Switzerland and the European Union.
          </p>
          <p>
            You have the right to access, correct, or delete your data at any time. Please see our Privacy Policy
            for details on how to exercise your rights.
          </p>
        </section>

        {/* ─── 9. MODERATION AND ENFORCEMENT ─── */}
        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">9. Moderation and Enforcement</h2>
          <p>
            We strive to maintain a safe and respectful environment. We use a combination of automated tools and
            human review to enforce these Terms and our Community Guidelines.
          </p>
          <p>
            <strong>Our moderation is transparent and fair.</strong> If we take action against your account or content
            (e.g., removal, suspension, or ban), you will be notified of the reason and have the right to appeal.
          </p>
          <p>Actions we may take include:</p>
          <ul>
            <li>Removing content that violates our policies.</li>
            <li>Issuing warnings to users who violate our policies.</li>
            <li>Suspending or banning accounts for serious or repeated violations.</li>
            <li>Reporting illegal activity to law enforcement authorities.</li>
          </ul>
          <p>
            We reserve the right to moderate content at our discretion, but we will always strive to be fair,
            consistent, and transparent in our enforcement actions.
          </p>
        </section>

        {/* ─── 10. DISPUTE RESOLUTION ─── */}
        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">10. Dispute Resolution</h2>
          <p>
            These Terms are governed by the laws of <strong>Switzerland</strong>, without regard to conflict of law principles.
            Any dispute arising out of or in connection with these Terms shall be resolved:
          </p>
          <ul>
            <li>First, through informal negotiations between you and us.</li>
            <li>If negotiations fail, through mediation or arbitration.</li>
            <li>If still unresolved, before the competent courts of Switzerland (or the courts of your jurisdiction, where applicable).</li>
          </ul>
          <p>
            We encourage you to contact us first at <a href="mailto:support@zrp.one" className="text-zrp-red hover:underline">support@zrp.one</a>
            to resolve disputes amicably.
          </p>
        </section>

        {/* ─── 11. TERMINATION ─── */}
        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">11. Termination</h2>
          <p>
            You may terminate your account at any time by contacting us or using the account deletion feature
            (if available). Upon termination, we will delete your data within 30 days, subject to legal retention
            obligations.
          </p>
          <p>
            We may suspend or terminate your account if we determine that you have violated these Terms,
            or if we are required to do so by law. We will notify you of any termination and provide the reason.
          </p>
          <p>
            Upon termination, you will lose access to your account and content. We are not liable for any losses
            arising from termination.
          </p>
        </section>

        {/* ─── 12. DISCLAIMERS AND LIMITATION OF LIABILITY ─── */}
        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">12. Disclaimers and Limitation of Liability</h2>
          <p>
            <strong>“As‑Is” and “As‑Available”</strong> – The platform is provided on an "as‑is" and "as‑available" basis.
            We do not warrant that the platform will be uninterrupted, error‑free, or free of harmful components.
          </p>
          <p>
            <strong>No Guarantee of Content Accuracy</strong> – We do not endorse or guarantee the accuracy,
            completeness, or reliability of any content posted on the platform.
          </p>
          <p>
            <strong>Limitation of Liability</strong> – To the fullest extent permitted by law, ZRP and its affiliates,
            employees, and agents shall not be liable for any indirect, incidental, special, consequential,
            or punitive damages arising from your use of the platform.
          </p>
          <p>
            In no event shall our total liability exceed the amount you have paid to us (if any) in the preceding
            12 months.
          </p>
          <p>
            <strong>User Responsibility</strong> – You are solely responsible for your interactions with other users
            and for the content you post. We do not actively monitor user interactions but reserve the right to do so.
          </p>
        </section>

        {/* ─── 13. CHARITY COMMITMENT ─── */}
        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">13. Charity Commitment</h2>
          <p>
            <strong>35% of our profits are dedicated to charitable causes</strong> supporting orphans, schools,
            hospitals, and climate relief. This is not a marketing gimmick – it is a core commitment.
          </p>
          <p>
            We publish transparency reports detailing our charitable contributions. Your use of the platform
            contributes to positive social impact.
          </p>
          <p>
            We do not use your data for charity campaigns; our commitment is to the greater good, not profit.
          </p>
        </section>

        {/* ─── 14. CHANGES TO THESE TERMS ─── */}
        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">14. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time to reflect changes in our services, legal requirements,
            or industry standards. We will notify you of any significant changes:
          </p>
          <ul>
            <li>By email (if you have provided one).</li>
            <li>Through a notice on the platform.</li>
            <li>By updating the "Last updated" date at the top of this page.</li>
          </ul>
          <p>
            If you continue to use the platform after the changes take effect, you accept the updated Terms.
            If you do not agree, you must discontinue use.
          </p>
        </section>

        {/* ─── 15. CONTACT US ─── */}
        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">15. Contact Us</h2>
          <p>If you have any questions, concerns, or feedback regarding these Terms, please contact us:</p>
          <ul className="list-none pl-0 mt-2 space-y-1">
            <li><strong>Email:</strong> <a href="mailto:support@zrp.one" className="text-zrp-red hover:underline">support@zrp.one</a></li>
            <li><strong>For privacy inquiries:</strong> <a href="mailto:privacy@zrp.one" className="text-zrp-red hover:underline">privacy@zrp.one</a></li>
          </ul>
          <p className="mt-4">
            We are committed to addressing your concerns quickly and transparently.
          </p>
        </section>

        {/* ─── 16. SUMMARY OF USER RIGHTS ─── */}
        <section className="bg-gray-50 dark:bg-zrp-deepBlack p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mb-4">Summary of Your Rights</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-zrp-red text-lg">✓</span>
              <div>
                <span className="font-semibold">Post freely</span>
                <p className="text-gray-500 dark:text-gray-400 text-xs">Express your opinions without fear.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-zrp-red text-lg">✓</span>
              <div>
                <span className="font-semibold">Own your content</span>
                <p className="text-gray-500 dark:text-gray-400 text-xs">You retain full ownership of your posts.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-zrp-red text-lg">✓</span>
              <div>
                <span className="font-semibold">Delete your data</span>
                <p className="text-gray-500 dark:text-gray-400 text-xs">Request deletion of your account and data.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-zrp-red text-lg">✓</span>
              <div>
                <span className="font-semibold">Appeal moderation</span>
                <p className="text-gray-500 dark:text-gray-400 text-xs">Challenge any content or account actions.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-zrp-red text-lg">✓</span>
              <div>
                <span className="font-semibold">Privacy</span>
                <p className="text-gray-500 dark:text-gray-400 text-xs">Your data is protected by Swiss law and GDPR.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-zrp-red text-lg">✓</span>
              <div>
                <span className="font-semibold">Charity impact</span>
                <p className="text-gray-500 dark:text-gray-400 text-xs">35% of profits go to global causes.</p>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>© {new Date().getFullYear()} ZRP. All rights reserved.</p>
          <p className="mt-1">
            Built with purpose. 35% of profits go to charity.
          </p>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            ZRP Social – The first Swiss European social media platform. Freedom of speech, by the people, for the people.
          </p>
        </div>
      </div>
    </div>
  );
}
