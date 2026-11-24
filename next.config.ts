import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Remove the "x-powered-by: Next.js" header from responses */
  poweredByHeader: false,

  /* React strict mode for catching common bugs in development */
  reactStrictMode: true,

  /* Security headers applied to all routes (with Google AdSense & Analytics support) */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://pagead2.googlesyndication.com https://*.google.com https://*.googlesyndication.com https://*.google-analytics.com https://adservice.google.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https://*.googlesyndication.com https://*.google.com https://*.google-analytics.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.google.com https://*.googlesyndication.com https://*.google-analytics.com",
              "worker-src 'self' blob:",
              "frame-src 'self' https://googleads.g.doubleclick.net https://*.googlesyndication.com https://*.google.com",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
