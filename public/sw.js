/* AIONIX GEAR — service worker.
 * Política honesta de offline:
 *  - Arquivos estáticos (JS/CSS/fontes/ícones): cache primeiro.
 *  - Páginas: sempre tenta a rede; sem rede, mostra a última versão vista (marcada como "dados em cache"
 *    pelo aviso de conexão do app) ou a página /offline.
 *  - Nada que altera dados (POST, server actions, uploads) é cacheado ou enfileirado: sem rede, a
 *    operação simplesmente não é enviada e o usuário é avisado.
 */
const VERSION = "ag-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.addAll(["/offline"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || req.headers.get("RSC") || req.headers.get("Next-Action")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/") || url.pathname === "/icon.svg") {
    event.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Guarda só páginas de leitura, nunca respostas de erro ou redirecionamentos.
          if (res.ok && res.type === "basic" && !url.pathname.startsWith("/definir-senha") && !url.pathname.startsWith("/convite")) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match("/offline"))),
    );
  }
});
