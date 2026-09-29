"use client";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { getAttribution, getVisitorId } from "@/lib/tracking";
import { hasName, maskPhone, postJson, validateContact, writeDone, writeStored, type Lead } from "./lead-session";

export const INTEREST_NAME_ID = "interest-name";
const FIELD_IDS: Record<string, string> = { name: INTEREST_NAME_ID, phone: "interest-phone", email: "interest-email" };
/** Campos que ficam na caixinha "mais informações de contato". */
const EXTRA_FIELDS = ["phone", "email"];

/**
 * Início do fluxo na própria página do imóvel: só o nome é obrigatório (WhatsApp e e-mail ficam
 * numa caixinha opcional). Cria o lead e leva o visitante direto à primeira pergunta.
 */
export function InterestStart({ propertyId, slug, consentText }: { propertyId: string; slug: string; consentText: string }) {
  const router = useRouter();
  const [contact, setContact] = useState({ name: "", phone: "", email: "" });
  const [showMore, setShowMore] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function focusFirstError(errs: Record<string, string>) {
    const first = Object.keys(FIELD_IDS).find((k) => errs[k]);
    if (!first) return false;
    // o campo pode estar dentro da caixinha fechada: abre antes de focar
    if (EXTRA_FIELDS.includes(first)) flushSync(() => setShowMore(true));
    document.getElementById(FIELD_IDS[first])?.focus();
    return true;
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const local = validateContact(contact);
    setErrors(local);
    if (focusFirstError(local)) return;

    setBusy(true);
    const r = await postJson<Lead>("/api/public/leads", {
      propertyId,
      name: contact.name,
      phone: contact.phone.trim() || undefined,
      email: contact.email.trim() || undefined,
      // o aviso de consentimento fica logo abaixo do botão: continuar é aceitar
      consent: true,
      visitorId: getVisitorId(),
      landingUrl: window.location.href,
      attribution: getAttribution(),
    });
    if (!r.ok) {
      setBusy(false);
      if (r.status === 422 && r.fieldErrors) {
        setErrors(r.fieldErrors);
        if (!focusFirstError(r.fieldErrors)) setFormError(r.fieldErrors._form ?? r.message);
      } else {
        setFormError(r.message);
      }
      return;
    }
    writeDone(propertyId, null);
    writeStored(propertyId, { ...r.data, name: contact.name, answers: {} });
    router.push(`/imovel/${slug}/interesse`);
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <OnBrandField id={FIELD_IDS.name} label="Seu nome" error={errors.name}>
        <Input
          id={FIELD_IDS.name}
          name="name"
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="go"
          maxLength={100}
          invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? `${FIELD_IDS.name}-error` : undefined}
          value={contact.name}
          onChange={(e) => setContact({ ...contact, name: e.target.value })}
          className="h-12! border-white! text-base!"
        />
      </OnBrandField>

      <div className="rounded-control border border-white/30">
        <button
          type="button"
          aria-expanded={showMore}
          aria-controls="interest-more"
          onClick={() => setShowMore((v) => !v)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-control px-4 py-3 text-left text-[0.9375rem] font-medium text-white hover:bg-white/10"
        >
          Quero deixar mais informações de contato
          <ChevronDown aria-hidden className={cn("size-5 shrink-0 text-white/80 transition-transform duration-150", showMore && "rotate-180")} />
        </button>
        {showMore && (
          <div id="interest-more" className="flex flex-col gap-4 border-t border-white/30 px-4 pt-4 pb-5">
            <OnBrandField id={FIELD_IDS.phone} label="WhatsApp (opcional)" error={errors.phone}>
              <Input
                id={FIELD_IDS.phone}
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                enterKeyHint="next"
                placeholder="(67) 99999-1234"
                invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? `${FIELD_IDS.phone}-error` : undefined}
                value={contact.phone}
                onChange={(e) => setContact({ ...contact, phone: maskPhone(e.target.value) })}
                className="h-12! border-white! text-base! tabular-nums"
              />
            </OnBrandField>
            <OnBrandField id={FIELD_IDS.email} label="E-mail (opcional)" error={errors.email}>
              <Input
                id={FIELD_IDS.email}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                enterKeyHint="go"
                maxLength={200}
                invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? `${FIELD_IDS.email}-error` : undefined}
                value={contact.email}
                onChange={(e) => setContact({ ...contact, email: e.target.value })}
                className="h-12! border-white! text-base!"
              />
            </OnBrandField>
          </div>
        )}
      </div>

      <div aria-live="polite">
        {formError && <p className="rounded-control bg-danger-soft px-4 py-3 text-[0.9375rem] text-danger">{formError}</p>}
      </div>

      <button
        type="submit"
        disabled={busy || !hasName(contact.name)}
        aria-busy={busy || undefined}
        className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-control bg-white px-5 text-base font-semibold text-brand hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy && <Spinner label="Enviando" />}
        {busy ? "Enviando…" : "Tenho interesse neste imóvel"}
      </button>
      <p className="text-[0.8125rem] leading-snug text-white/80">
        {consentText}{" "}
        <a href="/privacidade" target="_blank" rel="noopener" className="font-medium text-white underline underline-offset-4">
          Ler a política
        </a>
      </p>
    </form>
  );
}

/** Rótulo e erro legíveis sobre o fundo verde do card (o `Field` padrão usa cores para fundo claro). */
function OnBrandField({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-white">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="self-start rounded-[0.375rem] bg-danger-soft px-2 py-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
