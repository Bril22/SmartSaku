import type { CapacitorConfig } from "@capacitor/cli";

// SmartSaku is a Next.js server app (server actions, SSR, API routes), so it
// cannot be exported as static files. The native shell therefore loads the
// deployed site in a WebView instead of bundling web assets. Set your real
// production domain here, or pass CAP_SERVER_URL when running the Capacitor CLI.
const serverUrl = process.env.CAP_SERVER_URL || "https://smartsaku.vercel.app";

const config: CapacitorConfig = {
  appId: "app.smartsaku.mobile",
  appName: "SmartSaku",
  // fallback assets shown before the remote URL loads (see native/www)
  webDir: "native/www",
  backgroundColor: "#FFEED6",
  server: {
    url: serverUrl,
    cleartext: false,
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#FFEED6",
  },
  android: {
    backgroundColor: "#FFEED6",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 700,
      backgroundColor: "#FFEED6",
      showSpinner: false,
    },
  },
};

export default config;
