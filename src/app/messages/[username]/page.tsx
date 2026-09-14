"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState, useRef, use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ChatInterface from "@/components/ChatInterface";
import { useLanguage } from "@/contexts/LanguageContext";
// Call state (incoming-call listener, WebRTC peer, TURN credentials,
// the whole calling state machine) now lives in CallContext, mounted
// once at the app root (src/app/layout.tsx) - not in this page. See
// CallContext.tsx's own top comment for why: this page used to own all
// of it directly, which meant a user could only ever RECEIVE a call
// while they happened to already have this exact conversation open.
import { useCall } from "@/contexts/CallContext";

export default function ChatPage(
  props: {
    params: Promise<{ username: string }>;
    searchParams: Promise<{ listing?: string }>;
  }
) {
  const params = use(props.params);
  const searchParams = use(props.searchParams);

  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();

  const [receiver, setReceiver] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // The call UI itself (ringing/incoming/active screens) is now
  // rendered globally by CallProvider (see src/app/layout.tsx) as a
  // full-screen overlay above whatever page is mounted - this page only
  // needs to trigger an outgoing call and show/dismiss its own inline
  // error toast; it never renders CallComponent directly anymore.
  const { callError, startCall, clearCallError } = useCall();

  /*
   * The chat must occupy exactly the visible viewport area.
   *
   * This is especially important on:
   * - iPhone
   * - iPad
   * - Safari
   * - Android browsers
   *
   * visualViewport is used when available because the normal
   * window.innerHeight value can remain larger than the actual
   * visible area when the mobile keyboard is open.
   */
  const containerRef = useRef<HTMLDivElement>(null);

  const [availableHeight, setAvailableHeight] =
    useState<number | null>(null);

  useLayoutEffect(() => {
    const updateHeight = () => {
      const container = containerRef.current;

      if (!container) return;

      const rect = container.getBoundingClientRect();

      const viewportHeight =
        window.visualViewport?.height ??
        window.innerHeight;

      const top = Math.max(0, rect.top);

      // BottomNav is fixed over the application on phones/tablets.
      // Keep the chat viewport above it so the composer can never be
      // covered by the navigation bar. The safe-area padding is handled
      // by the shell/BottomNav itself.
      const bottomNavigationHeight =
        window.innerWidth < 1024 ? 56 : 0;

      const height = Math.max(
        0,
        viewportHeight -
          top -
          bottomNavigationHeight
      );

      setAvailableHeight(height);
    };

    updateHeight();

    window.addEventListener("resize", updateHeight);
    window.addEventListener("orientationchange", updateHeight);

    window.visualViewport?.addEventListener(
      "resize",
      updateHeight
    );

    window.visualViewport?.addEventListener(
      "scroll",
      updateHeight
    );

    const firstTimeout = window.setTimeout(
      updateHeight,
      100
    );

    const secondTimeout = window.setTimeout(
      updateHeight,
      500
    );

    return () => {
      window.removeEventListener(
        "resize",
        updateHeight
      );

      window.removeEventListener(
        "orientationchange",
        updateHeight
      );

      window.visualViewport?.removeEventListener(
        "resize",
        updateHeight
      );

      window.visualViewport?.removeEventListener(
        "scroll",
        updateHeight
      );

      window.clearTimeout(firstTimeout);
      window.clearTimeout(secondTimeout);
    };
  }, []);

  const userId = session?.user?.id;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (
      status === "authenticated" &&
      userId
    ) {
      fetchReceiver();
    }
  }, [
    status,
    userId,
    params.username,
  ]);

  const fetchReceiver = async () => {
    try {
      const res = await fetch(
        `/api/users/${params.username}`,
        {
          cache: "no-store",
        }
      );

      if (!res.ok) {
        throw new Error(
          `Failed to fetch user: ${res.status}`
        );
      }

      const data = await res.json();

      setReceiver(data);
    } catch (error) {
      console.error(
        "Error fetching receiver:",
        error
      );
      setReceiver(null);
    } finally {
      setLoading(false);
    }
  };

  if (
    status === "loading" ||
    loading
  ) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-500 dark:text-gray-400">
          {t("action.loading")}
        </div>
      </div>
    );
  }

  if (!receiver) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-4">
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4">
          <p className="text-red-700 dark:text-red-300 font-medium">
            {t("chat.userNotFound")}
          </p>

          <Link
            href="/messages"
            className="
              text-zrp-red
              hover:underline
              text-sm
              mt-2
              inline-flex
              items-center
              gap-1
            "
          >
            <ArrowLeft className="w-4 h-4" />
            {t("chat.backToMessages")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="
        w-full
        max-w-full
        mx-auto
        px-0
        sm:px-3
        lg:px-4
        pt-0
        sm:pt-2
        lg:pt-3
        pb-0
        flex
        flex-col
        min-h-0
        overflow-hidden
      "
      style={{
        height: availableHeight
          ? `calc(${availableHeight}px - env(safe-area-inset-bottom))`
          : "calc(100dvh - env(safe-area-inset-top) - 3.5rem - env(safe-area-inset-bottom))",

        paddingBottom:
          "env(safe-area-inset-bottom)",
      }}
    >
      {/* Call error */}
      {callError && (
        <div
          className="
            fixed
            top-4
            left-1/2
            -translate-x-1/2
            z-[100]
            bg-red-600
            text-white
            text-sm
            px-4
            py-2.5
            rounded-xl
            shadow-xl
            max-w-[calc(100vw-32px)]
            sm:max-w-md
            text-center
          "
        >
          {callError}

          <button
            type="button"
            onClick={() =>
              clearCallError()
            }
            className="ml-3 underline font-medium"
          >
            {t("chat.dismiss")}
          </button>
        </div>
      )}

      {/* Mobile back button */}
      <div
        className="
          lg:hidden
          flex-shrink-0
          px-3
          sm:px-0
          py-2
        "
      >
        <Link
          href="/messages"
          className="
            inline-flex
            items-center
            gap-1.5
            text-zrp-red
            hover:underline
            text-sm
            font-medium
            min-h-[40px]
          "
        >
          <ArrowLeft className="w-4 h-4" />
          {t("chat.backToMessages")}
        </Link>
      </div>

      {/* Chat container. The active-call overlay (CallComponent, in
          CallProvider) renders on top of this via a fixed full-screen
          div whenever a call is ringing/incoming/active, so this stays
          mounted underneath rather than being swapped out - it's the
          view the user returns to when the call ends. */}
      <div
        className="
          flex-1
          min-h-0
          w-full
          overflow-hidden
        "
      >
        <ChatInterface
          receiverId={receiver.id}
          receiverName={
            receiver.name ||
            receiver.username
          }
          receiverUsername={
            receiver.username
          }
          receiverAvatar={
            receiver.avatarUrl
          }
          receiverBadgeType={
            receiver.badgeType
          }
          initialMessage={
            searchParams.listing
              ? `${t("marketplace.contactSellerPrefill")} ${typeof window !== "undefined" ? window.location.origin : ""}/marketplace/listing/${searchParams.listing}`
              : undefined
          }
          onVoiceCall={() =>
            startCall(
              receiver.id,
              receiver.name || receiver.username,
              false
            )
          }
          onVideoCall={() =>
            startCall(
              receiver.id,
              receiver.name || receiver.username,
              true
            )
          }
        />
      </div>
    </div>
  );
}
