"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  UserPlus,
  LogIn,
  Key,
  Image,
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
    // ─── Getting Started ──────────────────────────────────────────────
    {
      id: "what-is-zrp",
      category: "Getting Started",
      question: "What is ZRP Social?",
      icon: HelpCircle,
      answer: (
        <div className="space-y-2">
          <p>
            ZRP Social is a Swiss‑based social media platform built on the principles of{" "}
            <strong>freedom of speech</strong>, <strong>privacy</strong>, and{" "}
            <strong>social impact</strong>.
          </p>
          <p>
            <strong>35% of all platform profits</strong> go directly to charities supporting
            orphans, schools, hospitals, and climate relief – with no borders, no religion,
            no nationality, no discrimination.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            🧡 Built by the people, for the people.
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
        <div className="space-y-2">
          <p>Registering is quick and free:</p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Go to the <Link href="/signup" className="text-zrp-red hover:underline">Sign Up</Link> page.</li>
            <li>Enter your full name, username, email, and password.</li>
            <li>Click <strong>Create account</strong>.</li>
            <li>Check your email for a verification link.</li>
            <li>Click the link to verify your email address.</li>
            <li>Complete the onboarding flow to set up your profile.</li>
          </ol>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ⚠️ You must verify your email before you can log in.
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
        <div className="space-y-2">
          <p>To log in to ZRP Social:</p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Go to the <Link href="/login" className="text-zrp-red hover:underline">Login</Link> page.</li>
            <li>Enter your registered email address.</li>
            <li>Enter your password.</li>
            <li>Click <strong>Sign in</strong>.</li>
          </ol>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            🔑 If you forgot your password, click <Link href="/forgot-password" className="text-zrp-red hover:underline">Forgot password?</Link> to reset it.
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
        <div className="space-y-2">
          <p>To reset your password:</p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Go to the <Link href="/login" className="text-zrp-red hover:underline">Login</Link> page.</li>
            <li>Click <strong>Forgot password?</strong></li>
            <li>Enter the email address associated with your account.</li>
            <li>Check your inbox for a password reset link.</li>
            <li>Click the link and enter your new password.</li>
          </ol>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ⏳ The reset link expires in 1 hour for security reasons.
          </p>
        </div>
      ),
    },

    // ─── Profile & Media ──────────────────────────────────────────────
    {
      id: "avatar-size",
      category: "Profile & Media",
      question: "What are the avatar requirements?",
      icon: Image,
      answer: (
        <div className="space-y-2">
          <p><strong>Avatar specifications:</strong></p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>Max file size:</strong> 2 MB</li>
            <li><strong>Supported formats:</strong> JPEG, PNG, GIF, WebP</li>
            <li><strong>Recommended resolution:</strong> 400×400 px (square)</li>
          </ul>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            💡 For best results, use a high‑quality square image. Your avatar will be displayed as a circle.
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
        <div className="space-y-2">
          <p><strong>Banner specifications:</strong></p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>Max file size:</strong> 4 MB</li>
            <li><strong>Supported formats:</strong> JPEG, PNG, GIF, WebP</li>
            <li><strong>Recommended resolution:</strong> 1200×400 px (3:1 ratio)</li>
          </ul>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            💡 Your banner appears at the top of your profile page. Choose an image that represents you or your brand.
          </p>
        </div>
      ),
    },
    {
      id: "post-image-size",
      category: "Profile & Media",
      question: "What are the post image requirements?",
      icon: Upload,
      answer: (
        <div className="space-y-2">
          <p><strong>Post image specifications:</strong></p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>Max file size:</strong> 4 MB</li>
            <li><strong>Supported formats:</strong> JPEG, PNG, GIF, WebP</li>
            <li><strong>Recommended resolution:</strong> 1200×800 px (3:2 ratio)</li>
          </ul>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            💡 You can upload one image per post. For better quality, use high‑resolution images.
          </p>
        </div>
      ),
    },
    {
      id: "post-video-size",
      category: "Profile & Media",
      question: "What are the post video requirements?",
      icon: Video,
      answer: (
        <div className="space-y-2">
          <p><strong>Post video specifications:</strong></p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>Max file size:</strong> 32 MB</li>
            <li><strong>Supported formats:</strong> MP4, MOV, AVI, WebM</li>
            <li><strong>Recommended resolution:</strong> 1280×720 px (720p) or higher</li>
            <li><strong>Max duration:</strong> 5 minutes (recommended)</li>
          </ul>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            💡 For the best viewing experience, keep videos under 30 seconds and use H.264 encoding.
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
        <div className="space-y-2">
          <p><strong>Chat image specifications:</strong></p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>Max file size:</strong> 4 MB</li>
            <li><strong>Supported formats:</strong> JPEG, PNG, GIF, WebP</li>
            <li><strong>Recommended resolution:</strong> 800×800 px (square)</li>
          </ul>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            💡 Images sent in direct messages are stored in the cloud and shared with the recipient only.
          </p>
        </div>
      ),
    },

    // ─── Posts & Interactions ─────────────────────────────────────────
    {
      id: "how-to-post",
      category: "Posts & Interactions",
      question: "How do I create a post?",
      icon: FileText,
      answer: (
        <div className="space-y-2">
          <p>Creating a post is simple:</p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>On your home feed, click the composer box that says <strong>"What's happening?"</strong>.</li>
            <li>Type your message (up to 500 characters).</li>
            <li>Use <strong>#hashtags</strong> and <strong>@mentions</strong> to reach more people.</li>
            <li>Optionally, upload an image or video, or add a poll.</li>
            <li>Click <strong>Post</strong> to publish immediately, or <strong>Schedule</strong> to post later.</li>
          </ol>
        </div>
      ),
    },
    {
      id: "how-to-schedule-post",
      category: "Posts & Interactions",
      question: "How do I schedule a post?",
      icon: Clock,
      answer: (
        <div className="space-y-2">
          <p>Scheduling a post allows you to publish at a later time:</p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Write your post in the composer.</li>
            <li>Click the <strong>Schedule</strong> button (clock icon).</li>
            <li>Select a date and time in the future.</li>
            <li>Click <strong>Schedule</strong> (the button text changes).</li>
            <li>Your post will be published automatically at the scheduled time.</li>
          </ol>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ⏰ Scheduled posts are checked every 5 minutes and published automatically.
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
        <div className="space-y-2">
          <p>You can comment on any post and reply to any comment:</p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Click the <strong>💬</strong> icon under a post to open comments.</li>
            <li>Type your comment in the input box and click <strong>Reply</strong>.</li>
            <li>To reply to a specific comment, click <strong>Reply</strong> under that comment.</li>
            <li>Your reply will appear as a nested thread.</li>
          </ol>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            💬 You can edit or delete your own comments at any time.
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
        <div className="space-y-2">
          <p><strong>Hashtags (#)</strong> – Use hashtags to categorise your posts:</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Example: <span className="text-blue-600">#ZRP</span>, <span className="text-blue-600">#web3</span></li>
            <li>Click any hashtag to see all posts with that tag.</li>
          </ul>
          <p><strong>Mentions (@)</strong> – Mention other users in your posts:</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Example: <span className="text-blue-600">@username</span></li>
            <li>Mentioned users will receive a notification.</li>
          </ul>
        </div>
      ),
    },
    {
      id: "how-to-pin-post",
      category: "Posts & Interactions",
      question: "How do I pin a post to my profile?",
      icon: CheckCircle,
      answer: (
        <div className="space-y-2">
          <p>Only you can pin a post to your profile:</p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Go to your own profile.</li>
            <li>Find the post you want to pin.</li>
            <li>Click the <strong>Pin</strong> icon (📌) on the post.</li>
            <li>The post will appear at the top of your profile with a "Pinned" badge.</li>
          </ol>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            📌 You can unpin a post at any time by clicking the pin icon again.
          </p>
        </div>
      ),
    },

    // ─── Messaging & Calls ────────────────────────────────────────────
    {
      id: "how-to-message",
      category: "Messaging & Calls",
      question: "How do I send a direct message?",
      icon: MessageSquare,
      answer: (
        <div className="space-y-2">
          <p>To send a direct message to someone:</p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Go to their profile page.</li>
            <li>Click the <strong>Message</strong> button.</li>
            <li>Type your message in the chat window.</li>
            <li>Press <strong>Enter</strong> or click the <strong>Send</strong> button.</li>
          </ol>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            💬 You can also send images in chat (max 4MB) and see typing indicators.
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
        <div className="space-y-2">
          <p>To start a call with someone:</p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Open a direct message conversation.</li>
            <li>Click the <strong>Phone</strong> icon for a voice call, or the <strong>Video</strong> icon for a video call.</li>
            <li>The recipient will receive an incoming call notification.</li>
            <li>They can accept or reject the call.</li>
          </ol>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            📞 Calls use WebRTC technology. For best results, use a stable internet connection.
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
        <div className="space-y-2">
          <p>Read receipts show when your message has been read:</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>✓✓ (double checkmark) – your message has been read</li>
            <li>✓ (single checkmark) – your message has been delivered</li>
          </ul>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            📖 Read receipts are automatically updated when the recipient views the message.
          </p>
        </div>
      ),
    },

    // ─── Privacy & Safety ─────────────────────────────────────────────
    {
      id: "privacy-policy",
      category: "Privacy & Safety",
      question: "How is my data protected?",
      icon: Lock,
      answer: (
        <div className="space-y-2">
          <p>ZRP Social takes your privacy seriously:</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>Swiss‑hosted:</strong> All data is stored in Switzerland, subject to strict Swiss privacy laws.</li>
            <li><strong>Encryption:</strong> All connections use HTTPS/TLS encryption.</li>
            <li><strong>No third‑party data sharing:</strong> Your data is never sold to advertisers.</li>
            <li><strong>Delete account:</strong> You can permanently delete your account and all associated data.</li>
          </ul>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            📜 Read our full <Link href="/privacy" className="text-zrp-red hover:underline">Privacy Policy</Link> for more details.
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
        <div className="space-y-2">
          <p>To report a post or comment:</p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Click the <strong>Flag</strong> icon (🚩) on the post or comment.</li>
            <li>Select the reason for reporting.</li>
            <li>Optionally, add additional details.</li>
            <li>Click <strong>Submit Report</strong>.</li>
          </ol>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            🛡️ Reports are reviewed by our moderation team. All reports are anonymous.
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
        <div className="space-y-2">
          <p>To block a user:</p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Go to the user's profile.</li>
            <li>Click the <strong>More</strong> menu (⋯) or the <strong>Block</strong> option.</li>
            <li>Confirm that you want to block the user.</li>
          </ol>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            🚫 Blocked users cannot follow you, mention you, or send you messages.
          </p>
        </div>
      ),
    },

    // ─── Charity & Impact ────────────────────────────────────────────
    {
      id: "charity-model",
      category: "Charity & Impact",
      question: "How does the 35% charity model work?",
      icon: Heart,
      answer: (
        <div className="space-y-2">
          <p><strong>35% of all platform profits</strong> are donated to:</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>🧸 Orphans – supporting children in need</li>
            <li>🏫 Schools – funding education worldwide</li>
            <li>🏥 Hospitals – improving healthcare access</li>
            <li>🌍 Climate relief – combating climate change</li>
          </ul>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            🧡 No borders. No religion. No nationality. No discrimination. Just impact.
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
        <div className="space-y-2">
          <p>The <strong>Impact badge</strong> shows how many meals you've helped fund through the platform.</p>
          <p>The number increases as the platform grows and more profits are generated.</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            🧡 Every interaction on ZRP Social contributes to the charity fund.
          </p>
        </div>
      ),
    },

    // ─── Administration ───────────────────────────────────────────────
    {
      id: "admin-roles",
      category: "Administration",
      question: "What are the different user roles?",
      icon: Users,
      answer: (
        <div className="space-y-2">
          <p><strong>User</strong> – Standard account with full social features.</p>
          <p><strong>Moderator</strong> – Can review and action reports, delete inappropriate content, and issue warnings.</p>
          <p><strong>Admin</strong> – Full platform control: manage users, posts, reports, roles, and analytics.</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            🛡️ Moderators and Admins are trusted community members who help keep ZRP Social safe.
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
        <div className="space-y-2">
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><span className="text-blue-500">🔵 Verified</span> – Authentic account of notable public interest</li>
            <li><span className="text-amber-400">🟡 Organization</span> – Official account of an organisation or company</li>
            <li><span className="text-gray-400">⚪ Government</span> – Official government account</li>
          </ul>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            🏅 Badges are assigned by the ZRP Social team and indicate authenticity.
          </p>
        </div>
      ),
    },
  ];

  // ─── Group FAQs by category ─────────────────────────────────────────
  const groupedFaqs = faqs.reduce((acc, faq) => {
    if (!acc[faq.category]) acc[faq.category] = [];
    acc[faq.category].push(faq);
    return acc;
  }, {} as Record<string, FaqItem[]>);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
      {/* ─── Header ─── */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zrp-red/10 text-zrp-red mb-4">
          <HelpCircle className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
          Frequently Asked Questions
        </h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
          Everything you need to know about ZRP Social – from registration to charity impact.
        </p>
      </div>

      {/* ─── Quick Links ─── */}
      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {Object.keys(groupedFaqs).map((category) => (
          <a
            key={category}
            href={`#category-${category.replace(/\s+/g, "-").toLowerCase()}`}
            className="px-3 py-1.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-zrp-red hover:text-white transition"
          >
            {category}
          </a>
        ))}
      </div>

      {/* ─── FAQ List ─── */}
      <div className="space-y-8">
        {Object.entries(groupedFaqs).map(([category, items]) => (
          <div key={category}>
            <h2
              id={`category-${category.replace(/\s+/g, "-").toLowerCase()}`}
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
                    className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-zrp-deepBlack"
                  >
                    <button
                      onClick={() => toggleFaq(faq.id)}
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
                      <div className="px-4 pb-4 pt-0 text-gray-700 dark:text-gray-300 text-sm border-t border-gray-100 dark:border-gray-800">
                        <div className="pt-3 space-y-2">{faq.answer}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ─── Still have questions? ─── */}
      <div className="mt-12 p-6 bg-gray-50 dark:bg-gray-800 rounded-xl text-center border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Still have questions?
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          We're here to help. Reach out to us anytime.
        </p>
        <div className="flex flex-wrap justify-center gap-3 mt-4">
          <Link
            href="/contact"
            className="px-4 py-2 bg-zrp-red text-white rounded-full text-sm font-medium hover:bg-zrp-darkRed transition"
          >
            Contact Support
          </Link>
          <Link
            href="/about"
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            About ZRP
          </Link>
        </div>
      </div>

      {/* ─── Footer Links ─── */}
      {/* ❌ REMOVED – to avoid duplication with global footer */}
    </div>
  );
}
