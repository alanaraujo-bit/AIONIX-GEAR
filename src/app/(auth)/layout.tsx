import { Logo } from "@/components/app/logo";
import { BRAND_TAGLINE } from "@/lib/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Logo />
        <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">{children}</main>
        <p className="text-[0.8125rem] text-ink-3">Seus dados são privados da sua empresa e protegidos por sessão segura.</p>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-line bg-panel lg:block" aria-hidden>
        <AuthArt />
        <div className="absolute inset-x-12 bottom-12">
          <p className="max-w-[28ch] text-[1.6rem] font-semibold leading-snug tracking-[-0.02em] text-ink">{BRAND_TAGLINE}</p>
          <p className="mt-3 max-w-[48ch] text-ink-2">
            Cada peça com custo, origem e destino. Cada catira com o resultado explicado. Cada real rastreável.
          </p>
        </div>
      </aside>
    </div>
  );
}

/** Ilustração: trilhas de placa em cobre convergindo para um chip — desenhada em SVG. */
function AuthArt() {
  const traces = [
    "M0 120 H180 L230 170 H420",
    "M0 200 H140 L190 250 H420",
    "M0 280 H120 L160 320 H420",
    "M640 90 H520 L470 140 H420",
    "M640 180 H540 L500 220 H460",
    "M640 300 H560 L520 340 H460",
    "M300 0 V90 L330 120 V170",
    "M380 0 V60 L360 80 V170",
  ];
  return (
    <svg viewBox="0 0 640 520" className="absolute -right-10 top-10 h-[70%] w-[115%] opacity-90" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="fade" x1="0" x2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
          <stop offset=".55" stopColor="var(--accent)" stopOpacity=".55" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity=".9" />
        </linearGradient>
      </defs>
      {traces.map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke="url(#fade)" strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}
      {[[420, 170], [420, 250], [460, 220], [460, 340], [330, 170], [360, 170]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4.5" fill="var(--panel)" stroke="var(--accent)" strokeWidth="2" />
      ))}
      <rect x="400" y="160" width="120" height="120" rx="14" fill="var(--surface)" stroke="var(--line-strong)" />
      <rect x="430" y="190" width="60" height="60" rx="8" fill="var(--accent)" opacity=".92" />
      {Array.from({ length: 6 }).map((_, i) => (
        <g key={i} stroke="var(--line-strong)" strokeWidth="2">
          <line x1={414 + i * 18} y1="148" x2={414 + i * 18} y2="160" />
          <line x1={414 + i * 18} y1="280" x2={414 + i * 18} y2="292" />
        </g>
      ))}
    </svg>
  );
}
