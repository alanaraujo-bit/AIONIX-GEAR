// Utilitário de desenvolvimento: abre páginas autenticadas e salva screenshots (desktop e celular).
// Uso: node scripts/shoot.mjs <saida> <rota> [<rota>...]   (lê credenciais de .dev-credentials)
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const [out, ...routes] = process.argv.slice(2);
const creds = Object.fromEntries(readFileSync(new URL("../.dev-credentials", import.meta.url), "utf8").trim().split("\n").map((l) => l.split("=")));
const base = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch();
const errors = [];
for (const [name, viewport] of [["desk", { width: 1440, height: 900 }], ["mob", { width: 390, height: 844 }]]) {
  if (process.env.ONLY && process.env.ONLY !== name) continue;
  const ctx = await browser.newContext({ viewport, locale: "pt-BR", colorScheme: process.env.DARK ? "dark" : "light" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name} console: ${m.text().slice(0, 300)}`));
  await page.goto(`${base}/entrar`);
  await page.fill("#email", creds.DEV_LOGIN_EMAIL);
  await page.fill("#password", creds.DEV_LOGIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 30000 });
  for (const r of routes) {
    await page.goto(`${base}${r}`, { waitUntil: "networkidle" });
    const file = `${out}/${name}-${r.replace(/[^\w]+/g, "_") || "home"}.png`;
    await page.screenshot({ path: file, fullPage: process.env.FULL === "1" });
    console.log(file);
  }
  await ctx.close();
}
await browser.close();
if (errors.length) console.log("ERRORS:\n" + errors.join("\n"));
