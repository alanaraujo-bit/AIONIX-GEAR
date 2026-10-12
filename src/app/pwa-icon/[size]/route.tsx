import { ImageResponse } from "next/og";

/** Ícone do app instalável (PWA), desenhado a partir da marca. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = size === "192" ? 192 : 512;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1d1b18" }}>
        <svg width={px * 0.62} height={px * 0.62} viewBox="0 0 32 32">
          <path d="M16 2.6 27.6 9.3v13.4L16 29.4 4.4 22.7V9.3Z" fill="#c4703f" />
          <path d="M16 6.4 24.3 11.2v9.6L16 25.6l-8.3-4.8v-9.6Z" fill="none" stroke="#1d1b18" strokeWidth="1.6" />
          <rect x="12.6" y="12.6" width="6.8" height="6.8" rx="1.4" fill="#1d1b18" />
        </svg>
      </div>
    ),
    { width: px, height: px, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
