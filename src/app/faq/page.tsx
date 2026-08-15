"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import VerifiedBadge from "@/components/VerifiedBadge";
import {
  ChevronDown,
  ChevronUp,
  UserPlus,
  LogIn,
  KeyRound,
  Image as ImageIcon,
  Video,
  MessageSquare,
  Bell,
  Shield,
  Heart,
  FileText,
  HelpCircle,
  Users,
  Settings,
  Phone,
  Camera,
  Upload,
  Clock,
  Globe,
  Lock,
  CheckCircle,
  Ticket,
  Trash2,
  Crown,
  Search,
  Sparkles,
  Zap,
  Wallet,
  BarChart3,
  Flag,
  Scale,
  Building2,
  Mail,
  ArrowRight,
  ExternalLink,
  CircleHelp,
  BadgeCheck,
  Megaphone,
  User,
  Send,
  Eye,
  HeartHandshake,
} from "lucide-react";

interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: React.ReactNode;
  icon?: React.ElementType;
}

const categories = [
  {
    id: "getting-started",
    label: "Getting Started",
    icon: Sparkles,
  },
  {
    id: "profile-media",
    label: "Profile & Media",
    icon: ImageIcon,
  },
  {
    id: "posts",
    label: "Posts & Social",
    icon: FileText,
  },
  {
    id: "messaging",
    label: "Messaging & Calls",
    icon: MessageSquare,
  },
  {
    id: "privacy",
    label: "Privacy & Safety",
    icon: Shield,
  },
  {
    id: "web3",
    label: "Web3 & Digital",
    icon: Wallet,
  },
  {
    id: "impact",
    label: "Charity & Impact",
    icon: Heart,
  },
  {
    id: "accounts",
    label: "Accounts & Plans",
    icon: Crown,
  },
  {
    id: "support",
    label: "Support",
    icon: Ticket,
  },
];

export default function FAQPage() {
  const [openId, setOpenId] = useState<string | null>("what-is-zrp");
  const [searchQuery, setSearchQuery] = useState("");

  const toggleFaq = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  const faqs: FaqItem[] = [
    /* ═══════════════════════════════════════════════════════════════════════
       GETTING STARTED
    ═══════════════════════════════════════════════════════════════════════ */

    {
      id: "what-is-zrp",
      category: "Getting Started",
      question: "What is ZRP Social?",
      icon: Sparkles,
      answer: (
        <div className="space-y-4">
          <p>
            <strong>ZRP Social</strong> is a Swiss-focused social platform
            built around communication, community, privacy, freedom of
            expression, and modern digital technology.
          </p>

          <p>
            ZRP is designed to give people a place to publish posts, interact
            with communities, communicate directly, share media, build
            professional profiles, and participate in an evolving digital
            ecosystem.
          </p>

          <div className="rounded-xl border border-zrp-red/20 bg-zrp-red/5 p-4">
            <div className="flex items-start gap-3">
              <Heart className="w-5 h-5 text-zrp-red flex-shrink-0" />
              <p className="text-sm">
                ZRP has a stated commitment to allocate{" "}
                <strong>35% of platform profits</strong> toward charitable
                causes.
              </p>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: "how-to-register",
      category: "Getting Started",
      question: "How do I create a ZRP account?",
      icon: UserPlus,
      answer: (
        <div className="space-y-4">
          <p>Creating an account is straightforward:</p>

          <StepList
            steps={[
              <>
                Go to the{" "}
                <Link href="/signup" className="faq-link">
                  Sign Up
                </Link>{" "}
                page.
              </>,
              "Enter the requested account information.",
              "Choose your username and password.",
              "Complete any email verification step requested by ZRP.",
              "Complete your profile and onboarding.",
            ]}
          />

          <InfoBox icon={CheckCircle}>
            Registration is free unless ZRP introduces a specific paid feature
            or service.
          </InfoBox>
        </div>
      ),
    },

    {
      id: "google-login",
      category: "Getting Started",
      question: "Can I sign in with Google?",
      icon: LogIn,
      answer: (
        <div className="space-y-3">
          <p>
            If <strong>Google Sign-In</strong> is enabled on your version of
            ZRP, you can use the Google authentication option on the login
            screen.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            The available authentication methods shown on the live ZRP login
            page are the authoritative list of supported sign-in options.
          </p>
        </div>
      ),
    },

    {
      id: "how-to-login",
      category: "Getting Started",
      question: "How do I log in?",
      icon: LogIn,
      answer: (
        <div className="space-y-4">
          <StepList
            steps={[
              <>
                Open the{" "}
                <Link href="/login" className="faq-link">
                  Login
                </Link>{" "}
                page.
              </>,
              "Enter your account credentials or use an available social login option.",
              "Select Sign In.",
            ]}
          />

          <InfoBox icon={Lock}>
            Never share your password with another person or enter your
            credentials into an unofficial ZRP website.
          </InfoBox>
        </div>
      ),
    },

    {
      id: "password-reset",
      category: "Getting Started",
      question: "I forgot my password. What should I do?",
      icon: KeyRound,
      answer: (
        <div className="space-y-4">
          <StepList
            steps={[
              <>
                Go to{" "}
                <Link href="/login" className="faq-link">
                  Login
                </Link>
                .
              </>,
              "Select Forgot password.",
              "Enter the email address associated with your account.",
              "Check your email for the password-reset instructions.",
              "Create a new password using the secure reset process.",
            ]}
          />

          <InfoBox icon={Shield}>
            If you did not request a password reset, do not use the link and
            consider securing your account.
          </InfoBox>
        </div>
      ),
    },

    /* ═══════════════════════════════════════════════════════════════════════
       PROFILE & MEDIA
    ═══════════════════════════════════════════════════════════════════════ */

    {
      id: "avatar-size",
      category: "Profile & Media",
      question: "What are the avatar requirements?",
      icon: ImageIcon,
      answer: (
        <MediaRequirements
          items={[
            ["Maximum file size", "2 MB"],
            ["Formats", "JPEG, PNG, GIF, WebP"],
            ["Recommended", "400 × 400 px"],
            ["Shape", "Square"],
          ]}
          note="A square, high-quality image normally produces the best profile result."
        />
      ),
    },

    {
      id: "banner-size",
      category: "Profile & Media",
      question: "What are the profile banner requirements?",
      icon: Camera,
      answer: (
        <MediaRequirements
          items={[
            ["Maximum file size", "4 MB"],
            ["Formats", "JPEG, PNG, GIF, WebP"],
            ["Recommended", "1200 × 400 px"],
            ["Aspect ratio", "3:1"],
          ]}
          note="Keep important text and logos away from the extreme edges because profile layouts can vary between devices."
        />
      ),
    },

    {
      id: "post-image-size",
      category: "Profile & Media",
      question: "What are the post image requirements?",
      icon: Upload,
      answer: (
        <MediaRequirements
          items={[
            ["Maximum file size", "4 MB"],
            ["Formats", "JPEG, PNG, GIF, WebP"],
            ["Recommended", "1200 × 800 px"],
            ["Aspect ratio", "3:2"],
          ]}
          note="Actual upload limits may depend on the current ZRP deployment and account plan."
        />
      ),
    },

    {
      id: "post-video-size",
      category: "Profile & Media",
      question: "What are the video requirements?",
      icon: Video,
      answer: (
        <MediaRequirements
          items={[
            ["Maximum file size", "32 MB"],
            ["Formats", "MP4, MOV, AVI, WebM"],
            ["Recommended", "1280 × 720 px or higher"],
            ["Recommended encoding", "H.264"],
          ]}
          note="Shorter videos generally provide a better experience for mobile users and faster uploads."
        />
      ),
    },

    {
      id: "chat-image-size",
      category: "Profile & Media",
      question: "Can I send images in messages?",
      icon: MessageSquare,
      answer: (
        <div className="space-y-4">
          <p>
            If media messaging is enabled for your account, you can send
            supported image formats through direct conversations.
          </p>

          <MediaRequirements
            items={[
              ["Maximum file size", "4 MB"],
              ["Formats", "JPEG, PNG, GIF, WebP"],
              ["Recommended", "800 × 800 px"],
            ]}
          />
        </div>
      ),
    },

    /* ═══════════════════════════════════════════════════════════════════════
       POSTS & SOCIAL
    ═══════════════════════════════════════════════════════════════════════ */

    {
      id: "how-to-post",
      category: "Posts & Social",
      question: "How do I create a post?",
      icon: FileText,
      answer: (
        <div className="space-y-4">
          <p>To publish on ZRP:</p>

          <StepList
            steps={[
              'Open the post composer.',
              "Write your content.",
              "Add hashtags or mentions if relevant.",
              "Optionally add supported media, a poll, or other available features.",
              "Publish immediately or schedule the post if scheduling is available.",
            ]}
          />

          <InfoBox icon={Zap}>
            Character limits and available media options depend on your
            account plan and the current ZRP platform configuration.
          </InfoBox>
        </div>
      ),
    },

    {
      id: "how-to-schedule-post",
      category: "Posts & Social",
      question: "Can I schedule posts?",
      icon: Clock,
      answer: (
        <div className="space-y-4">
          <p>
            If scheduled publishing is available on your account, you can
            prepare a post and choose a future publication time.
          </p>

          <StepList
            steps={[
              "Create your post.",
              "Open the scheduling option.",
              "Choose the desired date and time.",
              "Review the post.",
              "Confirm the schedule.",
            ]}
          />

          <InfoBox icon={Clock}>
            Scheduled-post limits vary by plan.
          </InfoBox>
        </div>
      ),
    },

    {
      id: "how-to-comment",
      category: "Posts & Social",
      question: "How do I comment or reply?",
      icon: MessageSquare,
      answer: (
        <StepList
          steps={[
            "Open the post.",
            "Select the comment/reply option.",
            "Write your response.",
            "Submit your comment.",
          ]}
        />
      ),
    },

    {
      id: "hashtags-mentions",
      category: "Posts & Social",
      question: "How do hashtags and mentions work?",
      icon: Users,
      answer: (
        <div className="space-y-5">
          <div>
            <h4 className="font-semibold mb-2">Hashtags</h4>
            <p className="text-sm">
              Hashtags such as <strong>#ZRP</strong> or{" "}
              <strong>#Web3</strong> help categorise public conversations and
              make related content easier to discover.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Mentions</h4>
            <p className="text-sm">
              Mentions such as <strong>@username</strong> can reference another
              account. Depending on account settings, the mentioned user may
              receive a notification.
            </p>
          </div>
        </div>
      ),
    },

    {
      id: "how-to-pin-post",
      category: "Posts & Social",
      question: "Can I pin a post to my profile?",
      icon: CheckCircle,
      answer: (
        <div className="space-y-4">
          <StepList
            steps={[
              "Open your profile.",
              "Find the post you want to highlight.",
              "Open the post options.",
              "Select the available Pin option.",
            ]}
          />

          <p className="text-sm text-gray-500 dark:text-gray-400">
            A pinned post is displayed prominently on your profile when the
            feature is enabled.
          </p>
        </div>
      ),
    },

    /* ═══════════════════════════════════════════════════════════════════════
       MESSAGING
    ═══════════════════════════════════════════════════════════════════════ */

    {
      id: "how-to-message",
      category: "Messaging & Calls",
      question: "How do I send a direct message?",
      icon: MessageSquare,
      answer: (
        <StepList
          steps={[
            "Open the recipient's profile or your Messages area.",
            "Open the conversation.",
            "Write your message.",
            "Press Send.",
          ]}
        />
      ),
    },

    {
      id: "how-to-call",
      category: "Messaging & Calls",
      question: "Can I make voice or video calls?",
      icon: Phone,
      answer: (
        <div className="space-y-4">
          <p>
            If calling is enabled in the current ZRP application, calls can be
            started from supported conversations.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <MiniFeature
              icon={Phone}
              title="Voice"
              text="Start an audio conversation where calling is supported."
            />

            <MiniFeature
              icon={Video}
              title="Video"
              text="Start a video conversation where video calling is supported."
            />
          </div>

          <InfoBox icon={Globe}>
            Call quality depends on your device, browser/app permissions, and
            network connection.
          </InfoBox>
        </div>
      ),
    },

    {
      id: "read-receipts",
      category: "Messaging & Calls",
      question: "What are read receipts?",
      icon: CheckCircle,
      answer: (
        <div className="space-y-3">
          <p>
            Read receipts indicate the delivery or viewing state of a message
            when the feature is enabled.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <StatusCard
              symbol="✓"
              title="Delivered"
              text="The message has been delivered."
            />

            <StatusCard
              symbol="✓✓"
              title="Read"
              text="The recipient has viewed the message."
            />
          </div>
        </div>
      ),
    },

    /* ═══════════════════════════════════════════════════════════════════════
       PRIVACY & SAFETY
    ═══════════════════════════════════════════════════════════════════════ */

    {
      id: "privacy-policy",
      category: "Privacy & Safety",
      question: "How does ZRP protect my data?",
      icon: Lock,
      answer: (
        <div className="space-y-4">
          <p>
            ZRP's privacy practices are described in detail in the{" "}
            <Link href="/privacy" className="faq-link">
              Privacy Policy
            </Link>
            .
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <PrivacyCard
              icon={Lock}
              title="Secure connections"
              text="Traffic should be protected using modern HTTPS/TLS security."
            />

            <PrivacyCard
              icon={Shield}
              title="Account protection"
              text="Security measures are used to help protect accounts and platform infrastructure."
            />

            <PrivacyCard
              icon={Eye}
              title="Transparency"
              text="Users can review the Privacy Policy to understand how information is processed."
            />

            <PrivacyCard
              icon={Trash2}
              title="Data rights"
              text="Applicable users can exercise privacy rights including access and deletion."
            />
          </div>

          <Link
            href="/privacy"
            className="inline-flex items-center gap-2 faq-link font-semibold"
          >
            Read Privacy Policy
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ),
    },

    {
      id: "how-to-report",
      category: "Privacy & Safety",
      question: "How do I report inappropriate content?",
      icon: Flag,
      answer: (
        <div className="space-y-4">
          <StepList
            steps={[
              "Open the options menu on the relevant post, comment, or account.",
              "Select Report.",
              "Choose the reason that best describes the issue.",
              "Provide additional information if appropriate.",
              "Submit the report.",
            ]}
          />

          <InfoBox icon={Shield}>
            Reports are reviewed according to ZRP's rules, Community
            Guidelines, applicable law, and the circumstances of the report.
          </InfoBox>
        </div>
      ),
    },

    {
      id: "how-to-block",
      category: "Privacy & Safety",
      question: "How do I block another user?",
      icon: Shield,
      answer: (
        <div className="space-y-4">
          <StepList
            steps={[
              "Open the user's profile.",
              "Open the available profile options.",
              "Select Block.",
              "Confirm the action.",
            ]}
          />

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Blocking changes how the two accounts can interact. Exact
            visibility and interaction behaviour is determined by the current
            ZRP implementation.
          </p>
        </div>
      ),
    },

    {
      id: "delete-account",
      category: "Privacy & Safety",
      question: "How do I delete my account?",
      icon: Trash2,
      answer: (
        <div className="space-y-4">
          <StepList
            steps={[
              <>
                Open{" "}
                <Link href="/settings" className="faq-link">
                  Settings
                </Link>
                .
              </>,
              "Open the account-management section.",
              "Select the available Delete Account option.",
              "Review the warning and consequences.",
              "Confirm the deletion request.",
            ]}
          />

          <InfoBox icon={Shield} danger>
            Account deletion may be irreversible. Information may be retained
            where required by law or for legitimate security, fraud-prevention,
            backup, or dispute-resolution purposes.
          </InfoBox>

          <Link href="/privacy" className="faq-link text-sm">
            Review the Privacy Policy →
          </Link>
        </div>
      ),
    },

    /* ═══════════════════════════════════════════════════════════════════════
       WEB3 & DIGITAL
    ═══════════════════════════════════════════════════════════════════════ */

    {
      id: "is-zrp-web3",
      category: "Web3 & Digital",
      question: "Is ZRP a Web3 platform?",
      icon: Wallet,
      answer: (
        <div className="space-y-4">
          <p>
            ZRP is designed with modern digital and Web3 technologies in mind,
            while keeping the core social experience accessible to ordinary
            users.
          </p>

          <p>
            You should not need to understand blockchain technology simply to
            use ZRP as a social network.
          </p>

          <div className="rounded-2xl bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack p-5 text-white">
            <div className="flex items-start gap-4">
              <Wallet className="w-6 h-6 text-zrp-red flex-shrink-0" />

              <div>
                <h4 className="font-orbitron font-bold">
                  Web3-ready, user-first
                </h4>

                <p className="mt-2 text-sm leading-6 text-white/65">
                  Digital ownership, payments, identity, and other
                  decentralised technologies can be integrated where they add
                  genuine value rather than complexity.
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: "need-wallet",
      category: "Web3 & Digital",
      question: "Do I need a crypto wallet to use ZRP?",
      icon: Wallet,
      answer: (
        <div className="space-y-3">
          <p>
            <strong>No.</strong> A crypto wallet should not be required simply
            to create a normal ZRP Social account or participate in ordinary
            social interactions.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Blockchain or digital-payment features, if offered, may have
            separate requirements.
          </p>
        </div>
      ),
    },

    {
      id: "digital-payments",
      category: "Web3 & Digital",
      question: "Will ZRP support digital or blockchain payments?",
      icon={CircleHelp}
      answer: (
        <div className="space-y-3">
          <p>
            ZRP can support modern digital-payment infrastructure where it
            provides a useful experience for users and creators.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Only payment methods and blockchain functionality actually enabled
            in the live ZRP product should be considered available.
          </p>
        </div>
      ),
    },

    {
      id: "creator-economy",
      category: "Web3 & Digital",
      question: "Will creators be able to monetise on ZRP?",
      icon: CircleHelp,
      answer: (
        <div className="space-y-4">
          <p>
            ZRP can provide creator-economy features designed to help creators
            build audiences and participate in monetisation opportunities.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <MiniFeature
              icon={BarChart3}
              title="Analytics"
              text="Understand audience engagement and content performance."
            />

            <MiniFeature
              icon={CircleHelp}
              title="Monetisation"
              text="Participate in monetisation features when available."
            />
          </div>
        </div>
      ),
    },

    /* ═══════════════════════════════════════════════════════════════════════
       CHARITY & IMPACT
    ═══════════════════════════════════════════════════════════════════════ */

    {
      id: "charity-model",
      category: "Charity & Impact",
      question: "How does the 35% charity commitment work?",
      icon: HeartHandshake,
      answer: (
        <div className="space-y-5">
          <p>
            ZRP has stated a commitment to allocate{" "}
            <strong>35% of platform profits</strong> toward charitable causes.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <ImpactCard
              icon="🧸"
              title="Orphans"
              text="Supporting children and communities in need."
            />

            <ImpactCard
              icon="🏫"
              title="Schools"
              text="Supporting access to education."
            />

            <ImpactCard
              icon="🏥"
              title="Hospitals"
              text="Supporting healthcare-related causes."
            />

            <ImpactCard
              icon="🌍"
              title="Climate"
              text="Supporting climate and environmental relief."
            />
          </div>

          <InfoBox icon={Heart}>
            The 35% figure refers to platform profits, not a 35% deduction from
            every individual user payment.
          </InfoBox>
        </div>
      ),
    },

    {
      id: "impact-badge",
      category: "Charity & Impact",
      question: "What is the Impact badge?",
      icon: Heart,
      answer: (
        <div className="space-y-3">
          <p>
            An Impact badge or similar feature can communicate participation
            in ZRP's social-impact ecosystem.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            The exact functionality and metrics displayed by an Impact feature
            depend on the live ZRP implementation.
          </p>
        </div>
      ),
    },

    /* ═══════════════════════════════════════════════════════════════════════
       ACCOUNTS & PLANS
    ═══════════════════════════════════════════════════════════════════════ */

    {
      id: "plans",
      category: "Accounts & Plans",
      question: "What account plans does ZRP offer?",
      icon: Crown,
      answer: (
        <div className="space-y-5">
          <p>
            ZRP can offer different account levels for individual users,
            creators, businesses, and larger organisations.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <PlanMini
              title="Free"
              description="Core social experience"
            />

            <PlanMini
              title="Pro"
              description="Creators & advanced users"
              featured
            />

            <PlanMini
              title="Business"
              description="Teams & companies"
            />

            <PlanMini
              title="Enterprise"
              description="Large organisations"
            />
          </div>

          <Link href="/help#help-account-types" className="faq-link">
            Compare plans in the Help Center →
          </Link>
        </div>
      ),
    },

    {
      id: "enterprise-plan",
      category: "Accounts & Plans",
      question: "What is the Enterprise plan?",
      icon: Building2,
      answer: (
        <div className="space-y-4">
          <p>
            Enterprise is intended for larger organisations requiring
            professional social, publishing, team, support, or integration
            capabilities.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <MiniFeature
              icon={Users}
              title="Teams"
              text="Support organisational roles and collaboration."
            />

            <MiniFeature
              icon={BarChart3}
              title="Analytics"
              text="Access more advanced organisational insights."
            />

            <MiniFeature
              icon={Zap}
              title="Integrations"
              text="Enterprise-level integrations may be available."
            />

            <MiniFeature
              icon={Ticket}
              title="Support"
              text="Higher-tier support options may be available."
            />
          </div>

          <Link href="/contact" className="faq-button">
            Contact ZRP
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ),
    },

    /* ═══════════════════════════════════════════════════════════════════════
       SUPPORT
    ═══════════════════════════════════════════════════════════════════════ */

    {
      id: "support-tickets",
      category: "Support",
      question: "How do I submit a support ticket?",
      icon: Ticket,
      answer: (
        <div className="space-y-4">
          <StepList
            steps={[
              <>
                Open the{" "}
                <Link href="/support" className="faq-link">
                  Support
                </Link>{" "}
                page.
              </>,
              "Choose the appropriate category.",
              "Describe the issue clearly.",
              "Submit the ticket.",
              "Monitor the ticket for updates.",
            ]}
          />

          <Link href="/support" className="faq-button">
            Open Support
            <Ticket className="w-4 h-4" />
          </Link>
        </div>
      ),
    },

    {
      id: "track-support-tickets",
      category: "Support",
      question: "How do I track my support tickets?",
      icon: MessageSquare,
      answer: (
        <div className="space-y-4">
          <p>
            If ticket tracking is enabled for your account, you can view
            support conversations from your ticket area.
          </p>

          <Link href="/support/tickets" className="faq-button">
            View My Tickets
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ),
    },

    {
      id: "contact-support",
      category: "Support",
      question: "How can I contact ZRP?",
      icon: Mail,
      answer: (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <ContactCard
              icon={Ticket}
              title="Support Ticket"
              text="Best for account and platform issues."
              href="/support"
              label="Open Support"
            />

            <ContactCard
              icon={Mail}
              title="Contact"
              text="For general questions and business enquiries."
              href="/contact"
              label="Contact ZRP"
            />
          </div>
        </div>
      ),
    },
  ];

  const filteredFaqs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return faqs;

    return faqs.filter((faq) => {
      const content = `${faq.question} ${faq.category}`.toLowerCase();
      return content.includes(query);
    });
  }, [searchQuery, faqs]);

  const groupedFaqs = useMemo(() => {
    return filteredFaqs.reduce(
      (acc, faq) => {
        if (!acc[faq.category]) {
          acc[faq.category] = [];
        }

        acc[faq.category].push(faq);
        return acc;
      },
      {} as Record<string, FaqItem[]>
    );
  }, [filteredFaqs]);

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack text-zrp-charcoal dark:text-white">

      {/* ═══════════════════════════════════════════════════════════════════
          HERO
      ═══════════════════════════════════════════════════════════════════ */}

      <section className="relative overflow-hidden bg-gradient-to-br from-zrp-darkRed via-zrp-deepBlack to-black">

        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
          }}
        />

        <div className="absolute -top-32 -right-32 w-[30rem] h-[30rem] bg-zrp-red/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[28rem] h-[28rem] bg-zrp-red/10 rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">

          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/50 hover:text-white text-sm transition mb-10"
          >
            ← Back to ZRP
          </Link>

          <div className="grid lg:grid-cols-[1.4fr_.6fr] gap-12 items-center">

            <div>

              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-xl px-4 py-2 text-[11px] font-mono tracking-wider text-white/70 mb-6">
                <span className="w-2 h-2 rounded-full bg-zrp-red animate-pulse" />
                ZRP KNOWLEDGE HUB
              </div>

              <h1 className="font-orbitron font-extrabold text-4xl sm:text-5xl lg:text-6xl leading-[1.05] text-white">
                Frequently
                <span className="block text-zrp-red mt-2">
                  Asked Questions.
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-base sm:text-lg text-white/60 leading-8">
                Everything you need to know about ZRP Social — from account
                creation and publishing to privacy, Web3, digital features,
                community safety, and support.
              </p>

              {/* Search */}
              <div className="relative mt-8 max-w-2xl">

                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/35" />

                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search questions..."
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.08] backdrop-blur-xl py-4 pl-14 pr-5 text-white placeholder:text-white/35 outline-none focus:border-zrp-red/60 focus:ring-2 focus:ring-zrp-red/20 transition"
                />

              </div>

              <div className="mt-5 flex flex-wrap gap-2">

                {[
                  "Account",
                  "Privacy",
                  "Posts",
                  "Messaging",
                  "Web3",
                  "Support",
                ].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSearchQuery(tag)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/55 hover:bg-white/10 hover:text-white transition"
                  >
                    {tag}
                  </button>
                ))}

              </div>

            </div>

            {/* Hero protocol card */}
            <div className="hidden lg:block">

              <div className="relative">

                <div className="absolute inset-0 bg-zrp-red/20 blur-3xl rounded-full" />

                <div className="relative rounded-3xl border border-white/10 bg-white/[0.05] backdrop-blur-xl p-6 shadow-2xl">

                  <div className="flex items-center justify-between mb-6">

                    <div className="flex items-center gap-3">

                      <div className="w-11 h-11 rounded-xl bg-zrp-red flex items-center justify-center">
                        <CircleHelp className="w-5 h-5 text-white" />
                      </div>

                      <div>
                        <div className="font-orbitron font-bold text-white">
                          ZRP FAQ
                        </div>
                        <div className="text-xs text-white/35">
                          Knowledge protocol
                        </div>
                      </div>

                    </div>

                    <span className="text-[10px] font-mono text-zrp-red">
                      LIVE
                    </span>

                  </div>

                  <div className="space-y-3">

                    <HeroStat
                      icon={HelpCircle}
                      label="Questions"
                      value={`${faqs.length}+`}
                    />

                    <HeroStat
                      icon={Shield}
                      label="Privacy"
                      value="Protected"
                    />

                    <HeroStat
                      icon={Globe}
                      label="Community"
                      value="Global"
                    />

                    <HeroStat
                      icon={Heart}
                      label="Impact"
                      value="35%"
                    />

                  </div>

                  <div className="mt-6 border-t border-white/10 pt-5 text-[10px] font-mono tracking-wider text-white/25">
                    SWISS · EUROPE · SOCIAL · DIGITAL
                  </div>

                </div>

              </div>

            </div>

          </div>

        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          CATEGORY NAVIGATION
      ═══════════════════════════════════════════════════════════════════ */}

      <section className="sticky top-0 z-20 border-b border-zrp-silver/20 dark:border-zrp-charcoal bg-white/95 dark:bg-zrp-deepBlack/95 backdrop-blur-xl">

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">

          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">

            {categories.map((category) => {
              const Icon = category.icon;

              return (
                <a
                  key={category.id}
                  href={`#${category.id}`}
                  className="flex-shrink-0 flex items-center gap-2 rounded-full border border-zrp-silver/30 dark:border-zrp-charcoal px-4 py-2 text-xs font-medium text-zrp-charcoal/60 dark:text-white/55 hover:border-zrp-red hover:text-zrp-red transition"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {category.label}
                </a>
              );
            })}

          </div>

        </div>

      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN
      ═══════════════════════════════════════════════════════════════════ */}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">

        {/* Intro cards */}

        <div className="grid md:grid-cols-3 gap-4 mb-12">

          <QuickCard
            icon={Sparkles}
            title="Learn ZRP"
            text="Understand how the platform works and discover its core features."
          />

          <QuickCard
            icon={Shield}
            title="Stay protected"
            text="Learn about privacy, account security, reporting, and moderation."
          />

          <QuickCard
            icon={Ticket}
            title="Get support"
            text="Can't find your answer? Open a support ticket and contact ZRP."
          />

        </div>

        {searchQuery && (
          <div className="mb-6 flex items-center justify-between">

            <p className="text-sm text-zrp-charcoal/50 dark:text-white/40">
              Showing{" "}
              <strong className="text-zrp-charcoal dark:text-white">
                {filteredFaqs.length}
              </strong>{" "}
              result{filteredFaqs.length === 1 ? "" : "s"} for "
              {searchQuery}"
            </p>

            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-xs font-semibold text-zrp-red hover:underline"
            >
              Clear
            </button>

          </div>
        )}

        {/* FAQ groups */}

        <div className="space-y-12">

          {Object.entries(groupedFaqs).map(([category, items]) => {

            const categoryInfo = categories.find(
              (item) => item.label === category
            );

            const CategoryIcon = categoryInfo?.icon || HelpCircle;

            const categoryId =
              categoryInfo?.id ||
              category.replace(/\s+/g, "-").toLowerCase();

            return (
              <section key={category} id={categoryId}>

                {/* Category heading */}

                <div className="flex items-center gap-4 mb-5">

                  <div className="w-11 h-11 rounded-xl bg-zrp-red/10 flex items-center justify-center text-zrp-red">
                    <CategoryIcon className="w-5 h-5" />
                  </div>

                  <div>

                    <h2 className="font-orbitron font-bold text-xl text-zrp-charcoal dark:text-white">
                      {category}
                    </h2>

                    <p className="text-xs text-zrp-charcoal/40 dark:text-white/35 mt-1">
                      {items.length}{" "}
                      {items.length === 1 ? "question" : "questions"}
                    </p>

                  </div>

                </div>

                <div className="space-y-3">

                  {items.map((faq) => {

                    const isOpen = openId === faq.id;
                    const Icon = faq.icon || HelpCircle;

                    return (
                      <div
                        key={faq.id}
                        className={`overflow-hidden rounded-2xl border transition-all duration-300 ${
                          isOpen
                            ? "border-zrp-red/30 shadow-lg shadow-red-950/5"
                            : "border-zrp-silver/30 dark:border-zrp-charcoal"
                        } bg-white dark:bg-zrp-deepBlack`}
                      >

                        <button
                          type="button"
                          onClick={() => toggleFaq(faq.id)}
                          className="w-full flex items-center gap-4 p-5 text-left hover:bg-zrp-silver/5 dark:hover:bg-white/[0.02] transition"
                          aria-expanded={isOpen}
                        >

                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition ${
                              isOpen
                                ? "bg-zrp-red text-white"
                                : "bg-zrp-red/10 text-zrp-red"
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>

                          <span className="flex-1 font-semibold text-sm sm:text-base text-zrp-charcoal dark:text-white">
                            {faq.question}
                          </span>

                          {isOpen ? (
                            <ChevronUp className="w-5 h-5 text-zrp-red flex-shrink-0" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-zrp-charcoal/30 dark:text-white/30 flex-shrink-0" />
                          )}

                        </button>

                        {isOpen && (
                          <div className="px-5 pb-6">

                            <div className="border-t border-zrp-silver/20 dark:border-zrp-charcoal pt-5 text-sm leading-7 text-zrp-charcoal/70 dark:text-white/65">
                              {faq.answer}
                            </div>

                          </div>
                        )}

                      </div>
                    );
                  })}

                </div>

              </section>
            );
          })}

        </div>

        {/* No results */}

        {filteredFaqs.length === 0 && (
          <div className="rounded-3xl border border-zrp-silver/30 dark:border-zrp-charcoal p-12 text-center">

            <Search className="w-10 h-10 mx-auto text-zrp-red/50" />

            <h3 className="mt-5 font-orbitron font-bold text-lg">
              No answers found
            </h3>

            <p className="mt-2 text-sm text-zrp-charcoal/45 dark:text-white/40">
              Try a different search term or contact the ZRP support team.
            </p>

            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="mt-5 text-sm font-semibold text-zrp-red hover:underline"
            >
              Clear search
            </button>

          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════
            SUPPORT CTA
        ═════════════════════════════════════════════════════════════════ */}

        <section className="relative overflow-hidden mt-16 rounded-3xl bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack p-8 sm:p-12 text-white">

          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />

          <div className="absolute -right-24 -bottom-24 w-80 h-80 bg-zrp-red/20 rounded-full blur-3xl" />

          <div className="relative grid md:grid-cols-[1fr_auto] gap-8 items-center">

            <div>

              <div className="inline-flex items-center gap-2 text-[10px] font-mono tracking-wider text-white/40 mb-4">
                <span className="w-2 h-2 rounded-full bg-zrp-red" />
                ZRP SUPPORT
              </div>

              <h2 className="font-orbitron font-bold text-2xl sm:text-3xl">
                Didn't find your answer?
              </h2>

              <p className="mt-3 max-w-xl text-sm sm:text-base text-white/55 leading-7">
                Our support team can help with account issues, technical
                problems, privacy requests, moderation questions, billing, and
                more.
              </p>

            </div>

            <div className="flex flex-wrap gap-3">

              <Link
                href="/support"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zrp-darkRed hover:bg-gray-100 transition"
              >
                <Ticket className="w-4 h-4" />
                Open Ticket
              </Link>

              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition"
              >
                <Mail className="w-4 h-4" />
                Contact ZRP
              </Link>

            </div>

          </div>

        </section>

        {/* Bottom navigation */}

        <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs text-zrp-charcoal/40 dark:text-white/35">

          <Link href="/help" className="hover:text-zrp-red transition">
            Help Center
          </Link>

          <Link href="/privacy" className="hover:text-zrp-red transition">
            Privacy Policy
          </Link>

          <Link href="/terms" className="hover:text-zrp-red transition">
            Terms of Service
          </Link>

          <Link
            href="/guidelines"
            className="hover:text-zrp-red transition"
          >
            Community Guidelines
          </Link>

          <Link href="/contact" className="hover:text-zrp-red transition">
            Contact
          </Link>

        </div>

      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   REUSABLE COMPONENTS
═══════════════════════════════════════════════════════════════════════════ */

function StepList({
  steps,
}: {
  steps: React.ReactNode[];
}) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={index} className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-zrp-red/10 text-zrp-red flex items-center justify-center text-[10px] font-mono font-bold">
            {String(index + 1).padStart(2, "0")}
          </span>

          <span className="pt-0.5 text-sm">
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}

function InfoBox({
  icon: Icon,
  children,
  danger = false,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        danger
          ? "border-red-500/20 bg-red-500/5"
          : "border-zrp-red/20 bg-zrp-red/5"
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={`w-5 h-5 flex-shrink-0 ${
            danger ? "text-red-500" : "text-zrp-red"
          }`}
        />

        <p className="text-sm leading-6">
          {children}
        </p>
      </div>
    </div>
  );
}

function MediaRequirements({
  items,
  note,
}: {
  items: string[][];
  note?: string;
}) {
  return (
    <div className="space-y-4">

      <div className="grid sm:grid-cols-2 gap-3">

        {items.map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-zrp-silver/25 dark:border-zrp-charcoal bg-zrp-silver/5 dark:bg-zrp-charcoal/30 p-4"
          >
            <div className="text-[10px] uppercase tracking-wider font-mono text-zrp-red/70">
              {label}
            </div>

            <div className="mt-1 font-semibold text-sm">
              {value}
            </div>
          </div>
        ))}

      </div>

      {note && (
        <p className="text-xs text-zrp-charcoal/45 dark:text-white/40">
          💡 {note}
        </p>
      )}

    </div>
  );
}

function MiniFeature({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-zrp-silver/25 dark:border-zrp-charcoal bg-zrp-silver/5 dark:bg-zrp-charcoal/30 p-4">

      <Icon className="w-5 h-5 text-zrp-red" />

      <h4 className="mt-3 font-semibold text-sm">
        {title}
      </h4>

      <p className="mt-1 text-xs leading-5 text-zrp-charcoal/55 dark:text-white/45">
        {text}
      </p>

    </div>
  );
}

function PrivacyCard({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-zrp-silver/25 dark:border-zrp-charcoal p-4">

      <Icon className="w-5 h-5 text-zrp-red" />

      <h4 className="mt-3 font-semibold text-sm">
        {title}
      </h4>

      <p className="mt-1 text-xs leading-5 text-zrp-charcoal/55 dark:text-white/45">
        {text}
      </p>

    </div>
  );
}

function ImpactCard({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-zrp-silver/25 dark:border-zrp-charcoal bg-zrp-silver/5 dark:bg-zrp-charcoal/30 p-4">

      <div className="text-2xl">
        {icon}
      </div>

      <h4 className="mt-2 font-semibold text-sm">
        {title}
      </h4>

      <p className="mt-1 text-xs leading-5 text-zrp-charcoal/55 dark:text-white/45">
        {text}
      </p>

    </div>
  );
}

function PlanMini({
  title,
  description,
  featured = false,
}: {
  title: string;
  description: string;
  featured?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        featured
          ? "border-zrp-red/40 bg-zrp-red/5"
          : "border-zrp-silver/25 dark:border-zrp-charcoal"
      }`}
    >

      <div className="flex items-center gap-2">

        <div
          className={`w-2 h-2 rounded-full ${
            featured ? "bg-zrp-red" : "bg-zrp-charcoal/20 dark:bg-white/20"
          }`}
        />

        <span className="font-orbitron font-bold text-sm">
          {title}
        </span>

      </div>

      <p className="mt-2 text-xs text-zrp-charcoal/50 dark:text-white/45">
        {description}
      </p>

    </div>
  );
}

function ContactCard({
  icon: Icon,
  title,
  text,
  href,
  label,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
  href: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-zrp-silver/25 dark:border-zrp-charcoal p-5">

      <Icon className="w-5 h-5 text-zrp-red" />

      <h3 className="mt-3 font-orbitron font-bold text-sm">
        {title}
      </h3>

      <p className="mt-2 text-xs leading-5 text-zrp-charcoal/50 dark:text-white/45">
        {text}
      </p>

      <Link href={href} className="faq-link inline-flex mt-4">
        {label}
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>

    </div>
  );
}

function StatusCard({
  symbol,
  title,
  text,
}: {
  symbol: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-zrp-silver/25 dark:border-zrp-charcoal p-4">

      <div className="text-zrp-red font-bold text-lg">
        {symbol}
      </div>

      <h4 className="mt-2 font-semibold text-sm">
        {title}
      </h4>

      <p className="mt-1 text-xs text-zrp-charcoal/50 dark:text-white/45">
        {text}
      </p>

    </div>
  );
}

function QuickCard({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/5 dark:bg-zrp-charcoal/30 p-5">

      <div className="w-10 h-10 rounded-xl bg-zrp-red/10 flex items-center justify-center text-zrp-red">
        <Icon className="w-5 h-5" />
      </div>

      <h3 className="mt-4 font-orbitron font-bold text-sm">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-zrp-charcoal/55 dark:text-white/45">
        {text}
      </p>

    </div>
  );
}

function HeroStat({
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
        <span className="text-sm text-white/50">
          {label}
        </span>
      </div>

      <span className="text-xs font-mono text-white/75">
        {value}
      </span>

    </div>
  );
}
