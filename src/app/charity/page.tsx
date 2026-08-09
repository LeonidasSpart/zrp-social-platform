// app/charity/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Charity – ZRP Social',
  description: 'ZRP Social donates 35% of profits to orphans, schools, hospitals, and climate relief. Quarterly transparency reports coming soon.',
};

const CAUSES = [
  {
    title: 'Orphans & Vulnerable Children',
    description: 'Supporting orphanages, foster care programs, and educational scholarships for children without parents.',
    icon: '👶',
    percentage: 35,
  },
  {
    title: 'Schools & Education',
    description: 'Building classrooms, providing learning materials, and funding teacher training in underserved communities.',
    icon: '📚',
    percentage: 25,
  },
  {
    title: 'Hospitals & Healthcare',
    description: 'Equipping clinics, funding medical supplies, and supporting maternal and child health initiatives.',
    icon: '🏥',
    percentage: 20,
  },
  {
    title: 'Climate Relief',
    description: 'Reforestation projects, renewable energy adoption, and disaster response for climate-affected regions.',
    icon: '🌍',
    percentage: 20,
  },
];

export default function CharityPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-deep-black font-inter">
      {/* Header – brand colors */}
      <header className="border-b border-silver/30 dark:border-charcoal/50 bg-white/80 dark:bg-deep-black/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold font-orbitron">
            <span className="text-zrp-red">ZRP</span>
            <span className="text-charcoal dark:text-white">Social</span>
          </Link>
          <nav className="space-x-6 text-sm font-medium">
            <Link href="/" className="text-charcoal/70 hover:text-zrp-red dark:text-white/70 dark:hover:text-zrp-red transition">
              Home
            </Link>
            <Link href="/about" className="text-charcoal/70 hover:text-zrp-red dark:text-white/70 dark:hover:text-zrp-red transition">
              About
            </Link>
            <Link href="/charity" className="text-zrp-red font-semibold">
              Charity
            </Link>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main>
        {/* Hero – brand gradient (red to dark red) */}
        <section className="relative bg-gradient-to-br from-zrp-red to-dark-red py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-extrabold font-orbitron text-white leading-tight">
              Giving Back, <br />
              <span className="text-white/90">35% of Our Profits</span>
            </h1>
            <p className="mt-6 text-xl text-white/90 max-w-2xl mx-auto font-inter">
              At ZRP Social, we believe social media should have a social impact.
              That's why <strong className="text-white">35% of our platform profits</strong> are dedicated to
              charities supporting orphans, schools, hospitals, and climate relief.
            </p>
            <p className="mt-4 text-lg text-white/80 max-w-2xl mx-auto">
              <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium">
                📅 Quarterly transparency reports
              </span>
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="#how-it-works"
                className="px-6 py-3 bg-white text-zrp-red font-semibold rounded-full shadow-lg hover:bg-silver transition font-inter"
              >
                Learn How It Works
              </Link>
              <Link
                href="#transparency"
                className="px-6 py-3 bg-transparent border-2 border-white text-white font-semibold rounded-full shadow-lg hover:bg-white/10 transition font-inter"
              >
                See Transparency
              </Link>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-16 px-4 max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-charcoal dark:text-white font-orbitron mb-12">
            How ZRP Gives to Charity
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6 bg-silver/20 dark:bg-charcoal/50 rounded-xl shadow-sm border border-silver/30 dark:border-charcoal">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-xl font-semibold text-charcoal dark:text-white font-orbitron">1. Platform Profits</h3>
              <p className="mt-2 text-charcoal/80 dark:text-white/70 font-inter">
                Revenue comes from premium subscriptions, tips, and business plans.
                After operational costs, <strong className="text-zrp-red">35% of net profits</strong> are set aside for charity.
              </p>
            </div>
            <div className="text-center p-6 bg-silver/20 dark:bg-charcoal/50 rounded-xl shadow-sm border border-silver/30 dark:border-charcoal">
              <div className="text-4xl mb-4">⚖️</div>
              <h3 className="text-xl font-semibold text-charcoal dark:text-white font-orbitron">2. Transparent Allocation</h3>
              <p className="mt-2 text-charcoal/80 dark:text-white/70 font-inter">
                Funds are split across our four pillars: orphans, education,
                healthcare, and climate. We publish detailed reports <strong className="text-zrp-red">every three months</strong>.
              </p>
            </div>
            <div className="text-center p-6 bg-silver/20 dark:bg-charcoal/50 rounded-xl shadow-sm border border-silver/30 dark:border-charcoal">
              <div className="text-4xl mb-4">🤝</div>
              <h3 className="text-xl font-semibold text-charcoal dark:text-white font-orbitron">3. Direct Impact</h3>
              <p className="mt-2 text-charcoal/80 dark:text-white/70 font-inter">
                We partner with vetted NGOs and local organisations to ensure
                your contributions reach those who need them most.
                <br />
                <span className="text-sm text-zrp-red font-medium">First official donation report: Q3 2026</span>
              </p>
            </div>
          </div>
        </section>

        {/* Causes – Where the 35% Goes */}
        <section className="bg-silver/10 dark:bg-charcoal/30 py-16 px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center text-charcoal dark:text-white font-orbitron mb-4">
              Where the 35% Goes
            </h2>
            <p className="text-center text-charcoal/70 dark:text-white/70 mb-12 max-w-2xl mx-auto font-inter">
              The charity budget is distributed across these four causes. We believe in
              holistic impact – from a child's first classroom to a community's
              clean water.
            </p>
            <div className="grid md:grid-cols-2 gap-8">
              {CAUSES.map((cause) => (
                <div
                  key={cause.title}
                  className="bg-white dark:bg-charcoal/80 p-6 rounded-xl shadow-md border border-silver/30 dark:border-charcoal flex items-start gap-4"
                >
                  <span className="text-3xl">{cause.icon}</span>
                  <div>
                    <h3 className="text-xl font-semibold text-charcoal dark:text-white font-orbitron">
                      {cause.title}
                    </h3>
                    <p className="text-charcoal/70 dark:text-white/70 mt-1 font-inter">{cause.description}</p>
                    <div className="mt-3 w-full bg-silver/50 dark:bg-charcoal rounded-full h-2.5">
                      <div
                        className="bg-zrp-red h-2.5 rounded-full"
                        style={{ width: `${cause.percentage}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-charcoal/60 dark:text-white/60 font-inter">
                      {cause.percentage}% of charity budget
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Transparency & Impact – No data shared yet */}
        <section id="transparency" className="py-16 px-4 max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-charcoal dark:text-white font-orbitron mb-4">
            Transparency & Impact
          </h2>
          <p className="text-center text-charcoal/70 dark:text-white/70 mb-12 max-w-2xl mx-auto font-inter">
            We believe in full transparency. <strong className="text-zrp-red">No donation data has been shared yet</strong> – 
            we will publish our first official report <strong className="text-zrp-red">every three months</strong>.
            <br />
            <span className="text-sm text-zrp-red font-medium">
              📅 First report: Q3 2026
            </span>
          </p>

          {/* Placeholder stats */}
          <div className="grid md:grid-cols-3 gap-6 text-center">
            <div className="bg-silver/20 dark:bg-charcoal/50 p-6 rounded-xl border border-silver/30 dark:border-charcoal">
              <div className="text-4xl font-bold text-zrp-red font-orbitron">—</div>
              <p className="text-charcoal/70 dark:text-white/70 mt-2 font-inter">Total Donated (coming soon)</p>
            </div>
            <div className="bg-silver/20 dark:bg-charcoal/50 p-6 rounded-xl border border-silver/30 dark:border-charcoal">
              <div className="text-4xl font-bold text-zrp-red font-orbitron">—</div>
              <p className="text-charcoal/70 dark:text-white/70 mt-2 font-inter">Lives Impacted (coming soon)</p>
            </div>
            <div className="bg-silver/20 dark:bg-charcoal/50 p-6 rounded-xl border border-silver/30 dark:border-charcoal">
              <div className="text-4xl font-bold text-zrp-red font-orbitron">—</div>
              <p className="text-charcoal/70 dark:text-white/70 mt-2 font-inter">Projects Supported (coming soon)</p>
            </div>
          </div>

          {/* Cause breakdown – placeholder */}
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="bg-silver/10 dark:bg-charcoal/30 p-4 rounded-lg border border-silver/30 dark:border-charcoal">
              <p className="text-2xl font-bold text-charcoal dark:text-white font-orbitron">—</p>
              <p className="text-sm text-charcoal/60 dark:text-white/60 font-inter">Orphanages</p>
            </div>
            <div className="bg-silver/10 dark:bg-charcoal/30 p-4 rounded-lg border border-silver/30 dark:border-charcoal">
              <p className="text-2xl font-bold text-charcoal dark:text-white font-orbitron">—</p>
              <p className="text-sm text-charcoal/60 dark:text-white/60 font-inter">Schools</p>
            </div>
            <div className="bg-silver/10 dark:bg-charcoal/30 p-4 rounded-lg border border-silver/30 dark:border-charcoal">
              <p className="text-2xl font-bold text-charcoal dark:text-white font-orbitron">—</p>
              <p className="text-sm text-charcoal/60 dark:text-white/60 font-inter">Hospitals</p>
            </div>
            <div className="bg-silver/10 dark:bg-charcoal/30 p-4 rounded-lg border border-silver/30 dark:border-charcoal">
              <p className="text-2xl font-bold text-charcoal dark:text-white font-orbitron">—</p>
              <p className="text-sm text-charcoal/60 dark:text-white/60 font-inter">Climate Projects</p>
            </div>
          </div>

          <div className="mt-8 text-center text-charcoal/50 dark:text-white/50 text-sm border-t border-silver/30 dark:border-charcoal pt-6 font-inter">
            ⏳ We are currently accumulating funds. The first quarterly report will include verified donation amounts and project details.
          </div>
        </section>

        {/* Call to Action – brand red */}
        <section className="bg-gradient-to-r from-zrp-red to-dark-red py-16 px-4">
          <div className="max-w-4xl mx-auto text-center text-white">
            <h2 className="text-3xl font-bold font-orbitron">Be Part of Something Bigger</h2>
            <p className="mt-4 text-lg opacity-90 font-inter">
              Every time you post, like, or subscribe on ZRP Social, you're
              contributing to real change – because <strong className="text-white">35% of our profits</strong>
              go to those who need it most. Join us in making social media a
              force for good.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="/signup"
                className="px-8 py-3 bg-white text-zrp-red font-semibold rounded-full shadow-lg hover:bg-silver transition font-inter"
              >
                Create Your Account
              </Link>
              <Link
                href="/about"
                className="px-8 py-3 border-2 border-white text-white font-semibold rounded-full hover:bg-white/10 transition font-inter"
              >
                Learn About ZRP
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer removed – global footer will render via layout */}
    </div>
  );
}
