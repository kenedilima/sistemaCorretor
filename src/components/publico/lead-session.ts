import type { AnswerMap } from "@/domain/types";
import type { Handoff } from "@/server/services/public-leads";

/**
 * Estado do lead no navegador, compartilhado entre o formulário da página do imóvel (que cria o lead)
 * e o questionário em /interesse (que o retoma pelo sessionStorage).
 */
export type Lead = { leadId: string; token: string };
export type Stored = Lead & { name: string; answers: AnswerMap };
/** Marcador da etapa final: recarregar a tela de conclusão volta a ela em vez de reiniciar o fluxo. */
export type StoredDone = Lead & { name: string; handoff: Handoff };

export const GENERIC_ERROR = "Algo deu errado. Tente novamente.";
export const OFFLINE_ERROR = "Sem conexão. Verifique sua internet e tente novamente.";

const storageKey = (propertyId: string) => `sc_lead_${propertyId}`;
const doneKey = (propertyId: string) => `sc_done_${propertyId}`;

export function readDone(propertyId: string): StoredDone | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(doneKey(propertyId)) ?? "null");
    const h = v?.handoff;
    if (typeof v?.leadId !== "string" || typeof v?.token !== "string" || typeof h?.whatsappUrl !== "string") return null;
    if (!h.whatsappUrl.startsWith("https://wa.me/") || !Array.isArray(h.lines)) return null;
    return { leadId: v.leadId, token: v.token, name: typeof v.name === "string" ? v.name : "", handoff: h as Handoff };
  } catch {
    return null;
  }
}

export function writeDone(propertyId: string, value: StoredDone | null) {
  try {
    if (value) sessionStorage.setItem(doneKey(propertyId), JSON.stringify(value));
    else sessionStorage.removeItem(doneKey(propertyId));
  } catch {
    /* armazenamento bloqueado */
  }
}

export function readStored(propertyId: string): Stored | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(storageKey(propertyId)) ?? "null");
    if (!v || typeof v.leadId !== "string" || typeof v.token !== "string") return null;
    return {
      leadId: v.leadId,
      token: v.token,
      name: typeof v.name === "string" ? v.name : "",
      answers: v.answers && typeof v.answers === "object" ? (v.answers as AnswerMap) : {},
    };
  } catch {
    return null;
  }
}

export function writeStored(propertyId: string, value: Stored | null) {
  try {
    if (value) sessionStorage.setItem(storageKey(propertyId), JSON.stringify(value));
    else sessionStorage.removeItem(storageKey(propertyId));
  } catch {
    /* modo privado / armazenamento bloqueado: o fluxo continua sem retomada */
  }
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; fieldErrors?: Record<string, string> };

export async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: data as T };
    return { ok: false, status: res.status, message: data?.message ?? GENERIC_ERROR, fieldErrors: data?.fieldErrors };
  } catch {
    return { ok: false, status: 0, message: OFFLINE_ERROR };
  }
}

/** Máscara progressiva: (67) 9999-1234 / (67) 99999-1234. */
export function maskPhone(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  const cut = rest.length === 9 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}`;
}

export const hasName = (name: string) => name.trim().length >= 2;

/** Validação local (mesmas regras do servidor) — evita gastar o limite de envios do IP com erros de digitação. */
export function validateContact(c: { name: string; phone: string; email: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!hasName(c.name)) errors.name = "Informe seu nome";
  let digits = c.phone.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits && digits.length !== 10 && digits.length !== 11) errors.phone = "WhatsApp inválido. Use DDD + número";
  const email = c.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "E-mail inválido";
  return errors;
}
