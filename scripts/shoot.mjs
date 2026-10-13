// Utilitário de desenvolvimento: abre páginas autenticadas e salva screenshots (desktop e celular).
// Uso: node scripts/shoot.mjs <saida> <rota> [<rota>...]
// Variáveis: ORG="nome parcial da empresa" (troca de empresa), ONLY=desk|mob, FULL=1, DARK=1
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const [out, ...routes] = process.argv.slice(2);
const creds = Object.fromEntries(readFileSync(new URL("../.dev-credentials", import.meta.url), "utf8").trim().split("\n").map((l) => l.split("=")));
const base = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", colorScheme: process.env.DARK ? "dark" : "light" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console ${page.url()}: ${m.text().slice(0, 300)}`));
await page.goto(`${base}/entrar`);
await page.fill("#email", creds.DEV_LOGIN_EMAIL);
await page.fill("#password", creds.DEV_LOGIN_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 30000 });
if (process.env.ORG) {
  await page.locator("aside button:has(span.rounded-\\[8px\\])").last().click();
  await page.getByRole("menuitem", { name: new RegExp(process.env.ORG) }).click();
  await page.waitForTimeout(1500);
}
for (const [name, viewport] of [["desk", { width: 1440, height: 900 }], ["mob", { width: 390, height: 844 }]]) {
  if (process.env.ONLY && process.env.ONLY !== name) continue;
  await page.setViewportSize(viewport);
  for (const r of routes) {
    await page.goto(`${base}${r}`, { waitUntil: "networkidle" });
    const file = `${out}/${name}${process.env.DARK ? "-dark" : ""}-${r.replace(/[^\w]+/g, "_") || "home"}.png`;
    await page.screenshot({ path: file, fullPage: process.env.FULL === "1" });
    console.log(file);
  }
}
await browser.close();
if (errors.length) console.log("ERRORS:\n" + errors.join("\n"));
