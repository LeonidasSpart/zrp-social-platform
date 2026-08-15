"use client";

import Link from "next/link";
import { useState } from "react";
import VerifiedBadge from "@/components/VerifiedBadge";

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
} from "lucide-react";

interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string | React.ReactNode;
  icon?: React.ElementType;
}

export default function FAQPage() {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggleFaq = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  const faqs: FaqItem[] = [
    // ============================================================
    // GETTING STARTED
    // ============================================================
    {
      id: "what-is-zrp",
      category: "Getting Started",
      question: "What is ZRP Social?",
      icon: HelpCircle,
      answer: (
        <div className="space-y-3">
          <p>
            <strong>ZRP Social</strong> is a Swiss-based social platform built
            around freedom of expression, privacy, digital independence,
            community, and social impact.
          </p>

          <p>
            ZRP is designed to give individuals, creators, organisations,
            businesses, and communities a modern platform for communication,
            publishing, networking, and digital interaction.
          </p>

          <p>
            The platform is built with a strong focus on privacy, security,
            transparent moderation, and user ownership of content.
          </p>

          <div className="p-3 rounded-lg bg-zrp-red/5 border border-zrp-red/20 text-sm">
            <strong className="text-zrp-red">ZRP principle:</strong>{" "}
            open conversation, responsible technology, privacy, and meaningful
            social impact.
          </div>
        </div>
      ),
    },

    {
      id: "how-to-register",
      category: "Getting Started",
      question: "How do I register an account?",
      icon: UserPlus,
      answer: (
        <div className="space-y-3">
          <p>Creating a ZRP Social account is quick and free.</p>

          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              Go to the{" "}
              <Link
                href="/signup"
                className="text-zrp-red hover:underline"
              >
                Sign Up
              </Link>{" "}
              page.
            </li>
            <li>Enter the requested account information.</li>
            <li>Create a secure password.</li>
            <li>Accept the Terms of Service and Privacy Policy.</li>
            <li>Complete email verification if requested.</li>
            <li>Complete your profile and onboarding.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            🔐 Use a unique password that you do not use on other services.
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
        <div className="space-y-3">
          <p>To access your ZRP Social account:</p>

          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              Go to the{" "}
              <Link
                href="/login"
                className="text-zrp-red hover:underline"
              >
                Login
              </Link>{" "}
              page.
            </li>
            <li>Enter your registered email address.</li>
            <li>Enter your password.</li>
            <li>Click or tap Sign In.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            If you cannot remember your password, use the password recovery
            option on the login page.
          </p>
        </div>
      ),
    },

    {
      id: "password-reset",
      category: "Getting Started",
      question: "How do I reset my password?",
      icon: Key,
      answer: (
        <div className="space-y-3">
          <p>To reset your password:</p>

          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              Open the{" "}
              <Link
                href="/login"
                className="text-zrp-red hover:underline"
              >
                Login
              </Link>{" "}
              page.
            </li>
            <li>Select Forgot Password.</li>
            <li>Enter the email associated with your account.</li>
            <li>Check your inbox for the recovery email.</li>
            <li>Follow the secure reset link.</li>
            <li>Create a new password.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            ⏳ Password reset links may expire for security reasons.
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
      question: "What are the avatar requirements?",
      icon: Image,
      answer: (
        <div className="space-y-3">
          <p>
            For the best profile image quality, we recommend:
          </p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>
              <strong>Maximum file size:</strong> 2 MB
            </li>
            <li>
              <strong>Supported formats:</strong> JPEG, PNG, GIF, WebP
            </li>
            <li>
              <strong>Recommended resolution:</strong> 400 × 400 px
            </li>
            <li>
              <strong>Recommended ratio:</strong> 1:1
            </li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Your avatar is displayed as a circular image throughout the
            platform.
          </p>
        </div>
      ),
    },

    {
      id: "banner-size",
      category: "Profile & Media",
      question: "What are the banner image requirements?",
      icon: Camera,
      answer: (
        <div className="space-y-3">
          <p>Recommended profile banner specifications:</p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>
              <strong>Maximum file size:</strong> 4 MB
            </li>
            <li>
              <strong>Supported formats:</strong> JPEG, PNG, GIF, WebP
            </li>
            <li>
              <strong>Recommended resolution:</strong> 1200 × 400 px
            </li>
            <li>
              <strong>Recommended ratio:</strong> 3:1
            </li>
          </ul>
        </div>
      ),
    },

    {
      id: "post-image-size",
      category: "Profile & Media",
      question: "What are the post image requirements?",
      icon: Upload,
      answer: (
        <div className="space-y-3">
          <p>For images attached to posts:</p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>
              <strong>Maximum file size:</strong> 4 MB
            </li>
            <li>
              <strong>Supported formats:</strong> JPEG, PNG, GIF, WebP
            </li>
            <li>
              <strong>Recommended resolution:</strong> 1200 × 800 px
            </li>
            <li>
              <strong>Recommended ratio:</strong> 3:2
            </li>
          </ul>
        </div>
      ),
    },

    {
      id: "post-video-size",
      category: "Profile & Media",
      question: "What are the post video requirements?",
      icon: Video,
      answer: (
        <div className="space-y-3">
          <p>Supported video specifications include:</p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>
              <strong>Maximum file size:</strong> 32 MB
            </li>
            <li>
              <strong>Supported formats:</strong> MP4, MOV, AVI, WebM
            </li>
            <li>
              <strong>Recommended resolution:</strong> 1280 × 720 px or higher
            </li>
            <li>
              <strong>Recommended encoding:</strong> H.264
            </li>
            <li>
              <strong>Recommended duration:</strong> 5 minutes or less
            </li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Actual limits may vary depending on your account plan and current
            platform configuration.
          </p>
        </div>
      ),
    },

    {
      id: "chat-image-size",
      category: "Profile & Media",
      question: "What are the chat image requirements?",
      icon: MessageSquare,
      answer: (
        <div className="space-y-3">
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>
              <strong>Maximum file size:</strong> 4 MB
            </li>
            <li>
              <strong>Supported formats:</strong> JPEG, PNG, GIF, WebP
            </li>
            <li>
              <strong>Recommended resolution:</strong> 800 × 800 px
            </li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Images shared through direct messages are handled according to
            the ZRP Privacy Policy.
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
      question: "How do I create a post?",
      icon: FileText,
      answer: (
        <div className="space-y-3">
          <p>To publish a post:</p>

          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Open your home feed.</li>
            <li>Open the post composer.</li>
            <li>Write your message.</li>
            <li>Add hashtags or mentions if desired.</li>
            <li>Optionally attach supported media or a poll.</li>
            <li>Select Post to publish.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Available post limits may depend on your account plan.
          </p>
        </div>
      ),
    },

    {
      id: "how-to-schedule-post",
      category: "Posts & Interactions",
      question: "How do I schedule a post?",
      icon: Clock,
      answer: (
        <div className="space-y-3">
          <p>Scheduling allows eligible accounts to publish content later.</p>

          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Create your post.</li>
            <li>Select the scheduling option.</li>
            <li>Choose the desired date and time.</li>
            <li>Confirm the scheduled publication.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Scheduled posts are subject to account limits and platform
            availability.
          </p>
        </div>
      ),
    },

    {
      id: "how-to-comment",
      category: "Posts & Interactions",
      question: "How do I comment or reply?",
      icon: MessageSquare,
      answer: (
        <div className="space-y-3">
          <p>
            Open a post and select the comment or reply option.
          </p>

          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Open the post.</li>
            <li>Select the comment icon.</li>
            <li>Write your response.</li>
            <li>Select Reply or Post.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            You can manage your own comments in accordance with the platform's
            available controls.
          </p>
        </div>
      ),
    },

    {
      id: "hashtags-mentions",
      category: "Posts & Interactions",
      question: "How do hashtags and mentions work?",
      icon: Users,
      answer: (
        <div className="space-y-3">
          <p>
            <strong>Hashtags</strong> use the # symbol to categorise content.
          </p>

          <p className="text-sm">
            Example:{" "}
            <span className="text-zrp-red font-medium">
              #ZRP
            </span>{" "}
            or{" "}
            <span className="text-zrp-red font-medium">
              #Web3
            </span>
          </p>

          <p>
            <strong>Mentions</strong> use the @ symbol to reference another
            account.
          </p>

          <p className="text-sm">
            Example:{" "}
            <span className="text-zrp-red font-medium">
              @username
            </span>
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Depending on notification settings, mentioned users may receive a
            notification.
          </p>
        </div>
      ),
    },

    {
      id: "how-to-pin-post",
      category: "Posts & Interactions",
      question: "How do I pin a post to my profile?",
      icon: CheckCircle,
      answer: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Open your profile.</li>
            <li>Find the post you want to highlight.</li>
            <li>Select the post options menu.</li>
            <li>Select Pin.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            You can unpin the post later using the same controls.
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
      question: "How do I send a direct message?",
      icon: MessageSquare,
      answer: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Open the user's profile or your messaging area.</li>
            <li>Select Message.</li>
            <li>Write your message.</li>
            <li>Select Send.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Messaging functionality may depend on account settings and
            platform availability.
          </p>
        </div>
      ),
    },

    {
      id: "how-to-call",
      category: "Messaging & Calls",
      question: "How do I make a voice or video call?",
      icon: Phone,
      answer: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Open an eligible direct-message conversation.</li>
            <li>Select the voice or video call button.</li>
            <li>Allow microphone or camera permissions when requested.</li>
            <li>Wait for the recipient to accept the call.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Calls may use browser-based real-time communication technologies
            such as WebRTC.
          </p>
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
            Read receipts provide an indication of whether a message has been
            delivered or viewed.
          </p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>
              <strong>Single check:</strong> message delivered or sent.
            </li>
            <li>
              <strong>Double check:</strong> message has been read, where
              read receipts are supported.
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
      question: "How is my data protected?",
      icon: Lock,
      answer: (
        <div className="space-y-3">
          <p>
            ZRP Social takes privacy and security seriously.
          </p>

          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Encrypted connections using HTTPS/TLS.</li>
            <li>Security controls designed to protect account information.</li>
            <li>Access controls for platform systems.</li>
            <li>Processes for identifying and responding to abuse.</li>
            <li>Account deletion and privacy rights.</li>
          </ul>

          <p>
            For complete information, read our{" "}
            <Link
              href="/privacy"
              className="text-zrp-red hover:underline"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      ),
    },

    {
      id: "how-to-report",
      category: "Privacy & Safety",
      question: "How do I report inappropriate content?",
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Open the post, comment, or relevant content.</li>
            <li>Select the More or reporting menu.</li>
            <li>Select Report.</li>
            <li>Choose the appropriate reason.</li>
            <li>Add additional information if necessary.</li>
            <li>Submit the report.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Reports are reviewed according to applicable policies and
            moderation procedures.
          </p>
        </div>
      ),
    },

    {
      id: "how-to-block",
      category: "Privacy & Safety",
      question: "How do I block a user?",
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Open the user's profile.</li>
            <li>Open the More menu.</li>
            <li>Select Block.</li>
            <li>Confirm the action.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Blocking limits interactions between the accounts according to
            ZRP's current platform controls.
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
        <div className="space-y-3">
          <p>
            You can request permanent deletion of your ZRP Social account.
          </p>

          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              Go to{" "}
              <Link
                href="/settings"
                className="text-zrp-red hover:underline"
              >
                Settings
              </Link>
              .
            </li>
            <li>Open the Account section.</li>
            <li>Select Delete Account.</li>
            <li>Review the warning and confirmation information.</li>
            <li>Confirm the deletion request.</li>
          </ol>

          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-sm">
            <strong>Important:</strong> Account deletion is intended to be
            permanent. Some information may need to be retained where required
            by applicable law or legitimate security obligations.
          </div>

          <p>
            See our{" "}
            <Link
              href="/privacy"
              className="text-zrp-red hover:underline"
            >
              Privacy Policy
            </Link>{" "}
            for more information.
          </p>
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
          Frequently Asked Questions
        </h1>

        <p className="mt-3 text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
          Find answers about ZRP Social, account management, publishing,
          privacy, security, Web3 infrastructure, support, and our social
          impact mission.
        </p>

        <div className="flex flex-wrap justify-center gap-2 mt-5">
          <span className="px-3 py-1 rounded-full text-xs bg-zrp-red/10 text-zrp-red border border-zrp-red/20">
            {faqs.length} Questions
          </span>

          <span className="px-3 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
            {categoryCount} Categories
          </span>

          <span className="px-3 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
            Swiss Platform
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
              {category}
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
                  {category}
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
                Terms of Service
              </h3>

              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Read the rules governing use of ZRP Social.
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
                Privacy Policy
              </h3>

              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Learn how ZRP handles personal data and privacy.
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
          Still have questions?
        </h3>

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-lg mx-auto">
          Our support team can help with account issues, technical problems,
          moderation questions, privacy requests, and other ZRP Social
          enquiries.
        </p>

        <div className="flex flex-wrap justify-center gap-3 mt-5">
          <Link
            href="/support"
            className="px-5 py-2.5 bg-zrp-red text-white rounded-full text-sm font-medium hover:bg-zrp-darkRed transition"
          >
            Submit a Ticket
          </Link>

          <Link
            href="/about"
            className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            About ZRP
          </Link>
        </div>
      </div>

      {/* ========================================================
          FOOTER NOTE
      ======================================================== */}
      <div className="mt-8 text-center">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Information on this page is provided for general guidance. Features,
          limits, pricing, availability, and technical implementations may
          change as ZRP Social evolves.
        </p>
      </div>
    </div>
  );
}
