"use client";

import { X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";

interface Props {
  messageKey: TranslationKey;
  onClose: () => void;
}

// Shown in place of a store-sensitive payment action (Tips, premium-post
// unlock, plan upgrade, Help contributions) whenever the app is running
// inside the native iOS/Android shell - see src/lib/native-payment-policy.ts
// for which features this applies to and why. Deliberately generic and
// reusable rather than one bespoke modal per feature, and deliberately
// says nothing about Apple/Google policy to the user.
export default function NativePaymentNotice({ messageKey, onClose }: Props) {
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zrp-deepBlack rounded-xl shadow-xl max-w-sm w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2 pr-6">
          {t("native.paymentUnavailable.title")}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t(messageKey)}</p>

        <button
          onClick={onClose}
          className="w-full mt-5 bg-zrp-red text-white py-2 rounded-lg font-medium hover:bg-zrp-darkRed transition"
        >
          {t("action.cancel")}
        </button>
      </div>
    </div>
  );
}
