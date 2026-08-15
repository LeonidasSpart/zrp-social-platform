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
  Image as ImageIcon,
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
  CircleHelp,
  Wallet,
  Globe,
  CreditCard,
  Zap,
  Scale,
  Server,
  Database,
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
    /* ================================================================
       GETTING STARTED
    ================================================================ */

    {
      id: "what-is-zrp",
      category: "Getting Started",
      question: "What is ZRP Social?",
      icon: HelpCircle,
      answer: (
        <div className="space-y-3">
          <p>
            ZRP Social is a Swiss-based social platform designed around
            <strong> freedom of expression</strong>, <strong>privacy</strong>,
            security, and community.
          </p>

          <p>
            The platform provides tools for individuals, creators,
            organisations, businesses, and communities to communicate,
            publish content, build audiences, and connect with other users.
          </p>

          <p>
            ZRP is designed with a strong focus on European values,
            responsible technology, user control, and transparent platform
            policies.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            🧡 ZRP is built to give people a place to connect, communicate,
            and create.
          </p>
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
          <p>Creating a ZRP Social account is simple:</p>

          <ol className="list-decimal list-inside space-y-1 text-sm">
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
            <li>Enter your registration information.</li>
            <li>Choose a username and password.</li>
            <li>Create your account.</li>
            <li>Verify your email address if verification is requested.</li>
            <li>Complete your profile and onboarding.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            🔐 Never share your password or verification codes with another
            person.
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
          <p>To access your account:</p>

          <ol className="list-decimal list-inside space-y-1 text-sm">
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
            <li>Enter your registered email address.</li>
            <li>Enter your password.</li>
            <li>Select Sign In.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            If you cannot access your account, use the password recovery
            option.
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

          <ol className="list-decimal list-inside space-y-1 text-sm">
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
            <li>Select <strong>Forgot password?</strong></li>
            <li>Enter the email address associated with your account.</li>
            <li>Check your email for the password reset instructions.</li>
            <li>Create a new secure password.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            ⏳ Password reset links may expire for security reasons.
          </p>
        </div>
      ),
    },

    /* ================================================================
       PROFILE & MEDIA
    ================================================================ */

    {
      id: "avatar-size",
      category: "Profile & Media",
      question: "What are the avatar requirements?",
      icon: ImageIcon,
      answer: (
        <div className="space-y-3">
          <p>
            <strong>Recommended avatar specifications:</strong>
          </p>

          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              <strong>Maximum file size:</strong> 2 MB
            </li>
            <li>
              <strong>Formats:</strong> JPEG, PNG, GIF, WebP
            </li>
            <li>
              <strong>Recommended resolution:</strong> 400×400 px
            </li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            💡 A square, high-quality image normally produces the best
            result.
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
          <p>
            <strong>Recommended banner specifications:</strong>
          </p>

          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              <strong>Maximum file size:</strong> 4 MB
            </li>
            <li>
              <strong>Formats:</strong> JPEG, PNG, GIF, WebP
            </li>
            <li>
              <strong>Recommended resolution:</strong> 1200×400 px
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
          <p>
            <strong>Recommended post image specifications:</strong>
          </p>

          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              <strong>Maximum file size:</strong> 4 MB
            </li>
            <li>
              <strong>Formats:</strong> JPEG, PNG, GIF, WebP
            </li>
            <li>
              <strong>Recommended resolution:</strong> 1200×800 px
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
          <p>
            <strong>Recommended video specifications:</strong>
          </p>

          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              <strong>Maximum file size:</strong> 32 MB
            </li>
            <li>
              <strong>Formats:</strong> MP4, MOV, AVI, WebM
            </li>
            <li>
              <strong>Recommended resolution:</strong> 1280×720 px or higher
            </li>
            <li>
              <strong>Recommended encoding:</strong> H.264
            </li>
          </ul>
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
          <p>
            <strong>Chat image specifications:</strong>
          </p>

          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              <strong>Maximum file size:</strong> 4 MB
            </li>
            <li>
              <strong>Formats:</strong> JPEG, PNG, GIF, WebP
            </li>
            <li>
              <strong>Recommended resolution:</strong> 800×800 px
            </li>
          </ul>
        </div>
      ),
    },

    /* ================================================================
       POSTS & INTERACTIONS
    ================================================================ */

    {
      id: "how-to-post",
      category: "Posts & Interactions",
      question: "How do I create a post?",
      icon: FileText,
      answer: (
        <div className="space-y-3">
          <p>To publish a post:</p>

          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Open your home feed.</li>
            <li>Open the post composer.</li>
            <li>Write your message.</li>
            <li>Add media or a poll if available.</li>
            <li>Add hashtags or mentions if appropriate.</li>
            <li>Select <strong>Post</strong>.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            📢 Content remains subject to the ZRP Terms of Service and
            Community Guidelines.
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
          <p>
            If scheduling is available for your account, you can publish
            content automatically at a future date and time.
          </p>

          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Create your post.</li>
            <li>Select the scheduling option.</li>
            <li>Choose the future date and time.</li>
            <li>Confirm the scheduled publication.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            ⏰ Availability and limits may depend on your account plan.
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
            Select the comment or reply option beneath a post, enter your
            message, and submit it.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            💬 You remain responsible for comments and replies you publish.
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
            <strong>Hashtags</strong> use the # symbol to organise content
            around a topic.
          </p>

          <p>
            Example:{" "}
            <span className="text-zrp-red font-medium">#ZRP</span>{" "}
            or{" "}
            <span className="text-zrp-red font-medium">#Web3</span>
          </p>

          <p>
            <strong>Mentions</strong> use the @ symbol to reference another
            account.
          </p>

          <p>
            Example:{" "}
            <span className="text-zrp-red font-medium">@username</span>
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
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Open your profile.</li>
            <li>Find the post you want to highlight.</li>
            <li>Select the post options menu.</li>
            <li>Select <strong>Pin</strong>.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            📌 You can remove the pinned status later.
          </p>
        </div>
      ),
    },

    /* ================================================================
       MESSAGING & CALLS
    ================================================================ */

    {
      id: "how-to-message",
      category: "Messaging & Calls",
      question: "How do I send a direct message?",
      icon: MessageSquare,
      answer: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Open the user's profile or an existing conversation.</li>
            <li>Select <strong>Message</strong>.</li>
            <li>Write your message.</li>
            <li>Select Send.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            💬 Messaging availability may depend on account privacy settings
            and platform restrictions.
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
          <p>
            Where voice or video calling is available:
          </p>

          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Open a direct message conversation.</li>
            <li>Select the voice or video call option.</li>
            <li>Wait for the recipient to accept the call.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            📞 Calls require a compatible device, browser, microphone, camera,
            and stable network connection.
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
            Read receipts indicate whether a message has been delivered or
            viewed, where the feature is enabled.
          </p>

          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              <strong>Delivered:</strong> The message reached the recipient's
              messaging service.
            </li>
            <li>
              <strong>Read:</strong> The recipient has opened or viewed the
              conversation.
            </li>
          </ul>
        </div>
      ),
    },

    /* ================================================================
       PRIVACY & SAFETY
    ================================================================ */

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

          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Encrypted connections using HTTPS/TLS.</li>
            <li>Security controls designed to protect accounts and data.</li>
            <li>Access controls for internal systems.</li>
            <li>Security monitoring and abuse prevention.</li>
            <li>Account and data deletion mechanisms.</li>
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
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Open the options menu on the content.</li>
            <li>Select <strong>Report</strong>.</li>
            <li>Select the appropriate reason.</li>
            <li>Add additional information if necessary.</li>
            <li>Submit the report.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            🛡️ Reports are reviewed according to applicable ZRP policies.
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
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Open the user's profile.</li>
            <li>Select the options menu.</li>
            <li>Select <strong>Block</strong>.</li>
            <li>Confirm the action.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            🚫 Blocking can prevent the blocked account from interacting with
            you according to the platform's blocking functionality.
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
            You can request permanent deletion of your ZRP Social account
            through your account settings.
          </p>

          <ol className="list-decimal list-inside space-y-1 text-sm">
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
            <li>Select <strong>Delete Account</strong>.</li>
            <li>Review the warning carefully.</li>
            <li>Confirm the deletion request.</li>
          </ol>

          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg text-sm">
            ⚠️ Account deletion may be permanent and cannot normally be
            reversed. Certain information may be retained where required by
            applicable law.
          </div>
        </div>
      ),
    },

    /* ================================================================
       WEB3 & DIGITAL
    ================================================================ */

    {
      id: "what-is-web3",
      category: "Web3 & Digital",
      question: "What does Web3 mean for ZRP?",
      icon: Globe,
      answer: (
        <div className="space-y-3">
          <p>
            Web3 generally refers to a new generation of internet
            infrastructure that can include decentralised networks,
            blockchain technology, digital assets, cryptographic identities,
            and user-controlled digital ownership.
          </p>

          <p>
            ZRP may explore Web3 technologies where they provide meaningful
            benefits to users, creators, organisations, or the broader
            ecosystem.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            ⚠️ Web3 features should only be considered available when they are
            officially enabled and documented by ZRP.
          </p>
        </div>
      ),
    },

    {
      id: "digital-payments",
      category: "Web3 & Digital",
      question: "Will ZRP support digital or blockchain payments?",
      icon: CircleHelp,
      answer: (
        <div className="space-y-3">
          <p>
            ZRP can support modern digital-payment infrastructure where it
            provides a useful and secure experience for users and creators.
          </p>

          <p>
            Digital payments may include conventional online payment methods
            and, where officially supported, blockchain-based payment
            infrastructure.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            🔐 Payment methods, supported networks, assets, fees, and
            availability will depend on the features officially enabled by
            ZRP.
          </p>
        </div>
      ),
    },

    {
      id: "zrp-wallet",
      category: "Web3 & Digital",
      question: "Does ZRP have a Web3 wallet?",
      icon: Wallet,
      answer: (
        <div className="space-y-3">
          <p>
            ZRP may integrate wallet functionality as part of its broader
            digital ecosystem.
          </p>

          <p>
            A Web3 wallet can allow users to interact with blockchain
            applications and manage compatible digital assets.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            🔑 Never share a private key, seed phrase, recovery phrase, or
            wallet password with anyone, including someone claiming to be
            ZRP support.
          </p>
        </div>
      ),
    },

    {
      id: "blockchain-security",
      category: "Web3 & Digital",
      question: "What should I know about blockchain security?",
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            Blockchain transactions can be irreversible. Users should verify
            addresses, networks, assets, and transaction details before
            approving a transaction.
          </p>

          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Never share your private keys.</li>
            <li>Never share your recovery phrase.</li>
            <li>Verify wallet addresses before sending assets.</li>
            <li>Be careful with links and third-party applications.</li>
            <li>Do not trust unsolicited investment or giveaway messages.</li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            🛡️ ZRP support will never ask you for your private key or recovery
            phrase.
          </p>
        </div>
      ),
    },

    {
      id: "blockchain-transactions",
      category: "Web3 & Digital",
      question: "Can blockchain transactions be reversed?",
      icon: Scale,
      answer: (
        <div className="space-y-3">
          <p>
            Generally, confirmed blockchain transactions cannot simply be
            reversed by the sender or recipient.
          </p>

          <p>
            Users should therefore verify the destination address, network,
            amount, and transaction details before confirming a blockchain
            transaction.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            ⚠️ Blockchain transactions can involve risks, network fees,
            technical failures, and third-party services.
          </p>
        </div>
      ),
    },

    {
      id: "web3-not-investment",
      category: "Web3 & Digital",
      question: "Is ZRP an investment platform?",
      icon: CreditCard,
      answer: (
        <div className="space-y-3">
          <p>
            ZRP Social is primarily a social platform and digital ecosystem.
          </p>

          <p>
            References to blockchain, Web3, digital assets, or future
            technology integrations should not automatically be interpreted
            as an offer, recommendation, or guarantee of financial returns.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            ⚠️ Always conduct your own research and consider professional
            advice before making financial or digital-asset decisions.
          </p>
        </div>
      ),
    },

    {
      id: "web3-future",
      category: "Web3 & Digital",
      question: "What Web3 features could ZRP introduce in the future?",
      icon: Zap,
      answer: (
        <div className="space-y-3">
          <p>
            Depending on product development and regulatory requirements, ZRP
            may explore technologies such as:
          </p>

          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Digital wallets.</li>
            <li>Blockchain-based payments.</li>
            <li>Digital identity infrastructure.</li>
            <li>Creator ownership tools.</li>
            <li>Tokenised community features.</li>
            <li>Decentralised applications and integrations.</li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            🚀 Future concepts are not guarantees of future functionality.
            Only officially released features should be considered active.
          </p>
        </div>
      ),
    },

    /* ================================================================
       CHARITY & IMPACT
    ================================================================ */

    {
      id: "charity-model",
      category: "Charity & Impact",
      question: "How does the 35% charity model work?",
      icon: Heart,
      answer: (
        <div className="space-y-3">
          <p>
            ZRP's stated social-impact commitment is to dedicate{" "}
            <strong>35% of platform profits</strong> to charitable causes.
          </p>

          <p>These causes may include:</p>

          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>🧸 Support for orphans and children in need.</li>
            <li>🏫 Education and schools.</li>
            <li>🏥 Hospitals and healthcare initiatives.</li>
            <li>🌍 Climate and environmental relief.</li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            🧡 The contribution is based on platform profits and is not an
            additional fee charged directly to users.
          </p>
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
            An impact badge may be used to represent participation in ZRP's
            broader social-impact ecosystem.
          </p>

          <p>
            Any specific metrics displayed by the platform should be
            interpreted according to the methodology published by ZRP.
          </p>
        </div>
      ),
    },

    /* ================================================================
       VERIFICATION & ADMINISTRATION
    ================================================================ */

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
            <strong>User</strong> – Standard account with access to available
            social features.
          </p>

          <p>
            <strong>Moderator</strong> – Authorised personnel responsible for
            reviewing reports and enforcing applicable policies.
          </p>

          <p>
            <strong>Administrator</strong> – Authorised personnel with
            additional platform-management permissions.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            🛡️ Administrative access is restricted according to internal
            permissions.
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
            <li className="flex items-center gap-2">
              <VerifiedBadge badgeType="verified" />
              <span>
                <strong>Verified</strong> – Indicates an account that has
                received ZRP verification.
              </span>
            </li>

            <li className="flex items-center gap-2">
              <VerifiedBadge badgeType="organization" />
              <span>
                <strong>Organization</strong> – Official organisation or
                company account.
              </span>
            </li>

            <li className="flex items-center gap-2">
              <VerifiedBadge badgeType="government" />
              <span>
                <strong>Government</strong> – Official government account.
              </span>
            </li>

            <li className="flex items-center gap-2">
              <VerifiedBadge badgeType="team" />
              <span>
                <strong>ZRP Team</strong> – Official ZRP staff account.
              </span>
            </li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            🏅 Verification indicates authenticity or official status
            according to ZRP's verification system.
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
            Enterprise services are intended for larger organisations and
            professional teams requiring additional capabilities or support.
          </p>

          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Advanced account capabilities.</li>
            <li>Organisation management tools.</li>
            <li>Additional support options.</li>
            <li>Potential API and integration capabilities.</li>
            <li>Custom solutions where available.</li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            📧 Enterprise availability and pricing may vary.
          </p>
        </div>
      ),
    },

    /* ================================================================
       PLATFORM & INFRASTRUCTURE
    ================================================================ */

    {
      id: "platform-security",
      category: "Platform & Security",
      question: "How does ZRP protect the platform from bots and abuse?",
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            ZRP uses security and abuse-prevention mechanisms designed to
            detect suspicious behaviour and protect the community.
          </p>

          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Account security controls.</li>
            <li>Abuse detection.</li>
            <li>Rate limiting and automated protections.</li>
            <li>Content reporting.</li>
            <li>Human moderation where appropriate.</li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            🛡️ Security systems may evolve as new threats emerge.
          </p>
        </div>
      ),
    },

    {
      id: "translations",
      category: "Platform & Security",
      question: "Can ZRP translate posts?",
      icon: Globe,
      answer: (
        <div className="space-y-3">
          <p>
            Where translation functionality is available, users can translate
            supported posts into another language directly through the
            platform.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            🌍 Translation availability may depend on language support and
            platform functionality.
          </p>
        </div>
      ),
    },

    {
      id: "google-login",
      category: "Platform & Security",
      question: "Can I sign in with Google?",
      icon: LogIn,
      answer: (
        <div className="space-y-3">
          <p>
            If Google authentication is enabled for your ZRP deployment,
            you can use the Google sign-in option during authentication.
          </p>

          <p>
            Google authentication is handled through Google's authentication
            infrastructure and remains subject to Google's policies.
          </p>
        </div>
      ),
    },

    {
      id: "data-storage",
      category: "Platform & Security",
      question: "Where is ZRP data stored?",
      icon: Database,
      answer: (
        <div className="space-y-3">
          <p>
            ZRP's infrastructure may use hosting and service providers located
            in Switzerland, the European Union, or other jurisdictions where
            appropriate safeguards are in place.
          </p>

          <p>
            The exact providers and processing arrangements are governed by
            the platform's current infrastructure and Privacy Policy.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            📜 For the authoritative information about personal-data
            processing, see the{" "}
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

    /* ================================================================
       SUPPORT & TICKETS
    ================================================================ */

    {
      id: "support-tickets",
      category: "Support & Tickets",
      question: "How do I submit a support ticket?",
      icon: Ticket,
      answer: (
        <div className="space-y-3">
          <p>
            If you need assistance, you can submit a support request through
            the ZRP support system.
          </p>

          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>
              Go to the{" "}
              <Link
                href="/support"
                className="text-zrp-red hover:underline"
              >
                Support
              </Link>{" "}
              page.
            </li>
            <li>Choose the appropriate category.</li>
            <li>Describe your issue clearly.</li>
            <li>Include relevant information or screenshots where useful.</li>
            <li>Submit the ticket.</li>
          </ol>
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
          <p>
            If ticket tracking is enabled for your account, you can review
            previous requests through the support area.
          </p>

          <ol className="list-decimal list-inside space-y-1 text-sm">
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
            <li>Choose the ticket you want to review.</li>
            <li>Read the conversation and current status.</li>
            <li>Reply if additional information is requested.</li>
          </ol>
        </div>
      ),
    },

    {
      id: "admin-ticket-management",
      category: "Support & Tickets",
      question: "How do administrators manage support tickets?",
      icon: Shield,
      answer: (
        <div className="space-y-3">
          <p>
            Authorised administrators can manage support requests through the
            administrative support interface.
          </p>

          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Review incoming tickets.</li>
            <li>Assign or prioritise requests.</li>
            <li>Respond to users.</li>
            <li>Update ticket status.</li>
            <li>Resolve or close requests.</li>
          </ul>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            🔐 Administrative ticket functionality is restricted to authorised
            staff.
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
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              <strong>OPEN</strong> – The request has been submitted.
            </li>
            <li>
              <strong>IN_PROGRESS</strong> – The request is being reviewed.
            </li>
            <li>
              <strong>AWAITING_REPLY</strong> – Additional information is
              required.
            </li>
            <li>
              <strong>RESOLVED</strong> – The issue has been addressed.
            </li>
            <li>
              <strong>CLOSED</strong> – The ticket has been closed.
            </li>
          </ul>
        </div>
      ),
    },

    /* ================================================================
       FAQ / GENERAL
    ================================================================ */

    {
      id: "can-switch-plans",
      category: "Plans & Billing",
      question: "Can I change my subscription plan?",
      icon: CreditCard,
      answer: (
        <div className="space-y-3">
          <p>
            If multiple subscription plans are available to your account, you
            may be able to upgrade or downgrade through your account settings.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            💳 Billing terms, pricing, and changes are subject to the plan
            selected and the applicable subscription terms.
          </p>
        </div>
      ),
    },

    {
      id: "cancel-subscription",
      category: "Plans & Billing",
      question: "Can I cancel my subscription?",
      icon: CreditCard,
      answer: (
        <div className="space-y-3">
          <p>
            Where paid subscriptions are available, cancellation can normally
            be requested through your account billing or subscription
            settings.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            📄 Any applicable refund or billing terms are governed by the
            relevant subscription terms.
          </p>
        </div>
      ),
    },

    {
      id: "charity-payments",
      category: "Plans & Billing",
      question: "Is the 35% charity contribution deducted from my payment?",
      icon: Heart,
      answer: (
        <div className="space-y-3">
          <p>
            No. The stated 35% commitment is based on{" "}
            <strong>platform profits</strong>, rather than being presented as
            a separate charity fee charged to users.
          </p>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            🧡 The exact calculation and charitable reporting should be
            understood through ZRP's official transparency information.
          </p>
        </div>
      ),
    },

    {
      id: "freedom-of-speech",
      category: "Community & Moderation",
      question: "Does ZRP support freedom of speech?",
      icon: MessageSquare,
      answer: (
        <div className="space-y-3">
          <p>
            Freedom of expression is a core principle of ZRP Social.
          </p>

          <p>
            Users are generally free to express opinions, criticism,
            political views, religious views, and other lawful viewpoints.
          </p>

          <p>
            Freedom of expression does not create a right to use the platform
            for illegal activity, threats, targeted harassment, child sexual
            abuse material, fraud, malware, or other prohibited content.
          </p>

          <p>
            For the complete rules, review our{" "}
            <Link
              href="/guidelines"
              className="text-zrp-red hover:underline"
            >
              Community Guidelines
            </Link>{" "}
            and{" "}
            <Link
              href="/terms"
              className="text-zrp-red hover:underline"
            >
              Terms of Service
            </Link>
            .
          </p>
        </div>
      ),
    },

    {
      id: "moderation-appeal",
      category: "Community & Moderation",
      question: "Can I appeal a moderation decision?",
      icon: Scale,
      answer: (
        <div className="space-y-3">
          <p>
            Where an appeal mechanism is available, users can challenge
            certain moderation decisions.
          </p>

          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Review the notification explaining the action.</li>
            <li>Open the available appeal option.</li>
            <li>Explain why you believe the decision should be reviewed.</li>
            <li>Provide relevant context or evidence.</li>
            <li>Submit the appeal.</li>
          </ol>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            ⚖️ Appeals are reviewed according to ZRP's moderation procedures.
          </p>
        </div>
      ),
    },

    {
      id: "contact-zrp",
      category: "General",
      question: "How can I contact ZRP?",
      icon: HelpCircle,
      answer: (
        <div className="space-y-3">
          <p>
            For general assistance, use the ZRP support system.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/support"
              className="inline-flex items-center px-4 py-2 bg-zrp-red text-white rounded-full text-sm font-medium hover:bg-zrp-darkRed transition"
            >
              Open Support
            </Link>

            <Link
              href="/contact"
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              Contact ZRP
            </Link>
          </div>
        </div>
      ),
    },
  ];

  /* ================================================================
     GROUP FAQS
  ================================================================ */

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

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6">
      {/* ================================================================
          HEADER
      ================================================================ */}

      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zrp-red/10 text-zrp-red mb-4">
          <HelpCircle className="w-8 h-8" />
        </div>

        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zrp-red">
            ZRP Social
          </span>

          <span className="text-xs text-gray-400">
            •
          </span>

          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Help & Knowledge Center
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
          Frequently Asked Questions
        </h1>

        <p className="mt-3 text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
          Find answers about your ZRP account, content, privacy, security,
          Web3, digital infrastructure, subscriptions, moderation, and
          community features.
        </p>
      </div>

      {/* ================================================================
          TRUST / QUICK INFO
      ================================================================ */}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zrp-deepBlack">
          <Shield className="w-5 h-5 text-zrp-red mb-2" />

          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
            Privacy focused
          </h3>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Built with privacy, security, and user control in mind.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zrp-deepBlack">
          <Globe className="w-5 h-5 text-zrp-red mb-2" />

          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
            Global community
          </h3>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Connect and communicate with users around the world.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zrp-deepBlack">
          <Wallet className="w-5 h-5 text-zrp-red mb-2" />

          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
            Digital future
          </h3>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Exploring modern digital and Web3 technologies responsibly.
          </p>
        </div>
      </div>

      {/* ================================================================
          QUICK LINKS
      ================================================================ */}

      <div className="flex flex-wrap justify-center gap-2 mb-10">
        {Object.keys(groupedFaqs).map((category) => (
          <a
            key={category}
            href={`#category-${category
              .replace(/\s+/g, "-")
              .toLowerCase()}`}
            className="px-3 py-1.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-zrp-red hover:text-white transition"
          >
            {category}
          </a>
        ))}
      </div>

      {/* ================================================================
          FAQ LIST
      ================================================================ */}

      <div className="space-y-8">
        {Object.entries(groupedFaqs).map(([category, items]) => (
          <section key={category}>
            <h2
              id={`category-${category
                .replace(/\s+/g, "-")
                .toLowerCase()}`}
              className="text-xl font-semibold text-gray-900 dark:text-white mb-4 pb-2 border-b border-gray-200 dark:border-gray-700"
            >
              {category}
            </h2>

            <div className="space-y-3">
              {items.map((faq) => {
                const isOpen = openId === faq.id;
                const Icon = faq.icon || HelpCircle;

                return (
                  <div
                    key={faq.id}
                    className={`border rounded-xl overflow-hidden bg-white dark:bg-zrp-deepBlack transition ${
                      isOpen
                        ? "border-zrp-red/40 shadow-sm"
                        : "border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(faq.id)}
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${faq.id}`}
                      className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        <Icon className="w-5 h-5 text-zrp-red" />
                      </div>

                      <div className="flex-1">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {faq.question}
                        </span>
                      </div>

                      <div className="flex-shrink-0 mt-0.5">
                        {isOpen ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {isOpen && (
                      <div
                        id={`faq-answer-${faq.id}`}
                        className="px-4 pb-5 pt-0 text-gray-700 dark:text-gray-300 text-sm border-t border-gray-100 dark:border-gray-800"
                      >
                        <div className="pt-4">
                          {faq.answer}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* ================================================================
          LEGAL LINKS
      ================================================================ */}

      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          href="/terms"
          className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zrp-deepBlack hover:border-zrp-red/40 transition"
        >
          <FileText className="w-5 h-5 text-zrp-red mb-2" />

          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
            Terms of Service
          </h3>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Read the rules governing use of ZRP Social.
          </p>
        </Link>

        <Link
          href="/privacy"
          className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zrp-deepBlack hover:border-zrp-red/40 transition"
        >
          <Lock className="w-5 h-5 text-zrp-red mb-2" />

          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
            Privacy Policy
          </h3>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Learn how ZRP handles personal data.
          </p>
        </Link>

        <Link
          href="/guidelines"
          className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zrp-deepBlack hover:border-zrp-red/40 transition"
        >
          <Shield className="w-5 h-5 text-zrp-red mb-2" />

          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
            Community Guidelines
          </h3>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Understand ZRP's content and community rules.
          </p>
        </Link>
      </div>

      {/* ================================================================
          SUPPORT
      ================================================================ */}

      <div className="mt-8 p-6 bg-gray-50 dark:bg-gray-800 rounded-xl text-center border border-gray-200 dark:border-gray-700">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-zrp-red/10 text-zrp-red mb-3">
          <HelpCircle className="w-5 h-5" />
        </div>

        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Still have questions?
        </h3>

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
          Our support team can help with account issues, technical problems,
          moderation questions, privacy requests, and other ZRP-related
          matters.
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
            className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            About ZRP
          </Link>
        </div>
      </div>

      {/* ================================================================
          FOOTER NOTE
      ================================================================ */}

      <div className="mt-8 text-center">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          ZRP Social • Swiss-built social platform • Privacy • Freedom of
          expression • Responsible technology
        </p>
      </div>
    </div>
  );
}
