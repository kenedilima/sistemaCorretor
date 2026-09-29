import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { createProperty } from "@/server/services/properties";
import {
  getHandoff, getPublicQuestions, recordPublicEvent, registerWhatsappClick, startLead, submitAnswers,
} from "@/server/services/public-leads";
import { getQuestionDefsForProperty } from "@/server/services/questionnaires";
import { makeAgent, makePublishedProperty, propertyInput } from "./helpers";

const appUrl = "https://app.teste";
const VISITOR = "7f1c2a9e-3b4d-4e5f-8a6b-0c1d2e3f4a5b";
const OTHER_VISITOR = "0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d";

async function setup() {
  const ctx = await makeAgent();
  const property = await makePublishedProperty(ctx);
  const questions = await getQuestionDefsForProperty(property.id, ctx.accountId);
  const answer = (qIndex: number, optIndex: number) => ({ [questions[qIndex].id]: { optionIds: [questions[qIndex].options[optIndex].id] } });
  const best = { ...answer(0, 0), ...answer(1, 0), ...answer(2, 0), ...answer(3, 0), ...answer(4, 0) };
  return { ctx, property, questions, answer, best };
}

const contact = (propertyId: string, extra: Record<string, unknown> = {}) => ({
  propertyId, name: "João Silva", phone: "(67) 98888-7777", consent: true, visitorId: VISITOR, ...extra,
});

describe("startLead", () => {
  it("cria lead incompleto com origem e telefone normalizado", async () => {
    const { ctx, property } = await setup();
    const { leadId, token } = await startLead(contact(property.id, { attribution: { utmSource: "instagram", utmCampaign: "casa" } }));
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead).toMatchObject({
      accountId: ctx.accountId, phone: "5567988887777", isComplete: false, classification: "UNRATED",
      channel: "INSTAGRAM", utmCampaign: "casa", status: "NEW", publicToken: token,
    });
    expect(lead.consentText).toMatch(/Política de Privacidade/);
  });

  it("aceita só o nome: telefone e e-mail são opcionais", async () => {
    const { property } = await setup();
    const { leadId } = await startLead(contact(property.id, { phone: undefined }));
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead).toMatchObject({ name: "João Silva", phone: null, email: null });
    const again = await startLead(contact(property.id, { phone: "" }));
    expect(again.leadId).toBe(leadId);
  });

  it("recusa imóvel não publicado, sem consentimento ou telefone inválido", async () => {
    const ctx = await makeAgent();
    const draft = await createProperty(ctx, propertyInput());
    await expect(startLead(contact(draft.id))).rejects.toBeInstanceOf(NotFoundError);
    const { property } = await setup();
    await expect(startLead(contact(property.id, { consent: false }))).rejects.toMatchObject({ fieldErrors: { consent: expect.any(String) } });
    await expect(startLead(contact(property.id, { phone: "123" }))).rejects.toMatchObject({ fieldErrors: { phone: expect.any(String) } });
  });

  it("reaproveita lead incompleto do mesmo telefone no mesmo imóvel", async () => {
    const { property } = await setup();
    const first = await startLead(contact(property.id, { visitorId: VISITOR }));
    const second = await startLead(contact(property.id, { name: "João S.", visitorId: VISITOR }));
    expect(second.leadId).toBe(first.leadId);
    expect(second.token).toBe(first.token);
    expect(await db.lead.count()).toBe(1);
  });

  it("não entrega o lead de outro navegador que usa o mesmo telefone", async () => {
    const { property } = await setup();
    const first = await startLead(contact(property.id, { email: "joao@teste.com", visitorId: VISITOR }));
    const other = await startLead(contact(property.id, { name: "Intruso", email: "x@teste.com", visitorId: OTHER_VISITOR }));
    expect(other.leadId).not.toBe(first.leadId);
    expect(other.token).not.toBe(first.token);
    const original = await db.lead.findUniqueOrThrow({ where: { id: first.leadId } });
    expect(original).toMatchObject({ name: "João Silva", email: "joao@teste.com" });
    const noVisitor = await startLead(contact(property.id, { visitorId: undefined }));
    expect(noVisitor.leadId).not.toBe(first.leadId);
    expect(await db.lead.count()).toBe(3);
  });

  it("recusa visitorId genérico ou mal formatado", async () => {
    const { property } = await setup();
    for (const visitorId of ["anon", "ANON", "v1", "a b c d e f g h", "x".repeat(65)]) {
      await expect(startLead(contact(property.id, { visitorId }))).rejects.toBeInstanceOf(ValidationError);
      await expect(recordPublicEvent({ propertyId: property.id, type: "PAGE_VIEW", visitorId })).rejects.toBeInstanceOf(ValidationError);
    }
  });
});

describe("submitAnswers", () => {
  it("pontua, salva respostas e gera link do WhatsApp", async () => {
    const { property, best } = await setup();
    const { leadId, token } = await startLead(contact(property.id));
    const handoff = await submitAnswers(leadId, token, { answers: best }, { appUrl });
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { answers: { orderBy: { position: "asc" } } } });
    expect(lead).toMatchObject({ isComplete: true, score: 100, maxScore: 100, classification: "HIGH", wantsVisit: true });
    expect(lead.answers).toHaveLength(5);
    expect(lead.answers[1]).toMatchObject({ questionLabel: "Quando pretende fechar negócio?", displayValue: "Imediatamente", points: 30 });
    expect(handoff.whatsappUrl).toMatch(/^https:\/\/wa\.me\/5567999990000\?text=/);
    expect(handoff.message).toContain("Olá, sou João Silva.");
    expect(handoff.message).toContain(`${appUrl}/imovel/${property.slug}`);
    expect(await db.analyticsEvent.count({ where: { type: "QUESTIONNAIRE_COMPLETE" } })).toBe(1);
  });

  it("valida obrigatórias e opções de outra pergunta", async () => {
    const { property, questions, answer } = await setup();
    const { leadId, token } = await startLead(contact(property.id));
    await expect(submitAnswers(leadId, token, { answers: answer(0, 0) }, { appUrl })).rejects.toBeInstanceOf(ValidationError);
    const wrong = { [questions[1].id]: { optionIds: [questions[2].options[0].id] } };
    await expect(submitAnswers(leadId, token, { answers: wrong }, { appUrl })).rejects.toBeInstanceOf(ValidationError);
  });

  it("exige o token do próprio lead", async () => {
    const { property, best } = await setup();
    const { leadId } = await startLead(contact(property.id));
    await expect(submitAnswers(leadId, "token-errado", { answers: best }, { appUrl })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("reenvio após concluir devolve o mesmo resultado sem duplicar", async () => {
    const { property, best } = await setup();
    const { leadId, token } = await startLead(contact(property.id));
    await submitAnswers(leadId, token, { answers: best }, { appUrl });
    await submitAnswers(leadId, token, { answers: best }, { appUrl });
    expect(await db.leadAnswer.count()).toBe(5);
    expect(await db.analyticsEvent.count({ where: { type: "QUESTIONNAIRE_COMPLETE" } })).toBe(1);
  });

  it("envios concorrentes gravam respostas e evento uma única vez", async () => {
    const { property, best } = await setup();
    const { leadId, token } = await startLead(contact(property.id));
    const results = await Promise.all([
      submitAnswers(leadId, token, { answers: best }, { appUrl }),
      submitAnswers(leadId, token, { answers: best }, { appUrl }),
    ]);
    expect(results[0].whatsappUrl).toBe(results[1].whatsappUrl);
    expect(await db.leadAnswer.count()).toBe(5);
    expect(await db.analyticsEvent.count({ where: { type: "QUESTIONNAIRE_COMPLETE" } })).toBe(1);
  });

  it("sem WhatsApp do corretor falha com conflito (não 404) e mantém as respostas", async () => {
    const { ctx, property, best } = await setup();
    const { leadId, token } = await startLead(contact(property.id));
    await db.user.update({ where: { id: ctx.userId }, data: { whatsapp: null } });
    const err = await submitAnswers(leadId, token, { answers: best }, { appUrl }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).not.toBeInstanceOf(NotFoundError);
    expect(err.message).toMatch(/indisponível/);
    expect(await db.leadAnswer.count()).toBe(5);
    await expect(getHandoff(leadId, token, { appUrl })).rejects.toBeInstanceOf(ConflictError);
    await db.user.update({ where: { id: ctx.userId }, data: { whatsapp: "5567999990000" } });
    expect((await submitAnswers(leadId, token, { answers: best }, { appUrl })).whatsappUrl).toMatch(/^https:\/\/wa\.me\//);
  });

  it("recusa mais de 20 respostas", async () => {
    const { property } = await setup();
    const { leadId, token } = await startLead(contact(property.id));
    const answers = Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => [`q${i}`, { text: "x" }]),
    );
    await expect(submitAnswers(leadId, token, { answers }, { appUrl })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("registerWhatsappClick", () => {
  it("registra uma única vez", async () => {
    const { property, best } = await setup();
    const { leadId, token } = await startLead(contact(property.id));
    await submitAnswers(leadId, token, { answers: best }, { appUrl });
    await registerWhatsappClick(leadId, token);
    await registerWhatsappClick(leadId, token);
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).whatsappClickedAt).toBeInstanceOf(Date);
    expect(await db.analyticsEvent.count({ where: { type: "WHATSAPP_CLICK" } })).toBe(1);
  });

  it("registra uma única vez mesmo com chamadas concorrentes", async () => {
    const { property, best } = await setup();
    const { leadId, token } = await startLead(contact(property.id));
    await submitAnswers(leadId, token, { answers: best }, { appUrl });
    await Promise.all([registerWhatsappClick(leadId, token), registerWhatsappClick(leadId, token)]);
    expect(await db.analyticsEvent.count({ where: { type: "WHATSAPP_CLICK" } })).toBe(1);
  });
});

describe("recordPublicEvent e getPublicQuestions", () => {
  it("registra visualização com canal e ignora imóvel não publicado", async () => {
    const { ctx, property } = await setup();
    await recordPublicEvent({ propertyId: property.id, type: "PAGE_VIEW", visitorId: VISITOR, attribution: { utmSource: "qrcode" } });
    const ev = await db.analyticsEvent.findFirstOrThrow();
    expect(ev).toMatchObject({ accountId: ctx.accountId, channel: "QR_CODE", type: "PAGE_VIEW" });
    const draft = await createProperty(ctx, propertyInput({ title: "Outro imóvel" }));
    await expect(recordPublicEvent({ propertyId: draft.id, type: "PAGE_VIEW" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("não expõe pesos ao visitante", async () => {
    const { property } = await setup();
    const qs = await getPublicQuestions(property.id);
    expect(qs).toHaveLength(5);
    expect(JSON.stringify(qs)).not.toContain("weight");
  });
});
