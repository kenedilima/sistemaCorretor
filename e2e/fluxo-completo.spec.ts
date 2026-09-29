import path from "node:path";
import { devices, expect, test } from "@playwright/test";

test("corretor publica imóvel e recebe lead qualificado", async ({ page, browser }) => {
  // 1. Cadastro
  await page.goto("/cadastro");
  await page.getByLabel("Seu nome").fill("Ana Martins");
  await page.getByLabel("E-mail").fill(`ana+${Date.now()}@exemplo.com`);
  await page.getByLabel("Senha").fill("senha-segura-123");
  await page.getByRole("button", { name: /criar conta/i }).click();
  await expect(page).toHaveURL(/\/painel\/perfil/);

  // 2. Perfil com WhatsApp
  await page.getByLabel("WhatsApp").fill("(67) 99999-0000");
  await page.getByRole("button", { name: /salvar perfil/i }).click();
  await expect(page.getByText(/perfil salvo/i)).toBeVisible();

  // 3. Imóvel
  await page.goto("/painel/imoveis/novo");
  await page.getByLabel("Título do anúncio").fill("Casa no Jardim dos Estados");
  await page.getByLabel("Tipo").selectOption("HOUSE");
  await page.getByLabel("Finalidade").selectOption("SALE");
  await page.getByLabel("Preço (R$)").fill("850000");
  await page.getByLabel("Cidade").fill("Campo Grande");
  await page.getByLabel("Bairro").fill("Jardim dos Estados");
  await page.getByLabel("Descrição").fill("Casa térrea ampla, com quintal, área gourmet e ótima iluminação.");
  await page.getByRole("button", { name: /salvar e continuar/i }).click();
  await expect(page).toHaveURL(/\/painel\/imoveis\/[^/]+/);

  // 4. Foto + publicação
  await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "fixtures", "casa.jpg"));
  await expect(page.getByAltText(/foto 1/i)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /^publicar$/i }).click();
  await expect(page.getByText("Publicado", { exact: true })).toBeVisible();
  const publicUrl = await page.getByTestId("public-url").inputValue();
  expect(publicUrl).toContain("/imovel/casa-no-jardim-dos-estados");

  // 5. Visitante no celular vindo do Instagram
  const visitor = await browser.newContext({ ...devices["iPhone 13"] });
  const v = await visitor.newPage();
  await v.goto(`/imovel/casa-no-jardim-dos-estados?utm_source=instagram&utm_campaign=teste`);
  await expect(v.getByRole("heading", { name: "Casa no Jardim dos Estados" })).toBeVisible();
  await v.getByRole("link", { name: /tenho interesse/i }).first().click();
  // só o nome é obrigatório: o botão fica desabilitado até preenchê-lo
  const start = v.getByRole("button", { name: /começar/i });
  await expect(start).toBeDisabled();
  await v.getByLabel("Nome").fill("João Pereira");
  await start.click();
  // Cada opção avança sozinha (150ms) para a próxima pergunta; esperamos o título de cada uma
  // aparecer antes de clicar, senão dois cliques em sequência podem acertar o mesmo botão "Sim"
  // (perguntas 4 e 5 têm o mesmo rótulo) antes da transição terminar.
  const steps: [heading: string, option: string][] = [
    ["Você pretende comprar ou alugar?", "Comprar"],
    ["Quando pretende fechar negócio?", "Imediatamente"],
    ["Como pretende pagar?", "À vista"],
    ["Você possui valor de entrada?", "Sim"],
    ["Gostaria de agendar uma visita?", "Sim"],
  ];
  for (const [heading, option] of steps) {
    await expect(v.getByRole("heading", { name: heading })).toBeVisible();
    await v.getByRole("button", { name: option, exact: true }).click();
  }
  const whatsapp = v.getByRole("link", { name: /continuar no whatsapp/i });
  await expect(whatsapp).toBeVisible();
  const href = await whatsapp.getAttribute("href");
  expect(href).toMatch(/^https:\/\/wa\.me\/5567999990000\?text=/);
  expect(decodeURIComponent(href!.split("text=")[1])).toContain("Olá, sou João Pereira.");
  await visitor.close();

  // 6. Corretor vê o lead
  await page.goto("/painel/leads");
  // escopado à linha da tabela: "Alta intenção" e "Instagram" também aparecem como <option> de
  // filtros ocultos na página, então buscar o texto solto poderia casar com eles.
  const tableRow = page.getByRole("row", { name: /João Pereira/ });
  await expect(tableRow).toBeVisible();
  await expect(tableRow.getByText("Alta intenção")).toBeVisible();
  await expect(tableRow.getByText("Instagram")).toBeVisible();
  await tableRow.getByRole("link", { name: /João Pereira/ }).click();
  await expect(page.getByText("Imediatamente")).toBeVisible();
});
