import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Investors – ZRP Social',
  description:
    'Investor information for ZRP Social. Discover our vision, platform, growth, business opportunities, and plans for building a global social platform from Switzerland.',
};

const WHY_ZRP = [
  {
    icon: '🇨🇭',
    title: 'Swiss European Foundation',
    description:
      'ZRP is built from Switzerland with a European approach to privacy, security, freedom of expression, and responsible technology.',
  },
  {
    icon: '🌍',
    title: 'Global Ambition',
    description:
      'ZRP is designed to serve users and communities worldwide while building strong local communities through our global expansion.',
  },
  {
    icon: '⚡',
    title: 'Rapid Product Development',
    description:
      'Our platform is evolving quickly with new products, features, and improvements being introduced continuously.',
  },
];

const PLATFORM = [
  {
    title: 'Social Platform',
    description:
      'Posts, comments, replies, likes, reposts, bookmarks, media, hashtags, discovery, and personalized feeds.',
  },
  {
    title: 'ZRP Shorts',
    description:
      'A dedicated short video experience for discovering, creating, and sharing engaging content.',
  },
  {
    title: 'Private Messaging',
    description:
      'Real time private communication that allows members to connect directly within ZRP.',
  },
  {
    title: 'Creator Ecosystem',
    description:
      'Tools designed to help creators publish content, build audiences, and develop their communities.',
  },
  {
    title: 'Global Communities',
    description:
      'A growing country and community structure designed to connect local communities to one global platform.',
  },
  {
    title: 'Security & Moderation',
    description:
      'Continuous investment in security, spam protection, abuse prevention, reporting, and responsible moderation.',
  },
];

const OPPORTUNITIES = [
  {
    icon: '💻',
    title: 'Technology',
    description:
      'Accelerating infrastructure, scalability, security, artificial intelligence, and product development.',
  },
  {
    icon: '🌍',
    title: 'Global Expansion',
    description:
      'Supporting the growth of ZRP communities and local operations around the world.',
  },
  {
    icon: '👥',
    title: 'Community Growth',
    description:
      'Growing the user, creator, business, and community ecosystem around ZRP.',
  },
  {
    icon: '🚀',
    title: 'New Products',
    description:
      'Developing new products and services that expand the ZRP ecosystem and create additional opportunities.',
  },
];

const INVESTOR_TYPES = [
  'Individual investors',
  'Angel investors',
  'Strategic investors',
  'Family offices',
  'Venture capital',
  'Corporate partners',
];

export default function InvestorsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter">
      <main>

        {/* Hero */}
        <section className="relative bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">

            <span className="inline-block bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium text-white/90 mb-6">
              🇨🇭 Swiss European Technology
            </span>

            <img
              src="/logo.png"
              alt="ZRP Social Logo"
              className="h-16 mx-auto mb-6 object-contain"
            />

            <h1 className="text-4xl sm:text-5xl font-extrabold font-orbitron text-white leading-tight">
              Invest in the Future of Social
            </h1>

            <p className="mt-6 text-xl text-white/90 max-w-2xl mx-auto font-inter">
              ZRP Social is building a global social platform from Switzerland,
              focused on people, privacy, security, freedom of expression, and
              real communities.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">

              <a
                href="mailto:investors@zrp.one"
                className="px-6 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-200 transition font-inter"
              >
                Contact Investor Relations
              </a>

              <Link
                href="/about"
                className="px-6 py-3 bg-transparent border-2 border-white text-white font-semibold rounded-full shadow-lg hover:bg-white/10 transition font-inter"
              >
                Learn About ZRP
              </Link>

            </div>
          </div>
        </section>

        {/* Vision */}
        <section className="py-16 px-4 max-w-6xl mx-auto">

          <div className="max-w-3xl mx-auto text-center">

            <h2 className="text-3xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
              Building a New Generation of Social Media
            </h2>

            <p className="mt-5 text-zrp-charcoal/80 dark:text-white/70 font-inter leading-relaxed">
              ZRP was created with a simple vision: build a social platform
              where people can connect, communicate, create, and build
              communities while keeping privacy, security, and freedom of
              expression at the center.
            </p>

            <p className="mt-4 text-zrp-charcoal/80 dark:text-white/70 font-inter leading-relaxed">
              We are building from Europe with a global ambition.
            </p>

          </div>

          <div className="mt-12 grid md:grid-cols-3 gap-8">

            {WHY_ZRP.map((item) => (
              <div
                key={item.title}
                className="text-center p-6 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl shadow-sm border border-zrp-silver/30 dark:border-zrp-charcoal"
              >
                <div className="text-4xl mb-4">
                  {item.icon}
                </div>

                <h3 className="text-xl font-semibold text-zrp-charcoal dark:text-white font-orbitron">
                  {item.title}
                </h3>

                <p className="mt-2 text-zrp-charcoal/80 dark:text-white/70 font-inter">
                  {item.description}
                </p>
              </div>
            ))}

          </div>
        </section>

        {/* Platform */}
        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">

          <div className="max-w-6xl mx-auto">

            <div className="max-w-3xl mx-auto text-center">

              <h2 className="text-3xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
                The ZRP Platform
              </h2>

              <p className="mt-4 text-zrp-charcoal/70 dark:text-white/70 font-inter">
                ZRP is developing a complete social ecosystem rather than a
                single social feed.
              </p>

            </div>

            <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-6">

              {PLATFORM.map((feature) => (
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

                  <p className="mt-2 text-zrp-charcoal/70 dark:text-white/70 font-inter text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}

            </div>
          </div>
        </section>

        {/* Growth */}
        <section className="py-16 px-4 max-w-6xl mx-auto">

          <div className="max-w-3xl mx-auto text-center">

            <h2 className="text-3xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
              ZRP Is Growing
            </h2>

            <p className="mt-4 text-zrp-charcoal/70 dark:text-white/70 font-inter">
              ZRP is live and developing rapidly. Our focus is on continuously
              improving the product while building a strong and engaged global
              community.
            </p>

          </div>

          <div className="mt-10 grid md:grid-cols-3 gap-6">

            <div className="text-center p-7 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
              <div className="text-4xl font-bold font-orbitron text-zrp-red">
                195K+
              </div>

              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">
                Registered users
              </p>
            </div>

            <div className="text-center p-7 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
              <div className="text-4xl font-bold font-orbitron text-zrp-red">
                Live
              </div>

              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">
                Platform available worldwide
              </p>
            </div>

            <div className="text-center p-7 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
              <div className="text-4xl font-bold font-orbitron text-zrp-red">
                Growing
              </div>

              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">
                New products and features continuously added
              </p>
            </div>

          </div>

          <p className="mt-6 text-center text-xs text-zrp-charcoal/50 dark:text-white/50 font-inter">
            Platform figures are provided for informational purposes and may
            change as ZRP continues to grow.
          </p>

        </section>

        {/* Investment Opportunities */}
        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">

          <div className="max-w-6xl mx-auto">

            <div className="max-w-3xl mx-auto text-center">

              <h2 className="text-3xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
                Where We Want to Grow
              </h2>

              <p className="mt-4 text-zrp-charcoal/70 dark:text-white/70 font-inter">
                Strategic investment and partnerships can help accelerate the
                next stage of ZRP.
              </p>

            </div>

            <div className="mt-12 grid md:grid-cols-2 gap-8">

              {OPPORTUNITIES.map((item) => (
                <div
                  key={item.title}
                  className="flex items-start gap-5 p-6 bg-white dark:bg-zrp-deepBlack rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal"
                >
                  <div className="text-3xl flex-shrink-0">
                    {item.icon}
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-zrp-charcoal dark:text-white font-orbitron">
                      {item.title}
                    </h3>

                    <p className="mt-2 text-zrp-charcoal/75 dark:text-white/70 font-inter">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}

            </div>

          </div>
        </section>

        {/* Investor Types */}
        <section className="py-16 px-4 max-w-4xl mx-auto">

          <h2 className="text-3xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-10">
            Who We Are Looking For
          </h2>

          <div className="grid sm:grid-cols-2 gap-4">

            {INVESTOR_TYPES.map((type) => (
              <div
                key={type}
                className="flex items-center gap-3 p-4 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-lg border border-zrp-silver/30 dark:border-zrp-charcoal"
              >
                <span className="text-zrp-red font-bold flex-shrink-0">
                  ✓
                </span>

                <span className="text-zrp-charcoal/90 dark:text-white/80 font-inter">
                  {type}
                </span>
              </div>
            ))}

          </div>

        </section>

        {/* Charity */}
        <section className="py-16 px-4 max-w-6xl mx-auto">

          <div className="bg-gradient-to-r from-zrp-red to-zrp-darkRed rounded-xl p-8 sm:p-10 text-white">

            <div className="grid md:grid-cols-2 gap-8 items-center">

              <div>

                <h2 className="text-3xl font-bold font-orbitron">
                  Growth With a Purpose
                </h2>

                <p className="mt-4 text-white/90 font-inter leading-relaxed">
                  ZRP has committed 35% of platform profits to charitable
                  causes, including support for orphans, schools, hospitals,
                  and climate relief.
                </p>

              </div>

              <div className="text-center">

                <div className="text-6xl font-bold font-orbitron">
                  35%
                </div>

                <p className="mt-2 text-white/80 font-inter">
                  of platform profits committed to charity
                </p>

                <div className="mt-5 text-3xl">
                  👶 📚 🏥 🌍
                </div>

              </div>

            </div>

          </div>

        </section>

        {/* Investor Contact */}
        <section className="bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-16 px-4">

          <div className="max-w-2xl mx-auto text-center">

            <h2 className="text-2xl sm:text-3xl font-bold text-white font-orbitron">
              Interested in ZRP?
            </h2>

            <p className="mt-3 text-white/80 font-inter">
              We would like to hear from investors and strategic partners who
              believe in the long term opportunity of building a global social
              platform from Europe.
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-4">

              <a
                href="mailto:investors@zrp.one"
                className="inline-block px-6 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-200 transition font-inter"
              >
                investors@zrp.one
              </a>

              <Link
                href="/about"
                className="inline-block px-6 py-3 bg-transparent border-2 border-white text-white font-semibold rounded-full hover:bg-white/10 transition font-inter"
              >
                Learn More About ZRP
              </Link>

            </div>

            <p className="mt-7 text-xs text-white/50 font-inter leading-relaxed">
              Information on this page is provided for general informational
              purposes only and does not constitute an offer, solicitation,
              investment recommendation, or guarantee of financial returns.
              Any investment opportunity will be subject to applicable legal
              and regulatory requirements.
            </p>

          </div>

        </section>

        {/* Closing */}
        <section className="py-16 px-4 max-w-4xl mx-auto text-center">

          <blockquote className="text-2xl font-orbitron text-zrp-charcoal dark:text-white italic">
            “One world. One community. One ZRP.”
          </blockquote>

          <div className="mt-6 text-zrp-charcoal/50 dark:text-white/50 font-inter text-sm">
            ZRP Social
          </div>

        </section>

      </main>
    </div>
  );
}
