"use client";

import Image from "next/image";
import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 md:py-20 text-gray-800 dark:text-gray-200">
      {/* ─── Header ─── */}
      <div className="text-center mb-12">
        <div className="flex justify-center mb-6">
          <Image
            src="/logo.png"
            alt="ZRP"
            width={80}
            height={80}
            className="w-20 h-20 object-contain"
          />
        </div>
        <h1 className="text-4xl md:text-5xl font-orbitron font-bold text-zrp-red dark:text-zrp-red">
          About ZRP Social
        </h1>
        <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 mt-3 max-w-2xl mx-auto">
          The First Swiss European Social Media Platform
        </p>
      </div>

      {/* ─── Story ─── */}
      <div className="prose prose-lg dark:prose-invert max-w-none space-y-6 text-gray-800 dark:text-gray-200">
        <p>
          <span className="font-semibold text-zrp-red dark:text-zrp-red">ZRP Social</span> was born from a simple but powerful idea:
          <strong className="text-gray-900 dark:text-white"> freedom of speech belongs to everyone.</strong>
        </p>

        <p>
          In a world where voices are increasingly silenced, we decided to build a platform that puts people first.
          No censorship. No manipulation. No hidden agendas.
        </p>

        <p>
          We are proud to be the <strong className="text-gray-900 dark:text-white">first Swiss European social media platform</strong>, built on the principles of
          neutrality, privacy, and security. Switzerland's strong legal framework and its commitment to free expression
          make it the perfect home for ZRP Social.
        </p>

        <p>
          Our mission is simple: <strong className="text-gray-900 dark:text-white">to give a voice to the voiceless.</strong>
          ZRP Social will always stand as a people's voice against anyone who tries to hold back freedom of speech.
          We believe that open, honest, and respectful conversation is the foundation of a free society.
        </p>

        <p>
          We are not just another social network – we are a movement. A movement that says <em className="text-gray-900 dark:text-white font-medium">“enough”</em> to the
          silencing of dissent, to the manipulation of public discourse, and to the erosion of fundamental rights.
        </p>

        <p>
          With ZRP Social, you can speak freely, connect authentically, and build communities without fear.
          Your data is yours. Your voice is yours. Your freedom is non-negotiable.
        </p>

        <p className="text-lg font-semibold text-center text-zrp-red dark:text-zrp-red py-4">
          ZRP will stay all life – a people's voice for the people.
        </p>
      </div>

      {/* ─── Values ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <div className="text-4xl mb-3">🗣️</div>
          <h3 className="font-orbitron text-lg font-semibold text-gray-900 dark:text-white">Freedom of Speech</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            We protect your right to express yourself without fear.
          </p>
        </div>
        <div className="text-center">
          <div className="text-4xl mb-3">🛡️</div>
          <h3 className="font-orbitron text-lg font-semibold text-gray-900 dark:text-white">Privacy &amp; Security</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Built in Switzerland, with Swiss laws and strong data protection.
          </p>
        </div>
        <div className="text-center">
          <div className="text-4xl mb-3">❤️</div>
          <h3 className="font-orbitron text-lg font-semibold text-gray-900 dark:text-white">People First</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            35% of profits go to charity – we believe in making a difference.
          </p>
        </div>
      </div>

      {/* ─── Call to Action ─── */}
      <div className="text-center mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Join the movement. Be heard.
        </p>
        <Link
          href="/signup"
          className="inline-block bg-zrp-red text-white px-8 py-3 rounded-lg font-semibold hover:bg-zrp-darkRed transition"
        >
          Create your account
        </Link>
      </div>
    </div>
  );
}
