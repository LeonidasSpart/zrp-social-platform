"use client";

import { useLanguage } from "@/contexts/LanguageContext";

export default function PressKitPage() {
  const { t } = useLanguage();

  const FEATURES = [
    { title: t("press.feature1Title"), desc: t("press.feature1Desc") },
    { title: t("press.feature2Title"), desc: t("press.feature2Desc") },
    { title: t("press.feature3Title"), desc: t("press.feature3Desc") },
    { title: t("press.feature4Title"), desc: t("press.feature4Desc") },
    { title: t("press.feature5Title"), desc: t("press.feature5Desc") },
    { title: t("press.feature6Title"), desc: t("press.feature6Desc") },
  ];

  const STATS = [{ label: t("press.statUsersLabel"), value: "195,000+" }];

  const COLORS = [
    { name: "ZRP Red", hex: "#FF2D2D", class: "bg-zrp-red" },
    { name: "Dark Red", hex: "#B10000", class: "bg-zrp-darkRed" },
    { name: "White", hex: "#FFFFFF", class: "bg-white border border-zrp-silver/50" },
    { name: "Silver", hex: "#BDDBDB", class: "bg-zrp-silver" },
    { name: "Charcoal", hex: "#0D0D0D", class: "bg-zrp-charcoal" },
    { name: "Deep Black", hex: "#050505", class: "bg-zrp-deepBlack" },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter">
      <main>

        {/* Hero — same visual style as Careers */}
        <section className="relative bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">

            <img
              src="/logo.png"
              alt="ZRP Social Logo"
              className="h-16 mx-auto mb-6"
            />

            <h1 className="text-4xl sm:text-5xl font-extrabold font-orbitron text-white leading-tight">
              {t("press.heroTitle")}
            </h1>

            <p className="mt-4 text-xl text-white/90 font-inter max-w-2xl mx-auto">
              {t("press.heroSubtitle")}
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
              <span className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-white font-medium font-inter">
                {t("press.versionBadge")}
              </span>

              <span className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-white font-medium font-inter">
                {t("press.emailBadge")}
              </span>
            </div>

          </div>
        </section>

        {/* Overview */}
        <section className="py-16 px-4 max-w-6xl mx-auto">

          <div className="grid md:grid-cols-2 gap-12 items-center">

            <div>

              <h2 className="text-3xl font-bold font-orbitron text-zrp-charcoal dark:text-white mb-4">
                {t("press.overviewHeading")}
              </h2>

              <p className="text-zrp-charcoal/80 dark:text-white/70 font-inter leading-relaxed">
                <strong className="text-zrp-red">ZRP Social</strong> {t("press.overviewIntro")}
              </p>

              <ul className="mt-4 space-y-3 font-inter">

                <li className="flex items-start gap-3">
                  <span className="text-zrp-red font-bold">•</span>

                  <span className="text-zrp-charcoal/80 dark:text-white/70">
                    <strong className="text-zrp-charcoal dark:text-white">
                      {t("press.pillar1Title")}
                    </strong>{' '}
                    – {t("press.pillar1Desc")}
                  </span>
                </li>

                <li className="flex items-start gap-3">
                  <span className="text-zrp-red font-bold">•</span>

                  <span className="text-zrp-charcoal/80 dark:text-white/70">
                    <strong className="text-zrp-charcoal dark:text-white">
                      {t("press.pillar2Title")}
                    </strong>{' '}
                    – {t("press.pillar2Desc")}
                  </span>
                </li>

                <li className="flex items-start gap-3">
                  <span className="text-zrp-red font-bold">•</span>

                  <span className="text-zrp-charcoal/80 dark:text-white/70">
                    <strong className="text-zrp-charcoal dark:text-white">
                      {t("press.pillar3Title")}
                    </strong>{' '}
                    –{' '}
                    <span className="text-zrp-red font-semibold">
                      {t("press.pillar3Bold")}
                    </span>{' '}
                    {t("press.pillar3Desc")}
                  </span>
                </li>

              </ul>

            </div>

            <div className="bg-zrp-silver/20 dark:bg-zrp-charcoal/50 p-8 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal text-center">

              <div className="text-6xl font-orbitron font-bold text-zrp-red">
                35%
              </div>

              <p className="text-zrp-charcoal/70 dark:text-white/70 font-inter mt-2">
                {t("press.profitsGoTo")}
                <br />
                <span className="text-zrp-charcoal dark:text-white font-semibold">
                  {t("press.profitsGoToCauses")}
                </span>
              </p>

              <div className="mt-4 flex justify-center gap-2">
                <span className="text-2xl">👶</span>
                <span className="text-2xl">📚</span>
                <span className="text-2xl">🏥</span>
                <span className="text-2xl">🌍</span>
              </div>

            </div>

          </div>

        </section>

        {/* Key Features */}
        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">

          <div className="max-w-6xl mx-auto">

            <h2 className="text-3xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-12">
              {t("press.keyFeaturesHeading")}
            </h2>

            <div className="grid md:grid-cols-3 gap-6">

              {FEATURES.map((feature) => (

                <div
                  key={feature.title}
                  className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal"
                >

                  <h3 className="text-lg font-bold font-orbitron text-zrp-charcoal dark:text-white">
                    {feature.title}
                  </h3>

                  <p className="mt-2 text-zrp-charcoal/70 dark:text-white/70 font-inter text-sm">
                    {feature.desc}
                  </p>

                </div>

              ))}

            </div>

          </div>

        </section>

        {/* Charity Commitment */}
        <section className="py-16 px-4 max-w-6xl mx-auto">

          <h2 className="text-3xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-8">
            {t("press.charityCommitmentHeading")}
          </h2>

          {/* Careers-style dark gradient */}
          <div className="bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack rounded-xl p-8 text-white">

            <p className="text-xl font-inter mb-6">
              ZRP Social {t("press.notJustAnotherNetwork")}{' '}
              <strong>{t("press.notJustAnotherNetworkBold")}</strong> – {t("press.notJustAnotherNetworkRest")}
            </p>

            <div className="grid sm:grid-cols-2 gap-6">

              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">

                <div className="text-3xl font-orbitron font-bold">
                  35%
                </div>

                <p className="font-inter text-sm opacity-90">
                  {t("press.netProfitsLabel")}
                </p>

              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">

                <div className="flex gap-2 text-2xl">
                  👶📚🏥🌍
                </div>

                <p className="font-inter text-sm opacity-90">
                  {t("press.fourCausesLabel")}
                </p>

              </div>

            </div>

            <div className="mt-4 text-sm font-inter opacity-80 border-t border-white/20 pt-4">
              {t("press.transparencyNote")}
            </div>

          </div>

        </section>

        {/* Platform Statistics */}
        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">

          <div className="max-w-6xl mx-auto">

            <h2 className="text-3xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-4">
              {t("press.platformStatsHeading")}
            </h2>

            <p className="text-center text-zrp-charcoal/70 dark:text-white/70 font-inter mb-10">

              <span className="bg-zrp-red/10 dark:bg-zrp-red/20 text-zrp-red px-3 py-1 rounded-full text-sm font-medium">
                {t("press.dataAsOf")}
              </span>

            </p>

            <div className="grid grid-cols-1 md:grid-cols-1 gap-4 max-w-sm mx-auto">

              {STATS.map((stat) => (

                <div
                  key={stat.label}
                  className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal text-center"
                >

                  <div className="text-2xl font-bold font-orbitron text-zrp-red">
                    {stat.value}
                  </div>

                  <div className="text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter mt-1">
                    {stat.label}
                  </div>

                </div>

              ))}

            </div>

          </div>

        </section>

        {/* Brand Assets */}
        <section className="py-16 px-4 max-w-6xl mx-auto">

          <h2 className="text-3xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-4">
            {t("press.brandAssetsHeading")}
          </h2>

          <p className="text-center text-zrp-charcoal/70 dark:text-white/70 font-inter mb-10 max-w-2xl mx-auto">
            {t("press.brandAssetsDesc")}
          </p>

          {/* Logo and icons */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">

            <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/50 p-4 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal text-center">

              <img
                src="/logo.png"
                alt="Logo"
                className="h-16 mx-auto"
              />

              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">
                {t("press.logoLabel")}
              </p>

              <a
                href="/logo.png"
                download
                className="text-xs text-zrp-red hover:underline font-inter"
              >
                {t("press.download")}
              </a>

            </div>

            <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/50 p-4 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal text-center">

              <img
                src="/favicon.png"
                alt="Favicon"
                className="h-12 mx-auto"
              />

              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">
                {t("press.faviconLabel")}
              </p>

              <a
                href="/favicon.png"
                download
                className="text-xs text-zrp-red hover:underline font-inter"
              >
                {t("press.download")}
              </a>

            </div>

            <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/50 p-4 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal text-center">

              <img
                src="/icon-192.png"
                alt="Icon 192"
                className="h-16 mx-auto"
              />

              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">
                {t("press.icon192Label")}
              </p>

              <a
                href="/icon-192.png"
                download
                className="text-xs text-zrp-red hover:underline font-inter"
              >
                {t("press.download")}
              </a>

            </div>

            <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/50 p-4 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal text-center">

              <img
                src="/icon-512.png"
                alt="Icon 512"
                className="h-16 mx-auto"
              />

              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">
                {t("press.icon512Label")}
              </p>

              <a
                href="/icon-512.png"
                download
                className="text-xs text-zrp-red hover:underline font-inter"
              >
                {t("press.download")}
              </a>

            </div>

          </div>

          {/* Colors */}
          <div className="mb-12">

            <h3 className="text-xl font-bold font-orbitron text-zrp-charcoal dark:text-white mb-4">
              {t("press.colorPaletteHeading")}
            </h3>

            <div className="flex flex-wrap gap-4">

              {COLORS.map((color) => (

                <div
                  key={color.name}
                  className="flex items-center gap-3 bg-zrp-silver/10 dark:bg-zrp-charcoal/50 px-4 py-2 rounded-lg border border-zrp-silver/30 dark:border-zrp-charcoal"
                >

                  <div
                    className={`w-10 h-10 rounded-full ${color.class} ${
                      color.name === 'White'
                        ? 'border border-zrp-silver/50'
                        : ''
                    }`}
                  />

                  <div>

                    <div className="text-sm font-semibold text-zrp-charcoal dark:text-white font-orbitron">
                      {color.name}
                    </div>

                    <div className="text-xs text-zrp-charcoal/60 dark:text-white/60 font-inter">
                      {color.hex}
                    </div>

                  </div>

                </div>

              ))}

            </div>

          </div>

          {/* Typography */}
          <div>

            <h3 className="text-xl font-bold font-orbitron text-zrp-charcoal dark:text-white mb-4">
              {t("press.typographyHeading")}
            </h3>

            <div className="grid md:grid-cols-2 gap-6">

              <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/50 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">

                <div className="text-3xl font-orbitron text-zrp-red">
                  Orbitron
                </div>

                <p className="text-zrp-charcoal/70 dark:text-white/70 font-inter text-sm mt-2">
                  {t("press.orbitronDesc")}
                </p>

                <div className="mt-3 text-zrp-charcoal/50 dark:text-white/50 font-orbitron text-sm tracking-wider">
                  ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789
                </div>

              </div>

              <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/50 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">

                <div className="text-3xl font-inter text-zrp-charcoal dark:text-white">
                  Inter
                </div>

                <p className="text-zrp-charcoal/70 dark:text-white/70 font-inter text-sm mt-2">
                  {t("press.interDesc")}
                </p>

                <div className="mt-3 text-zrp-charcoal/50 dark:text-white/50 font-inter text-sm tracking-wider">
                  ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789
                </div>

              </div>

            </div>

          </div>

        </section>

        {/* Press Contact — same Careers color treatment */}
        <section className="bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-16 px-4">

          <div className="max-w-4xl mx-auto text-center text-white">

            <h2 className="text-3xl font-bold font-orbitron">
              {t("press.pressContactHeading")}
            </h2>

            <div className="mt-6 flex flex-wrap justify-center gap-6">

              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 min-w-[200px]">

                <div className="text-sm font-inter opacity-80">
                  {t("press.emailLabel")}
                </div>

                <div className="font-inter font-semibold">
                  press@zrp.one
                </div>

              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 min-w-[200px]">

                <div className="text-sm font-inter opacity-80">
                  {t("press.websiteLabel")}
                </div>

                <div className="font-inter font-semibold">
                  zrp.one
                </div>

              </div>

            </div>

            <p className="mt-6 text-sm font-inter opacity-80">
              {t("press.mediaInquiriesNote")}
            </p>

          </div>

        </section>

        {/* Mission Statement */}
        <section className="py-16 px-4 max-w-4xl mx-auto text-center">

          <blockquote className="text-2xl font-orbitron text-zrp-charcoal dark:text-white italic">
            {t("press.missionQuote")}
          </blockquote>

          <div className="mt-6 text-zrp-charcoal/50 dark:text-white/50 font-inter text-sm">
            {t("press.missionAttribution")}
          </div>

        </section>

      </main>
    </div>
  );
}
