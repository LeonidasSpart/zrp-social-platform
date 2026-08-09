// app/press/page.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Press Kit – ZRP Social',
  description: 'Press kit for ZRP Social – brand assets, mission, statistics, and contact information for journalists and media.',
};

export default function PressKitPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter">
      <main>
        {/* Hero – ZRP Red to Dark Red gradient */}
        <section className="relative bg-gradient-to-br from-zrp-red to-zrp-darkRed py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            {/* Logo displayed directly from public/ */}
            <img
              src="/logo.png"
              alt="ZRP Social Logo"
              className="h-16 mx-auto mb-6"
            />
            <h1 className="text-4xl sm:text-5xl font-extrabold font-orbitron text-white leading-tight">
              Press Kit
            </h1>
            <p className="mt-4 text-xl text-white/90 font-inter max-w-2xl mx-auto">
              Media resources, brand assets, and key information about ZRP Social.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
              <span className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full text-white font-medium font-inter">
                📅 Version 1.0 – 8.8.2026
              </span>
              <span className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full text-white font-medium font-inter">
                📧 press@zrp.one
              </span>
            </div>
          </div>
        </section>

        {/* Overview */}
        <section className="py-16 px-4 max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold font-orbitron text-zrp-charcoal dark:text-white mb-4">
                Overview
              </h2>
              <p className="text-zrp-charcoal/80 dark:text-white/70 font-inter leading-relaxed">
                <strong className="text-zrp-red">ZRP Social</strong> is a European, Swiss-hosted social media platform built on three pillars:
              </p>
              <ul className="mt-4 space-y-3 font-inter">
                <li className="flex items-start gap-3">
                  <span className="text-zrp-red font-bold">•</span>
                  <span className="text-zrp-charcoal/80 dark:text-white/70"><strong className="text-zrp-charcoal dark:text-white">Freedom of Speech</strong> – No censorship, no algorithm manipulation, no hidden agendas.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-zrp-red font-bold">•</span>
                  <span className="text-zrp-charcoal/80 dark:text-white/70"><strong className="text-zrp-charcoal dark:text-white">Privacy & Security</strong> – Strong data protection under Swiss law.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-zrp-red font-bold">•</span>
                  <span className="text-zrp-charcoal/80 dark:text-white/70"><strong className="text-zrp-charcoal dark:text-white">Social Impact</strong> – <span className="text-zrp-red font-semibold">35% of platform profits</span> go to charities.</span>
                </li>
              </ul>
            </div>
            <div className="bg-zrp-silver/20 dark:bg-zrp-charcoal/50 p-8 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal text-center">
              <div className="text-6xl font-orbitron font-bold text-zrp-red">35%</div>
              <p className="text-zrp-charcoal/70 dark:text-white/70 font-inter mt-2">
                of profits go to<br />
                <span className="text-zrp-charcoal dark:text-white font-semibold">orphans, schools, hospitals &amp; climate</span>
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
              Key Features
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { title: 'Social Feed', desc: 'Posts, reposts, comments, polls, stories, hashtags – with infinite scroll.' },
                { title: 'Real-time Messaging', desc: 'Direct messages with Socket.io – instant and private.' },
                { title: 'Creator Monetisation', desc: 'USDC tips (Solana), premium posts, and a creator dashboard with withdrawals.' },
                { title: 'Business Plans', desc: 'Custom URLs, recruitment posts, articles, team management, API keys.' },
                { title: 'Privacy & Safety', desc: 'Private accounts, mute/block, content reporting, admin moderation.' },
                { title: 'Multi-language', desc: 'English, French, German, Italian – more coming.' },
              ].map((feature) => (
                <div key={feature.title} className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
                  <h3 className="text-lg font-bold font-orbitron text-zrp-charcoal dark:text-white">{feature.title}</h3>
                  <p className="mt-2 text-zrp-charcoal/70 dark:text-white/70 font-inter text-sm">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Charity Commitment */}
        <section className="py-16 px-4 max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-8">
            Charity Commitment
          </h2>
          <div className="bg-gradient-to-r from-zrp-red to-zrp-darkRed rounded-xl p-8 text-white">
            <p className="text-xl font-inter mb-6">
              ZRP Social is <strong>not just another social network</strong> – we exist to make a difference.
            </p>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="text-3xl font-orbitron font-bold">35%</div>
                <p className="font-inter text-sm opacity-90">of net profits allocated quarterly</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="flex gap-2 text-2xl">👶📚🏥🌍</div>
                <p className="font-inter text-sm opacity-90">Four causes: orphans, education, healthcare, climate</p>
              </div>
            </div>
            <div className="mt-4 text-sm font-inter opacity-80 border-t border-white/20 pt-4">
              📅 Full transparency reports published every three months – first report: Q3 2026
            </div>
          </div>
        </section>

        {/* Platform Statistics */}
        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-4">
              Platform Statistics
            </h2>
            <p className="text-center text-zrp-charcoal/70 dark:text-white/70 font-inter mb-10">
              <span className="bg-zrp-red/10 dark:bg-zrp-red/20 text-zrp-red px-3 py-1 rounded-full text-sm font-medium">
                Data as of 8.8.2026 – growing daily
              </span>
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Registered Users', value: '195,000+' },
                { label: 'Monthly Active Users', value: '850+' },
                { label: 'Daily Posts', value: '2,500+' },
                { label: 'Countries', value: '14' },
              ].map((stat) => (
                <div key={stat.label} className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal text-center">
                  <div className="text-2xl font-bold font-orbitron text-zrp-red">{stat.value}</div>
                  <div className="text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Brand Assets – no ZIP downloads, just display assets */}
        <section className="py-16 px-4 max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-4">
            Brand Assets
          </h2>
          <p className="text-center text-zrp-charcoal/70 dark:text-white/70 font-inter mb-10 max-w-2xl mx-auto">
            All brand assets are available directly from our public folder.
            Right‑click any image to save it.
          </p>

          {/* Logo and icons gallery */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
            <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/50 p-4 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal text-center">
              <img src="/logo.png" alt="Logo" className="h-16 mx-auto" />
              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">Logo</p>
              <a href="/logo.png" download className="text-xs text-zrp-red hover:underline font-inter">Download</a>
            </div>
            <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/50 p-4 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal text-center">
              <img src="/favicon.png" alt="Favicon" className="h-12 mx-auto" />
              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">Favicon</p>
              <a href="/favicon.png" download className="text-xs text-zrp-red hover:underline font-inter">Download</a>
            </div>
            <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/50 p-4 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal text-center">
              <img src="/icon-192.png" alt="Icon 192" className="h-16 mx-auto" />
              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">Icon 192px</p>
              <a href="/icon-192.png" download className="text-xs text-zrp-red hover:underline font-inter">Download</a>
            </div>
            <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/50 p-4 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal text-center">
              <img src="/icon-512.png" alt="Icon 512" className="h-16 mx-auto" />
              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">Icon 512px</p>
              <a href="/icon-512.png" download className="text-xs text-zrp-red hover:underline font-inter">Download</a>
            </div>
          </div>

          {/* Colors */}
          <div className="mb-12">
            <h3 className="text-xl font-bold font-orbitron text-zrp-charcoal dark:text-white mb-4">Color Palette</h3>
            <div className="flex flex-wrap gap-4">
              {[
                { name: 'ZRP Red', hex: '#FF2D2D', class: 'bg-zrp-red' },
                { name: 'Dark Red', hex: '#B10000', class: 'bg-zrp-darkRed' },
                { name: 'White', hex: '#FFFFFF', class: 'bg-white border border-zrp-silver/50' },
                { name: 'Silver', hex: '#BDDBDB', class: 'bg-zrp-silver' },
                { name: 'Charcoal', hex: '#0D0D0D', class: 'bg-zrp-charcoal' },
                { name: 'Deep Black', hex: '#050505', class: 'bg-zrp-deepBlack' },
              ].map((color) => (
                <div key={color.name} className="flex items-center gap-3 bg-zrp-silver/10 dark:bg-zrp-charcoal/50 px-4 py-2 rounded-lg border border-zrp-silver/30 dark:border-zrp-charcoal">
                  <div className={`w-10 h-10 rounded-full ${color.class} ${color.name === 'White' ? 'border border-zrp-silver/50' : ''}`}></div>
                  <div>
                    <div className="text-sm font-semibold text-zrp-charcoal dark:text-white font-orbitron">{color.name}</div>
                    <div className="text-xs text-zrp-charcoal/60 dark:text-white/60 font-inter">{color.hex}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Typography */}
          <div>
            <h3 className="text-xl font-bold font-orbitron text-zrp-charcoal dark:text-white mb-4">Typography</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/50 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
                <div className="text-3xl font-orbitron text-zrp-red">Orbitron</div>
                <p className="text-zrp-charcoal/70 dark:text-white/70 font-inter text-sm mt-2">Bold, futuristic, engineered for the future. Used for headings &amp; logo.</p>
                <div className="mt-3 text-zrp-charcoal/50 dark:text-white/50 font-orbitron text-sm tracking-wider">ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789</div>
              </div>
              <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/50 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
                <div className="text-3xl font-inter text-zrp-charcoal dark:text-white">Inter</div>
                <p className="text-zrp-charcoal/70 dark:text-white/70 font-inter text-sm mt-2">Clean, modern, and highly readable. Used for body text.</p>
                <div className="mt-3 text-zrp-charcoal/50 dark:text-white/50 font-inter text-sm tracking-wider">ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789</div>
              </div>
            </div>
          </div>
        </section>

        {/* Press Contact */}
        <section className="bg-gradient-to-r from-zrp-red to-zrp-darkRed py-16 px-4">
          <div className="max-w-4xl mx-auto text-center text-white">
            <h2 className="text-3xl font-bold font-orbitron">Press Contact</h2>
            <div className="mt-6 flex flex-wrap justify-center gap-6">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 min-w-[200px]">
                <div className="text-sm font-inter opacity-80">Email</div>
                <div className="font-inter font-semibold">press@zrp.one</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 min-w-[200px]">
                <div className="text-sm font-inter opacity-80">Website</div>
                <div className="font-inter font-semibold">zrp.one</div>
              </div>
            </div>
            <p className="mt-6 text-sm font-inter opacity-80">
              For media inquiries, interviews, or additional information.
            </p>
          </div>
        </section>

        {/* Mission Statement */}
        <section className="py-16 px-4 max-w-4xl mx-auto text-center">
          <blockquote className="text-2xl font-orbitron text-zrp-charcoal dark:text-white italic">
            “We believe social media should be a force for good. ZRP empowers people to connect, create, and contribute – without fear, without surveillance, and with a direct impact on the world.”
          </blockquote>
          <div className="mt-6 text-zrp-charcoal/50 dark:text-white/50 font-inter text-sm">
            — ZRP Social Mission Statement
          </div>
        </section>
      </main>
    </div>
  );
}
