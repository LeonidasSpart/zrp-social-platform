"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  User,
  Users,
  Building2,
  Crown,
  FileText,
  PenTool,
  Megaphone,
  Briefcase,
  CheckCircle,
  ArrowRight,
  HelpCircle,
  Settings,
  CreditCard,
  Zap,
  Star,
  Shield,
  Clock,
  Globe,
  Mail,
  MessageSquare,
  Video,
  Image,
  Lock,
} from "lucide-react";

interface HelpSection {
  id: string;
  title: string;
  icon: React.ElementType;
  content: React.ReactNode;
}

interface PlanFeature {
  name: string;
  free: boolean | string;
  pro: boolean | string;
  business: boolean | string;
  enterprise: boolean | string;
}

export default function HelpPage() {
  const [openSection, setOpenSection] = useState<string | null>(null);

  const toggleSection = (id: string) => {
    setOpenSection(openSection === id ? null : id);
  };

  const planFeatures: PlanFeature[] = [
    { name: "Post length", free: "280 chars", pro: "1,000 chars", business: "5,000 chars", enterprise: "Unlimited" },
    { name: "Images per post", free: "1", pro: "4", business: "10", enterprise: "Unlimited" },
    { name: "Video upload", free: "32 MB", pro: "100 MB", business: "500 MB", enterprise: "2 GB" },
    { name: "Polls", free: "✅", pro: "✅", business: "✅", enterprise: "✅" },
    { name: "Scheduled posts", free: "5/month", pro: "50/month", business: "500/month", enterprise: "Unlimited" },
    { name: "Analytics", free: "Basic", pro: "Advanced", business: "Full", enterprise: "Custom" },
    { name: "Verified badge", free: "❌", pro: "✅", business: "✅", enterprise: "✅" },
    { name: "Custom profile URL", free: "❌", pro: "✅", business: "✅", enterprise: "✅" },
    { name: "Recruitment profiles", free: "❌", pro: "❌", business: "✅", enterprise: "✅" },
    { name: "Article publishing", free: "❌", pro: "❌", business: "✅", enterprise: "✅" },
    { name: "Team management", free: "❌", pro: "❌", business: "✅", enterprise: "✅" },
    { name: "API access", free: "❌", pro: "❌", business: "✅", enterprise: "✅" },
    { name: "Priority support", free: "❌", pro: "✅", business: "✅", enterprise: "24/7" },
    { name: "Charity contribution", free: "35%", pro: "35%", business: "35%", enterprise: "35%" },
  ];

  const sections: HelpSection[] = [
    {
      id: "account-types",
      title: "Account Types & Plans",
      icon: Users,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300">
            ZRP Social offers flexible plans tailored to your needs – from individual creators to large enterprises.
            All plans contribute <strong>35% of profits</strong> to charity.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <User className="w-6 h-6 text-blue-500" />
              <h3 className="font-bold mt-2">Free</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">$0 / month</p>
              <p className="text-xs text-gray-400 mt-1">For individuals</p>
              <ul className="text-sm space-y-1 mt-2">
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Basic social features</li>
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> 280 char posts</li>
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> 5 scheduled posts/month</li>
              </ul>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border border-zrp-red/30 shadow-sm">
              <Star className="w-6 h-6 text-amber-500" />
              <h3 className="font-bold mt-2">Pro</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">$9.99 / month</p>
              <p className="text-xs text-gray-400 mt-1">For creators & influencers</p>
              <ul className="text-sm space-y-1 mt-2">
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> 1,000 char posts</li>
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Verified badge</li>
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Advanced analytics</li>
              </ul>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <Building2 className="w-6 h-6 text-purple-500" />
              <h3 className="font-bold mt-2">Business</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">$49.99 / month</p>
              <p className="text-xs text-gray-400 mt-1">For teams & companies</p>
              <ul className="text-sm space-y-1 mt-2">
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> 5,000 char posts</li>
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Article publishing</li>
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Recruitment profiles</li>
              </ul>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <Crown className="w-6 h-6 text-amber-600" />
              <h3 className="font-bold mt-2">Enterprise</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Custom pricing</p>
              <p className="text-xs text-gray-400 mt-1">For large organisations</p>
              <ul className="text-sm space-y-1 mt-2">
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Unlimited posts</li>
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Full API access</li>
                <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Dedicated support</li>
              </ul>
            </div>
          </div>

          <div className="mt-4 p-4 bg-zrp-red/5 border border-zrp-red/20 rounded-lg">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong>🧡 All plans contribute 35% of profits to charity.</strong> No exceptions. No hidden fees.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "business-features",
      title: "Business & Enterprise Features",
      icon: Briefcase,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300">
            Upgrade to <strong>Business</strong> or <strong>Enterprise</strong> to unlock powerful tools for teams, recruitment, content creation, and more.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <PenTool className="w-5 h-5 text-blue-500" />
              <h4 className="font-semibold mt-1">Article Publishing</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Write long‑form articles (up to 10,000 words) with rich media. Perfect for thought leadership, company updates, and newsletters.</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <Briefcase className="w-5 h-5 text-purple-500" />
              <h4 className="font-semibold mt-1">Recruitment Profiles</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Showcase job openings, company culture, and career opportunities. Attract top talent directly on ZRP Social.</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <Users className="w-5 h-5 text-green-500" />
              <h4 className="font-semibold mt-1">Team Management</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Add team members, assign roles, and manage permissions. Perfect for organisations with multiple content creators.</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <FileText className="w-5 h-5 text-amber-500" />
              <h4 className="font-semibold mt-1">Long‑Form Content</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Write posts up to 5,000 characters (Business) or unlimited (Enterprise). Share detailed insights, case studies, and industry analysis.</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <Megaphone className="w-5 h-5 text-red-500" />
              <h4 className="font-semibold mt-1">Promoted Content</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Boost your posts to reach a wider audience. Advanced targeting options for Business and Enterprise.</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <Shield className="w-5 h-5 text-cyan-500" />
              <h4 className="font-semibold mt-1">Priority Moderation</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Get faster response times on reports and content disputes. Enterprise accounts get 24/7 dedicated support.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "account-limits",
      title: "Account Limits & Restrictions",
      icon: Lock,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300">
            To ensure a fair and spam‑free experience, ZRP Social has the following limits. Upgrade to increase them.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left">Feature</th>
                  <th className="px-3 py-2 text-center">Free</th>
                  <th className="px-3 py-2 text-center">Pro</th>
                  <th className="px-3 py-2 text-center">Business</th>
                  <th className="px-3 py-2 text-center">Enterprise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {planFeatures.map((feature, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"}>
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{feature.name}</td>
                    <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">{feature.free}</td>
                    <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">{feature.pro}</td>
                    <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">{feature.business}</td>
                    <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">{feature.enterprise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              💡 All limits reset monthly. Unused scheduled posts do not roll over.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "how-to-upgrade",
      title: "How to Upgrade Your Account",
      icon: CreditCard,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300">
            Upgrading to a paid plan gives you access to advanced features and higher limits. Here's how:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Go to <Link href="/settings" className="text-zrp-red hover:underline">Settings</Link>.</li>
            <li>Click on the <strong>Subscription</strong> tab.</li>
            <li>Choose your plan (Pro, Business, or Enterprise).</li>
            <li>Enter your payment details (secure, PCI‑compliant).</li>
            <li>Confirm the upgrade – your new features will be active immediately.</li>
          </ol>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            🔒 Need help with billing? <Link href="/contact" className="text-zrp-red hover:underline">Contact our support team</Link>.
          </p>
        </div>
      ),
    },
    {
      id: "corporate-accounts",
      title: "Corporate Accounts",
      icon: Building2,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300">
            Corporate accounts on ZRP Social are designed for organisations, brands, and professional teams. They include:
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>Verified Organisation badge</strong> (gold) – increased trust and visibility.</li>
            <li><strong>Custom branding</strong> – logo, cover image, and theme colours.</li>
            <li><strong>Multiple team members</strong> – assign roles (Admin, Editor, Contributor).</li>
            <li><strong>Advanced analytics</strong> – track engagement, reach, and conversion.</li>
            <li><strong>Recruitment tools</strong> – post job openings and manage applications.</li>
            <li><strong>Article publishing</strong> – publish long‑form content under your brand.</li>
            <li><strong>Priority support</strong> – fast response times and dedicated contact.</li>
          </ul>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            📧 For custom Enterprise solutions, <Link href="/contact" className="text-zrp-red hover:underline">contact our sales team</Link>.
          </p>
        </div>
      ),
    },
    {
      id: "faq",
      title: "Frequently Asked Questions",
      icon: HelpCircle,
      content: (
        <div className="space-y-3">
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white">Can I switch plans later?</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">Yes, you can upgrade or downgrade at any time. Changes take effect immediately.</p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white">What happens if I downgrade?</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">You'll lose access to advanced features, but your content and data remain intact. Scheduled posts will be cancelled if they exceed your new limit.</p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white">Is there a free trial for paid plans?</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">Yes, we offer a 14‑day free trial for Pro and Business plans. Enterprise requires a custom demo.</p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white">What payment methods do you accept?</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">We accept all major credit cards (Visa, Mastercard, American Express) and PayPal.</p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white">Are the 35% charity contributions deducted from my subscription?</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">No, the 35% comes from the platform's overall profits – not your subscription fees. Your payment goes entirely to support the platform and its features.</p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white">Can I cancel my subscription anytime?</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">Yes, you can cancel anytime from your Settings page. No long‑term contracts or hidden fees.</p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6">
      {/* ─── Header ─── */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zrp-red/10 text-zrp-red mb-4">
          <HelpCircle className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
          Help Center
        </h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
          Everything you need to know about ZRP Social – from account types to business features.
        </p>
      </div>

      {/* ─── Quick Links ─── */}
      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#help-${section.id}`}
            className="px-3 py-1.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-zrp-red hover:text-white transition"
          >
            {section.title}
          </a>
        ))}
      </div>

      {/* ─── Sections ─── */}
      <div className="space-y-6">
        {sections.map((section) => {
          const isOpen = openSection === section.id;
          const Icon = section.icon;

          return (
            <div
              key={section.id}
              id={`help-${section.id}`}
              className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900"
            >
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <Icon className="w-5 h-5 text-zrp-red flex-shrink-0" />
                <span className="font-semibold text-gray-900 dark:text-white flex-1">
                  {section.title}
                </span>
                {isOpen ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pt-0 text-gray-700 dark:text-gray-300">
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                    {section.content}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Contact Support ─── */}
      <div className="mt-12 p-6 bg-gray-50 dark:bg-gray-800 rounded-xl text-center border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Still need help?
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Our support team is here to assist you with any questions.
        </p>
        <div className="flex flex-wrap justify-center gap-3 mt-4">
          <Link
            href="/contact"
            className="px-4 py-2 bg-zrp-red text-white rounded-full text-sm font-medium hover:bg-zrp-darkRed transition"
          >
            Contact Support
          </Link>
          <Link
            href="/faq"
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            Visit FAQ
          </Link>
        </div>
      </div>

      {/* ─── Footer Links ─── */}
      <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-gray-400 dark:text-gray-500">
        <Link href="/about" className="hover:text-zrp-red transition">About</Link>
        <Link href="/privacy" className="hover:text-zrp-red transition">Privacy</Link>
        <Link href="/terms" className="hover:text-zrp-red transition">Terms</Link>
        <Link href="/contact" className="hover:text-zrp-red transition">Contact</Link>
        <Link href="/charity" className="hover:text-zrp-red transition">Charity</Link>
        <Link href="/faq" className="hover:text-zrp-red transition">FAQ</Link>
        <Link href="/help" className="hover:text-zrp-red transition">Help Center</Link>
      </div>
    </div>
  );
}
