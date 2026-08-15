// src/app/manifest.ts
import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ZRP Social',
    short_name: 'ZRP',
    description: 'Freedom of speech. Swiss European platform. 35% of profits to charity.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#FF2D2D',
    icons: [
      // Full-bleed icons for regular contexts (app switchers, browser UI,
      // etc.) - shown exactly as designed, no OS-applied mask.
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      // Separate, padded icons for maskable contexts (Android adaptive
      // icons, etc.) - the artwork sits inside the safe zone so circular/
      // squircle/rounded-square masks don't crop off the outer ring.
      // The originals were previously marked maskable directly, but had
      // no safe-zone padding baked in, so Android was cropping them.
      {
        src: '/icon-192-maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
