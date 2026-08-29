import { Metadata } from "next";
import AIChat from "@/components/AI/AIChat";
import AIPageSubtitle from "@/components/AI/AIPageSubtitle";

export const metadata: Metadata = {
  title: "ZRP AI",
  description: "Chat with ZRP AI, powered by DeepSeek.",
  alternates: { canonical: "/ai" },
  openGraph: {
    title: "ZRP AI | ZRP Social",
    description: "Chat with ZRP AI, powered by DeepSeek.",
    url: "/ai",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "ZRP AI | ZRP Social",
    description: "Chat with ZRP AI, powered by DeepSeek.",
  },
};

export default function AIPage() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          🤖 ZRP AI
        </h1>
        <AIPageSubtitle />
      </div>
      <div className="h-[600px]">
        <AIChat />
      </div>
    </div>
  );
}
