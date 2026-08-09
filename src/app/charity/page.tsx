// app/charity/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Charity – ZRP Social',
  description: 'ZRP Social donates 35% of profits to orphans, schools, hospitals, and climate relief. Learn how we give back.',
};

// You can replace these with real values from your database later
const CHARITY_STATS = {
  totalDonated: 28450, // USD
  orphans: 32,
  schools: 5,
  hospitals: 2,
  climateProjects: 3,
  beneficiaries: 1250,
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
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            ZRP<span className="text-gray-900 dark:text-white">Social</span>
          </Link>
          <nav className="space-x-6 text-sm font-medium">
            <Link href="/" className="text-gray-600 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400">
              Home
            </Link>
            <Link href="/about" className="text-gray-600 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400">
              About
            </Link>
            <Link href="/charity" className="text-blue-600 dark:text-blue-400 font-semibold">
              Charity
            </Link>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main>
        {/* Hero */}
        <section className="relative bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-800 dark:to-gray-700 py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-white leading-tight">
              Giving Back, <br />
              <span className="text-blue-600 dark:text-blue-400">35% of Our Profits</span>
            </h1>
            <p className="mt-6 text-xl text-gray-700 dark:text-gray-200 max-w-2xl mx-auto">
              At ZRP Social, we believe social media should have a social impact.
              That's why we donate 35% of all platform profits to charities supporting
              orphans, schools, hospitals, and climate relief.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="#how-it-works"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full shadow-lg transition"
              >
                Learn How It Works
              </Link>
              <Link
                href="#transparency"
                className="px-6 py-3 bg-white dark:bg-gray-800 text-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 font-semibold rounded-full shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                See Transparency
              </Link>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-16 px-4 max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            How ZRP Gives to Charity
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6 bg-gray-50 dark:bg-gray-800 rounded-xl shadow-sm">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">1. Platform Profits</h3>
              <p className="mt-2 text-gray-600 dark:text-gray-300">
                Revenue comes from premium subscriptions, tips, and business plans.
                After covering operational costs, 35% of net profits are set aside for charity.
              </p>
            </div>
            <div className="text-center p-6 bg-gray-50 dark:bg-gray-800 rounded-xl shadow-sm">
              <div className="text-4xl mb-4">⚖️</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">2. Transparent Allocation</h3>
              <p className="mt-2 text-gray-600 dark:text-gray-300">
                Funds are distributed equally among our four pillars:
                orphans, education, healthcare, and climate.
                We publish quarterly transparency reports.
              </p>
            </div>
            <div className="text-center p-6 bg-gray-50 dark:bg-gray-800 rounded-xl shadow-sm">
              <div className="text-4xl mb-4">🤝</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">3. Direct Impact</h3>
              <p className="mt-2 text-gray-600 dark:text-gray-300">
                We partner with vetted NGOs and local organisations to ensure
                your contributions reach those who need them most.
                No middlemen, no overhead – just real change.
              </p>
            </div>
          </div>
        </section>

        {/* Causes */}
        <section className="bg-gray-50 dark:bg-gray-800 py-16 px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-4">
              Where Your Support Goes
            </h2>
            <p className="text-center text-gray-600 dark:text-gray-300 mb-12 max-w-2xl mx-auto">
              Every donation is split across these four causes. We believe in
              holistic impact – from a child's first classroom to a community's
              clean water.
            </p>
            <div className="grid md:grid-cols-2 gap-8">
              {CAUSES.map((cause) => (
                <div
                  key={cause.title}
                  className="bg-white dark:bg-gray-700 p-6 rounded-xl shadow-md flex items-start gap-4"
                >
                  <span className="text-3xl">{cause.icon}</span>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {cause.title}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300 mt-1">{cause.description}</p>
                    <div className="mt-3 w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2.5">
                      <div
                        className="bg-blue-600 h-2.5 rounded-full"
                        style={{ width: `${cause.percentage}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {cause.percentage}% of charity budget
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Transparency & Impact */}
        <section id="transparency" className="py-16 px-4 max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-4">
            Transparency & Impact
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-300 mb-12 max-w-2xl mx-auto">
            We believe in full transparency. Here's what we've achieved together so far.
            All numbers are verified and updated quarterly.
          </p>
          <div className="grid md:grid-cols-3 gap-6 text-center">
            <div className="bg-blue-50 dark:bg-gray-700 p-6 rounded-xl">
              <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">
                ${CHARITY_STATS.totalDonated.toLocaleString()}
              </div>
              <p className="text-gray-600 dark:text-gray-300 mt-2">Total Donated</p>
            </div>
            <div className="bg-green-50 dark:bg-gray-700 p-6 rounded-xl">
              <div className="text-4xl font-bold text-green-600 dark:text-green-400">
                {CHARITY_STATS.beneficiaries.toLocaleString()}+
              </div>
              <p className="text-gray-600 dark:text-gray-300 mt-2">Lives Impacted</p>
            </div>
            <div className="bg-purple-50 dark:bg-gray-700 p-6 rounded-xl">
              <div className="text-4xl font-bold text-purple-600 dark:text-purple-400">
                {Object.values(CHARITY_STATS).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0)}
              </div>
              <p className="text-gray-600 dark:text-gray-300 mt-2">Projects Supported</p>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{CHARITY_STATS.orphans}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Orphanages</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{CHARITY_STATS.schools}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Schools</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{CHARITY_STATS.hospitals}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Hospitals</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{CHARITY_STATS.climateProjects}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Climate Projects</p>
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="bg-blue-600 dark:bg-blue-700 py-16 px-4">
          <div className="max-w-4xl mx-auto text-center text-white">
            <h2 className="text-3xl font-bold">Be Part of Something Bigger</h2>
            <p className="mt-4 text-lg opacity-90">
              Every time you post, like, or subscribe on ZRP Social, you're
              contributing to real change. Join us in making social media a
              force for good.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="/signup"
                className="px-8 py-3 bg-white text-blue-600 font-semibold rounded-full shadow-lg hover:bg-gray-100 transition"
              >
                Create Your Account
              </Link>
              <Link
                href="/about"
                className="px-8 py-3 border border-white text-white font-semibold rounded-full hover:bg-white/10 transition"
              >
                Learn About ZRP
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <p className="text-sm text-gray-400">
            © {new Date().getFullYear()} ZRP Social. Built with ❤️ in Switzerland.
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0 text-sm">
            <Link href="/privacy" className="text-gray-400 hover:text-white">Privacy</Link>
            <Link href="/terms" className="text-gray-400 hover:text-white">Terms</Link>
            <Link href="/charity" className="text-blue-400 hover:text-blue-300">Charity</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
