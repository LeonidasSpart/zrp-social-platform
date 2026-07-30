"use client";

import Link from "next/link";
import Image from "next/image";

export default function PrivacyPage() {
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
        <h1 className="text-4xl md:text-5xl font-orbitron font-bold text-zrp-red">Privacy Policy</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-3 text-sm">
          Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-6">

        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">1. Introduction</h2>
          <p>
            Welcome to ZRP Social. We are a <strong>Swiss‑based social media platform</strong> dedicated to protecting
            your privacy and upholding your right to freedom of speech. This Privacy Policy explains how we collect,
            use, store, and protect your personal data when you use our platform.
          </p>
          <p>
            We comply with the <strong>Swiss Federal Act on Data Protection (FADP)</strong> and the
            <strong>European General Data Protection Regulation (GDPR)</strong>, ensuring that your data is handled
            with the highest standards of care and transparency.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">2. Data Controller</h2>
          <p>
            <strong>ZRP Social</strong> is the data controller for the personal data you provide through our platform.
            If you have any questions about this policy or your data, please contact us at:
          </p>
          <ul className="list-none pl-0 mt-2 space-y-1">
            <li><strong>Email:</strong> <a href="mailto:privacy@zrp.one" className="text-zrp-red hover:underline">privacy@zrp.one</a></li>
            <li><strong>Address:</strong> ZRP, Switzerland (exact address will be added)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">3. What Data We Collect</h2>
          <p>We collect only the data necessary to provide and improve our services. This includes:</p>
          <ul>
            <li><strong>Account Information:</strong> Username, email address, display name, and password (hashed).</li>
            <li><strong>Profile Information:</strong> Bio, profile picture, location, country, website, and any other information you choose to add.</li>
            <li><strong>Content:</strong> Posts, comments, images, videos, GIFs, polls, and any other content you create or share.</li>
            <li><strong>Interaction Data:</strong> Likes, reposts, follows, bookmarks, shares, and messages.</li>
            <li><strong>Device Information:</strong> IP address, browser type, operating system, and device identifiers for security and analytics.</li>
            <li><strong>Cookies:</strong> We use essential and functional cookies; you can manage your preferences via our cookie banner.</li>
          </ul>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            We never collect sensitive data like financial details or government IDs without explicit consent.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">4. How We Use Your Data</h2>
          <p>Your data is used to:</p>
          <ul>
            <li>Provide, operate, and maintain the platform.</li>
            <li>Improve user experience and develop new features.</li>
            <li>Communicate with you (e.g., service updates, security alerts).</li>
            <li>Prevent fraud, abuse, and enforce our community guidelines.</li>
            <li>Comply with legal obligations.</li>
          </ul>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <strong>We do not sell or rent your personal data to third parties.</strong>
            We never use your data for advertising or political manipulation.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">5. Legal Basis for Processing (GDPR)</h2>
          <ul>
            <li><strong>Contractual necessity:</strong> To perform our contract with you (the Terms of Service).</li>
            <li><strong>Legitimate interests:</strong> To improve the platform, ensure security, and prevent fraud.</li>
            <li><strong>Consent:</strong> For optional features like cookies or location data.</li>
            <li><strong>Legal obligation:</strong> Where we must comply with applicable laws.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">6. Cookies and Tracking</h2>
          <p>
            We use cookies to enhance your experience, remember your preferences, and analyse platform usage.
            You can choose to accept or reject non-essential cookies via our cookie banner.
          </p>
          <p>
            <strong>We do not use tracking cookies for advertising or profiling.</strong>
            All analytics are anonymized and used solely to improve the platform.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">7. Data Sharing and Third Parties</h2>
          <p>
            We only share data with trusted service providers who act as data processors on our behalf,
            strictly for the purpose of operating the platform (e.g., hosting providers, email delivery).
            These processors are contractually bound to protect your data.
          </p>
          <p>
            We <strong>do not share</strong> your data with advertisers, political organisations, or any entity
            that would compromise your privacy or freedom of speech.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">8. Data Retention</h2>
          <p>
            We retain your data for as long as your account is active, or as necessary to provide you with services.
            If you delete your account, your content and personal data will be permanently removed from our databases
            within 30 days, except where retention is required by law.
          </p>
          <p>
            You can request deletion of your data at any time (see Section 10).
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">9. International Data Transfers</h2>
          <p>
            ZRP Social is hosted in Switzerland and the European Union. We do not transfer your data to countries
            that do not provide an adequate level of data protection, unless we have taken appropriate safeguards
            (such as Standard Contractual Clauses) to ensure your data remains protected.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">10. Your Rights</h2>
          <p>Under GDPR and Swiss law, you have the following rights:</p>
          <ul>
            <li><strong>Right to Access:</strong> Request a copy of your personal data.</li>
            <li><strong>Right to Rectification:</strong> Correct inaccurate data.</li>
            <li><strong>Right to Erasure:</strong> Request deletion of your data (“right to be forgotten”).</li>
            <li><strong>Right to Restriction:</strong> Limit how we process your data.</li>
            <li><strong>Right to Portability:</strong> Receive your data in a structured format.</li>
            <li><strong>Right to Object:</strong> Object to processing based on legitimate interests.</li>
            <li><strong>Right to Withdraw Consent:</strong> Withdraw consent at any time (where applicable).</li>
          </ul>
          <p>
            To exercise any of these rights, please contact us at <a href="mailto:privacy@zrp.one" className="text-zrp-red hover:underline">privacy@zrp.one</a>.
            We will respond within 30 days.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">11. Data Security</h2>
          <p>
            We implement robust security measures to protect your data, including:
          </p>
          <ul>
            <li>Encryption of data in transit (TLS) and at rest.</li>
            <li>Regular security audits and vulnerability assessments.</li>
            <li>Strict access controls for employees and contractors.</li>
            <li>Anonymisation and pseudonymisation where possible.</li>
          </ul>
          <p>
            While we strive to protect your data, no system is 100% secure. We encourage you to use strong passwords
            and enable two‑factor authentication (if available) to further protect your account.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">12. Children’s Privacy</h2>
          <p>
            ZRP Social is not intended for children under the age of 16. We do not knowingly collect personal data from
            children. If you are a parent or guardian and believe we have collected data from your child, please contact
            us so we can delete it.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">13. Freedom of Speech and Content Moderation</h2>
          <p>
            We are committed to protecting your freedom of speech. However, we reserve the right to moderate content
            that is illegal, violates our community guidelines, or incites violence or discrimination.
          </p>
          <p>
            We will never delete content solely for being critical of power, expressing unpopular opinions, or
            challenging the status quo. Our moderation is transparent, and we provide clear appeals processes.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">14. Charity Commitment</h2>
          <p>
            <strong>35% of our profits are donated to charitable causes</strong> supporting orphans, schools, hospitals,
            and climate relief. We are transparent about our donations and publish regular reports.
          </p>
          <p>
            We never use your data to target you for charity campaigns; our commitment is to the greater good, not profit.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">15. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any significant changes via email
            or prominent notice on the platform. The latest version will always be available at
            <Link href="/privacy" className="text-zrp-red hover:underline"> /privacy</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-orbitron text-gray-900 dark:text-white mt-8 mb-4">16. Contact Us</h2>
          <p>
            If you have any questions, concerns, or requests regarding your privacy, please contact us:
          </p>
          <ul className="list-none pl-0 mt-2 space-y-1">
            <li><strong>Email:</strong> <a href="mailto:privacy@zrp.one" className="text-zrp-red hover:underline">privacy@zrp.one</a></li>
            <li><strong>Postal address:</strong> ZRP, Switzerland (we will add a full address soon).</li>
          </ul>
          <p className="mt-4">
            We are committed to resolving any privacy concerns swiftly and transparently.
          </p>
        </section>

        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>© {new Date().getFullYear()} ZRP. All rights reserved. Built with purpose. 35% of profits go to charity.</p>
        </div>
      </div>
    </div>
  );
}
