import "server-only";
import QRCode from "qrcode";
import { headers } from "next/headers";

export async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** QR em SVG (vetorial, nítido na impressão). */
export async function qrSvg(text: string, opts: { margin?: number } = {}) {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: opts.margin ?? 0, color: { dark: "#000000", light: "#ffffff" } });
}
