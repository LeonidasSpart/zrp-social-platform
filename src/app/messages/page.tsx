"use client";

import { MessageCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function MessagesIndexPage() {
  const { t } = useLanguage();

  return (
    <div className="hidden lg:flex flex-1 items-center justify-center h-screen text-gray-400 dark:text-gray-500">
      <div className="text-center px-4">
        <MessageCircle className="w-14 h-14 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <p className="text-lg font-medium text-gray-600 dark:text-gray-300">
          {t("messages.title")}
        </p>
        <p className="text-sm mt-1">Select a conversation to start chatting.</p>
      </div>
    </div>
  );
}
