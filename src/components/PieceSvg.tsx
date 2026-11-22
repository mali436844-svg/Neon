import { memo } from "react";

type Props = { type: string; color: "w" | "b" };

function PieceSvgInner({ type, color }: Props) {
  const fill = color === "w" ? "url(#gw)" : "url(#gb)";
  const stroke = color === "w" ? "#1e1b4b" : "#c4b5fd";
  const detail = color === "w" ? "#1e1b4b" : "#c4b5fd";
  const common = { fill, stroke, strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const base = <rect x="22" y="78" width="56" height="10" rx="4" {...common} />;
  let body: React.ReactNode = null;
  switch (type) {
    case "p":
      body = (
        <>
          <path d="M35 79 Q37 58 44 50 L56 50 Q63 58 65 79 Z" {...common} />
          <ellipse cx="50" cy="49" rx="14" ry="4.5" {...common} />
          <circle cx="50" cy="33" r="13" {...common} />
        </>
      );
      break;
    case "r":
      body = (
        <>
          <rect x="33" y="40" width="34" height="39" {...common} />
          <rect x="28" y="36" width="44" height="7" rx="2" {...common} />
          <path d="M26 16 h10 v8 h8 v-8 h12 v8 h8 v-8 h10 v20 h-48 Z" {...common} />
          <line x1="36" y1="56" x2="64" y2="56" stroke={detail} strokeWidth="2" opacity="0.5" />
        </>
      );
      break;
    case "n":
      body = (
        <>
          <path
            d="M32 80 C32 68 40 61 49 55 C43 55 36 58 30 62 C23 60 19 53 24 47 C30 39 37 32 43 26 L43 14 L52 21 C67 23 77 38 77 56 C77 68 73 75 73 80 Z"
            {...common}
          />
          <circle cx="47" cy="35" r="3.2" fill={detail} />
          <path d="M60 30 C66 38 68 48 66 60" fill="none" stroke={detail} strokeWidth="2" opacity="0.55" />
        </>
      );
      break;
    case "b":
      body = (
        <>
          <path d="M40 60 L35 79 L65 79 L60 60 Z" {...common} />
          <path d="M50 20 C30 36 32 54 40 61 L60 61 C68 54 70 36 50 20 Z" {...common} />
          <circle cx="50" cy="14" r="5.5" {...common} />
          <line x1="56" y1="32" x2="46" y2="46" stroke={detail} strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="50" cy="62" rx="13" ry="3.5" {...common} />
        </>
      );
      break;
    case "q":
      body = (
        <>
          <path d="M33 66 L30 79 L70 79 L67 66 Z" {...common} />
          <path d="M24 34 L33 67 L67 67 L76 34 L62 52 L56 26 L50 50 L44 26 L38 52 Z" {...common} />
          <circle cx="24" cy="30" r="5" {...common} />
          <circle cx="44" cy="22" r="5" {...common} />
          <circle cx="56" cy="22" r="5" {...common} />
          <circle cx="76" cy="30" r="5" {...common} />
        </>
      );
      break;
    case "k":
      body = (
        <>
          <path d="M36 64 L32 79 L68 79 L64 64 Z" {...common} />
          <path d="M30 42 C28 26 72 26 70 42 L64 65 L36 65 Z" {...common} />
          <path d="M46 6 h8 v8 h8 v8 h-8 v10 h-8 v-10 h-8 v-8 h8 Z" {...common} />
          <line x1="38" y1="52" x2="62" y2="52" stroke={detail} strokeWidth="2" opacity="0.55" />
        </>
      );
      break;
  }
  return (
    <svg viewBox="0 0 100 100" className="piece-svg" aria-hidden>
      {body}
      {base}
    </svg>
  );
}

export const PieceSvg = memo(PieceSvgInner);

export function PieceGradients() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <linearGradient id="gw" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ddd6fe" />
        </linearGradient>
        <linearGradient id="gb" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#3b2a6b" />
          <stop offset="1" stopColor="#0f0a1f" />
        </linearGradient>
      </defs>
    </svg>
  );
}
