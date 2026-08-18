"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  CreditCard,
  Star,
  Shield,
  ShieldCheck,
  Globe,
  Mail,
  MessageSquare,
  Video,
  Image,
  Lock,
  Ticket,
  Flag,
  Trash2,
  Scale,
  Search,
  Zap,
  Sparkles,
  BadgeCheck,
  Eye,
  Heart,
  Wallet,
  CircleDollarSign,
  BarChart3,
  Settings,
  LifeBuoy,
  ExternalLink,
  BookOpen,
  AlertTriangle,
} from "lucide-react";

interface HelpSection {
  id: string;
  number: string;
  title: string;
  subtitle: string;
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

const planFeatures: PlanFeature[] = [
  {
    name: "Post length",
    free: "280 chars",
    pro: "1,000 chars",
    business: "5,000 chars",
    enterprise: "Unlimited",
  },
  {
    name: "Images per post",
    free: "1",
    pro: "4",
    business: "10",
    enterprise: "Unlimited",
  },
  {
    name: "Video upload",
    free: "32 MB",
    pro: "100 MB",
    business: "500 MB",
    enterprise: "2 GB",
  },
  {
    name: "Polls",
    free: "✓",
    pro: "✓",
    business: "✓",
    enterprise: "✓",
  },
  {
    name: "Scheduled posts",
    free: "5/month",
    pro: "50/month",
    business: "500/month",
    enterprise: "Unlimited",
  },
  {
    name: "Analytics",
    free: "Basic",
    pro: "Advanced",
    business: "Full",
    enterprise: "Custom",
  },
  {
    name: "Verified badge",
    free: "—",
    pro: "✓",
    business: "✓",
    enterprise: "✓",
  },
  {
    name: "Custom profile URL",
    free: "—",
    pro: "✓",
    business: "✓",
    enterprise: "✓",
  },
  {
    name: "Recruitment profiles",
    free: "—",
    pro: "—",
    business: "✓",
    enterprise: "✓",
  },
  {
    name: "Article publishing",
    free: "—",
    pro: "—",
    business: "✓",
    enterprise: "✓",
  },
  {
    name: "Team management",
    free: "—",
    pro: "—",
    business: "✓",
    enterprise: "✓",
  },
  {
    name: "API access",
    free: "—",
    pro: "—",
    business: "✓",
    enterprise: "✓",
  },
  {
    name: "Priority support",
    free: "—",
    pro: "✓",
    business: "✓",
    enterprise: "24/7",
  },
  {
    name: "Charity contribution",
    free: "35%",
    pro: "35%",
    business: "35%",
    enterprise: "35%",
  },
];

export default function HelpPage() {
  const [openSection, setOpenSection] = useState<string | null>(
    "account-types"
  );

  const [searchQuery, setSearchQuery] = useState("");

  const toggleSection = (id: string) => {
    setOpenSection(openSection === id ? null : id);
  };

  const sections: HelpSection[] = [
    {
      id: "account-types",
      number: "01",
      title: "Account Types & Plans",
      subtitle: "Choose the ZRP experience that fits you",
      icon: Users,
      content: (
        <div className="space-y-6">
          <p className="help-text">
            ZRP Social offers flexible plans for individuals, creators,
            businesses, teams, and larger organisations. Every plan is part of
            the same ZRP ecosystem and contributes to our social-impact
            commitment.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <PlanCard
              icon={User}
              iconClass="text-zrp-charcoal dark:text-white"
              accent="border-white/10"
              title="Free"
              price="$0"
              period="/ month"
              description="For everyday users"
              features={[
                "Core social features",
                "280 character posts",
                "5 scheduled posts/month",
              ]}
            />

            <PlanCard
              icon={Star}
              iconClass="text-zrp-red"
              accent="border-zrp-red/50"
              featured
              title="Pro"
              price="$9.99"
              period="/ month"
              description="For creators"
              features={[
                "1,000 character posts",
                "Verified badge",
                "Advanced analytics",
              ]}
            />

            <PlanCard
              icon={Building2}
              iconClass="text-zrp-charcoal dark:text-white"
              accent="border-zrp-red/20"
              title="Business"
              price="$49.99"
              period="/ month"
              description="For teams & companies"
              features={[
                "5,000 character posts",
                "Article publishing",
                "Recruitment profiles",
              ]}
            />

            <PlanCard
              icon={Crown}
              iconClass="text-zrp-red"
              accent="border-zrp-red/20"
              title="Enterprise"
              price="Custom"
              period=""
              description="For larger organisations"
              features={[
                "Unlimited content",
                "API access",
                "Dedicated support",
              ]}
            />
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-zrp-red to-zrp-darkRed p-6 text-white">
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />

            <div className="relative flex items-start gap-4">
              <Heart className="w-7 h-7 flex-shrink-0" />

              <div>
                <h3 className="font-orbitron font-bold text-lg">
                  Built for impact
                </h3>

                <p className="mt-1 text-sm text-white/85 leading-6">
                  ZRP is committed to directing 35% of platform profits toward
                  charitable causes supporting orphans, schools, hospitals, and
                  climate relief.
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: "business-features",
      number: "02",
      title: "Business & Enterprise",
      subtitle: "Professional tools for organisations",
      icon: Briefcase,
      content: (
        <div className="space-y-6">
          <p className="help-text">
            Business and Enterprise accounts extend ZRP from a social network
            into a professional communication and publishing platform.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <FeatureCard
              icon={PenTool}
              title="Article Publishing"
              description="Publish long-form content with rich media for thought leadership, company updates, research, and industry analysis."
            />

            <FeatureCard
              icon={Briefcase}
              title="Recruitment Profiles"
              description="Present your organisation, publish opportunities, and build a professional presence for candidates."
            />

            <FeatureCard
              icon={Users}
              title="Team Management"
              description="Add team members, assign roles, and manage permissions across your organisation."
            />

            <FeatureCard
              icon={FileText}
              title="Long-Form Content"
              description="Business accounts can publish substantially longer posts for detailed insights and professional communication."
            />

            <FeatureCard
              icon={Megaphone}
              title="Promoted Content"
              description="Business-oriented promotional tools can help organisations increase the reach of their content."
            />

            <FeatureCard
              icon={Shield}
              title="Enhanced Support"
              description="Higher-tier accounts receive priority support and additional assistance depending on their plan."
            />
          </div>
        </div>
      ),
    },

    {
      id: "account-limits",
      number: "03",
      title: "Account Limits",
      subtitle: "Compare features and usage limits",
      icon: Lock,
      content: (
        <div className="space-y-5">
          <p className="help-text">
            ZRP uses plan-based limits to help maintain platform performance,
            reduce abuse, and give users predictable access to features.
          </p>

          <div className="overflow-x-auto rounded-2xl border border-white/10 dark:border-zrp-charcoal">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-zrp-charcoal text-white">
                  <th className="px-4 py-4 text-left font-orbitron">
                    Feature
                  </th>

                  <th className="px-4 py-4 text-center font-orbitron">
                    Free
                  </th>

                  <th className="px-4 py-4 text-center font-orbitron text-zrp-red">
                    Pro
                  </th>

                  <th className="px-4 py-4 text-center font-orbitron">
                    Business
                  </th>

                  <th className="px-4 py-4 text-center font-orbitron">
                    Enterprise
                  </th>
                </tr>
              </thead>

              <tbody>
                {planFeatures.map((feature, index) => (
                  <tr
                    key={feature.name}
                    className={
                      index % 2 === 0
                        ? "bg-white dark:bg-zrp-deepBlack"
                        : "bg-zrp-silver/10 dark:bg-zrp-charcoal/40"
                    }
                  >
                    <td className="px-4 py-3 font-medium text-zrp-charcoal dark:text-white">
                      {feature.name}
                    </td>

                    <PlanValue value={feature.free} />

                    <PlanValue
                      value={feature.pro}
                      highlighted
                    />

                    <PlanValue value={feature.business} />

                    <PlanValue value={feature.enterprise} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-zrp-red/20 bg-zrp-red/5 p-4">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-zrp-red flex-shrink-0" />

              <p className="text-sm text-zrp-charcoal/75 dark:text-white/70">
                Limits may change as ZRP evolves. Current limits displayed on
                the platform take precedence over this informational page.
              </p>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: "upgrade",
      number: "04",
      title: "Subscriptions & Upgrades",
      subtitle: "Manage your ZRP plan",
      icon: CreditCard,
      content: (
        <div className="space-y-5">
          <p className="help-text">
            Paid plans unlock additional publishing, analytics, business, and
            support capabilities.
          </p>

          <div className="grid md:grid-cols-4 gap-3">
            <StepCard
              number="01"
              title="Open Settings"
              text="Go to your ZRP account settings."
            />

            <StepCard
              number="02"
              title="Choose Plan"
              text="Open the subscription section."
            />

            <StepCard
              number="03"
              title="Review"
              text="Review the plan and available features."
            />

            <StepCard
              number="04"
              title="Activate"
              text="Complete the available payment flow."
            />
          </div>

          <div className="rounded-2xl bg-zrp-charcoal text-white p-6">
            <div className="flex items-start gap-4">
              <CreditCard className="w-6 h-6 text-zrp-red flex-shrink-0" />

              <div>
                <h3 className="font-orbitron font-bold">
                  Billing & payments
                </h3>

                <p className="mt-2 text-sm text-white/65 leading-6">
                  Payment methods, pricing, taxes, renewal terms, and
                  cancellation options are presented during the applicable
                  checkout process.
                </p>

                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 mt-4 text-sm text-zrp-red hover:text-white transition"
                >
                  Contact support
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: "creator-economy",
      number: "05",
      title: "Creators & Digital Economy",
      subtitle: "Build an audience and participate in the ZRP ecosystem",
      icon: Sparkles,
      content: (
        <div className="space-y-6">
          <p className="help-text">
            ZRP gives creators tools to publish, build an audience, understand
            engagement, and participate in platform monetisation features where
            available.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <FeatureCard
              icon={BarChart3}
              title="Creator Analytics"
              description="Understand audience engagement, reach, and content performance with the analytics available on your plan."
            />

            <FeatureCard
              icon={BadgeCheck}
              title="Verified Identity"
              description="Eligible paid and professional accounts may have access to verification features according to ZRP's current policies."
            />

            <FeatureCard
              icon={CircleDollarSign}
              title="Creator Monetisation"
              description="Where enabled, creators can participate in monetisation features such as tips and premium content."
            />

            <FeatureCard
              icon={Wallet}
              title="Digital Payments"
              description="Certain creator features may support digital payments or blockchain-based payment infrastructure where enabled by ZRP."
            />
          </div>

          <div className="rounded-2xl border border-zrp-red/20 bg-gradient-to-br from-zrp-red/5 to-transparent p-6">
            <div className="flex items-start gap-4">
              <Sparkles className="w-6 h-6 text-zrp-red flex-shrink-0" />

              <div>
                <h3 className="font-orbitron font-bold text-zrp-charcoal dark:text-white">
                  Web3-ready by design
                </h3>

                <p className="mt-2 text-sm leading-6 text-zrp-charcoal/70 dark:text-white/65">
                  ZRP can integrate modern digital ownership and payment
                  technologies without making them a requirement for ordinary
                  users. The goal is simple: powerful technology underneath,
                  familiar social experiences on top.
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: "corporate-accounts",
      number: "06",
      title: "Corporate Accounts",
      subtitle: "Professional identity for organisations",
      icon: Building2,
      content: (
        <div className="space-y-5">
          <p className="help-text">
            Corporate accounts are designed for organisations, brands,
            companies, and professional teams.
          </p>

          <div className="grid md:grid-cols-2 gap-3">
            <ChecklistItem text="Verified organisation identity" />
            <ChecklistItem text="Custom profile branding" />
            <ChecklistItem text="Multiple team members" />
            <ChecklistItem text="Role-based permissions" />
            <ChecklistItem text="Advanced analytics" />
            <ChecklistItem text="Recruitment tools" />
            <ChecklistItem text="Article publishing" />
            <ChecklistItem text="Priority support" />
          </div>

          <div className="rounded-xl bg-zrp-red/5 border border-zrp-red/20 p-5">
            <p className="text-sm text-zrp-charcoal/75 dark:text-white/70">
              Looking for an Enterprise configuration?
            </p>

            <Link
              href="/contact"
              className="inline-flex items-center gap-2 mt-2 text-zrp-red font-semibold text-sm hover:underline"
            >
              Talk to ZRP
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      ),
    },

    {
      id: "support",
      number: "07",
      title: "Support Tickets",
      subtitle: "Get help when you need it",
      icon: Ticket,
      content: (
        <div className="space-y-6">
          <p className="help-text">
            If you need assistance with your account, billing, moderation, or
            another platform issue, use the ZRP support system.
          </p>

          <div className="grid md:grid-cols-3 gap-4">
            <StepCard
              number="01"
              title="Open Support"
              text="Visit the ZRP Support page."
            />

            <StepCard
              number="02"
              title="Describe Issue"
              text="Select the relevant category and provide details."
            />

            <StepCard
              number="03"
              title="Track Ticket"
              text="Follow the conversation and respond to updates."
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/support"
              className="inline-flex items-center gap-2 rounded-full bg-zrp-red px-5 py-2.5 text-sm font-semibold text-white hover:bg-zrp-darkRed transition"
            >
              <Ticket className="w-4 h-4" />
              Open Support
            </Link>

            <a
              href="mailto:support@zrp.one"
              className="inline-flex items-center gap-2 rounded-full border border-zrp-silver/40 dark:border-zrp-charcoal px-5 py-2.5 text-sm font-semibold text-zrp-charcoal dark:text-white hover:border-zrp-red hover:text-zrp-red transition"
            >
              <Mail className="w-4 h-4" />
              support@zrp.one
            </a>
          </div>
        </div>
      ),
    },

    {
      id: "reporting",
      number: "08",
      title: "Reporting & Blocking",
      subtitle: "Protect your experience on ZRP",
      icon: Flag,
      content: (
        <div className="space-y-5">
          <p className="help-text">
            ZRP supports open discussion while maintaining rules against
            illegal, harmful, abusive, fraudulent, or otherwise prohibited
            activity.
          </p>

          <div className="grid md:grid-cols-2 gap-5">
            <ActionGuide
              icon={Flag}
              title="Report content"
              steps={[
                "Open the post or comment menu.",
                "Select Report.",
                "Choose the appropriate reason.",
                "Add relevant details if necessary.",
                "Submit the report.",
              ]}
            />

            <ActionGuide
              icon={Lock}
              title="Block a user"
              steps={[
                "Open the user's profile.",
                "Open the profile menu.",
                "Select Block.",
                "Confirm the action.",
                "Manage blocked users from Settings.",
              ]}
            />
          </div>

          <div className="rounded-xl border border-zrp-red/20 bg-zrp-red/5 p-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-zrp-red flex-shrink-0" />

              <p className="text-sm leading-6 text-zrp-charcoal/75 dark:text-white/70">
                Reporting does not automatically mean content will be removed.
                Reports are reviewed according to applicable law, ZRP's Terms,
                and Community Guidelines.
              </p>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: "deletion",
      number: "09",
      title: "Account Deletion",
      subtitle: "Leave ZRP and manage your personal data",
      icon: Trash2,
      content: (
        <div className="space-y-5">
          <p className="help-text">
            You can request deletion of your ZRP account and associated
            personal data through the available account controls.
          </p>

          <div className="grid md:grid-cols-4 gap-3">
            <StepCard
              number="01"
              title="Settings"
              text="Open your account Settings."
            />

            <StepCard
              number="02"
              title="Account"
              text="Open the account management area."
            />

            <StepCard
              number="03"
              title="Delete"
              text="Select the account deletion option."
            />

            <StepCard
              number="04"
              title="Confirm"
              text="Review the consequences and confirm."
            />
          </div>

          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />

              <div>
                <h3 className="font-semibold text-zrp-charcoal dark:text-white">
                  Important
                </h3>

                <p className="mt-1 text-sm leading-6 text-zrp-charcoal/70 dark:text-white/65">
                  Account deletion may be irreversible. Certain information
                  may need to be retained where required by law or for
                  legitimate security, fraud-prevention, backup, or dispute
                  resolution purposes. See the{" "}
                  <Link
                    href="/privacy"
                    className="text-zrp-red hover:underline"
                  >
                    Privacy Policy
                  </Link>{" "}
                  for details.
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: "moderation",
      number: "10",
      title: "Moderation & Appeals",
      subtitle: "Fair enforcement and user appeals",
      icon: Scale,
      content: (
        <div className="space-y-5">
          <p className="help-text">
            ZRP combines automated systems and human review to help enforce
            platform rules and respond to reports.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <FeatureCard
              icon={Shield}
              title="Platform Safety"
              description="Systems are used to detect abuse, spam, malicious activity, and violations of platform rules."
            />

            <FeatureCard
              icon={Eye}
              title="Human Review"
              description="Certain reports and moderation decisions may require human review."
            />

            <FeatureCard
              icon={Scale}
              title="Appeals"
              description="Where an appeal process is available, users can challenge applicable moderation actions."
            />

            <FeatureCard
              icon={MessageSquare}
              title="Clear Communication"
              description="Where appropriate, users may receive information about moderation actions and available next steps."
            />
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack p-6 text-white">
            <div className="flex items-start gap-4">
              <Scale className="w-7 h-7 text-zrp-red flex-shrink-0" />

              <div>
                <h3 className="font-orbitron font-bold text-lg">
                  Freedom with responsibility
                </h3>

                <p className="mt-2 text-sm leading-6 text-white/70">
                  ZRP does not aim to remove content simply because it is
                  unpopular or politically controversial. Content and conduct
                  may nevertheless be restricted where they violate applicable
                  law, platform rules, or safety requirements.
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: "privacy",
      number: "11",
      title: "Privacy & Your Data",
      subtitle: "Understand your data rights",
      icon: Shield,
      content: (
        <div className="space-y-5">
          <p className="help-text">
            Privacy is a core part of the ZRP product philosophy. The complete
            legal details are available in our Privacy Policy.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <InfoCard
              icon={User}
              title="Account data"
              text="Information such as account and profile information needed to operate your account."
            />

            <InfoCard
              icon={MessageSquare}
              title="User content"
              text="Posts, comments, messages, media, and other information you choose to publish."
            />

            <InfoCard
              icon={Shield}
              title="Security data"
              text="Information used to protect the platform, prevent abuse, and secure accounts."
            />

            <InfoCard
              icon={Lock}
              title="Privacy controls"
              text="You have rights and controls over personal information subject to applicable law."
            />
          </div>

          <Link
            href="/privacy"
            className="inline-flex items-center gap-2 text-sm font-semibold text-zrp-red hover:underline"
          >
            Read the full Privacy Policy
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ),
    },

    {
      id: "trust-passport",
      number: "12",
      title: "ZRP Trust Passport",
      subtitle: "Understand account trust signals and transparency",
      icon: ShieldCheck,
      content: (
        <div className="space-y-6">
          {/* Introduction */}
          <div className="rounded-2xl border border-zrp-red/20 bg-gradient-to-br from-zrp-red/10 via-transparent to-transparent p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-zrp-red/10 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-zrp-red" />
              </div>

              <div>
                <h3 className="font-orbitron font-bold text-lg text-zrp-charcoal dark:text-white">
                  What is the ZRP Trust Passport?
                </h3>

                <p className="mt-2 text-sm leading-6 text-zrp-charcoal/70 dark:text-white/65">
                  The ZRP Trust Passport is a transparency feature designed to
                  help the ZRP community understand positive trust signals
                  associated with an account.
                </p>
              </div>
            </div>
          </div>

          {/* Explanation */}
          <p className="help-text">
            Each account can receive a Trust Score from{" "}
            <strong>0 to 100</strong>. The score is calculated from positive
            account and community signals already available on ZRP. It is
            designed to provide transparency without exposing private or
            sensitive account information.
          </p>

          {/* Trust signals */}
          <div>
            <h3 className="font-orbitron font-bold text-base text-zrp-charcoal dark:text-white mb-4">
              What can contribute to the Trust Passport?
            </h3>

            <div className="grid md:grid-cols-2 gap-4">
              <InfoCard
                icon={ShieldCheck}
                title="Email verification"
                text="A verified email address can contribute to an account's positive trust signals."
              />

              <InfoCard
                icon={User}
                title="Profile completeness"
                text="Profile information such as a photo, name, bio, location, and website can contribute to the score."
              />

              <InfoCard
                icon={Calendar}
                title="Account history"
                text="Established account history can contribute additional trust signals over time."
              />

              <InfoCard
                icon={Users}
                title="Community activity"
                text="Positive participation such as posts, comments, likes, reposts, and community connections can contribute to the score."
              />

              <InfoCard
                icon={BadgeCheck}
                title="ZRP verification"
                text="An account with an active ZRP verification badge can receive an additional verification signal."
              />

              <InfoCard
                icon={Eye}
                title="Transparency"
                text="The Trust Passport shows public-facing signals without exposing private security or personal information."
              />
            </div>
          </div>

          {/* Trust levels */}
          <div>
            <h3 className="font-orbitron font-bold text-base text-zrp-charcoal dark:text-white mb-4">
              Trust levels
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                {
                  score: "0–34",
                  label: "Building Trust",
                },
                {
                  score: "35–54",
                  label: "Moderate Trust",
                },
                {
                  score: "55–74",
                  label: "Good Trust",
                },
                {
                  score: "75–89",
                  label: "High Trust",
                },
                {
                  score: "90–100",
                  label: "Excellent Trust",
                },
              ].map((level) => (
                <div
                  key={level.score}
                  className="rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/5 dark:bg-zrp-charcoal/30 p-4"
                >
                  <div className="text-lg font-orbitron font-bold text-zrp-red">
                    {level.score}
                  </div>

                  <div className="mt-1 text-xs font-semibold text-zrp-charcoal dark:text-white">
                    {level.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* What it does not mean */}
          <div className="rounded-2xl bg-zrp-charcoal dark:bg-black border border-white/10 p-6 text-white">
            <div className="flex items-start gap-4">
              <Lock className="w-6 h-6 text-zrp-red flex-shrink-0" />

              <div>
                <h3 className="font-orbitron font-bold">
                  What the Trust Passport does not mean
                </h3>

                <ul className="mt-3 space-y-2 text-sm leading-6 text-white/65">
                  <li>
                    • It is not government or identity verification.
                  </li>

                  <li>
                    • It is not a popularity ranking.
                  </li>

                  <li>
                    • It is not a financial or credit score.
                  </li>

                  <li>
                    • It is not a moderation punishment score.
                  </li>

                  <li>
                    • It does not guarantee that a person is trustworthy.
                  </li>

                  <li>
                    • It does not guarantee someone's intentions or future
                    behavior.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Privacy */}
          <div className="rounded-xl border border-zrp-red/20 bg-zrp-red/5 p-5">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-zrp-red flex-shrink-0 mt-0.5" />

              <div>
                <h3 className="font-semibold text-sm text-zrp-charcoal dark:text-white">
                  Privacy by design
                </h3>

                <p className="mt-1 text-sm leading-6 text-zrp-charcoal/70 dark:text-white/65">
                  The Trust Passport does not publicly expose sensitive
                  information such as email addresses, IP addresses, private
                  messages, private moderation reports, or internal security
                  information.
                </p>
              </div>
            </div>
          </div>

          {/* Dynamic score */}
          <div className="rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-zrp-red flex-shrink-0 mt-0.5" />

              <div>
                <h3 className="font-orbitron font-bold text-sm text-zrp-charcoal dark:text-white">
                  Your score can change
                </h3>

                <p className="mt-1 text-sm leading-6 text-zrp-charcoal/65 dark:text-white/60">
                  Trust Passport information is generated from current account
                  information and activity. As your account develops, the
                  available trust signals and score may change automatically.
                </p>
              </div>
            </div>
          </div>

          {/* How to find it */}
          <div className="rounded-2xl border border-zrp-red/20 bg-zrp-red/5 p-5">
            <div className="flex items-start gap-3">
              <Eye className="w-5 h-5 text-zrp-red flex-shrink-0 mt-0.5" />

              <div>
                <h3 className="font-orbitron font-bold text-sm text-zrp-charcoal dark:text-white">
                  Where can I find it?
                </h3>

                <p className="mt-1 text-sm leading-6 text-zrp-charcoal/70 dark:text-white/65">
                  Open a user's ZRP profile and select{" "}
                  <strong>ZRP Trust Passport</strong> to view the account's
                  available trust signals and Trust Score.
                </p>

                <p className="mt-2 text-xs text-zrp-charcoal/50 dark:text-white/45">
                  The Trust Passport is available directly from supported ZRP
                  profile pages.
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: "faq",
      number: "13",
      title: "Frequently Asked Questions",
      subtitle: "Quick answers to common questions",
      icon: HelpCircle,
      content: (
        <div className="space-y-4">
          <FaqItem
            question="What is the ZRP Trust Passport?"
            answer="The ZRP Trust Passport is a transparency feature that displays positive account and community trust signals. It provides a Trust Score from 0 to 100 based on information and activity available on ZRP."
          />

          <FaqItem
            question="How is the Trust Score calculated?"
            answer="The score can consider signals such as email verification, profile completeness, account history, community activity, community connections, and ZRP verification."
          />

          <FaqItem
            question="Does a high Trust Score mean that someone is trustworthy?"
            answer="No. The Trust Passport does not guarantee someone's identity, intentions, character, or future behavior. It is a transparency tool based on available ZRP account signals."
          />

          <FaqItem
            question="Can my Trust Score change?"
            answer="Yes. The Trust Passport is based on current account information and activity. As your account develops or information changes, your available trust signals and score may change."
          />

          <FaqItem
            question="Does the Trust Passport expose private information?"
            answer="No. The public Trust Passport is designed not to expose sensitive information such as email addresses, IP addresses, private messages, private moderation reports, or internal security information."
          />

          <FaqItem
            question="Where can I see a user's Trust Passport?"
            answer="Open a user's ZRP profile and select ZRP Trust Passport to view the available trust signals and Trust Score."
          />

          <FaqItem
            question="Can I switch plans?"
            answer="Plan changes depend on the subscription options currently available in your account. Check Settings for the current options."
          />

          <FaqItem
            question="What happens if I downgrade?"
            answer="Features and limits associated with your previous plan may no longer be available. Existing content is handled according to the applicable ZRP policies."
          />

          <FaqItem
            question="Does ZRP require cryptocurrency?"
            answer="No. ZRP is designed to be usable as a social platform without requiring users to understand or use blockchain technology."
          />

          <FaqItem
            question="Is ZRP a Web3 platform?"
            answer="ZRP can incorporate blockchain and digital-payment technologies where appropriate, while keeping the core social experience accessible to ordinary users."
          />

          <FaqItem
            question="Does ZRP sell user data?"
            answer="ZRP's stated policy is not to sell or rent personal data. See the Privacy Policy for the complete description of data processing."
          />

          <FaqItem
            question="Where is ZRP based?"
            answer="ZRP is positioned as a Swiss platform, with a focus on Swiss and European values including privacy, security, and freedom of expression."
          />

          <FaqItem
            question="How does the charity commitment work?"
            answer="ZRP is committed to allocating 35% of platform profits to charitable causes. This is a platform-level profit commitment rather than a deduction from an individual user's subscription."
          />
        </div>
      ),
    },
  ];

  const filteredSections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return sections;

    return sections.filter((section) => {
      const searchable = [
        section.title,
        section.subtitle,
        section.id,
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter text-zrp-charcoal dark:text-white">
      {/* ═══════════════════════════════════════════════════════════════════
          HERO
      ═══════════════════════════════════════════════════════════════════ */}

      <section className="relative overflow-hidden bg-gradient-to-br from-zrp-darkRed via-zrp-deepBlack to-black py-16 sm:py-24 px-4">
        {/* Web3-style background grid */}

        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
          }}
        />

        <div className="absolute -top-32 -right-32 w-96 h-96 bg-zrp-red/20 rounded-full blur-3xl" />

        <div className="absolute -bottom-40 -left-32 w-[28rem] h-[28rem] bg-zrp-red/10 rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/65 hover:text-white text-sm transition mb-10"
          >
            ← Back to ZRP
          </Link>

          <div className="grid lg:grid-cols-[1.4fr_0.6fr] gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm px-4 py-2 text-xs font-semibold text-white/85 mb-6">
                <span className="w-2 h-2 rounded-full bg-zrp-red animate-pulse" />

                ZRP SOCIAL · HELP CENTER
              </div>

              <h1 className="font-orbitron text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.05]">
                Your gateway to
                <span className="block text-zrp-red mt-2">
                  ZRP Social.
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-base sm:text-lg text-white/65 leading-8">
                Learn how ZRP works, manage your account, understand our
                plans, protect your privacy, and get the most from the
                platform.
              </p>

              {/* Search */}

              <div className="mt-8 max-w-2xl relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />

                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(event.target.value)
                  }
                  placeholder="Search help topics..."
                  className="w-full rounded-2xl border border-white/10 bg-white/10 backdrop-blur-xl pl-14 pr-5 py-4 text-white placeholder:text-white/40 outline-none focus:border-zrp-red/70 focus:ring-2 focus:ring-zrp-red/20 transition"
                />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  "Plans",
                  "Privacy",
                  "Support",
                  "Moderation",
                  "Creators",
                  "Trust Passport",
                ].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSearchQuery(tag)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white transition"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Hero visual */}

            <div className="hidden lg:block">
              <div className="relative">
                <div className="absolute inset-0 bg-zrp-red/20 blur-3xl rounded-full" />

                <div className="relative rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl p-7 shadow-2xl">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-zrp-red flex items-center justify-center shadow-lg shadow-red-900/30">
                        <Sparkles className="w-5 h-5 text-white" />
                      </div>

                      <div>
                        <div className="text-white font-orbitron font-bold">
                          ZRP
                        </div>

                        <div className="text-white/40 text-xs">
                          Social ecosystem
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-zrp-red font-mono">
                      ONLINE
                    </div>
                  </div>

                  <div className="space-y-3">
                    <GlassStat
                      icon={Shield}
                      label="Privacy"
                      value="Protected"
                    />

                    <GlassStat
                      icon={Globe}
                      label="Network"
                      value="Global"
                    />

                    <GlassStat
                      icon={Zap}
                      label="Experience"
                      value="Real-time"
                    />

                    <GlassStat
                      icon={Heart}
                      label="Impact"
                      value="35%"
                    />

                    <GlassStat
                      icon={ShieldCheck}
                      label="Trust"
                      value="Transparent"
                    />
                  </div>

                  <div className="mt-6 pt-5 border-t border-white/10 text-xs text-white/35 font-mono">
                    SWISS · EUROPE · PRIVACY · FREEDOM
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          QUICK NAV
      ═══════════════════════════════════════════════════════════════════ */}

      <section className="border-b border-zrp-silver/20 dark:border-zrp-charcoal bg-white dark:bg-zrp-deepBlack">
        <div className="max-w-6xl mx-auto px-4 py-5">
          <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide">
            <span className="flex-shrink-0 text-xs font-orbitron uppercase tracking-wider text-zrp-charcoal/40 dark:text-white/40">
              Explore
            </span>

            {sections.slice(0, 12).map((section) => (
              <a
                key={section.id}
                href={`#help-${section.id}`}
                className="flex-shrink-0 rounded-full border border-zrp-silver/30 dark:border-zrp-charcoal px-4 py-2 text-xs font-medium text-zrp-charcoal/65 dark:text-white/60 hover:border-zrp-red hover:text-zrp-red transition"
              >
                {section.title}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN
      ═══════════════════════════════════════════════════════════════════ */}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Ecosystem cards */}

        <div className="grid md:grid-cols-3 gap-4 mb-12">
          <QuickCard
            icon={BookOpen}
            title="Learn"
            description="Understand ZRP features, plans, privacy, account controls, and Trust Passport."
          />

          <QuickCard
            icon={Shield}
            title="Stay protected"
            description="Learn about security, Trust Passport, reporting, moderation, and privacy."
          />

          <QuickCard
            icon={LifeBuoy}
            title="Get support"
            description="Open a support ticket when you need help from the ZRP team."
          />
        </div>

        {searchQuery && (
          <div className="mb-6 text-sm text-zrp-charcoal/50 dark:text-white/50">
            Showing{" "}
            <strong className="text-zrp-charcoal dark:text-white">
              {filteredSections.length}
            </strong>{" "}
            help topic{filteredSections.length === 1 ? "" : "s"} for "
            {searchQuery}"
          </div>
        )}

        {/* Sections */}

        <div className="space-y-4">
          {filteredSections.map((section) => {
            const isOpen = openSection === section.id;
            const Icon = section.icon;

            return (
              <div
                key={section.id}
                id={`help-${section.id}`}
                className={`group overflow-hidden rounded-2xl border transition-all duration-300 ${
                  isOpen
                    ? "border-zrp-red/30 shadow-lg shadow-red-950/5"
                    : "border-zrp-silver/30 dark:border-zrp-charcoal"
                } bg-white dark:bg-zrp-deepBlack`}
              >
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-4 p-5 sm:p-6 text-left hover:bg-zrp-silver/5 dark:hover:bg-white/[0.02] transition"
                  aria-expanded={isOpen}
                >
                  <div
                    className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition ${
                      isOpen
                        ? "bg-zrp-red text-white shadow-lg shadow-red-900/20"
                        : "bg-zrp-red/10 text-zrp-red"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-zrp-red/60">
                        {section.number}
                      </span>

                      <h2 className="font-orbitron font-bold text-base sm:text-lg text-zrp-charcoal dark:text-white">
                        {section.title}
                      </h2>
                    </div>

                    <p className="mt-1 text-xs sm:text-sm text-zrp-charcoal/50 dark:text-white/45">
                      {section.subtitle}
                    </p>
                  </div>

                  <div className="flex-shrink-0">
                    {isOpen ? (
                      <ChevronUp className="w-5 h-5 text-zrp-red" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-zrp-charcoal/30 dark:text-white/30 group-hover:text-zrp-red transition" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 sm:px-6 pb-6">
                    <div className="border-t border-zrp-silver/20 dark:border-zrp-charcoal pt-6">
                      {section.content}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredSections.length === 0 && (
            <div className="rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal p-12 text-center">
              <Search className="w-10 h-10 mx-auto text-zrp-red/50" />

              <h3 className="mt-4 font-orbitron font-bold text-lg">
                No matching help topics
              </h3>

              <p className="mt-2 text-sm text-zrp-charcoal/50 dark:text-white/50">
                Try another search term or contact ZRP support.
              </p>

              <button
                onClick={() => setSearchQuery("")}
                className="mt-5 text-sm font-semibold text-zrp-red hover:underline"
              >
                Clear search
              </button>
            </div>
          )}
        </div>

        {/* ═════════════════════════════════════════════════════════════════
            SUPPORT CTA
        ═════════════════════════════════════════════════════════════════ */}

        <section className="relative overflow-hidden mt-14 rounded-3xl bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack p-8 sm:p-12 text-white">
          <div className="absolute inset-0 opacity-[0.06]">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
          </div>

          <div className="absolute -right-24 -bottom-24 w-80 h-80 bg-zrp-red/20 rounded-full blur-3xl" />

          <div className="relative grid md:grid-cols-[1fr_auto] gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-xs text-white/50 font-mono mb-4">
                <span className="w-2 h-2 rounded-full bg-zrp-red" />
                ZRP SUPPORT
              </div>

              <h2 className="text-2xl sm:text-3xl font-orbitron font-bold">
                Still need help?
              </h2>

              <p className="mt-3 max-w-xl text-white/60 leading-7">
                Our support team can help with account issues, payments,
                moderation questions, privacy requests, Trust Passport
                questions, and other platform problems.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/support"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zrp-darkRed hover:bg-gray-100 transition"
              >
                <Ticket className="w-4 h-4" />
                Open Ticket
              </Link>

              <a
                href="mailto:support@zrp.one"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition"
              >
                <Mail className="w-4 h-4" />
                Email Support
              </a>
            </div>
          </div>
        </section>

        {/* Footer links */}

        <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs text-zrp-charcoal/45 dark:text-white/40">
          <Link
            href="/privacy"
            className="hover:text-zrp-red transition"
          >
            Privacy Policy
          </Link>

          <Link
            href="/terms"
            className="hover:text-zrp-red transition"
          >
            Terms of Service
          </Link>

          <Link
            href="/guidelines"
            className="hover:text-zrp-red transition"
          >
            Community Guidelines
          </Link>

          <Link
            href="/contact"
            className="hover:text-zrp-red transition"
          >
            Contact
          </Link>

          <Link
            href="/"
            className="hover:text-zrp-red transition"
          >
            ZRP Social
          </Link>
        </div>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENTS
═══════════════════════════════════════════════════════════════════════════ */

function PlanCard({
  icon: Icon,
  iconClass,
  accent,
  title,
  price,
  period,
  description,
  features,
  featured = false,
}: {
  icon: React.ElementType;
  iconClass: string;
  accent: string;
  title: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  featured?: boolean;
}) {
  return (
    <div
      className={`relative rounded-2xl border ${accent} ${
        featured
          ? "bg-gradient-to-b from-zrp-red/10 to-transparent"
          : "bg-zrp-silver/10 dark:bg-zrp-charcoal/50"
      } p-5`}
    >
      {featured && (
        <div className="absolute -top-3 right-4 rounded-full bg-zrp-red px-3 py-1 text-[10px] font-bold text-white uppercase tracking-wider">
          Popular
        </div>
      )}

      <Icon className={`w-6 h-6 ${iconClass}`} />

      <h3 className="mt-4 font-orbitron font-bold text-lg text-zrp-charcoal dark:text-white">
        {title}
      </h3>

      <div className="mt-2">
        <span className="font-orbitron font-bold text-2xl text-zrp-charcoal dark:text-white">
          {price}
        </span>

        <span className="text-xs text-zrp-charcoal/50 dark:text-white/40">
          {period}
        </span>
      </div>

      <p className="mt-1 text-xs text-zrp-charcoal/50 dark:text-white/40">
        {description}
      </p>

      <ul className="mt-5 space-y-2">
        {features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2 text-xs text-zrp-charcoal/70 dark:text-white/65"
          >
            <CheckCircle className="w-3.5 h-3.5 text-zrp-red flex-shrink-0 mt-0.5" />

            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/5 dark:bg-zrp-charcoal/30 p-5 hover:border-zrp-red/30 transition">
      <div className="w-10 h-10 rounded-xl bg-zrp-red/10 flex items-center justify-center text-zrp-red group-hover:bg-zrp-red group-hover:text-white transition">
        <Icon className="w-5 h-5" />
      </div>

      <h3 className="mt-4 font-orbitron font-bold text-sm text-zrp-charcoal dark:text-white">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-zrp-charcoal/65 dark:text-white/60">
        {description}
      </p>
    </div>
  );
}

function StepCard({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/5 dark:bg-zrp-charcoal/30 p-4">
      <div className="font-mono text-xs text-zrp-red">
        {number}
      </div>

      <h3 className="mt-3 font-orbitron font-bold text-sm">
        {title}
      </h3>

      <p className="mt-1 text-xs leading-5 text-zrp-charcoal/55 dark:text-white/50">
        {text}
      </p>
    </div>
  );
}

function PlanValue({
  value,
  highlighted = false,
}: {
  value: boolean | string;
  highlighted?: boolean;
}) {
  const isDash = value === "—" || value === "❌";

  return (
    <td
      className={`px-4 py-3 text-center ${
        highlighted
          ? "text-zrp-red font-semibold"
          : isDash
            ? "text-zrp-charcoal/25 dark:text-white/20"
            : "text-zrp-charcoal/60 dark:text-white/60"
      }`}
    >
      {value === "✓" || value === "✅" ? (
        <CheckCircle className="w-4 h-4 mx-auto text-green-500" />
      ) : (
        value
      )}
    </td>
  );
}

function ActionGuide({
  icon: Icon,
  title,
  steps,
}: {
  icon: React.ElementType;
  title: string;
  steps: string[];
}) {
  return (
    <div className="rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal p-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-zrp-red/10 flex items-center justify-center text-zrp-red">
          <Icon className="w-5 h-5" />
        </div>

        <h3 className="font-orbitron font-bold">
          {title}
        </h3>
      </div>

      <ol className="mt-5 space-y-3">
        {steps.map((step, index) => (
          <li
            key={step}
            className="flex items-start gap-3 text-sm text-zrp-charcoal/65 dark:text-white/60"
          >
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-zrp-silver/20 dark:bg-zrp-charcoal flex items-center justify-center text-[10px] font-mono text-zrp-red">
              {index + 1}
            </span>

            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zrp-silver/25 dark:border-zrp-charcoal bg-zrp-silver/5 dark:bg-zrp-charcoal/30 px-4 py-3">
      <CheckCircle className="w-4 h-4 text-zrp-red flex-shrink-0" />

      <span className="text-sm text-zrp-charcoal/70 dark:text-white/65">
        {text}
      </span>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-zrp-silver/25 dark:border-zrp-charcoal bg-zrp-silver/5 dark:bg-zrp-charcoal/30 p-5">
      <Icon className="w-5 h-5 text-zrp-red" />

      <h3 className="mt-3 font-orbitron font-bold text-sm">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-zrp-charcoal/60 dark:text-white/55">
        {text}
      </p>
    </div>
  );
}

function FaqItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  return (
    <div className="rounded-xl border border-zrp-silver/25 dark:border-zrp-charcoal bg-zrp-silver/5 dark:bg-zrp-charcoal/30 p-5">
      <h3 className="font-semibold text-sm text-zrp-charcoal dark:text-white">
        {question}
      </h3>

      <p className="mt-2 text-sm leading-6 text-zrp-charcoal/60 dark:text-white/55">
        {answer}
      </p>
    </div>
  );
}

function QuickCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/5 dark:bg-zrp-charcoal/30 p-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-zrp-red/10 flex items-center justify-center text-zrp-red">
          <Icon className="w-5 h-5" />
        </div>

        <h3 className="font-orbitron font-bold text-sm">
          {title}
        </h3>
      </div>

      <p className="mt-3 text-sm leading-6 text-zrp-charcoal/60 dark:text-white/55">
        {description}
      </p>
    </div>
  );
}

function GlassStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4 text-zrp-red" />

        <span className="text-sm text-white/55">
          {label}
        </span>
      </div>

      <span className="text-xs font-mono text-white/80">
        {value}
      </span>
    </div>
  );
}
