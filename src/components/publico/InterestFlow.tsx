"use client";
import { ArrowLeft, Check, ChevronDown, MessageCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/components/ui/cn";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { isAnswered, visibleQuestions } from "@/domain/questionnaire";
import type { AnswerMap, AnswerValue } from "@/domain/types";
import { captureAttribution, getAttribution, getVisitorId, sendEventOncePerSession } from "@/lib/tracking";
import type { Handoff, PublicQuestion } from "@/server/services/public-leads";

type Step = { kind: "contact" } | { kind: "question"; index: number } | { kind: "sending" } | { kind: "done"; handoff: Handoff };
type Lead = { leadId: string; token: string };
type Stored = Lead & { name: string; answers: AnswerMap };
/** Marcador da etapa final: recarregar a tela de conclusão volta a ela em vez de abrir o formulário vazio. */
type StoredDone = Lead & { name: string; handoff: Handoff };

export type InterestFlowProps = {
  property: { id: string; title: string; slug: string; coverUrl: string | null; agentName: string; agentPhotoUrl: string | null };
  questions: PublicQuestion[];
  consentText: string;
};

const GENERIC_ERROR = "Algo deu errado. Tente novamente.";
const OFFLINE_ERROR = "Sem conexão. Verifique sua internet e tente novamente.";
const numberFmt = new Intl.NumberFormat("pt-BR");

const storageKey = (propertyId: string) => `sc_lead_${propertyId}`;
const doneKey = (propertyId: string) => `sc_done_${propertyId}`;

function readDone(propertyId: string): StoredDone | null {
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

function writeDone(propertyId: string, value: StoredDone | null) {
  try {
    if (value) sessionStorage.setItem(doneKey(propertyId), JSON.stringify(value));
    else sessionStorage.removeItem(doneKey(propertyId));
  } catch {
    /* armazenamento bloqueado */
  }
}

function readStored(propertyId: string): Stored | null {
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

function writeStored(propertyId: string, value: Stored | null) {
  try {
    if (value) sessionStorage.setItem(storageKey(propertyId), JSON.stringify(value));
    else sessionStorage.removeItem(storageKey(propertyId));
  } catch {
    /* modo privado / armazenamento bloqueado: o fluxo continua sem retomada */
  }
}

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; fieldErrors?: Record<string, string> };

async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
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
function maskPhone(raw: string) {
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

const CONTACT_FIELD_IDS: Record<string, string> = { name: "cf-name", phone: "cf-phone", email: "cf-email" };
/** Campos que ficam na caixinha "mais informações de contato". */
const EXTRA_CONTACT_FIELDS = ["phone", "email"];

const hasName = (name: string) => name.trim().length >= 2;

/** Validação local (mesmas regras do servidor) — evita gastar o limite de envios do IP com erros de digitação. */
function validateContact(c: { name: string; phone: string; email: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!hasName(c.name)) errors.name = "Informe seu nome";
  let digits = c.phone.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits && digits.length !== 10 && digits.length !== 11) errors.phone = "WhatsApp inválido. Use DDD + número";
  const email = c.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "E-mail inválido";
  return errors;
}

/** Fluxo do visitante: nome (contatos extras opcionais) → uma pergunta por tela → encaminhamento ao WhatsApp. */
export function InterestFlow({ property, questions, consentText }: InterestFlowProps) {
  const [step, setStep] = useState<Step>({ kind: "contact" });
  const [lead, setLead] = useState<Lead | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [contact, setContact] = useState({ name: "", phone: "", email: "" });
  const [showMoreContact, setShowMoreContact] = useState(false);
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [questionErrors, setQuestionErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);
  const [busy, setBusy] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const advancing = useRef(false);
  const advanceTimer = useRef<number | null>(null);
  const started = useRef(false);
  const firstStep = useRef(true);

  const visible = useMemo(() => visibleQuestions(questions, answers), [questions, answers]);
  const totalSteps = visible.length + 1;

  // entrada direta, evento de início e retomada após recarregar
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    captureAttribution();
    sendEventOncePerSession(property.id, "QUESTIONNAIRE_START");
    /* eslint-disable react-hooks/set-state-in-effect -- sessionStorage só existe no navegador; restaurar após hidratar */
    const done = readDone(property.id);
    if (done) {
      setLead({ leadId: done.leadId, token: done.token });
      setContact((c) => ({ ...c, name: done.name }));
      setStep({ kind: "done", handoff: done.handoff });
      return;
    }
    const saved = readStored(property.id);
    if (!saved) return;
    const vis = visibleQuestions(questions, saved.answers);
    setLead({ leadId: saved.leadId, token: saved.token });
    setAnswers(saved.answers);
    setContact((c) => ({ ...c, name: saved.name }));
    if (vis.length > 0) {
      const pending = vis.findIndex((q) => !isAnswered(q, saved.answers[q.id]));
      setStep({ kind: "question", index: pending === -1 ? vis.length - 1 : pending });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [property.id, questions]);

  const stepKey =
    step.kind === "question" ? `q-${visible[step.index]?.id ?? step.index}`
    : step.kind === "sending" && error ? "sending-error"
    : step.kind;

  function cancelAdvance() {
    if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
    advancing.current = false;
  }

  useEffect(() => () => cancelAdvance(), []);

  // foco no título a cada troca de etapa (leitores de tela anunciam a nova pergunta)
  useEffect(() => {
    cancelAdvance();
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [stepKey]);

  function persist(nextLead: Lead | null, nextAnswers: AnswerMap, name = contact.name) {
    if (nextLead) writeStored(property.id, { ...nextLead, name, answers: nextAnswers });
  }

  function goTo(index: number, currentAnswers: AnswerMap, currentLead: Lead) {
    const vis = visibleQuestions(questions, currentAnswers);
    if (index < vis.length) setStep({ kind: "question", index: Math.max(0, index) });
    else void submitAnswers(currentAnswers, currentLead);
  }

  function focusFirstContactError(errors: Record<string, string>) {
    const first = Object.keys(CONTACT_FIELD_IDS).find((k) => errors[k]);
    if (!first) return false;
    // o campo pode estar dentro da caixinha fechada: abre antes de focar
    if (EXTRA_CONTACT_FIELDS.includes(first)) flushSync(() => setShowMoreContact(true));
    document.getElementById(CONTACT_FIELD_IDS[first])?.focus();
    return true;
  }

  async function submitContact(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const localErrors = validateContact(contact);
    if (Object.keys(localErrors).length > 0) {
      setContactErrors(localErrors);
      focusFirstContactError(localErrors);
      return;
    }
    setBusy(true);
    const r = await postJson<Lead>("/api/public/leads", {
      propertyId: property.id,
      name: contact.name,
      phone: contact.phone.trim() || undefined,
      email: contact.email.trim() || undefined,
      // o aviso de consentimento fica logo abaixo do botão: continuar é aceitar
      consent: true,
      visitorId: getVisitorId(),
      landingUrl: window.location.href,
      attribution: getAttribution(),
    });
    setBusy(false);
    if (!r.ok) {
      if (r.status === 422 && r.fieldErrors) {
        setContactErrors(r.fieldErrors);
        if (!focusFirstContactError(r.fieldErrors)) setError({ message: r.fieldErrors._form ?? r.message });
      } else {
        setContactErrors({});
        setError({ message: r.message, retry: () => formRef.current?.requestSubmit() });
      }
      return;
    }
    setContactErrors({});
    setLead(r.data);
    persist(r.data, answers, contact.name);
    goTo(0, answers, r.data);
  }

  async function submitAnswers(currentAnswers: AnswerMap, currentLead: Lead) {
    setStep({ kind: "sending" });
    setError(null);
    const vis = visibleQuestions(questions, currentAnswers);
    const payload = Object.fromEntries(
      vis.filter((q) => isAnswered(q, currentAnswers[q.id])).map((q) => [q.id, currentAnswers[q.id]]),
    );
    const r = await postJson<Handoff>(`/api/public/leads/${encodeURIComponent(currentLead.leadId)}/answers`, {
      token: currentLead.token,
      answers: payload,
    });
    if (r.ok) {
      writeStored(property.id, null);
      writeDone(property.id, { ...currentLead, name: contact.name, handoff: r.data });
      setStep({ kind: "done", handoff: r.data });
      return;
    }
    if (r.status === 422 && r.fieldErrors) {
      const idx = vis.findIndex((q) => r.fieldErrors?.[q.id]);
      if (idx !== -1) {
        setQuestionErrors(r.fieldErrors);
        setStep({ kind: "question", index: idx });
        return;
      }
      // erro sem pergunta visível correspondente: mostra a mensagem em vez de voltar à 1ª pergunta
      setError({ message: r.fieldErrors._form ?? r.message, retry: () => void submitAnswers(currentAnswers, currentLead) });
      return;
    }
    if (r.status === 404) {
      writeStored(property.id, null);
      setLead(null);
      setError({ message: "Não foi possível continuar seu contato. Confirme seus dados para tentar de novo." });
      setStep({ kind: "contact" });
      return;
    }
    setError({ message: r.message, retry: () => void submitAnswers(currentAnswers, currentLead) });
  }

  function setAnswer(q: PublicQuestion, value: AnswerValue | undefined): AnswerMap {
    const next = { ...answers };
    if (value) next[q.id] = value;
    else delete next[q.id];
    setAnswers(next);
    persist(lead, next);
    if (questionErrors[q.id]) {
      setQuestionErrors((errors) => {
        const rest = { ...errors };
        delete rest[q.id];
        return rest;
      });
    }
    return next;
  }

  function back() {
    cancelAdvance();
    setError(null);
    if (step.kind === "question") {
      setStep(step.index === 0 ? { kind: "contact" } : { kind: "question", index: step.index - 1 });
    } else if (step.kind === "sending") {
      setStep({ kind: "question", index: Math.max(0, visible.length - 1) });
    }
  }

  const progress =
    step.kind === "contact" ? 1 / totalSteps
    : step.kind === "question" ? (step.index + 2) / totalSteps
    : 1;
  const stepLabel =
    step.kind === "contact" ? `Etapa 1 de ${totalSteps}`
    : step.kind === "question" ? `Etapa ${step.index + 2} de ${totalSteps}`
    : step.kind === "sending" ? "Enviando respostas"
    : "Tudo pronto";

  const headingClass = "font-display text-[1.875rem] leading-[1.15] tracking-[-0.015em] text-balance text-ink outline-none";

  let body: ReactNode;
  if (step.kind === "contact") {
    body = (
      <>
        <h1 ref={headingRef} tabIndex={-1} className={headingClass}>
          Antes de começar, qual é o seu nome?
        </h1>
        <div className="mt-3 flex items-center gap-3">
          {property.agentPhotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- foto do storage (local ou Supabase)
            <img src={property.agentPhotoUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" />
          )}
          <p className="text-[0.9375rem] leading-snug text-ink-muted">
            Responda algumas perguntas rápidas e fale com {property.agentName} pelo WhatsApp.
          </p>
        </div>
        <form ref={formRef} noValidate onSubmit={submitContact} className="mt-7 flex flex-1 flex-col gap-5">
          <Field id="cf-name" label="Nome" error={contactErrors.name}>
            <Input
              name="name"
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="go"
              maxLength={100}
              value={contact.name}
              onChange={(e) => setContact({ ...contact, name: e.target.value })}
              className="h-12! text-base!"
            />
          </Field>

          <div className="rounded-control border border-line">
            <button
              type="button"
              aria-expanded={showMoreContact}
              aria-controls="cf-more"
              onClick={() => setShowMoreContact((v) => !v)}
              className="flex min-h-12 w-full items-center justify-between gap-3 rounded-control px-4 py-3 text-left text-[0.9375rem] font-medium text-ink hover:bg-ink/5"
            >
              Quero deixar mais informações de contato
              <ChevronDown
                aria-hidden
                className={cn("size-5 shrink-0 text-ink-muted transition-transform duration-150", showMoreContact && "rotate-180")}
              />
            </button>
            {showMoreContact && (
              <div id="cf-more" className="flex flex-col gap-5 border-t border-line px-4 pt-4 pb-5">
                <Field id="cf-phone" label="WhatsApp" optional hint="Com DDD" error={contactErrors.phone}>
                  <Input
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    enterKeyHint="next"
                    placeholder="(67) 99999-1234"
                    value={contact.phone}
                    onChange={(e) => setContact({ ...contact, phone: maskPhone(e.target.value) })}
                    className="h-12! text-base! tabular-nums"
                  />
                </Field>
                <Field id="cf-email" label="E-mail" optional error={contactErrors.email}>
                  <Input
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    enterKeyHint="go"
                    maxLength={200}
                    value={contact.email}
                    onChange={(e) => setContact({ ...contact, email: e.target.value })}
                    className="h-12! text-base!"
                  />
                </Field>
              </div>
            )}
          </div>

          <ErrorBox error={error} />
          <div className={actionBarClass}>
            <PrimaryButton type="submit" disabled={busy || !hasName(contact.name)} aria-busy={busy || undefined}>
              {busy ? <Spinner label="Enviando" /> : null}
              {busy ? "Enviando…" : "Começar"}
            </PrimaryButton>
            <p className="mt-3 text-[0.8125rem] leading-snug text-ink-muted">
              {consentText}{" "}
              <a href="/privacidade" target="_blank" rel="noopener" className="font-medium text-brand underline underline-offset-4">
                Ler a política
              </a>
            </p>
          </div>
        </form>
      </>
    );
  } else if (step.kind === "question") {
    const q = visible[step.index];
    if (!q) {
      body = null;
    } else {
      const a = answers[q.id];
      const isChoice = q.type === "SINGLE_CHOICE" || q.type === "YES_NO" || q.type === "MULTI_CHOICE";
      const multi = q.type === "MULTI_CHOICE";
      const selected = new Set(a?.optionIds ?? []);
      const qError = questionErrors[q.id];

      const next = (current: AnswerMap) => {
        if (!lead) return setStep({ kind: "contact" });
        goTo(step.index + 1, current, lead);
      };
      const onContinue = () => {
        if (q.required && !isAnswered(q, answers[q.id])) {
          setQuestionErrors((e) => ({ ...e, [q.id]: multi ? "Escolha pelo menos uma opção" : "Responda para continuar" }));
          return;
        }
        next(answers);
      };
      const onPick = (optionId: string) => {
        if (advancing.current) return;
        if (multi) {
          const ids = selected.has(optionId) ? [...selected].filter((id) => id !== optionId) : [...selected, optionId];
          setAnswer(q, ids.length ? { optionIds: ids } : undefined);
          return;
        }
        const current = setAnswer(q, { optionIds: [optionId] });
        advancing.current = true;
        advanceTimer.current = window.setTimeout(() => {
          advanceTimer.current = null;
          advancing.current = false;
          next(current);
        }, 150);
      };

      body = (
        <>
          <h1 ref={headingRef} tabIndex={-1} className={headingClass} id={`q-${q.id}`}>
            {q.label}
          </h1>
          {multi && <p className="mt-2 text-[0.9375rem] text-ink-muted">Escolha quantas quiser.</p>}

          <div className="mt-7 flex flex-1 flex-col">
            {isChoice && (
              <ul className="flex flex-col gap-2.5" aria-labelledby={`q-${q.id}`}>
                {q.options.map((o) => {
                  const on = selected.has(o.id);
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => onPick(o.id)}
                        className={cn(
                          "flex min-h-14 w-full items-center gap-3.5 rounded-control border px-4 py-3 text-left text-base leading-snug transition-colors duration-100",
                          on
                            ? "border-brand bg-brand-soft text-ink"
                            : "border-line-strong bg-surface text-ink hover:border-ink-faint active:bg-surface-sunken",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "grid size-5 shrink-0 place-items-center border-[1.5px]",
                            multi ? "rounded-[0.3rem]" : "rounded-full",
                            on ? "border-brand bg-brand text-white" : "border-line-strong",
                          )}
                        >
                          {on && <Check className="size-3.5" strokeWidth={3} />}
                        </span>
                        {o.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {q.type === "TEXT" && (
              <Field id={`qa-${q.id}`} label="Sua resposta" error={qError} aside={`${a?.text?.length ?? 0}/500`}>
                <Textarea
                  rows={4}
                  maxLength={500}
                  value={a?.text ?? ""}
                  onChange={(e) => setAnswer(q, e.target.value ? { text: e.target.value } : undefined)}
                  className="text-base!"
                />
              </Field>
            )}

            {q.type === "NUMBER" && (
              <Field id={`qa-${q.id}`} label="Sua resposta" error={qError}>
                <Input
                  inputMode="numeric"
                  enterKeyHint="next"
                  autoComplete="off"
                  value={a?.number != null ? numberFmt.format(a.number) : ""}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                    setAnswer(q, digits ? { number: Number(digits) } : undefined);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onContinue();
                  }}
                  className="h-12! text-base! tabular-nums"
                />
              </Field>
            )}

            {isChoice && qError && <p className="mt-3 text-sm text-danger">{qError}</p>}
            <ErrorBox error={qError ? { message: qError } : null} srOnly />

            <div className={cn(actionBarClass, "mt-4 flex flex-col gap-2")}>
              {(multi || !isChoice) && <PrimaryButton onClick={onContinue}>Continuar</PrimaryButton>}
              {!q.required && (
                <button
                  type="button"
                  onClick={() => next(setAnswer(q, undefined))}
                  className="inline-flex h-12 w-full items-center justify-center rounded-control text-base font-medium text-ink-muted hover:bg-ink/5 hover:text-ink"
                >
                  Pular
                </button>
              )}
            </div>
          </div>
        </>
      );
    }
  } else if (step.kind === "sending") {
    body = error ? (
      <>
        <h1 ref={headingRef} tabIndex={-1} className={headingClass}>
          Não foi possível enviar
        </h1>
        <div className="mt-4">
          <ErrorBox error={error} />
        </div>
        <div className="flex flex-col gap-2 pt-8">
          <button
            type="button"
            onClick={back}
            className="inline-flex h-12 w-full items-center justify-center rounded-control text-base font-medium text-ink-muted hover:bg-ink/5 hover:text-ink"
          >
            Revisar respostas
          </button>
        </div>
      </>
    ) : (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <Spinner className="size-8 text-brand" label="Enviando" />
        <h1 ref={headingRef} tabIndex={-1} className="font-display text-[1.5rem] text-ink outline-none">
          Enviando suas respostas…
        </h1>
      </div>
    );
  } else {
    const { handoff } = step;
    const firstName = contact.name.trim().split(/\s+/)[0];
    body = (
      <>
        <span aria-hidden className="grid size-14 place-items-center rounded-full bg-whatsapp/10 text-whatsapp">
          <Check className="size-7" strokeWidth={2.5} />
        </span>
        <h1 ref={headingRef} tabIndex={-1} className={cn(headingClass, "mt-5")}>
          {firstName ? `Pronto, ${firstName}!` : "Pronto!"}
        </h1>
        <p className="mt-2 text-base text-ink-muted">Sua mensagem já vai pronta — é só enviar.</p>

        <a
          href={handoff.whatsappUrl}
          target="_blank"
          rel="noopener"
          onClick={() => {
            if (!lead) return;
            const url = `/api/public/leads/${encodeURIComponent(lead.leadId)}/whatsapp`;
            const payload = JSON.stringify({ token: lead.token });
            if (!navigator.sendBeacon?.(url, payload)) {
              fetch(url, { method: "POST", body: payload, keepalive: true }).catch(() => {});
            }
          }}
          className="mt-7 inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-control bg-whatsapp px-5 text-base font-semibold text-white hover:bg-whatsapp-strong active:bg-whatsapp-strong"
        >
          <MessageCircle aria-hidden className="size-5" />
          Continuar no WhatsApp
        </a>

        {handoff.lines.length > 0 && (
          <section aria-labelledby="resumo" className="mt-9">
            <h2 id="resumo" className="text-sm font-medium text-ink-muted">
              O corretor vai receber
            </h2>
            <dl className="mt-2 divide-y divide-line border-y border-line">
              {handoff.lines.map((l) => (
                <div key={l.label} className="flex flex-col gap-0.5 py-3">
                  <dt className="text-sm text-ink-muted">{l.label}</dt>
                  <dd className="text-base text-ink">{l.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <div className="pt-8">
          <Link
            href={`/imovel/${property.slug}`}
            onClick={() => writeDone(property.id, null)}
            className="inline-flex h-12 w-full items-center justify-center rounded-control text-base font-medium text-ink-muted hover:bg-ink/5 hover:text-ink"
          >
            Voltar ao imóvel
          </Link>
        </div>
      </>
    );
  }

  const canGoBack = step.kind === "question" || (step.kind === "sending" && error !== null);

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-2 py-2 sm:px-4">
          {step.kind === "contact" ? (
            <Link href={`/imovel/${property.slug}`} aria-label="Voltar ao imóvel" className={backButtonClass}>
              <ArrowLeft aria-hidden className="size-5" />
            </Link>
          ) : canGoBack ? (
            <button type="button" onClick={back} aria-label="Voltar à etapa anterior" className={backButtonClass}>
              <ArrowLeft aria-hidden className="size-5" />
            </button>
          ) : (
            <span aria-hidden className="w-2" />
          )}
          {property.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- foto do storage (local ou Supabase)
            <img src={property.coverUrl} alt="" className="size-10 shrink-0 rounded-[0.5rem] object-cover" />
          )}
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[0.9375rem] font-medium text-ink">{property.title}</p>
            <p className="text-[0.8125rem] text-ink-muted">{stepLabel}</p>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label="Progresso"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="h-1 bg-line/60"
        >
          <div className="h-full bg-brand transition-[width] duration-300 ease-out" style={{ width: `${progress * 100}%` }} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pt-7 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-10">
        <div key={stepKey} className="flex flex-1 flex-col motion-safe:animate-[step-in_220ms_ease-out]">
          {body}
        </div>
      </main>
    </div>
  );
}

/**
 * Ações logo abaixo do conteúdo (sem `mt-auto`: em telas altas isso jogava o botão para o rodapé,
 * deixando um vão enorme). Quando o conteúdo passa da tela — teclado aberto, muitas opções —
 * a barra gruda no rodapé e o botão continua ao alcance do polegar.
 */
const actionBarClass =
  "sticky bottom-0 z-10 -mx-4 bg-surface px-4 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6";

const backButtonClass =
  "inline-flex size-12 shrink-0 items-center justify-center rounded-full text-ink hover:bg-ink/5";

function PrimaryButton({ className, type = "button", ...props }: ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-14 w-full items-center justify-center gap-2 rounded-control bg-brand px-5 text-base font-semibold text-on-brand",
        "hover:bg-brand-strong active:bg-brand-strong disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

/** Mensagem de erro geral, anunciada com aria-live. */
function ErrorBox({ error, srOnly }: { error: { message: string; retry?: () => void } | null; srOnly?: boolean }) {
  return (
    <div aria-live="polite" className={srOnly ? "sr-only" : undefined}>
      {error && (
        <div className={cn(!srOnly && "flex flex-col items-start gap-2 rounded-control bg-danger-soft px-4 py-3 text-[0.9375rem] text-danger")}>
          <p>{error.message}</p>
          {error.retry && !srOnly && (
            <button
              type="button"
              onClick={error.retry}
              className="inline-flex min-h-12 items-center gap-2 font-semibold underline underline-offset-4"
            >
              <RotateCcw aria-hidden className="size-4" />
              Tentar novamente
            </button>
          )}
        </div>
      )}
    </div>
  );
}
