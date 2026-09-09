"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import GroupChatInterface from "@/components/GroupChatInterface";
import { useLanguage } from "@/contexts/LanguageContext";

export default function GroupChatPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const { status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();

  /*
   * The chat must occupy exactly the visible viewport area - same real
   * approach as messages/[username]/page.tsx (visualViewport over
   * window.innerHeight so the mobile keyboard opening never leaves the
   * composer hidden below the fold, and the fixed mobile BottomNav is
   * accounted for explicitly since it floats over the page rather than
   * taking layout space).
   */
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const updateHeight = () => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const top = Math.max(0, rect.top);
      const bottomNavigationHeight = window.innerWidth < 1024 ? 56 : 0;
      const height = Math.max(0, viewportHeight - top - bottomNavigationHeight);
      setAvailableHeight(height);
    };

    updateHeight();

    window.addEventListener("resize", updateHeight);
    window.addEventListener("orientationchange", updateHeight);
    window.visualViewport?.addEventListener("resize", updateHeight);
    window.visualViewport?.addEventListener("scroll", updateHeight);

    const firstTimeout = window.setTimeout(updateHeight, 100);
    const secondTimeout = window.setTimeout(updateHeight, 500);

    return () => {
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("orientationchange", updateHeight);
      window.visualViewport?.removeEventListener("resize", updateHeight);
      window.visualViewport?.removeEventListener("scroll", updateHeight);
      window.clearTimeout(firstTimeout);
      window.clearTimeout(secondTimeout);
    };
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-500 dark:text-gray-400">{t("action.loading")}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full max-w-full mx-auto px-0 sm:px-3 lg:px-4 pt-0 sm:pt-2 lg:pt-3 pb-0 flex flex-col min-h-0 overflow-hidden"
      style={{
        height: availableHeight
          ? `calc(${availableHeight}px - env(safe-area-inset-bottom))`
          : "calc(100dvh - env(safe-area-inset-top) - 3.5rem - env(safe-area-inset-bottom))",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Mobile back button */}
      <div className="lg:hidden flex-shrink-0 px-3 sm:px-0 py-2">
        <Link
          href="/messages"
          className="inline-flex items-center gap-1.5 text-zrp-red hover:underline text-sm font-medium min-h-[40px]"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("chat.backToMessages")}
        </Link>
      </div>

      <div className="flex-1 min-h-0 w-full overflow-hidden">
        <GroupChatInterface conversationId={params.id} onLeftGroup={() => router.push("/messages")} />
      </div>
    </div>
  );
}
