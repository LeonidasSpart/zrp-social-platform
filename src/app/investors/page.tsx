import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Investors – ZRP Social',
  description:
    'Investor information for ZRP Social – a Swiss European social media platform built for people, privacy, security, and global communities.',
};

const platformFeatures = [
  {
    title: 'Social Feed',
    desc: 'A modern social experience for posts, reposts, comments, media, hashtags, discovery, and personalized content.',
  },
  {
    title: 'ZRP Shorts',
    desc: 'A vertical short video experience designed for content discovery, creators, and community engagement.',
  },
  {
    title: 'Private Messaging',
    desc: 'Real time private communication designed to help users connect directly and securely.',
  },
  {
    title: 'Creator Experience',
    desc: 'Tools designed to help creators publish content, build audiences, and develop their presence on ZRP.',
  },
  {
    title: 'Communities',
    desc: 'A global platform with local communities designed around countries, interests, creators, and shared ideas.',
  },
  {
    title: 'Security & Moderation',
    desc: 'Continuous improvements to spam protection, abuse prevention, reporting, moderation, and platform safety.',
  },
];

const investmentAreas = [
  {
    title: 'Technology',
    desc: 'Building scalable infrastructure and continuously improving the ZRP product experience.',
  },
  {
    title: 'Global Expansion',
    desc: 'Growing ZRP communities internationally while maintaining a strong European foundation.',
  },
  {
    title: 'Community',
    desc: 'Supporting creators, users, country communities, and local ZRP initiatives.',
  },
  {
    title: 'Product Development',
    desc: 'Introducing new products and capabilities that increase engagement and strengthen the platform.',
  },
];

export default function InvestorsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter text-zrp-charcoal dark:text-white">
      <main>

        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-zrp-red to-zrp-darkRed py-20 sm:py-24 px-4">
          <div className="absolute inset-0 bg-black/10" />

          <div className="relative max-w-5xl mx-auto text-center">
            <img
              src="/logo.png"
              alt="ZRP Social Logo"
              className="h-16 sm:h-20 mx-auto mb-7"
            />

            <div className="inline-flex items-center rounded-full bg-white/15 backdrop-blur-sm px-4 py-2 text-sm text-white font-medium mb-6">
              Investor Relations
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold font-orbitron text-white leading-tight">
              Building the Future of Social
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-white/90 font-inter max-w-3xl mx-auto leading-relaxed">
              ZRP Social is a Swiss European social media platform built around
              people, privacy, security, freedom of expression, and global
              communities.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <a
                href="#investment"
                className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-sm font-bold text-zrp-red hover:bg-white/90 transition font-inter"
              >
                Investment Opportunity
              </a>

              <a
                href="#contact"
                className="inline-flex items-center justify-center rounded-lg border border-white/40 bg-white/10 backdrop-blur-sm px-6 py-3 text-sm font-bold text-white hover:bg-white/20 transition font-inter"
              >
                Contact ZRP
              </a>
            </div>
          </div>
        </section>

        {/* Introduction */}
        <section className="py-16 sm:py-20 px-4 max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            <div>
              <div className="text-sm font-semibold uppercase tracking-widest text-zrp-red font-inter mb-3">
                The Vision
              </div>

              <h2 className="text-3xl sm:text-4xl font-bold font-orbitron text-zrp-charcoal dark:text-white">
                A social platform built for the next generation
              </h2>

              <p className="mt-6 text-zrp-charcoal/75 dark:text-white/70 leading-relaxed font-inter">
                ZRP is being developed with a simple idea: social media should
                help people connect, communicate, create, and build communities
                without losing control of their digital experience.
              </p>

              <p className="mt-4 text-zrp-charcoal/75 dark:text-white/70 leading-relaxed font-inter">
                From its Swiss European foundation, ZRP is designed with a
                global ambition and a long term focus on technology,
                communities, security, and product innovation.
              </p>
            </div>

            <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/50 rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal p-8">
              <div className="text-5xl sm:text-6xl font-orbitron font-bold text-zrp-red">
                ZRP
              </div>

              <p className="mt-3 text-xl font-orbitron text-zrp-charcoal dark:text-white">
                Swiss. European. For the World.
              </p>

              <div className="mt-7 grid grid-cols-2 gap-4">
                {[
                  ['Privacy', 'Built into the experience'],
                  ['Security', 'Continuous protection'],
                  ['Community', 'Global and local'],
                  ['Innovation', 'Continuous development'],
                ].map(([title, desc]) => (
                  <div
                    key={title}
                    className="rounded-xl bg-white dark:bg-zrp-charcoal/80 border border-zrp-silver/30 dark:border-zrp-charcoal p-4"
                  >
                    <div className="font-orbitron font-bold text-zrp-red">
                      {title}
                    </div>
                    <div className="mt-1 text-xs text-zrp-charcoal/65 dark:text-white/60 font-inter">
                      {desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>

        {/* Platform */}
        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 sm:py-20 px-4">
          <div className="max-w-6xl mx-auto">

            <div className="text-center max-w-3xl mx-auto">
              <div className="text-sm font-semibold uppercase tracking-widest text-zrp-red font-inter mb-3">
                The Platform
              </div>

              <h2 className="text-3xl sm:text-4xl font-bold font-orbitron text-zrp-charcoal dark:text-white">
                More than another social network
              </h2>

              <p className="mt-4 text-zrp-charcoal/70 dark:text-white/70 font-inter leading-relaxed">
                ZRP is developing a complete social ecosystem designed to
                connect people, creators, businesses, and communities.
              </p>
            </div>

            <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {platformFeatures.map((feature) => (
                <div
                  key={feature.title}
                  className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal"
                >
                  <div className="w-10 h-10 rounded-lg bg-zrp-red/10 dark:bg-zrp-red/20 flex items-center justify-center text-zrp-red font-orbitron font-bold">
                    Z
                  </div>

                  <h3 className="mt-5 text-lg font-bold font-orbitron text-zrp-charcoal dark:text-white">
                    {feature.title}
                  </h3>

                  <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* What Makes ZRP Different */}
        <section className="py-16 sm:py-20 px-4 max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto">
            <div className="text-sm font-semibold uppercase tracking-widest text-zrp-red font-inter mb-3">
              Our Position
            </div>

            <h2 className="text-3xl sm:text-4xl font-bold font-orbitron text-zrp-charcoal dark:text-white">
              Why ZRP?
            </h2>

            <p className="mt-4 text-zrp-charcoal/70 dark:text-white/70 font-inter">
              We believe the next generation of social platforms should put
              people and communities at the center.
            </p>
          </div>

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              'Freedom of Speech',
              'Privacy First',
              'Security Focused',
              'Community Driven',
            ].map((item) => (
              <div
                key={item}
                className="rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/50 p-6 text-center"
              >
                <div className="text-2xl font-orbitron font-bold text-zrp-red">
                  ZRP
                </div>

                <div className="mt-3 font-semibold font-inter text-zrp-charcoal dark:text-white">
                  {item}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Growth */}
        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 sm:py-20 px-4">
          <div className="max-w-6xl mx-auto">

            <div className="text-center">
              <div className="text-sm font-semibold uppercase tracking-widest text-zrp-red font-inter mb-3">
                Growth
              </div>

              <h2 className="text-3xl sm:text-4xl font-bold font-orbitron text-zrp-charcoal dark:text-white">
                Building momentum
              </h2>

              <p className="mt-4 max-w-2xl mx-auto text-zrp-charcoal/70 dark:text-white/70 font-inter">
                ZRP is live and continuously evolving, with new features,
                products, communities, and improvements being introduced as
                the platform grows.
              </p>
            </div>

            <div className="mt-12 grid md:grid-cols-3 gap-6">

              <div className="bg-white dark:bg-zrp-charcoal/80 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal p-7 text-center">
                <div className="text-4xl font-bold font-orbitron text-zrp-red">
                  195K+
                </div>
                <div className="mt-2 text-sm text-zrp-charcoal/65 dark:text-white/65 font-inter">
                  Registered users
                </div>
              </div>

              <div className="bg-white dark:bg-zrp-charcoal/80 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal p-7 text-center">
                <div className="text-4xl font-bold font-orbitron text-zrp-red">
                  Global
                </div>
                <div className="mt-2 text-sm text-zrp-charcoal/65 dark:text-white/65 font-inter">
                  Community expansion
                </div>
              </div>

              <div className="bg-white dark:bg-zrp-charcoal/80 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal p-7 text-center">
                <div className="text-4xl font-bold font-orbitron text-zrp-red">
                  Live
                </div>
                <div className="mt-2 text-sm text-zrp-charcoal/65 dark:text-white/65 font-inter">
                  Platform continuously improving
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Business Model */}
        <section className="py-16 sm:py-20 px-4 max-w-6xl mx-auto" id="investment">
          <div className="grid lg:grid-cols-2 gap-12">

            <div>
              <div className="text-sm font-semibold uppercase tracking-widest text-zrp-red font-inter mb-3">
                Business Model
              </div>

              <h2 className="text-3xl sm:text-4xl font-bold font-orbitron text-zrp-charcoal dark:text-white">
                Multiple paths to sustainable growth
              </h2>

              <p className="mt-5 text-zrp-charcoal/70 dark:text-white/70 font-inter leading-relaxed">
                ZRP is developing a diversified business model designed to
                create long term value while maintaining an accessible core
                social experience.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                ['Advertising', 'Privacy conscious opportunities for businesses.'],
                ['Premium Services', 'Advanced products and features for users and creators.'],
                ['Creator Economy', 'Tools and services supporting creators and communities.'],
                ['Business & Enterprise', 'Professional solutions for organizations and companies.'],
              ].map(([title, desc]) => (
                <div
                  key={title}
                  className="rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/50 p-5"
                >
                  <h3 className="font-bold font-orbitron text-zrp-charcoal dark:text-white">
                    {title}
                  </h3>

                  <p className="mt-2 text-sm text-zrp-charcoal/65 dark:text-white/65 font-inter">
                    {desc}
                  </p>
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* Investment Areas */}
        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 sm:py-20 px-4">
          <div className="max-w-6xl mx-auto">

            <div className="text-center max-w-3xl mx-auto">
              <div className="text-sm font-semibold uppercase tracking-widest text-zrp-red font-inter mb-3">
                Investment Opportunity
              </div>

              <h2 className="text-3xl sm:text-4xl font-bold font-orbitron text-zrp-charcoal dark:text-white">
                Where investment can accelerate ZRP
              </h2>

              <p className="mt-4 text-zrp-charcoal/70 dark:text-white/70 font-inter">
                We are interested in strategic partners who can help accelerate
                technology, growth, expansion, and community development.
              </p>
            </div>

            <div className="mt-12 grid md:grid-cols-2 gap-6">
              {investmentAreas.map((area) => (
                <div
                  key={area.title}
                  className="bg-white dark:bg-zrp-charcoal/80 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal p-7"
                >
                  <div className="text-2xl font-orbitron font-bold text-zrp-red">
                    0{investmentAreas.indexOf(area) + 1}
                  </div>

                  <h3 className="mt-4 text-xl font-bold font-orbitron text-zrp-charcoal dark:text-white">
                    {area.title}
                  </h3>

                  <p className="mt-2 text-zrp-charcoal/70 dark:text-white/70 font-inter leading-relaxed">
                    {area.desc}
                  </p>
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* Charity */}
        <section className="py-16 sm:py-20 px-4 max-w-6xl mx-auto">
          <div className="bg-gradient-to-r from-zrp-red to-zrp-darkRed rounded-2xl p-8 sm:p-10 text-white">

            <div className="grid lg:grid-cols-2 gap-10 items-center">

              <div>
                <div className="text-sm font-semibold uppercase tracking-widest text-white/80 font-inter">
                  Social Impact
                </div>

                <h2 className="mt-3 text-3xl sm:text-4xl font-bold font-orbitron">
                  Growth with a purpose
                </h2>

                <p className="mt-5 text-white/90 font-inter leading-relaxed">
                  ZRP has committed 35% of platform profits to charitable
                  causes. The commitment focuses on areas including orphans,
                  schools, hospitals, and climate relief.
                </p>
              </div>

              <div className="text-center">
                <div className="text-7xl font-bold font-orbitron">
                  35%
                </div>

                <div className="mt-2 text-white/90 font-inter">
                  of platform profits committed to charity
                </div>

                <div className="mt-6 text-3xl">
                  👶 📚 🏥 🌍
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Investor CTA */}
        <section
          id="contact"
          className="bg-gradient-to-br from-zrp-red to-zrp-darkRed py-16 sm:py-20 px-4"
        >
          <div className="max-w-4xl mx-auto text-center text-white">

            <h2 className="text-3xl sm:text-4xl font-bold font-orbitron">
              Interested in ZRP?
            </h2>

            <p className="mt-5 text-lg text-white/90 font-inter leading-relaxed">
              We are looking for investors and strategic partners who believe
              in the long term opportunity to build a global social platform
              from Europe.
            </p>

            <div className="mt-8 grid sm:grid-cols-3 gap-4">

              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/10">
                <div className="font-orbitron font-bold">
                  Capital
                </div>
                <div className="mt-1 text-sm text-white/70 font-inter">
                  Supporting long term growth
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/10">
                <div className="font-orbitron font-bold">
                  Strategy
                </div>
                <div className="mt-1 text-sm text-white/70 font-inter">
                  Partnerships and expertise
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/10">
                <div className="font-orbitron font-bold">
                  Expansion
                </div>
                <div className="mt-1 text-sm text-white/70 font-inter">
                  Global community growth
                </div>
              </div>

            </div>

            <div className="mt-10 flex flex-wrap justify-center gap-4">

              <a
                href="mailto:investors@zrp.one"
                className="rounded-lg bg-white px-7 py-3 font-bold text-zrp-red hover:bg-white/90 transition font-inter"
              >
                Contact Investor Relations
              </a>

              <a
                href="/"
                className="rounded-lg border border-white/40 bg-white/10 px-7 py-3 font-bold text-white hover:bg-white/20 transition font-inter"
              >
                Visit ZRP
              </a>

            </div>

            <p className="mt-6 text-xs text-white/60 font-inter">
              Investment opportunities are subject to applicable legal and
              regulatory requirements. Information presented on this page is
              for general informational purposes and does not constitute an
              offer or solicitation to invest.
            </p>

          </div>
        </section>

        {/* Closing */}
        <section className="py-16 px-4 max-w-4xl mx-auto text-center">
          <blockquote className="text-2xl sm:text-3xl font-orbitron text-zrp-charcoal dark:text-white">
            “One world. One community. One ZRP.”
          </blockquote>

          <p className="mt-5 text-zrp-charcoal/50 dark:text-white/50 font-inter text-sm">
            ZRP Social
          </p>
        </section>

      </main>
    </div>
  );
}
