"use client";

import dynamic from "next/dynamic";

const App = dynamic(() => import("@/components/App"), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-dvh place-items-center bg-[#0b0718] text-white">
      <div className="text-center font-mono">
        <div className="text-2xl font-black tracking-widest text-cyan-400">NEON GAMBIT</div>
        <div className="mt-2 text-xs text-white/50">Loading arcade...</div>
      </div>
    </div>
  ),
});

export default function Page() {
  return <App />;
}
