"use client";

import Link from "next/link";
import { useState } from "react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";

import {
  ChevronDown,
  ChevronUp,
  UserPlus,
  LogIn,
  Key,
  Image,
  Video,
  MessageSquare,
  Shield,
  ShieldCheck,
  Heart,
  FileText,
  HelpCircle,
  Users,
  Phone,
  Camera,
  Upload,
  Clock,
  Lock,
  CheckCircle,
  Ticket,
  Trash2,
  Crown,
  Wallet,
  Globe,
  CreditCard,
  Database,
  Zap,
  BadgeCheck,
  Eye,
  Sparkles,
} from "lucide-react";

interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string | React.ReactNode;
  icon?: React.ElementType;
}

// Category is kept as a stable English identifier for grouping and
// anchor-slug generation (so links to #category-... stay the same
// across languages) - this maps it to the translated display label.
const CATEGORY_KEYS: Record<string, TranslationKey> = {
  "Getting Started": "faq.cat.gettingStarted",
  "Profile & Media": "faq.cat.profileMedia",
  "Posts & Interactions": "faq.cat.postsInteractions",
  "Messaging & Calls": "faq.cat.messagingCalls",
  "Privacy & Safety": "faq.cat.privacySafety",
  "ZRP Trust Passport": "faq.cat.trustPassport",
  "Charity & Impact": "faq.cat.charityImpact",
  "Web3 & Digital": "faq.cat.web3Digital",
  "Administration": "faq.cat.administration",
  "Support & Tickets": "faq.cat.supportTickets",
  "Legal & Account": "faq.cat.legalAccount",
};

export default function FAQPage() {
  const { t } = useLanguage();
  const [openId, setOpenId] = useState<string | null>(null);

  const toggleFaq = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  const categoryLabel = (category: string) =>
    CATEGORY_KEYS[category] ? t(CATEGORY_KEYS[category]) : category;

  const faqs: FaqItem[] = [
    // ============================================================
    // GETTING STARTED
    // ============================================================
    {
      id: "what-is-zrp",
      category: "Getting Started",
      question: t("faq.whatIsZrp.q"),
      icon: HelpCircle,
      answer: (
        <div className="space-y-3">
          <p>
            <strong>{t("faq.whatIsZrp.p1Bold")}</strong> {t("faq.whatIsZrp.p1")}
          </p>

          <p>
            {t("faq.whatIsZrp.p2")}
          </p>

          <p>
            {t("faq.whatIsZrp.p3")}
          </p>

          <div className="p-3 rounded-lg bg-zrp-red/5 border border-zrp-red/20 text-sm">
            <strong className="text-zrp-red">{t("faq.whatIsZrp.noteBold")}</strong>{" "}
            {t("faq.whatIsZrp.noteText")}
          </div>
        </div>
      ),
    },

    {
      id: "how-to-register",
      category: "Getting Started",
      question: t("faq.howToRegister.q"),
      icon: UserPlus,
      answer: (
        <div className="space-y-3">
          <p>{t("faq.howToRegister.intro")}</p>

          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              {t("faq.howToRegister.step1Prefix")}{" "}
              <Link
                href="/signup"
                className="text-zrp-red hover:underline"
              >
                {t("faq.howToRegister.step1Link")}
              </Link>{" "}
              {t("faq.howToRegister.step1Rest")}
            </li>
            <li>{t("faq.howToRegister.step2")}</li>
            <li>{t("faq.howToRegister.step3")}</li>
            <li>{t("faq.howToRegister.step4")}</li>
            <li>{t("faq.howToRegister.step5")}</li>
            <li>{t("faq.howToRegister.step6")}</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.howToRegister.note")}
          </p>
        </div>
      ),
    },

    {
      id: "how-to-login",
      category: "Getting Started",
      question: t("faq.howToLogin.q"),
      icon: LogIn,
      answer: (
        <div className="space-y-3">
          <p>{t("faq.howToLogin.intro")}</p>

          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              {t("faq.howToLogin.step1Prefix")}{" "}
              <Link
                href="/login"
                className="text-zrp-red hover:underline"
              >
                {t("faq.howToLogin.step1Link")}
              </Link>{" "}
              {t("faq.howToLogin.step1Rest")}
            </li>
            <li>{t("faq.howToLogin.step2")}</li>
            <li>{t("faq.howToLogin.step3")}</li>
            <li>{t("faq.howToLogin.step4")}</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.howToLogin.note")}
          </p>
        </div>
      ),
    },

    {
      id: "password-reset",
      category: "Getting Started",
      question: t("faq.passwordReset.q"),
      icon: Key,
      answer: (
        <div className="space-y-3">
          <p>{t("faq.passwordReset.intro")}</p>

          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              {t("faq.passwordReset.step1Prefix")}{" "}
              <Link
                href="/login"
                className="text-zrp-red hover:underline"
              >
                {t("faq.passwordReset.step1Link")}
              </Link>{" "}
              {t("faq.passwordReset.step1Rest")}
            </li>
            <li>{t("faq.passwordReset.step2")}</li>
            <li>{t("faq.passwordReset.step3")}</li>
            <li>{t("faq.passwordReset.step4")}</li>
            <li>{t("faq.passwordReset.step5")}</li>
            <li>{t("faq.passwordReset.step6")}</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.passwordReset.note")}
          </p>
        </div>
      ),
    },

    // ============================================================
    // PROFILE & MEDIA
    // ============================================================
    {
      id: "avatar-size",
      category: "Profile & Media",
      question: t("faq.avatarSize.q"),
      icon: Image,
      answer: (
        <div className="space-y-3">
          <p>{t("faq.avatarSize.intro")}</p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>
              <strong>{t("faq.mediaLabel.maxFileSize")}</strong> {t("faq.avatarSize.maxFileSizeVal")}
            </li>
            <li>
              <strong>{t("faq.mediaLabel.supportedFormats")}</strong> {t("faq.avatarSize.formatsVal")}
            </li>
            <li>
              <strong>{t("faq.mediaLabel.recommendedResolution")}</strong> {t("faq.avatarSize.resolutionVal")}
            </li>
            <li>
              <strong>{t("faq.mediaLabel.recommendedRatio")}</strong> {t("faq.avatarSize.ratioVal")}
            </li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.avatarSize.note")}
          </p>
        </div>
      ),
    },

    {
      id: "banner-size",
      category: "Profile & Media",
      question: t("faq.bannerSize.q"),
      icon: Camera,
      answer: (
        <div className="space-y-3">
          <p>{t("faq.bannerSize.intro")}</p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>
              <strong>{t("faq.mediaLabel.maxFileSize")}</strong> {t("faq.bannerSize.maxFileSizeVal")}
            </li>
            <li>
              <strong>{t("faq.mediaLabel.supportedFormats")}</strong> {t("faq.bannerSize.formatsVal")}
            </li>
            <li>
              <strong>{t("faq.mediaLabel.recommendedResolution")}</strong> {t("faq.bannerSize.resolutionVal")}
            </li>
            <li>
              <strong>{t("faq.mediaLabel.recommendedRatio")}</strong> {t("faq.bannerSize.ratioVal")}
            </li>
          </ul>
        </div>
      ),
    },

    {
      id: "post-image-size",
      category: "Profile & Media",
      question: t("faq.postImageSize.q"),
      icon: Upload,
      answer: (
        <div className="space-y-3">
          <p>{t("faq.postImageSize.intro")}</p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>
              <strong>{t("faq.mediaLabel.maxFileSize")}</strong> {t("faq.postImageSize.maxFileSizeVal")}
            </li>
            <li>
              <strong>{t("faq.mediaLabel.supportedFormats")}</strong> {t("faq.postImageSize.formatsVal")}
            </li>
            <li>
              <strong>{t("faq.mediaLabel.recommendedResolution")}</strong> {t("faq.postImageSize.resolutionVal")}
            </li>
            <li>
              <strong>{t("faq.mediaLabel.recommendedRatio")}</strong> {t("faq.postImageSize.ratioVal")}
            </li>
          </ul>
        </div>
      ),
    },

    {
      id: "post-video-size",
      category: "Profile & Media",
      question: t("faq.postVideoSize.q"),
      icon: Video,
      answer: (
        <div className="space-y-3">
          <p>{t("faq.postVideoSize.intro")}</p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>
              <strong>{t("faq.mediaLabel.maxFileSize")}</strong> {t("faq.postVideoSize.maxFileSizeVal")}
            </li>
            <li>
              <strong>{t("faq.mediaLabel.supportedFormats")}</strong> {t("faq.postVideoSize.formatsVal")}
            </li>
            <li>
              <strong>{t("faq.mediaLabel.recommendedResolution")}</strong> {t("faq.postVideoSize.resolutionVal")}
            </li>
            <li>
              <strong>{t("faq.mediaLabel.recommendedEncoding")}</strong> {t("faq.postVideoSize.encodingVal")}
            </li>
            <li>
              <strong>{t("faq.mediaLabel.recommendedDuration")}</strong> {t("faq.postVideoSize.durationVal")}
            </li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.postVideoSize.note")}
          </p>
        </div>
      ),
    },

    {
      id: "chat-image-size",
      category: "Profile & Media",
      question: t("faq.chatImageSize.q"),
      icon: MessageSquare,
      answer: (
        <div className="space-y-3">
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>
              <strong>{t("faq.mediaLabel.maxFileSize")}</strong> {t("faq.chatImageSize.maxFileSizeVal")}
            </li>
            <li>
              <strong>{t("faq.mediaLabel.supportedFormats")}</strong> {t("faq.chatImageSize.formatsVal")}
            </li>
            <li>
              <strong>{t("faq.mediaLabel.recommendedResolution")}</strong> {t("faq.chatImageSize.resolutionVal")}
            </li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.chatImageSize.note")}
          </p>
        </div>
      ),
    },

    // ============================================================
    // POSTS & INTERACTIONS
    // ============================================================
    {
      id: "how-to-post",
      category: "Posts & Interactions",
      question: t("faq.howToPost.q"),
      icon: FileText,
      answer: (
        <div className="space-y-3">
          <p>{t("faq.howToPost.intro")}</p>

          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>{t("faq.howToPost.step1")}</li>
            <li>{t("faq.howToPost.step2")}</li>
            <li>{t("faq.howToPost.step3")}</li>
            <li>{t("faq.howToPost.step4")}</li>
            <li>{t("faq.howToPost.step5")}</li>
            <li>{t("faq.howToPost.step6")}</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.howToPost.note")}
          </p>
        </div>
      ),
    },

    {
      id: "how-to-schedule-post",
      category: "Posts & Interactions",
      question: t("faq.schedulePost.q"),
      icon: Clock,
      answer: (
        <div className="space-y-3">
          <p>{t("faq.schedulePost.intro")}</p>

          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>{t("faq.schedulePost.step1")}</li>
            <li>{t("faq.schedulePost.step2")}</li>
            <li>{t("faq.schedulePost.step3")}</li>
            <li>{t("faq.schedulePost.step4")}</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.schedulePost.note")}
          </p>
        </div>
      ),
    },

    {
      id: "how-to-comment",
      category: "Posts & Interactions",
      question: t("faq.howToComment.q"),
      icon: MessageSquare,
      answer: (
        <div className="space-y-3">
          <p>{t("faq.howToComment.intro")}</p>

          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>{t("faq.howToComment.step1")}</li>
            <li>{t("faq.howToComment.step2")}</li>
            <li>{t("faq.howToComment.step3")}</li>
            <li>{t("faq.howToComment.step4")}</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.howToComment.note")}
          </p>
        </div>
      ),
    },

    {
      id: "hashtags-mentions",
      category: "Posts & Interactions",
      question: t("faq.hashtagsMentions.q"),
      icon: Users,
      answer: (
        <div className="space-y-3">
          <p>
            <strong>{t("faq.hashtagsMentions.hashtagsBold")}</strong> {t("faq.hashtagsMentions.hashtagsText")}
          </p>

          <p className="text-sm">
            {t("faq.hashtagsMentions.exampleLabel")}{" "}
            <span className="text-zrp-red font-medium">#ZRP</span> or{" "}
            <span className="text-zrp-red font-medium">#Web3</span>
          </p>

          <p>
            <strong>{t("faq.hashtagsMentions.mentionsBold")}</strong> {t("faq.hashtagsMentions.mentionsText")}
          </p>

          <p className="text-sm">
            {t("faq.hashtagsMentions.exampleLabel")}{" "}
            <span className="text-zrp-red font-medium">@username</span>
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.hashtagsMentions.note")}
          </p>
        </div>
      ),
    },

    {
      id: "how-to-pin-post",
      category: "Posts & Interactions",
      question: t("faq.pinPost.q"),
      icon: CheckCircle,
      answer: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>{t("faq.pinPost.step1")}</li>
            <li>{t("faq.pinPost.step2")}</li>
            <li>{t("faq.pinPost.step3")}</li>
            <li>{t("faq.pinPost.step4")}</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.pinPost.note")}
          </p>
        </div>
      ),
    },

    // ============================================================
    // MESSAGING & CALLS
    // ============================================================
    {
      id: "how-to-message",
      category: "Messaging & Calls",
      question: t("faq.howToMessage.q"),
      icon: MessageSquare,
      answer: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>{t("faq.howToMessage.step1")}</li>
            <li>{t("faq.howToMessage.step2")}</li>
            <li>{t("faq.howToMessage.step3")}</li>
            <li>{t("faq.howToMessage.step4")}</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.howToMessage.note")}
          </p>
        </div>
      ),
    },

    {
      id: "how-to-call",
      category: "Messaging & Calls",
      question: t("faq.howToCall.q"),
      icon: Phone,
      answer: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>{t("faq.howToCall.step1")}</li>
            <li>{t("faq.howToCall.step2")}</li>
            <li>{t("faq.howToCall.step3")}</li>
            <li>{t("faq.howToCall.step4")}</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.howToCall.note")}
          </p>
        </div>
      ),
    },

    {
      id: "read-receipts",
      category: "Messaging & Calls",
      question: t("faq.readReceipts.q"),
      icon: CheckCircle,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.readReceipts.intro")}
          </p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>
              <strong>{t("faq.readReceipts.singleBold")}</strong> {t("faq.readReceipts.singleText")}
            </li>
            <li>
              <strong>{t("faq.readReceipts.doubleBold")}</strong> {t("faq.readReceipts.doubleText")}
            </li>
          </ul>
        </div>
      ),
    },

    // ============================================================
    // PRIVACY & SAFETY
    // ============================================================
    {
      id: "privacy-policy",
      category: "Privacy & Safety",
      question: t("faq.privacyPolicyFaq.q"),
      icon: Lock,
      answer: (
        <div className="space-y-3">
          <p>{t("faq.privacyPolicyFaq.intro")}</p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>{t("faq.privacyPolicyFaq.item1")}</li>
            <li>{t("faq.privacyPolicyFaq.item2")}</li>
            <li>{t("faq.privacyPolicyFaq.item3")}</li>
            <li>{t("faq.privacyPolicyFaq.item4")}</li>
            <li>{t("faq.privacyPolicyFaq.item5")}</li>
          </ul>

          <p>
            {t("faq.privacyPolicyFaq.readMore")}{" "}
            <Link
              href="/privacy"
              className="text-zrp-red hover:underline"
            >
              {t("faq.privacyPolicyFaq.readMoreLink")}
            </Link>
            .
          </p>
        </div>
      ),
    },

    {
      id: "how-to-report",
      category: "Privacy & Safety",
      question: t("faq.howToReport.q"),
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>{t("faq.howToReport.step1")}</li>
            <li>{t("faq.howToReport.step2")}</li>
            <li>{t("faq.howToReport.step3")}</li>
            <li>{t("faq.howToReport.step4")}</li>
            <li>{t("faq.howToReport.step5")}</li>
            <li>{t("faq.howToReport.step6")}</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.howToReport.note")}
          </p>
        </div>
      ),
    },

    {
      id: "how-to-block",
      category: "Privacy & Safety",
      question: t("faq.howToBlock.q"),
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>{t("faq.howToBlock.step1")}</li>
            <li>{t("faq.howToBlock.step2")}</li>
            <li>{t("faq.howToBlock.step3")}</li>
            <li>{t("faq.howToBlock.step4")}</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.howToBlock.note")}
          </p>
        </div>
      ),
    },

    {
      id: "delete-account",
      category: "Privacy & Safety",
      question: t("faq.deleteAccountFaq.q"),
      icon: Trash2,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.deleteAccountFaq.intro")}
          </p>

          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              {t("faq.deleteAccountFaq.step1Prefix")}{" "}
              <Link
                href="/settings"
                className="text-zrp-red hover:underline"
              >
                {t("faq.deleteAccountFaq.step1Link")}
              </Link>
              .
            </li>
            <li>{t("faq.deleteAccountFaq.step2")}</li>
            <li>{t("faq.deleteAccountFaq.step3")}</li>
            <li>{t("faq.deleteAccountFaq.step4")}</li>
            <li>{t("faq.deleteAccountFaq.step5")}</li>
          </ol>

          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-sm">
            <strong>{t("faq.deleteAccountFaq.warningBold")}</strong> {t("faq.deleteAccountFaq.warningText")}
          </div>

          <p>
            {t("faq.deleteAccountFaq.seeMorePrefix")}{" "}
            <Link
              href="/privacy"
              className="text-zrp-red hover:underline"
            >
              {t("faq.deleteAccountFaq.seeMoreLink")}
            </Link>{" "}
            {t("faq.deleteAccountFaq.seeMoreSuffix")}
          </p>
        </div>
      ),
    },

    // ============================================================
    // ZRP TRUST PASSPORT
    // ============================================================
    {
      id: "what-is-trust-passport",
      category: "ZRP Trust Passport",
      question: "What is the ZRP Trust Passport?",
      icon: ShieldCheck,
      answer: (
        <div className="space-y-4">
          <p>
            The <strong>ZRP Trust Passport</strong> is a transparency feature
            designed to help the ZRP community understand positive trust signals
            associated with an account.
          </p>

          <p>
            It provides a <strong>Trust Score from 0 to 100</strong> together
            with selected account and community signals that can help users
            better understand the public history and activity of an account.
          </p>

          <div className="p-4 rounded-xl bg-zrp-red/5 border border-zrp-red/20">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-zrp-red flex-shrink-0 mt-0.5" />

              <div>
                <strong className="text-zrp-red">
                  Transparency, not a guarantee
                </strong>

                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  The Trust Passport is designed to provide useful account
                  signals. It does not guarantee a person's identity,
                  intentions, character, or future behaviour.
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: "trust-score-calculation",
      category: "ZRP Trust Passport",
      question: "How is the ZRP Trust Score calculated?",
      icon: Sparkles,
      answer: (
        <div className="space-y-4">
          <p>
            The Trust Score is generated from positive account and community
            signals available to the ZRP platform.
          </p>

          <p>
            Depending on the current implementation, signals can include:
          </p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Email verification.</li>
            <li>Profile completeness.</li>
            <li>Account age and history.</li>
            <li>Posts and community participation.</li>
            <li>Comments and interactions.</li>
            <li>Likes and repost activity.</li>
            <li>Community connections.</li>
            <li>ZRP verification status.</li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            The exact weighting of individual signals is controlled by ZRP's
            Trust Passport system and may evolve over time.
          </p>
        </div>
      ),
    },

    {
      id: "trust-levels",
      category: "ZRP Trust Passport",
      question: "What do the different Trust Score levels mean?",
      icon: BadgeCheck,
      answer: (
        <div className="space-y-4">
          <p>
            The Trust Passport currently groups scores into broad trust levels
            to make the score easier to understand.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <strong className="text-zrp-red">0–34</strong>
              <p className="mt-1 text-sm font-medium">
                Building Trust
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The account is developing its public trust signals.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <strong className="text-zrp-red">35–54</strong>
              <p className="mt-1 text-sm font-medium">
                Moderate Trust
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The account has established some positive signals.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <strong className="text-zrp-red">55–74</strong>
              <p className="mt-1 text-sm font-medium">
                Good Trust
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The account demonstrates a broader set of positive signals.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <strong className="text-zrp-red">75–89</strong>
              <p className="mt-1 text-sm font-medium">
                High Trust
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The account has a strong collection of available trust signals.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-zrp-red/30 bg-zrp-red/5 sm:col-span-2">
              <strong className="text-zrp-red">90–100</strong>
              <p className="mt-1 text-sm font-medium">
                Excellent Trust
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The account has a very strong set of available positive trust
                signals.
              </p>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: "trust-score-change",
      category: "ZRP Trust Passport",
      question: "Can my Trust Score change?",
      icon: Zap,
      answer: (
        <div className="space-y-3">
          <p>
            Yes. The Trust Passport is dynamic and can change as the account's
            available trust signals change.
          </p>

          <p>
            For example, completing your profile, verifying your email,
            developing account history, participating positively in the
            community, or receiving an applicable verification status may
            affect available trust signals.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Trust Scores are not intended to be permanent rankings and may
            change as ZRP's systems evolve.
          </p>
        </div>
      ),
    },

    {
      id: "trust-score-not-popularity",
      category: "ZRP Trust Passport",
      question: "Is the Trust Score a popularity score?",
      icon: Heart,
      answer: (
        <div className="space-y-3">
          <p>
            <strong>No.</strong> The Trust Score is not intended to rank users
            according to popularity.
          </p>

          <p>
            A large following, many likes, or high engagement should not by
            itself be interpreted as proof that someone is trustworthy.
          </p>

          <p>
            The Trust Passport is designed around a broader set of account and
            community signals rather than simply measuring popularity.
          </p>
        </div>
      ),
    },

    {
      id: "trust-score-not-identity",
      category: "ZRP Trust Passport",
      question: "Does a high Trust Score prove someone's identity?",
      icon: Lock,
      answer: (
        <div className="space-y-3">
          <p>
            No. A Trust Score is <strong>not government identity
            verification</strong> and should not be treated as proof that a
            person is who they claim to be.
          </p>

          <p>
            Verification badges and the Trust Passport are separate concepts.
            The Trust Passport provides account trust signals, while a
            verification badge represents the applicable verification status
            granted by ZRP.
          </p>

          <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 text-sm">
            <strong>Important:</strong> Always exercise normal caution when
            communicating with people online, regardless of their Trust Score.
          </div>
        </div>
      ),
    },

    {
      id: "trust-passport-private-data",
      category: "ZRP Trust Passport",
      question: "Does the Trust Passport expose private information?",
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            The public Trust Passport is designed to display useful trust
            signals without exposing sensitive private information.
          </p>

          <p>It should not publicly expose information such as:</p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Private email addresses.</li>
            <li>Passwords.</li>
            <li>Private messages.</li>
            <li>IP addresses.</li>
            <li>Private moderation reports.</li>
            <li>Internal security information.</li>
            <li>Private account credentials.</li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            The handling of personal information is governed by the ZRP Privacy
            Policy.
          </p>
        </div>
      ),
    },

    {
      id: "trust-passport-location",
      category: "ZRP Trust Passport",
      question: "Where can I see a user's Trust Passport?",
      icon: Eye,
      answer: (
        <div className="space-y-3">
          <p>
            Open a supported ZRP user profile and select{" "}
            <strong>ZRP Trust Passport</strong>.
          </p>

          <p>
            The Trust Passport can display the account's available Trust Score
            and relevant public trust signals.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            The exact placement of the Trust Passport may vary as the ZRP
            profile experience develops.
          </p>
        </div>
      ),
    },

    {
      id: "trust-passport-verification",
      category: "ZRP Trust Passport",
      question: "Does ZRP verification affect the Trust Passport?",
      icon: BadgeCheck,
      answer: (
        <div className="space-y-4">
          <p>
            An active ZRP verification status may contribute a positive
            verification signal to the Trust Passport.
          </p>

          <p>
            However, <strong>verification and the Trust Passport are not the
            same thing</strong>.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <VerifiedBadge badgeType="verified" />

              <h3 className="mt-3 font-semibold">
                Verification
              </h3>

              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Represents the applicable verification status of an account.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-zrp-red/20 bg-zrp-red/5">
              <ShieldCheck className="w-5 h-5 text-zrp-red" />

              <h3 className="mt-3 font-semibold">
                Trust Passport
              </h3>

              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Combines multiple account and community signals into a
                transparency-oriented Trust Score.
              </p>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: "trust-passport-not-moderation",
      category: "ZRP Trust Passport",
      question: "Is the Trust Score a moderation or punishment score?",
      icon: ShieldCheck,
      answer: (
        <div className="space-y-3">
          <p>
            No. The Trust Passport is not intended to function as a public
            punishment or moderation score.
          </p>

          <p>
            Moderation decisions are handled separately through ZRP's
            moderation and safety systems.
          </p>

          <p>
            A Trust Score should therefore not be interpreted as a public
            record of someone's moderation history.
          </p>
        </div>
      ),
    },

    {
      id: "trust-passport-guarantee",
      category: "ZRP Trust Passport",
      question: "Does an Excellent Trust Score guarantee that someone is safe?",
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            No. Even an Excellent Trust Score does not guarantee that a person
            is safe, honest, legitimate, or trustworthy in every situation.
          </p>

          <p>
            The Trust Passport is an additional transparency tool. Users should
            always apply their own judgment and appropriate caution.
          </p>

          <div className="p-3 rounded-lg bg-zrp-red/5 border border-zrp-red/20 text-sm">
            <strong className="text-zrp-red">
              Think of it as a signal, not a guarantee.
            </strong>
          </div>
        </div>
      ),
    },

    // ============================================================
    // CHARITY & IMPACT
    // ============================================================
    {
      id: "charity-model",
      category: "Charity & Impact",
      question: "How does the 35% charity model work?",
      icon: Heart,
      answer: (
        <div className="space-y-3">
          <p>
            ZRP has stated a commitment to dedicate{" "}
            <strong>35% of platform profits</strong> to charitable causes.
          </p>

          <p>Areas of intended support include:</p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Support for orphans and children in need.</li>
            <li>Education and schools.</li>
            <li>Healthcare and hospitals.</li>
            <li>Climate and environmental relief initiatives.</li>
          </ul>

          <div className="p-3 rounded-lg bg-zrp-red/5 border border-zrp-red/20 text-sm">
            <strong className="text-zrp-red">
              Social impact:
            </strong>{" "}
            the objective is to connect the growth of the platform with
            measurable positive impact.
          </div>
        </div>
      ),
    },

    {
      id: "impact-badge",
      category: "Charity & Impact",
      question: "What is the impact badge on my profile?",
      icon: Heart,
      answer: (
        <div className="space-y-3">
          <p>
            An impact indicator may be used to communicate participation in
            ZRP's broader social-impact ecosystem.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Specific impact calculations and displayed metrics may change as
            the platform's charity reporting system develops.
          </p>
        </div>
      ),
    },

    // ============================================================
    // WEB3 & DIGITAL INFRASTRUCTURE
    // ============================================================
    {
      id: "web3-zrp",
      category: "Web3 & Digital",
      question: "Is ZRP a Web3 platform?",
      icon: Wallet,
      answer: (
        <div className="space-y-3">
          <p>
            ZRP is designed as a modern digital social platform and may
            integrate Web3-compatible technologies where they provide useful
            functionality to users.
          </p>

          <p>
            Web3 infrastructure can include areas such as digital identity,
            blockchain-based payments, wallet connectivity, digital assets,
            decentralised infrastructure, and user-controlled technology.
          </p>

          <p>
            However, users do not need to hold cryptocurrency or operate a
            blockchain wallet simply to use the core ZRP Social experience.
          </p>

          <div className="p-3 rounded-lg bg-zrp-red/5 border border-zrp-red/20 text-sm">
            <strong className="text-zrp-red">
              Important:
            </strong>{" "}
            Web3 features may be introduced, expanded, modified, or discontinued
            independently of the core social-networking functionality.
          </div>
        </div>
      ),
    },

    {
      id: "digital-payments",
      category: "Web3 & Digital",
      question: "Will ZRP support digital or blockchain payments?",
      icon: CreditCard,
      answer: (
        <div className="space-y-3">
          <p>
            ZRP can support modern digital-payment infrastructure where it is
            technically, commercially, and legally appropriate.
          </p>

          <p>
            Future payment options could include traditional payment methods
            and, where supported, blockchain-based payment infrastructure.
          </p>

          <p>
            Availability will depend on the relevant product, jurisdiction,
            payment provider, compliance requirements, and technical
            implementation.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            ZRP does not guarantee that any specific cryptocurrency,
            blockchain, token, or payment network will be supported.
          </p>
        </div>
      ),
    },

    {
      id: "wallets",
      category: "Web3 & Digital",
      question: "Will ZRP support cryptocurrency wallets?",
      icon: Wallet,
      answer: (
        <div className="space-y-3">
          <p>
            Wallet connectivity may be supported for eligible Web3 features.
          </p>

          <p>
            A cryptocurrency wallet is generally a user-controlled system
            used to manage blockchain credentials and digital assets.
          </p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Wallet connection may be optional.</li>
            <li>ZRP will not automatically have access to private keys.</li>
            <li>Users should never share seed phrases or private keys.</li>
            <li>Blockchain transactions can be irreversible.</li>
          </ul>

          <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 text-sm">
            <strong>Security warning:</strong> ZRP will never legitimately ask
            you to send your private key or wallet recovery phrase.
          </div>
        </div>
      ),
    },

    {
      id: "blockchain-transactions",
      category: "Web3 & Digital",
      question: "Are blockchain transactions reversible?",
      icon: Database,
      answer: (
        <div className="space-y-3">
          <p>
            Generally, blockchain transactions are designed to be irreversible
            once confirmed by the relevant network.
          </p>

          <p>
            This means users should carefully verify wallet addresses,
            transaction details, networks, and amounts before confirming a
            blockchain transaction.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            ZRP cannot guarantee recovery of assets sent to an incorrect
            address or through an unsupported network.
          </p>
        </div>
      ),
    },

    {
      id: "crypto-risk",
      category: "Web3 & Digital",
      question: "Does ZRP provide cryptocurrency investment advice?",
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            No. Information concerning blockchain technology, digital assets,
            tokens, or cryptocurrencies should not be interpreted as financial,
            investment, legal, or tax advice.
          </p>

          <p>
            Digital assets can be highly volatile and may involve substantial
            financial risk.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Always perform your own research and seek qualified professional
            advice where appropriate.
          </p>
        </div>
      ),
    },

    {
      id: "digital-identity",
      category: "Web3 & Digital",
      question: "Could ZRP support decentralised identity?",
      icon: Globe,
      answer: (
        <div className="space-y-3">
          <p>
            Decentralised identity technologies may provide new ways for users
            to control digital credentials and verify information without
            relying exclusively on traditional identity systems.
          </p>

          <p>
            ZRP may evaluate such technologies where they improve privacy,
            security, authenticity, or user control.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Any future identity system would remain subject to applicable
            privacy, security, and legal requirements.
          </p>
        </div>
      ),
    },

    {
      id: "zrp-token",
      category: "Web3 & Digital",
      question: "Does using ZRP Social require a ZRP token?",
      icon: Zap,
      answer: (
        <div className="space-y-3">
          <p>
            No. Core ZRP Social functionality does not require users to own
            cryptocurrency or a token.
          </p>

          <p>
            If ZRP introduces token-based or blockchain-enabled products in the
            future, those products may have their own terms, eligibility
            requirements, risks, and technical requirements.
          </p>

          <div className="p-3 rounded-lg bg-zrp-red/5 border border-zrp-red/20 text-sm">
            <strong className="text-zrp-red">
              Never send funds:
            </strong>{" "}
            Always verify official ZRP announcements before interacting with
            any token, wallet, or blockchain address claiming to represent ZRP.
          </div>
        </div>
      ),
    },

    // ============================================================
    // ADMINISTRATION
    // ============================================================
    {
      id: "admin-roles",
      category: "Administration",
      question: "What are the different user roles?",
      icon: Users,
      answer: (
        <div className="space-y-3">
          <p>
            ZRP may use different roles to operate and moderate the platform.
          </p>

          <p>
            <strong>User</strong> – standard platform account.
          </p>

          <p>
            <strong>Moderator</strong> – authorised personnel who may review
            reports and enforce applicable platform rules.
          </p>

          <p>
            <strong>Admin</strong> – authorised personnel with broader
            administrative capabilities.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Administrative permissions are restricted according to internal
            access-control policies.
          </p>
        </div>
      ),
    },

    {
      id: "verified-badge",
      category: "Administration",
      question: "What do the verified badges mean?",
      icon: CheckCircle,
      answer: (
        <div className="space-y-3">
          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <VerifiedBadge badgeType="verified" />
              <span>
                <strong>Verified</strong> – indicates an account that has
                received the applicable verification status.
              </span>
            </li>

            <li className="flex items-center gap-3">
              <VerifiedBadge badgeType="organization" />
              <span>
                <strong>Organization</strong> – indicates an official
                organisation or company account.
              </span>
            </li>

            <li className="flex items-center gap-3">
              <VerifiedBadge badgeType="government" />
              <span>
                <strong>Government</strong> – indicates an official government
                account.
              </span>
            </li>

            <li className="flex items-center gap-3">
              <VerifiedBadge badgeType="team" />
              <span>
                <strong>ZRP Team</strong> – indicates an official ZRP account.
              </span>
            </li>
          </ul>

          <div className="p-3 rounded-lg bg-zrp-red/5 border border-zrp-red/20 text-sm">
            <strong className="text-zrp-red">
              Verification ≠ Trust Passport:
            </strong>{" "}
            A verification badge is one possible trust signal. The ZRP Trust
            Passport combines multiple account and community signals into a
            separate transparency system.
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Verification does not necessarily represent endorsement of an
            account's opinions or content.
          </p>
        </div>
      ),
    },

    {
      id: "enterprise-plan",
      category: "Administration",
      question: "What is the Enterprise plan?",
      icon: Crown,
      answer: (
        <div className="space-y-3">
          <p>
            Enterprise services are designed for larger organisations,
            institutions, teams, and professional use cases.
          </p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Advanced organisational features.</li>
            <li>Higher usage limits where applicable.</li>
            <li>Advanced analytics and administration.</li>
            <li>Potential API and integration access.</li>
            <li>Priority support options.</li>
            <li>Custom commercial arrangements where available.</li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enterprise availability and pricing may vary.
          </p>
        </div>
      ),
    },

    // ============================================================
    // SUPPORT & TICKETS
    // ============================================================
    {
      id: "support-tickets",
      category: "Support & Tickets",
      question: "How do I submit a support ticket?",
      icon: Ticket,
      answer: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              Open the{" "}
              <Link
                href="/support"
                className="text-zrp-red hover:underline"
              >
                Support
              </Link>{" "}
              page.
            </li>
            <li>Choose the appropriate category.</li>
            <li>Enter a clear subject.</li>
            <li>Describe the issue in detail.</li>
            <li>Submit the ticket.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Providing screenshots, error messages, timestamps, and relevant
            account information can help support resolve technical problems
            faster.
          </p>
        </div>
      ),
    },

    {
      id: "track-support-tickets",
      category: "Support & Tickets",
      question: "How do I track my support tickets?",
      icon: MessageSquare,
      answer: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              Open{" "}
              <Link
                href="/support/tickets"
                className="text-zrp-red hover:underline"
              >
                My Tickets
              </Link>
              .
            </li>
            <li>Review your existing support requests.</li>
            <li>Open a ticket to view its conversation.</li>
            <li>Reply when additional information is requested.</li>
          </ol>
        </div>
      ),
    },

    {
      id: "admin-ticket-management",
      category: "Support & Tickets",
      question: "How do admins manage support tickets?",
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            Authorised administrators can manage support requests through the
            administrative support interface.
          </p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Review incoming tickets.</li>
            <li>Filter tickets by status or priority.</li>
            <li>Assign tickets to authorised staff.</li>
            <li>Respond to users.</li>
            <li>Update ticket status.</li>
            <li>Resolve or close completed requests.</li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Administrative interfaces are restricted to authorised personnel.
          </p>
        </div>
      ),
    },

    {
      id: "ticket-statuses",
      category: "Support & Tickets",
      question: "What do support ticket statuses mean?",
      icon: CheckCircle,
      answer: (
        <div className="space-y-3">
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>
              <strong className="text-zrp-red">OPEN</strong> – request has
              been submitted and requires attention.
            </li>

            <li>
              <strong className="text-blue-500">
                IN_PROGRESS
              </strong>{" "}
              – the support team is working on the request.
            </li>

            <li>
              <strong className="text-yellow-500">
                AWAITING_REPLY
              </strong>{" "}
              – additional information or a response is required.
            </li>

            <li>
              <strong className="text-green-500">
                RESOLVED
              </strong>{" "}
              – the issue has been addressed.
            </li>

            <li>
              <strong className="text-gray-500">
                CLOSED
              </strong>{" "}
              – the ticket has been closed.
            </li>
          </ul>
        </div>
      ),
    },

    // ============================================================
    // LEGAL & ACCOUNT
    // ============================================================
    {
      id: "terms",
      category: "Legal & Account",
      question: "Where can I read the ZRP Terms of Service?",
      icon: FileText,
      answer: (
        <div className="space-y-3">
          <p>
            The complete rules governing your use of ZRP Social are available
            in our{" "}
            <Link
              href="/terms"
              className="text-zrp-red hover:underline"
            >
              Terms of Service
            </Link>
            .
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            By using ZRP Social, you agree to comply with the applicable terms,
            policies, and community rules.
          </p>
        </div>
      ),
    },

    {
      id: "community-guidelines",
      category: "Legal & Account",
      question: "Where can I read the Community Guidelines?",
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            Our Community Guidelines explain the types of behaviour and content
            permitted on ZRP Social.
          </p>

          <p>
            You can review the current guidelines through the platform's
            Community Guidelines page.
          </p>
        </div>
      ),
    },

    {
      id: "account-suspension",
      category: "Legal & Account",
      question: "Why might my account be suspended?",
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            Accounts may be restricted or suspended when necessary to enforce
            the Terms of Service, Community Guidelines, security requirements,
            or applicable law.
          </p>

          <p>Examples may include:</p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Serious or repeated policy violations.</li>
            <li>Fraudulent or deceptive activity.</li>
            <li>Platform abuse or automated abuse.</li>
            <li>Threats or illegal activity.</li>
            <li>Compromised-account or security concerns.</li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Where applicable, users may have access to an appeal process.
          </p>
        </div>
      ),
    },

    {
      id: "appeal-moderation",
      category: "Legal & Account",
      question: "Can I appeal a moderation decision?",
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            Where an appeal process is available, users may challenge certain
            moderation decisions.
          </p>

          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Review the moderation notification.</li>
            <li>Follow the appeal instructions provided.</li>
            <li>Explain why you believe the decision should be reviewed.</li>
            <li>Provide relevant context or evidence.</li>
            <li>Submit the appeal for review.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Appeals are reviewed according to applicable policies and
            operational procedures.
          </p>
        </div>
      ),
    },
  ];

  // ============================================================
  // GROUP FAQS BY CATEGORY
  // ============================================================
  const groupedFaqs = faqs.reduce(
    (acc, faq) => {
      if (!acc[faq.category]) {
        acc[faq.category] = [];
      }

      acc[faq.category].push(faq);

      return acc;
    },
    {} as Record<string, FaqItem[]>
  );

  const categoryCount = Object.keys(groupedFaqs).length;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6">
      {/* ========================================================
          HEADER
      ======================================================== */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zrp-red/10 text-zrp-red mb-4">
          <HelpCircle className="w-8 h-8" />
        </div>

        <p className="text-xs uppercase tracking-[0.25em] text-zrp-red font-semibold mb-2">
          ZRP SOCIAL
        </p>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-white">
          {t("faq.pageTitle")}
        </h1>

        <p className="mt-3 text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
          {t("faq.pageSubtitle")}
        </p>

        <div className="flex flex-wrap justify-center gap-2 mt-5">
          <span className="px-3 py-1 rounded-full text-xs bg-zrp-red/10 text-zrp-red border border-zrp-red/20">
            {faqs.length} {t("faq.questionsCount")}
          </span>

          <span className="px-3 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
            {categoryCount} {t("faq.categoriesCount")}
          </span>

          <span className="px-3 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
            {t("faq.swissPlatform")}
          </span>
        </div>
      </div>

      {/* ========================================================
          QUICK LINKS
      ======================================================== */}
      <div className="mb-10">
        <div className="flex flex-wrap justify-center gap-2">
          {Object.keys(groupedFaqs).map((category) => (
            <a
              key={category}
              href={`#category-${category
                .replace(/\s+/g, "-")
                .replace(/&/g, "and")
                .toLowerCase()}`}
              className="px-3 py-1.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-zrp-red hover:text-white hover:border-zrp-red transition"
            >
              {categoryLabel(category)}
            </a>
          ))}
        </div>
      </div>

      {/* ========================================================
          FAQ LIST
      ======================================================== */}
      <div className="space-y-10">
        {Object.entries(groupedFaqs).map(([category, items]) => {
          const categoryId = `category-${category
            .replace(/\s+/g, "-")
            .replace(/&/g, "and")
            .toLowerCase()}`;

          return (
            <section key={category} id={categoryId}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />

                <h2 className="text-sm sm:text-base font-semibold uppercase tracking-wider text-gray-900 dark:text-white whitespace-nowrap">
                  {categoryLabel(category)}
                </h2>

                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
              </div>

              <div className="space-y-3">
                {items.map((faq) => {
                  const isOpen = openId === faq.id;
                  const Icon = faq.icon || HelpCircle;

                  return (
                    <div
                      key={faq.id}
                      className={`border rounded-xl overflow-hidden transition ${
                        isOpen
                          ? "border-zrp-red/40 shadow-sm"
                          : "border-gray-200 dark:border-gray-700"
                      } bg-white dark:bg-zrp-deepBlack`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleFaq(faq.id)}
                        aria-expanded={isOpen}
                        aria-controls={`faq-answer-${faq.id}`}
                        className="w-full flex items-start gap-3 p-4 sm:p-5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/70 transition"
                      >
                        <div
                          className={`flex-shrink-0 mt-0.5 ${
                            isOpen
                              ? "text-zrp-red"
                              : "text-gray-400 dark:text-gray-500"
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {faq.question}
                          </span>
                        </div>

                        <div className="flex-shrink-0 mt-0.5">
                          {isOpen ? (
                            <ChevronUp className="w-5 h-5 text-zrp-red" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </button>

                      {isOpen && (
                        <div
                          id={`faq-answer-${faq.id}`}
                          className="px-4 sm:px-5 pb-5 pt-0 text-gray-700 dark:text-gray-300 text-sm"
                        >
                          <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
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

      {/* ========================================================
          LEGAL LINKS
      ======================================================== */}
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/terms"
          className="group p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zrp-deepBlack hover:border-zrp-red/40 transition"
        >
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-zrp-red" />

            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {t("faq.legalTermsTitle")}
              </h3>

              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t("faq.legalTermsDesc")}
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/privacy"
          className="group p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zrp-deepBlack hover:border-zrp-red/40 transition"
        >
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-zrp-red" />

            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {t("faq.legalPrivacyTitle")}
              </h3>

              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t("faq.legalPrivacyDesc")}
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* ========================================================
          SUPPORT CTA
      ======================================================== */}
      <div className="mt-10 p-6 sm:p-8 bg-gradient-to-br from-zrp-red/10 via-gray-50 to-gray-50 dark:from-zrp-red/10 dark:via-gray-800 dark:to-gray-800 rounded-2xl text-center border border-zrp-red/20">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zrp-red/10 text-zrp-red mb-3">
          <MessageSquare className="w-6 h-6" />
        </div>

        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          {t("faq.ctaTitle")}
        </h3>

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-lg mx-auto">
          {t("faq.ctaDesc")}
        </p>

        <div className="flex flex-wrap justify-center gap-3 mt-5">
          <Link
            href="/support"
            className="px-5 py-2.5 bg-zrp-red text-white rounded-full text-sm font-medium hover:bg-zrp-darkRed transition"
          >
            {t("faq.ctaSubmitTicket")}
          </Link>

          <Link
            href="/about"
            className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            {t("faq.ctaAboutZrp")}
          </Link>
        </div>
      </div>

      {/* ========================================================
          FOOTER NOTE
      ======================================================== */}
      <div className="mt-8 text-center">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {t("faq.footerNote")}
        </p>
      </div>
    </div>
  );
}
