import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

type U = { email: string; password: string };
const users = () => JSON.parse(readFileSync("tests/e2e/.auth/users.json", "utf8")) as { a: U & { orgId: string }; b: U & { orgId: string }; sales: U };

async function login(page: Page, u: U) {
  await page.goto("/entrar");
  await page.fill("#email", u.email);
  await page.fill("#password", u.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/entrar"));
}

test.describe.serial("Jornada do dono: compra → venda com lucro real", () => {
  let itemUrl = "";

  test("login inválido mostra erro sem revelar se o e-mail existe", async ({ page }) => {
    await page.goto("/entrar");
    await page.fill("#email", users().a.email);
    await page.fill("#password", "senha-errada-123");
    await page.click('button[type="submit"]');
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  });

  test("rota protegida sem sessão leva ao login preservando o destino", async ({ page }) => {
    await page.goto("/estoque/novo");
    await expect(page).toHaveURL(/\/entrar\?next=%2Festoque%2Fnovo/);
  });

  test("cadastra GPU comprada de pessoa física com frete e local", async ({ page }) => {
    await login(page, users().a);
    await page.goto("/estoque/novo");
    await page.getByLabel("Categoria").selectOption({ label: "Placas de vídeo" });
    await page.getByPlaceholder("Ex.: MSI, Kingston, AMD").fill("MSI");
    await page.getByPlaceholder("Ex.: RTX 3060 Ventus 2X 12GB").fill("RTX 3060 Ventus 12GB");
    await page.locator('input[placeholder="Opcional"]').first().fill("SN-E2E-3060");
    const money = page.locator('input[inputmode="numeric"][placeholder="0,00"]');
    await money.nth(0).fill("150000");
    await money.nth(1).fill("5000");
    await page.getByLabel("Preço de venda pretendido").fill("220000");
    await page.getByRole("button", { name: /Registrar compra e item/ }).click();
    await page.waitForURL(/\/estoque\/c/);
    itemUrl = page.url();
    await expect(page.getByRole("heading", { name: "MSI RTX 3060 Ventus 12GB" })).toBeVisible();
    await expect(page.getByText("R$ 1.550,00").first()).toBeVisible();
    await expect(page.getByText("Disponível").first()).toBeVisible();
    await expect(page.getByText(/Comprado na compra C-\d+/)).toBeVisible();
  });

  test("vende com taxa retida e recebimento parcial; lucro e saldo corretos", async ({ page }) => {
    await login(page, users().a);
    await page.goto(itemUrl);
    await page.getByRole("link", { name: "Vender" }).click();
    await page.waitForURL(/\/vendas\/nova/);
    await page.getByLabel(/Preço de MSI/).fill("220000");
    await page.getByLabel("Taxa de cartão / plataforma").fill("8800");
    await page.getByLabel("Recebido agora").fill("100000");
    await page.getByRole("button", { name: /Fechar venda \(/ }).click();
    await page.waitForURL(/\/vendas\/c/);
    await expect(page.getByText("Lucro da venda")).toBeVisible();
    await expect(page.getByText("R$ 562,00").first()).toBeVisible();
    await expect(page.getByText(/Falta receber R\$\s1\.112,00/)).toBeVisible();
    // registra o restante
    await page.getByRole("button", { name: "Registrar recebimento" }).click();
    await page.getByRole("button", { name: /Confirmar R\$\s1\.112,00/ }).click();
    await expect(page.getByText("Recebido", { exact: true })).toBeVisible();
  });

  test("relatório e item mostram o resultado realizado", async ({ page }) => {
    await login(page, users().a);
    await page.goto("/relatorios?aba=lucro&periodo=month&por=item");
    await expect(page.getByRole("row", { name: /MSI RTX 3060 Ventus 12GB/ })).toContainText("R$ 562,00");
    await page.goto(itemUrl);
    await expect(page.getByText("Lucro real")).toBeVisible();
    await expect(page.getByText("Entregue").first()).toBeVisible();
  });

  test("verificação de integridade confere", async ({ page }) => {
    await login(page, users().a);
    await page.goto("/relatorios?aba=verificacao");
    await expect(page.getByText("Tudo confere.")).toBeVisible();
  });
});

test.describe("Permissões e isolamento", () => {
  test("vendedor não vê custos nem financeiro", async ({ page }) => {
    await login(page, users().sales);
    await page.goto("/estoque?group=all");
    await expect(page.getByRole("columnheader", { name: "Custo" })).toHaveCount(0);
    await page.goto("/financeiro");
    await expect(page).toHaveURL(/sem-permissao/);
    await expect(page.getByText("Esta área não faz parte do seu acesso")).toBeVisible();
    await page.goto("/compras/nova");
    await expect(page).toHaveURL(/sem-permissao/);
  });

  test("dono da empresa B não acessa registros da empresa A", async ({ page, request }) => {
    // descobre um item de A pela sessão de A
    await login(page, users().a);
    await page.goto("/estoque?group=all");
    const href = await page.locator('a[href^="/estoque/c"]').first().getAttribute("href");
    expect(href).toBeTruthy();
    await page.context().clearCookies();
    await login(page, users().b);
    await page.goto(href!);
    await expect(page.getByText("Não encontramos este registro")).toBeVisible();
    const exp = await page.request.get("/api/export/estoque");
    expect(await exp.text()).not.toContain("SN-E2E-3060");
    void request;
  });
});

test.describe("Celular", () => {
  test("@mobile navegação inferior e ações rápidas", async ({ page }) => {
    await login(page, users().a);
    await expect(page.getByRole("navigation", { name: "Navegação rápida" })).toBeVisible();
    await page.getByRole("button", { name: "Ações rápidas" }).click();
    await expect(page.getByRole("heading", { name: "O que você quer registrar?" })).toBeVisible();
    await page.getByRole("button", { name: "Cadastrar item" }).click();
    await expect(page).toHaveURL(/\/estoque\/novo/);
  });
});
