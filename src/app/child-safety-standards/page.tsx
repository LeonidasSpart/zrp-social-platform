import Link from "next/link";
import Image from "next/image";

const LAST_UPDATED = "September 15, 2026";

export default function ChildSafetyStandardsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter">
      <section className="relative overflow-hidden bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-16 sm:py-20 px-4">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-zrp-red/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-24 w-80 h-80 bg-black/30 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-3xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white transition font-inter text-sm mb-10"
          >
            ← Back to ZRP Social
          </Link>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="flex-shrink-0">
              <Image
                src="/logo.png"
                alt="ZRP Social"
                width={72}
                height={72}
                className="w-[72px] h-[72px] object-contain"
              />
            </div>

            <div>
              <h1 className="text-4xl sm:text-5xl font-extrabold font-orbitron text-white leading-tight">
                Child Safety Standards
              </h1>
            </div>
          </div>

          <p className="mt-6 max-w-2xl text-white/80 text-[15px] sm:text-base leading-7">
            ZRP Social has zero tolerance for child sexual abuse material
            (CSAM) and any form of child sexual abuse or exploitation (CSAE).
            This page describes our published standards, how we respond to
            violations, and how to reach us about a child safety concern.
          </p>

          <span className="inline-block mt-6 px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs">
            Last updated: {LAST_UPDATED}
          </span>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-12 sm:py-16 space-y-10 text-gray-800 dark:text-gray-200">
        <div>
          <h2 className="text-2xl font-bold font-orbitron mb-3 text-zrp-red">
            1. Zero tolerance
          </h2>
          <p className="leading-7 text-[15px]">
            Content or behavior that sexualizes, endangers, or exploits a
            minor is strictly prohibited on ZRP Social. This includes, without
            limitation: child sexual abuse material in any form; sextortion or
            grooming targeting a minor; content that sexualizes a minor even
            without nudity; and facilitating or promoting contact with minors
            for sexual purposes. This applies to every surface of the
            platform, including posts, comments, direct messages, stories,
            profile media, and any file or link shared through the app.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold font-orbitron mb-3 text-zrp-red">
            2. Minimum age
          </h2>
          <p className="leading-7 text-[15px]">
            ZRP Social requires every account holder to be at least 16 years
            old. Accounts identified as belonging to a person below this
            minimum age may be removed in accordance with our policies and
            applicable law.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold font-orbitron mb-3 text-zrp-red">
            3. Reporting a concern
          </h2>
          <p className="leading-7 text-[15px]">
            Every post, comment, message thread, and profile on ZRP Social can
            be reported directly from within the app. Reports involving child
            safety concerns are prioritized for review in accordance with our
            internal safety procedures. You do not need an account to raise a
            child safety concern with us. Please use the contact information
            below.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold font-orbitron mb-3 text-zrp-red">
            4. What happens after a report
          </h2>
          <p className="leading-7 text-[15px]">
            Content that violates this policy may be removed, and accounts
            responsible for serious or confirmed violations may be suspended
            or permanently terminated in accordance with our policies and
            applicable law. Where required by applicable law, or otherwise
            permitted by law, we report confirmed CSAM and other child-safety
            matters to the appropriate authorities and cooperate with lawful
            requests from law enforcement.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold font-orbitron mb-3 text-zrp-red">
            5. Contact us
          </h2>
          <p className="leading-7 text-[15px]">
            To report a child safety concern, or to reach our designated
            child safety contact, email{" "}
            <a
              href="mailto:contact@zrp.one"
              className="text-zrp-red underline"
            >
              contact@zrp.one
            </a>
            . Child safety reports are handled in accordance with our internal
            safety and enforcement procedures and applicable law.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold font-orbitron mb-3 text-zrp-red">
            6. Related policies
          </h2>
          <p className="leading-7 text-[15px]">
            This page supplements, and does not replace, our{" "}
            <Link href="/community-code" className="text-zrp-red underline">
              Community &amp; Leadership Code
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="text-zrp-red underline">
              Terms of Service
            </Link>
            , which govern acceptable use of ZRP Social more broadly.
          </p>
        </div>
      </section>
    </div>
  );
}
