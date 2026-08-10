import { Metadata } from "next";
import AIChat from "@/components/AI/AIChat";

export const metadata: Metadata = {
  title: "ZRP AI – ZRP Social",
  description: "Chat with ZRP AI, powered by DeepSeek.",
};

export default function AIPage() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          🤖 ZRP AI
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Ask anything. Get help with posts, learn about ZRP, or just chat.
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Powered by DeepSeek · Open-source · Transparent
        </p>
      </div>
      <div className="h-[600px]">
        <AIChat />
      </div>
    </div>
  );
}
