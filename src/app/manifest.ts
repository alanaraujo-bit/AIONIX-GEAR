import type { MetadataRoute } from "next";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME.split(" ")[0],
    description: BRAND_TAGLINE,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#faf9f7",
    theme_color: "#faf9f7",
    lang: "pt-BR",
    categories: ["business", "productivity", "finance"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Novo item", url: "/estoque/novo" },
      { name: "Nova venda", url: "/vendas/nova" },
      { name: "Nova catira", url: "/catiras/nova" },
      { name: "Escanear código", url: "/escanear" },
    ],
  };
}
