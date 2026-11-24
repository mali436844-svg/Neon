"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdBannerProps = {
  dataAdSlot?: string;
  dataAdFormat?: "auto" | "fluid" | "rectangle" | "horizontal";
  dataFullWidthResponsive?: boolean;
  className?: string;
};

export default function AdBanner({
  dataAdSlot = "1234567890", // Replace with your real Ad Slot ID from Google AdSense
  dataAdFormat = "auto",
  dataFullWidthResponsive = true,
  className = "",
}: AdBannerProps) {
  const clientPubId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && clientPubId) {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
    } catch (e) {
      console.warn("AdSense push error:", e);
    }
  }, [clientPubId]);

  // If no AdSense publisher ID is configured yet, display a subtle demo placeholder in dev
  if (!clientPubId) {
    if (process.env.NODE_ENV === "development") {
      return (
        <div className={`rounded border border-dashed border-white/20 p-2 text-center text-xs text-white/40 ${className}`}>
          📢 Ad Placeholder (Set NEXT_PUBLIC_ADSENSE_CLIENT_ID in your environment)
        </div>
      );
    }
    return null;
  }

  return (
    <div className={`overflow-hidden text-center ${className}`}>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={clientPubId}
        data-ad-slot={dataAdSlot}
        data-ad-format={dataAdFormat}
        data-full-width-responsive={dataFullWidthResponsive ? "true" : "false"}
      />
    </div>
  );
}
