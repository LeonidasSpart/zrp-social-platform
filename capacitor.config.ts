import type { CapacitorConfig } from "@capacitor/cli";

// ZRP is a full-stack Next.js app (custom server.js for Socket.io, API
// routes, server-side auth/data fetching) - none of that survives a
// static export, so this points the native shell at the live,
// already-deployed Railway URL instead of bundling a local build. This
// is the standard, valid pattern for a full-stack web app going to app
// stores: a real native app (not just a browser shortcut), but the
// content it displays is the same live site everyone already uses.
const config: CapacitorConfig = {
  appId: "one.zrp.social",
  appName: "ZRP Social",
  webDir: "public",
  server: {
    // Change this to your actual production domain if different.
    url: "https://zrp.one",
    // Required when loading a remote URL rather than bundled local
    // files - without this, links/navigation inside the WebView can
    // behave inconsistently across iOS/Android.
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
  },
  android: {
    // Matches the PWA manifest's theme_color (#FF2D2D) for a consistent
    // native status bar / splash background across web and app.
    backgroundColor: "#FF2D2D",
  },
};

export default config;
