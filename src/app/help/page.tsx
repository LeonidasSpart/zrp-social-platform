"use client";

import Link from "next/link";
import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
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
  Calendar,
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

export default function HelpPage() {
  const { t } = useLanguage();

  const [openSection, setOpenSection] = useState<string | null>(
    "account-types"
  );

  const [searchQuery, setSearchQuery] = useState("");

  const toggleSection = (id: string) => {
    setOpenSection(openSection === id ? null : id);
  };

  const planFeatures: PlanFeature[] = [
    {
      name: t("help.planFeature.name.postLength"),
      free: t("help.planFeature.postLength.free"),
      pro: t("help.planFeature.postLength.pro"),
      business: t("help.planFeature.postLength.business"),
      enterprise: t("help.plan.unlimited"),
    },
    {
      name: t("help.planFeature.name.imagesPerPost"),
      free: "1",
      pro: "4",
      business: "10",
      enterprise: t("help.plan.unlimited"),
    },
    {
      name: t("help.planFeature.name.videoUpload"),
      free: "32 MB",
      pro: "100 MB",
      business: "500 MB",
      enterprise: "2 GB",
    },
    {
      name: t("help.planFeature.name.polls"),
      free: "✓",
      pro: "✓",
      business: "✓",
      enterprise: "✓",
    },
    {
      name: t("help.planFeature.name.scheduledPosts"),
      free: t("help.planFeature.scheduledPosts.free"),
      pro: t("help.planFeature.scheduledPosts.pro"),
      business: t("help.planFeature.scheduledPosts.business"),
      enterprise: t("help.plan.unlimited"),
    },
    {
      name: t("help.planFeature.name.analytics"),
      free: t("help.planFeature.analytics.free"),
      pro: t("help.planFeature.analytics.pro"),
      business: t("help.planFeature.analytics.business"),
      enterprise: t("help.planFeature.analytics.enterprise"),
    },
    {
      name: t("help.planFeature.name.verifiedBadge"),
      free: "—",
      pro: "✓",
      business: "✓",
      enterprise: "✓",
    },
    {
      name: t("help.planFeature.name.customProfileUrl"),
      free: "—",
      pro: "✓",
      business: "✓",
      enterprise: "✓",
    },
    {
      name: t("help.planFeature.name.recruitmentProfiles"),
      free: "—",
      pro: "—",
      business: "✓",
      enterprise: "✓",
    },
    {
      name: t("help.planFeature.name.articlePublishing"),
      free: "—",
      pro: "—",
      business: "✓",
      enterprise: "✓",
    },
    {
      name: t("help.planFeature.name.teamManagement"),
      free: "—",
      pro: "—",
      business: "✓",
      enterprise: "✓",
    },
    {
      name: t("help.planFeature.name.apiAccess"),
      free: "—",
      pro: "—",
      business: "✓",
      enterprise: "✓",
    },
    {
      name: t("help.planFeature.name.prioritySupport"),
      free: "—",
      pro: "✓",
      business: "✓",
      enterprise: "24/7",
    },
    {
      name: t("help.planFeature.name.charityContribution"),
      free: "35%",
      pro: "35%",
      business: "35%",
      enterprise: "35%",
    },
  ];

  const sections: HelpSection[] = [
    {
      id: "account-types",
      number: "01",
      title: t("help.section.accountTypes.title"),
      subtitle: t("help.section.accountTypes.subtitle"),
      icon: Users,
      content: (
        <div className="space-y-6">
          <p className="help-text">
            {t("help.accountTypes.intro")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <PlanCard
              icon={User}
              iconClass="text-zrp-charcoal dark:text-white"
              accent="border-white/10"
              title={t("help.plan.free")}
              price="$0"
              period={t("help.plan.perMonth")}
              description={t("help.plan.free.desc")}
              features={[
                t("help.plan.free.feature1"),
                t("help.plan.free.feature2"),
                t("help.plan.free.feature3"),
              ]}
            />

            <PlanCard
              icon={Star}
              iconClass="text-zrp-red"
              accent="border-zrp-red/50"
              featured
              title={t("help.plan.pro")}
              price="$9.99"
              period={t("help.plan.perMonth")}
              description={t("help.plan.pro.desc")}
              features={[
                t("help.plan.pro.feature1"),
                t("help.plan.pro.feature2"),
                t("help.plan.pro.feature3"),
              ]}
            />

            <PlanCard
              icon={Building2}
              iconClass="text-zrp-charcoal dark:text-white"
              accent="border-zrp-red/20"
              title={t("help.plan.business")}
              price="$49.99"
              period={t("help.plan.perMonth")}
              description={t("help.plan.business.desc")}
              features={[
                t("help.plan.business.feature1"),
                t("help.plan.business.feature2"),
                t("help.plan.business.feature3"),
              ]}
            />

            <PlanCard
              icon={Crown}
              iconClass="text-zrp-red"
              accent="border-zrp-red/20"
              title={t("help.plan.enterprise")}
              price={t("help.plan.enterprisePrice")}
              period=""
              description={t("help.plan.enterprise.desc")}
              features={[
                t("help.plan.enterprise.feature1"),
                t("help.plan.enterprise.feature2"),
                t("help.plan.enterprise.feature3"),
              ]}
            />
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-zrp-red to-zrp-darkRed p-6 text-white">
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />

            <div className="relative flex items-start gap-4">
              <Heart className="w-7 h-7 flex-shrink-0" />

              <div>
                <h3 className="font-orbitron font-bold text-lg">
                  {t("help.accountTypes.impactTitle")}
                </h3>

                <p className="mt-1 text-sm text-white/85 leading-6">
                  {t("help.accountTypes.impactDesc")}
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
      title: t("help.section.businessFeatures.title"),
      subtitle: t("help.section.businessFeatures.subtitle"),
      icon: Briefcase,
      content: (
        <div className="space-y-6">
          <p className="help-text">
            {t("help.businessFeatures.intro")}
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <FeatureCard
              icon={PenTool}
              title={t("help.businessFeatures.f1Title")}
              description={t("help.businessFeatures.f1Desc")}
            />

            <FeatureCard
              icon={Briefcase}
              title={t("help.businessFeatures.f2Title")}
              description={t("help.businessFeatures.f2Desc")}
            />

            <FeatureCard
              icon={Users}
              title={t("help.businessFeatures.f3Title")}
              description={t("help.businessFeatures.f3Desc")}
            />

            <FeatureCard
              icon={FileText}
              title={t("help.businessFeatures.f4Title")}
              description={t("help.businessFeatures.f4Desc")}
            />

            <FeatureCard
              icon={Megaphone}
              title={t("help.businessFeatures.f5Title")}
              description={t("help.businessFeatures.f5Desc")}
            />

            <FeatureCard
              icon={Shield}
              title={t("help.businessFeatures.f6Title")}
              description={t("help.businessFeatures.f6Desc")}
            />
          </div>
        </div>
      ),
    },

    {
      id: "account-limits",
      number: "03",
      title: t("help.section.accountLimits.title"),
      subtitle: t("help.section.accountLimits.subtitle"),
      icon: Lock,
      content: (
        <div className="space-y-5">
          <p className="help-text">
            {t("help.accountLimits.intro")}
          </p>

          <div className="overflow-x-auto rounded-2xl border border-white/10 dark:border-zrp-charcoal">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-zrp-charcoal text-white">
                  <th className="px-4 py-4 text-left font-orbitron">
                    {t("help.accountLimits.tableFeature")}
                  </th>

                  <th className="px-4 py-4 text-center font-orbitron">
                    {t("help.plan.free")}
                  </th>

                  <th className="px-4 py-4 text-center font-orbitron text-zrp-red">
                    {t("help.plan.pro")}
                  </th>

                  <th className="px-4 py-4 text-center font-orbitron">
                    {t("help.plan.business")}
                  </th>

                  <th className="px-4 py-4 text-center font-orbitron">
                    {t("help.plan.enterprise")}
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

                    <PlanValue value={feature.pro} highlighted />

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
                {t("help.accountLimits.note")}
              </p>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: "upgrade",
      number: "04",
      title: t("help.section.upgrade.title"),
      subtitle: t("help.section.upgrade.subtitle"),
      icon: CreditCard,
      content: (
        <div className="space-y-5">
          <p className="help-text">
            {t("help.upgrade.intro")}
          </p>

          <div className="grid md:grid-cols-4 gap-3">
            <StepCard
              number="01"
              title={t("help.upgrade.step1Title")}
              text={t("help.upgrade.step1Text")}
            />

            <StepCard
              number="02"
              title={t("help.upgrade.step2Title")}
              text={t("help.upgrade.step2Text")}
            />

            <StepCard
              number="03"
              title={t("help.upgrade.step3Title")}
              text={t("help.upgrade.step3Text")}
            />

            <StepCard
              number="04"
              title={t("help.upgrade.step4Title")}
              text={t("help.upgrade.step4Text")}
            />
          </div>

          <div className="rounded-2xl bg-zrp-charcoal text-white p-6">
            <div className="flex items-start gap-4">
              <CreditCard className="w-6 h-6 text-zrp-red flex-shrink-0" />

              <div>
                <h3 className="font-orbitron font-bold">
                  {t("help.upgrade.billingTitle")}
                </h3>

                <p className="mt-2 text-sm text-white/65 leading-6">
                  {t("help.upgrade.billingDesc")}
                </p>

                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 mt-4 text-sm text-zrp-red hover:text-white transition"
                >
                  {t("help.upgrade.contactSupport")}
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
      title: t("help.section.creatorEconomy.title"),
      subtitle: t("help.section.creatorEconomy.subtitle"),
      icon: Sparkles,
      content: (
        <div className="space-y-6">
          <p className="help-text">
            {t("help.creatorEconomy.intro")}
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <FeatureCard
              icon={BarChart3}
              title={t("help.creatorEconomy.f1Title")}
              description={t("help.creatorEconomy.f1Desc")}
            />

            <FeatureCard
              icon={BadgeCheck}
              title={t("help.creatorEconomy.f2Title")}
              description={t("help.creatorEconomy.f2Desc")}
            />

            <FeatureCard
              icon={CircleDollarSign}
              title={t("help.creatorEconomy.f3Title")}
              description={t("help.creatorEconomy.f3Desc")}
            />

            <FeatureCard
              icon={Wallet}
              title={t("help.creatorEconomy.f4Title")}
              description={t("help.creatorEconomy.f4Desc")}
            />
          </div>

          <div className="rounded-2xl border border-zrp-red/20 bg-gradient-to-br from-zrp-red/5 to-transparent p-6">
            <div className="flex items-start gap-4">
              <Sparkles className="w-6 h-6 text-zrp-red flex-shrink-0" />

              <div>
                <h3 className="font-orbitron font-bold text-zrp-charcoal dark:text-white">
                  {t("help.creatorEconomy.web3Title")}
                </h3>

                <p className="mt-2 text-sm leading-6 text-zrp-charcoal/70 dark:text-white/65">
                  {t("help.creatorEconomy.web3Desc")}
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
      title: t("help.section.corporateAccounts.title"),
      subtitle: t("help.section.corporateAccounts.subtitle"),
      icon: Building2,
      content: (
        <div className="space-y-5">
          <p className="help-text">
            {t("help.corporateAccounts.intro")}
          </p>

          <div className="grid md:grid-cols-2 gap-3">
            <ChecklistItem text={t("help.corporateAccounts.c1")} />
            <ChecklistItem text={t("help.corporateAccounts.c2")} />
            <ChecklistItem text={t("help.corporateAccounts.c3")} />
            <ChecklistItem text={t("help.corporateAccounts.c4")} />
            <ChecklistItem text={t("help.corporateAccounts.c5")} />
            <ChecklistItem text={t("help.corporateAccounts.c6")} />
            <ChecklistItem text={t("help.corporateAccounts.c7")} />
            <ChecklistItem text={t("help.corporateAccounts.c8")} />
          </div>

          <div className="rounded-xl bg-zrp-red/5 border border-zrp-red/20 p-5">
            <p className="text-sm text-zrp-charcoal/75 dark:text-white/70">
              {t("help.corporateAccounts.enterpriseQuestion")}
            </p>

            <Link
              href="/contact"
              className="inline-flex items-center gap-2 mt-2 text-zrp-red font-semibold text-sm hover:underline"
            >
              {t("help.corporateAccounts.talkToZrp")}
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

          <p className="help-text">
            Each account can receive a Trust Score from{" "}
            <strong>0 to 100</strong>. The score is calculated from positive
            account and community signals already available on ZRP. It is
            designed to provide transparency without exposing private or
            sensitive account information.
          </p>

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

          <div className="rounded-2xl bg-zrp-charcoal dark:bg-black border border-white/10 p-6 text-white">
            <div className="flex items-start gap-4">
              <Lock className="w-6 h-6 text-zrp-red flex-shrink-0" />

              <div>
                <h3 className="font-orbitron font-bold">
                  What the Trust Passport does not mean
                </h3>

                <ul className="mt-3 space-y-2 text-sm leading-6 text-white/65">
                  <li>• It is not government or identity verification.</li>
                  <li>• It is not a popularity ranking.</li>
                  <li>• It is not a financial or credit score.</li>
                  <li>• It is not a moderation punishment score.</li>
                  <li>• It does not guarantee that a person is trustworthy.</li>
                  <li>
                    • It does not guarantee someone's intentions or future
                    behavior.
                  </li>
                </ul>
              </div>
            </div>
          </div>

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

  const query = searchQuery.trim().toLowerCase();

  const filteredSections = query
    ? sections.filter((section) => {
        const searchable = [
          section.title,
          section.subtitle,
          section.id,
        ]
          .join(" ")
          .toLowerCase();

        return searchable.includes(query);
      })
    : sections;

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter text-zrp-charcoal dark:text-white">
      {/* HERO */}

      <section className="relative overflow-hidden bg-gradient-to-br from-zrp-darkRed via-zrp-deepBlack to-black py-16 sm:py-24 px-4">
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
            ← {t("help.backToZrp")}
          </Link>

          <div className="grid lg:grid-cols-[1.4fr_0.6fr] gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm px-4 py-2 text-xs font-semibold text-white/85 mb-6">
                <span className="w-2 h-2 rounded-full bg-zrp-red animate-pulse" />
                ZRP SOCIAL · HELP CENTER
              </div>

              <h1 className="font-orbitron text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.05]">
                {t("help.hero.titleLine1")}
                <span className="block text-zrp-red mt-2">
                  ZRP Social.
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-base sm:text-lg text-white/65 leading-8">
                {t("help.hero.subtitle")}
              </p>

              <div className="mt-8 max-w-2xl relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />

                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t("help.hero.searchPlaceholder")}
                  className="w-full rounded-2xl border border-white/10 bg-white/10 backdrop-blur-xl pl-14 pr-5 py-4 text-white placeholder:text-white/40 outline-none focus:border-zrp-red/70 focus:ring-2 focus:ring-zrp-red/20 transition"
                />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  t("help.hero.tagPlans"),
                  t("help.hero.tagPrivacy"),
                  t("help.hero.tagSupport"),
                  t("help.hero.tagModeration"),
                  t("help.hero.tagCreators"),
                  t("help.hero.tagTrustPassport"),
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
                          {t("help.hero.cardSubtitle")}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-zrp-red font-mono">
                      {t("help.hero.cardStatus")}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <GlassStat
                      icon={Shield}
                      label={t("help.hero.statPrivacyLabel")}
                      value={t("help.hero.statPrivacyValue")}
                    />

                    <GlassStat
                      icon={Globe}
                      label={t("help.hero.statNetworkLabel")}
                      value={t("help.hero.statNetworkValue")}
                    />

                    <GlassStat
                      icon={Zap}
                      label={t("help.hero.statExperienceLabel")}
                      value={t("help.hero.statExperienceValue")}
                    />

                    <GlassStat
                      icon={Heart}
                      label={t("help.hero.statImpactLabel")}
                      value="35%"
                    />

                    <GlassStat
                      icon={ShieldCheck}
                      label={t("help.hero.statTrustLabel")}
                      value={t("help.hero.statTrustValue")}
                    />
                  </div>

                  <div className="mt-6 pt-5 border-t border-white/10 text-xs text-white/35 font-mono">
                    {t("help.hero.footerTag")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* QUICK NAV */}

      <section className="border-b border-zrp-silver/20 dark:border-zrp-charcoal bg-white dark:bg-zrp-deepBlack">
        <div className="max-w-6xl mx-auto px-4 py-5">
          <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide">
            <span className="flex-shrink-0 text-xs font-orbitron uppercase tracking-wider text-zrp-charcoal/40 dark:text-white/40">
              {t("help.nav.explore")}
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

      {/* MAIN */}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid md:grid-cols-3 gap-4 mb-12">
          <QuickCard
            icon={BookOpen}
            title={t("help.quickCard.learnTitle")}
            description={t("help.quickCard.learnDesc")}
          />

          <QuickCard
            icon={Shield}
            title={t("help.quickCard.protectedTitle")}
            description={t("help.quickCard.protectedDesc")}
          />

          <QuickCard
            icon={LifeBuoy}
            title={t("help.quickCard.supportTitle")}
            description={t("help.quickCard.supportDesc")}
          />
        </div>

        {searchQuery && (
          <div className="mb-6 text-sm text-zrp-charcoal/50 dark:text-white/50">
            {t("help.search.showingPrefix")}{" "}
            <strong className="text-zrp-charcoal dark:text-white">
              {filteredSections.length}
            </strong>{" "}
            {filteredSections.length === 1
              ? t("help.search.topicWord")
              : t("help.search.topicsWord")}{" "}
            {t("help.search.forQuery")} "
            {searchQuery}"
          </div>
        )}

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
                {t("help.noResults.title")}
              </h3>

              <p className="mt-2 text-sm text-zrp-charcoal/50 dark:text-white/50">
                {t("help.noResults.desc")}
              </p>

              <button
                onClick={() => setSearchQuery("")}
                className="mt-5 text-sm font-semibold text-zrp-red hover:underline"
              >
                {t("help.noResults.clear")}
              </button>
            </div>
          )}
        </div>

        {/* SUPPORT CTA */}

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

/* COMPONENTS */

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
  const { t } = useLanguage();

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
          {t("help.plan.popular")}
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
      <div className="font-mono text-xs text-zrp-red">{number}</div>

      <h3 className="mt-3 font-orbitron font-bold text-sm">{title}</h3>

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

        <h3 className="font-orbitron font-bold">{title}</h3>
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

      <h3 className="mt-3 font-orbitron font-bold text-sm">{title}</h3>

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

        <h3 className="font-orbitron font-bold text-sm">{title}</h3>
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

        <span className="text-sm text-white/55">{label}</span>
      </div>

      <span className="text-xs font-mono text-white/80">{value}</span>
    </div>
  );
}
