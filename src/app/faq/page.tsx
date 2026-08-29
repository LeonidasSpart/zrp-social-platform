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
      question: t("faq.whatIsTrustPassport.q"),
      icon: ShieldCheck,
      answer: (
        <div className="space-y-4">
          <p>
            The <strong>{t("faq.whatIsTrustPassport.p1Bold")}</strong> {t("faq.whatIsTrustPassport.p1")}
          </p>

          <p>
            {t("faq.whatIsTrustPassport.p2Prefix")} <strong>{t("faq.whatIsTrustPassport.p2Bold")}</strong> {t("faq.whatIsTrustPassport.p2")}
          </p>

          <div className="p-4 rounded-xl bg-zrp-red/5 border border-zrp-red/20">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-zrp-red flex-shrink-0 mt-0.5" />

              <div>
                <strong className="text-zrp-red">
                  {t("faq.whatIsTrustPassport.calloutBold")}
                </strong>

                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {t("faq.whatIsTrustPassport.calloutText")}
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
      question: t("faq.trustScoreCalc.q"),
      icon: Sparkles,
      answer: (
        <div className="space-y-4">
          <p>
            {t("faq.trustScoreCalc.p1")}
          </p>

          <p>
            {t("faq.trustScoreCalc.p2")}
          </p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>{t("faq.trustScoreCalc.item1")}</li>
            <li>{t("faq.trustScoreCalc.item2")}</li>
            <li>{t("faq.trustScoreCalc.item3")}</li>
            <li>{t("faq.trustScoreCalc.item4")}</li>
            <li>{t("faq.trustScoreCalc.item5")}</li>
            <li>{t("faq.trustScoreCalc.item6")}</li>
            <li>{t("faq.trustScoreCalc.item7")}</li>
            <li>{t("faq.trustScoreCalc.item8")}</li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.trustScoreCalc.note")}
          </p>
        </div>
      ),
    },

    {
      id: "trust-levels",
      category: "ZRP Trust Passport",
      question: t("faq.trustLevels.q"),
      icon: BadgeCheck,
      answer: (
        <div className="space-y-4">
          <p>
            {t("faq.trustLevels.intro")}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <strong className="text-zrp-red">0–34</strong>
              <p className="mt-1 text-sm font-medium">
                {t("faq.trustLevels.level1Name")}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t("faq.trustLevels.level1Desc")}
              </p>
            </div>

            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <strong className="text-zrp-red">35–54</strong>
              <p className="mt-1 text-sm font-medium">
                {t("faq.trustLevels.level2Name")}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t("faq.trustLevels.level2Desc")}
              </p>
            </div>

            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <strong className="text-zrp-red">55–74</strong>
              <p className="mt-1 text-sm font-medium">
                {t("faq.trustLevels.level3Name")}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t("faq.trustLevels.level3Desc")}
              </p>
            </div>

            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <strong className="text-zrp-red">75–89</strong>
              <p className="mt-1 text-sm font-medium">
                {t("faq.trustLevels.level4Name")}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t("faq.trustLevels.level4Desc")}
              </p>
            </div>

            <div className="p-4 rounded-xl border border-zrp-red/30 bg-zrp-red/5 sm:col-span-2">
              <strong className="text-zrp-red">90–100</strong>
              <p className="mt-1 text-sm font-medium">
                {t("faq.trustLevels.level5Name")}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t("faq.trustLevels.level5Desc")}
              </p>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: "trust-score-change",
      category: "ZRP Trust Passport",
      question: t("faq.trustScoreChange.q"),
      icon: Zap,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.trustScoreChange.p1")}
          </p>

          <p>
            {t("faq.trustScoreChange.p2")}
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.trustScoreChange.note")}
          </p>
        </div>
      ),
    },

    {
      id: "trust-score-not-popularity",
      category: "ZRP Trust Passport",
      question: t("faq.trustNotPopularity.q"),
      icon: Heart,
      answer: (
        <div className="space-y-3">
          <p>
            <strong>{t("faq.trustNotPopularity.noBold")}</strong> {t("faq.trustNotPopularity.p1")}
          </p>

          <p>
            {t("faq.trustNotPopularity.p2")}
          </p>

          <p>
            {t("faq.trustNotPopularity.p3")}
          </p>
        </div>
      ),
    },

    {
      id: "trust-score-not-identity",
      category: "ZRP Trust Passport",
      question: t("faq.trustNotIdentity.q"),
      icon: Lock,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.trustNotIdentity.p1Prefix")} <strong>{t("faq.trustNotIdentity.p1Bold")}</strong> {t("faq.trustNotIdentity.p1Suffix")}
          </p>

          <p>
            {t("faq.trustNotIdentity.p2")}
          </p>

          <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 text-sm">
            <strong>{t("faq.trustNotIdentity.warningBold")}</strong> {t("faq.trustNotIdentity.warningText")}
          </div>
        </div>
      ),
    },

    {
      id: "trust-passport-private-data",
      category: "ZRP Trust Passport",
      question: t("faq.trustPrivateData.q"),
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.trustPrivateData.p1")}
          </p>

          <p>{t("faq.trustPrivateData.p2")}</p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>{t("faq.trustPrivateData.item1")}</li>
            <li>{t("faq.trustPrivateData.item2")}</li>
            <li>{t("faq.trustPrivateData.item3")}</li>
            <li>{t("faq.trustPrivateData.item4")}</li>
            <li>{t("faq.trustPrivateData.item5")}</li>
            <li>{t("faq.trustPrivateData.item6")}</li>
            <li>{t("faq.trustPrivateData.item7")}</li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.trustPrivateData.note")}
          </p>
        </div>
      ),
    },

    {
      id: "trust-passport-location",
      category: "ZRP Trust Passport",
      question: t("faq.trustLocation.q"),
      icon: Eye,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.trustLocation.p1Prefix")}{" "}
            <strong>{t("faq.trustLocation.p1Bold")}</strong>.
          </p>

          <p>
            {t("faq.trustLocation.p2")}
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.trustLocation.note")}
          </p>
        </div>
      ),
    },

    {
      id: "trust-passport-verification",
      category: "ZRP Trust Passport",
      question: t("faq.trustVerification.q"),
      icon: BadgeCheck,
      answer: (
        <div className="space-y-4">
          <p>
            {t("faq.trustVerification.p1")}
          </p>

          <p>
            {t("faq.trustVerification.p2Prefix")} <strong>{t("faq.trustVerification.p2Bold")}</strong>.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <VerifiedBadge badgeType="verified" />

              <h3 className="mt-3 font-semibold">
                {t("faq.trustVerification.verifCardTitle")}
              </h3>

              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t("faq.trustVerification.verifCardDesc")}
              </p>
            </div>

            <div className="p-4 rounded-xl border border-zrp-red/20 bg-zrp-red/5">
              <ShieldCheck className="w-5 h-5 text-zrp-red" />

              <h3 className="mt-3 font-semibold">
                {t("faq.trustVerification.passportCardTitle")}
              </h3>

              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t("faq.trustVerification.passportCardDesc")}
              </p>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: "trust-passport-not-moderation",
      category: "ZRP Trust Passport",
      question: t("faq.trustNotModeration.q"),
      icon: ShieldCheck,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.trustNotModeration.p1")}
          </p>

          <p>
            {t("faq.trustNotModeration.p2")}
          </p>

          <p>
            {t("faq.trustNotModeration.p3")}
          </p>
        </div>
      ),
    },

    {
      id: "trust-passport-guarantee",
      category: "ZRP Trust Passport",
      question: t("faq.trustGuarantee.q"),
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.trustGuarantee.p1")}
          </p>

          <p>
            {t("faq.trustGuarantee.p2")}
          </p>

          <div className="p-3 rounded-lg bg-zrp-red/5 border border-zrp-red/20 text-sm">
            <strong className="text-zrp-red">
              {t("faq.trustGuarantee.calloutText")}
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
      question: t("faq.charityModel.q"),
      icon: Heart,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.charityModel.p1Prefix")}{" "}
            <strong>{t("faq.charityModel.p1Bold")}</strong> {t("faq.charityModel.p1Suffix")}
          </p>

          <p>{t("faq.charityModel.p2")}</p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>{t("faq.charityModel.item1")}</li>
            <li>{t("faq.charityModel.item2")}</li>
            <li>{t("faq.charityModel.item3")}</li>
            <li>{t("faq.charityModel.item4")}</li>
          </ul>

          <div className="p-3 rounded-lg bg-zrp-red/5 border border-zrp-red/20 text-sm">
            <strong className="text-zrp-red">
              {t("faq.charityModel.calloutBold")}
            </strong>{" "}
            {t("faq.charityModel.calloutText")}
          </div>
        </div>
      ),
    },

    {
      id: "impact-badge",
      category: "Charity & Impact",
      question: t("faq.impactBadge.q"),
      icon: Heart,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.impactBadge.p1")}
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.impactBadge.note")}
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
      question: t("faq.web3Zrp.q"),
      icon: Wallet,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.web3Zrp.p1")}
          </p>

          <p>
            {t("faq.web3Zrp.p2")}
          </p>

          <p>
            {t("faq.web3Zrp.p3")}
          </p>

          <div className="p-3 rounded-lg bg-zrp-red/5 border border-zrp-red/20 text-sm">
            <strong className="text-zrp-red">
              {t("faq.web3Zrp.calloutBold")}
            </strong>{" "}
            {t("faq.web3Zrp.calloutText")}
          </div>
        </div>
      ),
    },

    {
      id: "digital-payments",
      category: "Web3 & Digital",
      question: t("faq.digitalPayments.q"),
      icon: CreditCard,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.digitalPayments.p1")}
          </p>

          <p>
            {t("faq.digitalPayments.p2")}
          </p>

          <p>
            {t("faq.digitalPayments.p3")}
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.digitalPayments.note")}
          </p>
        </div>
      ),
    },

    {
      id: "wallets",
      category: "Web3 & Digital",
      question: t("faq.wallets.q"),
      icon: Wallet,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.wallets.p1")}
          </p>

          <p>
            {t("faq.wallets.p2")}
          </p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>{t("faq.wallets.item1")}</li>
            <li>{t("faq.wallets.item2")}</li>
            <li>{t("faq.wallets.item3")}</li>
            <li>{t("faq.wallets.item4")}</li>
          </ul>

          <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 text-sm">
            <strong>{t("faq.wallets.warningBold")}</strong> {t("faq.wallets.warningText")}
          </div>
        </div>
      ),
    },

    {
      id: "blockchain-transactions",
      category: "Web3 & Digital",
      question: t("faq.blockchainTx.q"),
      icon: Database,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.blockchainTx.p1")}
          </p>

          <p>
            {t("faq.blockchainTx.p2")}
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.blockchainTx.note")}
          </p>
        </div>
      ),
    },

    {
      id: "crypto-risk",
      category: "Web3 & Digital",
      question: t("faq.cryptoRisk.q"),
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.cryptoRisk.p1")}
          </p>

          <p>
            {t("faq.cryptoRisk.p2")}
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.cryptoRisk.note")}
          </p>
        </div>
      ),
    },

    {
      id: "digital-identity",
      category: "Web3 & Digital",
      question: t("faq.digitalIdentity.q"),
      icon: Globe,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.digitalIdentity.p1")}
          </p>

          <p>
            {t("faq.digitalIdentity.p2")}
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.digitalIdentity.note")}
          </p>
        </div>
      ),
    },

    {
      id: "zrp-token",
      category: "Web3 & Digital",
      question: t("faq.zrpToken.q"),
      icon: Zap,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.zrpToken.p1")}
          </p>

          <p>
            {t("faq.zrpToken.p2")}
          </p>

          <div className="p-3 rounded-lg bg-zrp-red/5 border border-zrp-red/20 text-sm">
            <strong className="text-zrp-red">
              {t("faq.zrpToken.calloutBold")}
            </strong>{" "}
            {t("faq.zrpToken.calloutText")}
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
      question: t("faq.adminRoles.q"),
      icon: Users,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.adminRoles.p1")}
          </p>

          <p>
            <strong>{t("faq.adminRoles.userLabel")}</strong> – {t("faq.adminRoles.userDesc")}
          </p>

          <p>
            <strong>{t("faq.adminRoles.modLabel")}</strong> – {t("faq.adminRoles.modDesc")}
          </p>

          <p>
            <strong>{t("faq.adminRoles.adminLabel")}</strong> – {t("faq.adminRoles.adminDesc")}
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.adminRoles.note")}
          </p>
        </div>
      ),
    },

    {
      id: "verified-badge",
      category: "Administration",
      question: t("faq.verifiedBadge.q"),
      icon: CheckCircle,
      answer: (
        <div className="space-y-3">
          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <VerifiedBadge badgeType="verified" />
              <span>
                <strong>{t("faq.verifiedBadge.verifiedLabel")}</strong> – {t("faq.verifiedBadge.verifiedDesc")}
              </span>
            </li>

            <li className="flex items-center gap-3">
              <VerifiedBadge badgeType="organization" />
              <span>
                <strong>{t("faq.verifiedBadge.orgLabel")}</strong> – {t("faq.verifiedBadge.orgDesc")}
              </span>
            </li>

            <li className="flex items-center gap-3">
              <VerifiedBadge badgeType="government" />
              <span>
                <strong>{t("faq.verifiedBadge.govLabel")}</strong> – {t("faq.verifiedBadge.govDesc")}
              </span>
            </li>

            <li className="flex items-center gap-3">
              <VerifiedBadge badgeType="team" />
              <span>
                <strong>{t("faq.verifiedBadge.teamLabel")}</strong> – {t("faq.verifiedBadge.teamDesc")}
              </span>
            </li>
          </ul>

          <div className="p-3 rounded-lg bg-zrp-red/5 border border-zrp-red/20 text-sm">
            <strong className="text-zrp-red">
              {t("faq.verifiedBadge.calloutBold")}
            </strong>{" "}
            {t("faq.verifiedBadge.calloutText")}
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.verifiedBadge.note")}
          </p>
        </div>
      ),
    },

    {
      id: "enterprise-plan",
      category: "Administration",
      question: t("faq.enterprisePlan.q"),
      icon: Crown,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.enterprisePlan.p1")}
          </p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>{t("faq.enterprisePlan.item1")}</li>
            <li>{t("faq.enterprisePlan.item2")}</li>
            <li>{t("faq.enterprisePlan.item3")}</li>
            <li>{t("faq.enterprisePlan.item4")}</li>
            <li>{t("faq.enterprisePlan.item5")}</li>
            <li>{t("faq.enterprisePlan.item6")}</li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.enterprisePlan.note")}
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
      question: t("faq.supportTickets.q"),
      icon: Ticket,
      answer: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              {t("faq.supportTickets.step1Prefix")}{" "}
              <Link
                href="/support"
                className="text-zrp-red hover:underline"
              >
                {t("faq.supportTickets.step1Link")}
              </Link>{" "}
              {t("faq.supportTickets.step1Suffix")}
            </li>
            <li>{t("faq.supportTickets.step2")}</li>
            <li>{t("faq.supportTickets.step3")}</li>
            <li>{t("faq.supportTickets.step4")}</li>
            <li>{t("faq.supportTickets.step5")}</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.supportTickets.note")}
          </p>
        </div>
      ),
    },

    {
      id: "track-support-tickets",
      category: "Support & Tickets",
      question: t("faq.trackTickets.q"),
      icon: MessageSquare,
      answer: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              {t("faq.trackTickets.step1Prefix")}{" "}
              <Link
                href="/support/tickets"
                className="text-zrp-red hover:underline"
              >
                {t("faq.trackTickets.step1Link")}
              </Link>
              .
            </li>
            <li>{t("faq.trackTickets.step2")}</li>
            <li>{t("faq.trackTickets.step3")}</li>
            <li>{t("faq.trackTickets.step4")}</li>
          </ol>
        </div>
      ),
    },

    {
      id: "admin-ticket-management",
      category: "Support & Tickets",
      question: t("faq.adminTicketMgmt.q"),
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.adminTicketMgmt.p1")}
          </p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>{t("faq.adminTicketMgmt.item1")}</li>
            <li>{t("faq.adminTicketMgmt.item2")}</li>
            <li>{t("faq.adminTicketMgmt.item3")}</li>
            <li>{t("faq.adminTicketMgmt.item4")}</li>
            <li>{t("faq.adminTicketMgmt.item5")}</li>
            <li>{t("faq.adminTicketMgmt.item6")}</li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.adminTicketMgmt.note")}
          </p>
        </div>
      ),
    },

    {
      id: "ticket-statuses",
      category: "Support & Tickets",
      question: t("faq.ticketStatuses.q"),
      icon: CheckCircle,
      answer: (
        <div className="space-y-3">
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>
              <strong className="text-zrp-red">OPEN</strong> – {t("faq.ticketStatuses.openDesc")}
            </li>

            <li>
              <strong className="text-blue-500">
                IN_PROGRESS
              </strong>{" "}
              – {t("faq.ticketStatuses.inProgressDesc")}
            </li>

            <li>
              <strong className="text-yellow-500">
                AWAITING_REPLY
              </strong>{" "}
              – {t("faq.ticketStatuses.awaitingReplyDesc")}
            </li>

            <li>
              <strong className="text-green-500">
                RESOLVED
              </strong>{" "}
              – {t("faq.ticketStatuses.resolvedDesc")}
            </li>

            <li>
              <strong className="text-gray-500">
                CLOSED
              </strong>{" "}
              – {t("faq.ticketStatuses.closedDesc")}
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
      question: t("faq.termsFaq.q"),
      icon: FileText,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.termsFaq.p1Prefix")}{" "}
            <Link
              href="/terms"
              className="text-zrp-red hover:underline"
            >
              {t("faq.termsFaq.p1Link")}
            </Link>
            .
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.termsFaq.note")}
          </p>
        </div>
      ),
    },

    {
      id: "community-guidelines",
      category: "Legal & Account",
      question: t("faq.communityGuidelines.q"),
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.communityGuidelines.p1")}
          </p>

          <p>
            {t("faq.communityGuidelines.p2")}
          </p>
        </div>
      ),
    },

    {
      id: "account-suspension",
      category: "Legal & Account",
      question: t("faq.accountSuspension.q"),
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.accountSuspension.p1")}
          </p>

          <p>{t("faq.accountSuspension.p2")}</p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>{t("faq.accountSuspension.item1")}</li>
            <li>{t("faq.accountSuspension.item2")}</li>
            <li>{t("faq.accountSuspension.item3")}</li>
            <li>{t("faq.accountSuspension.item4")}</li>
            <li>{t("faq.accountSuspension.item5")}</li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.accountSuspension.note")}
          </p>
        </div>
      ),
    },

    {
      id: "appeal-moderation",
      category: "Legal & Account",
      question: t("faq.appealModeration.q"),
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            {t("faq.appealModeration.p1")}
          </p>

          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>{t("faq.appealModeration.step1")}</li>
            <li>{t("faq.appealModeration.step2")}</li>
            <li>{t("faq.appealModeration.step3")}</li>
            <li>{t("faq.appealModeration.step4")}</li>
            <li>{t("faq.appealModeration.step5")}</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("faq.appealModeration.note")}
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
