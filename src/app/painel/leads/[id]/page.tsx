import { ArrowLeft, CalendarCheck, ExternalLink, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DeleteLeadButton } from "@/components/painel/DeleteLeadButton";
import { formatDateTime } from "@/components/painel/lead-status";
import { LeadStatusSelect } from "@/components/painel/LeadStatusSelect";
import { NoteForm } from "@/components/painel/NoteForm";
import { Badge } from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ClassificationBadge } from "@/components/ui/ClassificationBadge";
import { CHANNEL_LABELS, CLASSIFICATION_DISCLAIMER, LEAD_STATUS_LABELS } from "@/domain/labels";
import { formatBrPhone } from "@/domain/phone";
import { scoreOutOf100 } from "@/domain/scoring";
import { buildWhatsappUrl } from "@/domain/whatsapp";
import { requireUser } from "@/server/auth/current";
import { NotFoundError } from "@/server/errors";
import { getLead } from "@/server/services/leads";

export const metadata: Metadata = { title: "Contato" };

async function loadLead(id: string) {
  const user = await requireUser();
  try {
    return { user, lead: await getLead(user, id) };
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}

/** Linha "rótulo: valor" dos cartões de dados. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-sm text-ink-muted sm:w-40">{label}</dt>
      <dd className="min-w-0 text-[0.9375rem] break-words text-ink">{children}</dd>
    </div>
  );
}

export default async function LeadPage({ params }: PageProps<"/painel/leads/[id]">) {
  const { id } = await params;
  const { user, lead } = await loadLead(id);
  const firstName = lead.name.trim().split(/\s+/)[0];
  const whatsappUrl = buildWhatsappUrl(
    lead.phone,
    `Olá, ${firstName}! Aqui é ${user.name}, sobre o imóvel ${lead.property.title}.`,
  );
  const score = scoreOutOf100(lead.score, lead.maxScore);
  const utms = [
    ["utm_source", lead.utmSource],
    ["utm_medium", lead.utmMedium],
    ["utm_campaign", lead.utmCampaign],
    ["utm_content", lead.utmContent],
    ["utm_term", lead.utmTerm],
  ].filter((u): u is [string, string] => Boolean(u[1]));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link href="/painel/leads" className="inline-flex items-center gap-1.5 self-start text-sm text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" />
          Contatos
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-[2rem] leading-tight tracking-[-0.015em] break-words text-ink">{lead.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {lead.isComplete ? (
                <>
                  <ClassificationBadge value={lead.classification} />
                  {score !== null && (
                    <span className="text-sm text-ink-muted tabular-nums">
                      {score}/100
                      {lead.maxScore !== 100 && <span className="text-ink-faint"> ({lead.score} de {lead.maxScore} pts)</span>}
                    </span>
                  )}
                </>
              ) : (
                <Badge className="border border-dashed border-line-strong bg-transparent text-ink-faint">
                  Incompleto: não terminou as perguntas
                </Badge>
              )}
              {lead.wantsVisit && (
                <Badge tone="info" icon={<CalendarCheck aria-hidden />}>
                  Quer visitar
                </Badge>
              )}
            </div>
            <p className="mt-2 text-xs text-ink-muted">{CLASSIFICATION_DISCLAIMER}</p>
          </div>
          <LeadStatusSelect leadId={lead.id} status={lead.status} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "whatsapp" })}>
            <MessageCircle aria-hidden />
            Abrir WhatsApp
          </a>
          <a href={`tel:+${lead.phone}`} className={buttonStyles({ variant: "secondary" })}>
            <Phone aria-hidden />
            Ligar
          </a>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Contato">
          <dl className="-my-2.5 divide-y divide-line">
            <Row label="Telefone">
              <span className="tabular-nums">{formatBrPhone(lead.phone)}</span>
            </Row>
            <Row label="E-mail">
              {lead.email ? (
                <a href={`mailto:${lead.email}`} className="text-brand underline-offset-4 hover:underline">
                  {lead.email}
                </a>
              ) : (
                <span className="text-ink-faint">Não informado</span>
              )}
            </Row>
            <Row label="Recebido em">{formatDateTime(lead.createdAt)}</Row>
            <Row label="Consentimento">
              Registrado em {formatDateTime(lead.consentAt)}
              <details className="mt-1 text-sm text-ink-muted">
                <summary className="cursor-pointer">Ver texto aceito</summary>
                <p className="mt-1">{lead.consentText}</p>
              </details>
            </Row>
          </dl>
        </Card>

        <Card title="Imóvel">
          <p className="font-medium text-ink">{lead.property.title}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/painel/imoveis/${lead.property.id}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Ver no painel
            </Link>
            <a
              href={`/imovel/${lead.property.slug}`}
              target="_blank"
              rel="noopener"
              className={buttonStyles({ variant: "ghost", size: "sm" })}
            >
              <ExternalLink aria-hidden />
              Página pública
            </a>
          </div>
        </Card>
      </div>

      <Card title="Respostas" description={lead.answers.length ? undefined : "Nenhuma resposta registrada."}>
        {lead.answers.length > 0 ? (
          <dl className="-my-2.5 divide-y divide-line">
            {lead.answers.map((a) => (
              <div key={a.id} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
                <dt className="text-sm text-ink-muted sm:w-1/2">{a.questionLabel}</dt>
                <dd className="flex min-w-0 flex-1 items-baseline justify-between gap-3 text-[0.9375rem] text-ink">
                  <span className="break-words">{a.displayValue}</span>
                  <span className="shrink-0 text-xs text-ink-faint tabular-nums">
                    {a.points} {a.points === 1 ? "pt" : "pts"}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        ) : undefined}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Origem">
          <dl className="-my-2.5 divide-y divide-line">
            <Row label="Canal">{CHANNEL_LABELS[lead.channel]}</Row>
            {utms.map(([k, v]) => (
              <Row key={k} label={k}>
                {v}
              </Row>
            ))}
            <Row label="Veio de">
              {lead.referrer ? <span className="break-all">{lead.referrer}</span> : <span className="text-ink-faint">Acesso direto</span>}
            </Row>
          </dl>
        </Card>

        <Card title="Histórico">
          <ol className="flex flex-col gap-4 border-l border-line pl-4">
            {/* o registro inicial (sem status anterior) é criado junto com o contato; contatos antigos podem não tê-lo */}
            {!lead.history.some((h) => !h.fromStatus) && (
              <li className="relative">
                <span aria-hidden className="absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full bg-line-strong" />
                <p className="text-[0.9375rem] text-ink">Contato recebido</p>
                <p className="text-xs text-ink-muted">{formatDateTime(lead.createdAt)}</p>
              </li>
            )}
            {lead.history.map((h) => (
              <li key={h.id} className="relative">
                <span
                  aria-hidden
                  className={`absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full ${h.fromStatus ? "bg-brand" : "bg-line-strong"}`}
                />
                <p className="text-[0.9375rem] text-ink">
                  {h.fromStatus ? (
                    <>
                      {LEAD_STATUS_LABELS[h.fromStatus]} para{" "}
                      <strong className="font-semibold">{LEAD_STATUS_LABELS[h.toStatus]}</strong>
                    </>
                  ) : (
                    <>
                      Contato recebido como <strong className="font-semibold">{LEAD_STATUS_LABELS[h.toStatus]}</strong>
                    </>
                  )}
                </p>
                <p className="text-xs text-ink-muted">
                  {formatDateTime(h.createdAt)}
                  {h.changedBy && `, por ${h.changedBy.name}`}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card title="Observações">
        <NoteForm leadId={lead.id} />
        {lead.notes.length > 0 && (
          <ul className="mt-5 flex flex-col divide-y divide-line border-t border-line">
            {lead.notes.map((n) => (
              <li key={n.id} className="py-3">
                <p className="text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink">{n.body}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {n.author?.name ?? "Usuário removido"}, {formatDateTime(n.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Excluir contato"
        description="Remove permanentemente os dados desta pessoa (LGPD)."
        className="border-danger/25"
      >
        <DeleteLeadButton leadId={lead.id} name={lead.name} />
      </Card>
    </div>
  );
}
