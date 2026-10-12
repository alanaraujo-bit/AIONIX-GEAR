import { NextResponse, type NextRequest } from "next/server";

/**
 * Verificação otimista: sem cookie de sessão, rotas do app vão para o login
 * preservando o destino (ex.: QR da etiqueta). A autorização real acontece no
 * servidor, em cada página e ação.
 */
const PUBLIC = ["/entrar", "/definir-senha", "/convite", "/p/", "/api/", "/pwa-icon", "/manifest.webmanifest", "/icon", "/sw.js", "/offline", "/_next", "/favicon"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("ag_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|svg|webp|ico|txt)$).*)"],
};
