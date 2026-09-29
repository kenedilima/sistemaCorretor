import { CalendarCheck, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { ClassificationBadge } from "@/components/ui/ClassificationBadge";
import { formatBrPhone } from "@/domain/phone";
import { CHANNEL_LABELS, LEAD_STATUS_LABELS } from "@/domain/labels";
import type { Channel, Classification, LeadStatus } from "@/domain/types";
import { scoreOutOf100 } from "@/domain/scoring";
import { formatDateTime, LEAD_STATUS_TONES } from "./lead-status";

export type LeadRow = {
  id: string;
  name: string;
  phone: string | null;
  score: number;
  maxScore: number;
  classification: Classification;
  status: LeadStatus;
  isComplete: boolean;
  wantsVisit: boolean;
  channel: Channel;
  createdAt: Date;
  property: { id: string; title: string };
};

function Score({ lead }: { lead: LeadRow }) {
  const value = scoreOutOf100(lead.score, lead.maxScore);
  if (value === null || !lead.isComplete) return null;
  return (
    <span className="text-xs text-ink-muted tabular-nums">
      {value}
      <span className="text-ink-faint">/100</span>
    </span>
  );
}

function Incomplete() {
  return (
    <Badge className="border border-dashed border-line-strong bg-transparent text-ink-faint" title="Deixou o contato mas não terminou as perguntas">
      Incompleto
    </Badge>
  );
}

function Visit({ withLabel }: { withLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-brand" title="Quer agendar visita">
      <CalendarCheck aria-hidden className="size-4" />
      <span className={withLabel ? undefined : "sr-only"}>Quer visitar</span>
    </span>
  );
}

/**
 * Contatos em tabela (≥ 1024px) ou cartões empilhados (celular/tablet).
 * Pensado para responder de relance: quem, qual imóvel, intenção indicada, quer visita, já foi atendido?
 */
export function LeadTable({ leads }: { leads: LeadRow[] }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-card border border-line/70 bg-surface shadow-card lg:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface-sunken text-xs text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Nome</th>
              <th scope="col" className="px-4 py-3 font-medium">Imóvel</th>
              <th scope="col" className="px-4 py-3 font-medium">Classificação</th>
              <th scope="col" className="px-2 py-3 text-center font-medium">Visita</th>
              <th scope="col" className="px-4 py-3 font-medium">Origem</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {leads.map((l) => (
              <tr key={l.id} className="group relative hover:bg-surface-sunken">
                <td className="max-w-56 px-4 py-3">
                  {/* o link cobre a linha inteira (::after), mantendo a tabela semântica */}
                  <Link
                    href={`/painel/leads/${l.id}`}
                    className="block truncate font-medium text-ink after:absolute after:inset-0 group-hover:text-brand"
                  >
                    {l.name}
                  </Link>
                  {l.phone && <span className="block text-xs text-ink-muted tabular-nums">{formatBrPhone(l.phone)}</span>}
                </td>
                <td className="max-w-60 px-4 py-3">
                  <span className="line-clamp-2 text-ink-muted">{l.property.title}</span>
                </td>
                <td className="px-4 py-3">
                  {l.isComplete ? (
                    <span className="flex items-center gap-2">
                      <ClassificationBadge value={l.classification} size="sm" />
                      <Score lead={l} />
                    </span>
                  ) : (
                    <Incomplete />
                  )}
                </td>
                <td className="px-2 py-3 text-center">
                  {l.wantsVisit ? <Visit /> : <span className="sr-only">Não informou</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{CHANNEL_LABELS[l.channel]}</td>
                <td className="px-4 py-3">
                  <Badge tone={LEAD_STATUS_TONES[l.status]}>{LEAD_STATUS_LABELS[l.status]}</Badge>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-ink-muted tabular-nums">{formatDateTime(l.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 lg:hidden">
        {leads.map((l) => (
          <li key={l.id}>
            <Link
              href={`/painel/leads/${l.id}`}
              className="flex items-stretch gap-3 rounded-card border border-line/70 bg-surface p-4 shadow-card active:bg-surface-sunken"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{l.name}</p>
                    {l.phone && <p className="text-sm text-ink-muted tabular-nums">{formatBrPhone(l.phone)}</p>}
                  </div>
                  <Badge tone={LEAD_STATUS_TONES[l.status]} className="shrink-0">
                    {LEAD_STATUS_LABELS[l.status]}
                  </Badge>
                </div>
                <p className="line-clamp-1 text-sm text-ink-muted">{l.property.title}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {l.isComplete ? (
                    <span className="flex items-center gap-2">
                      <ClassificationBadge value={l.classification} size="sm" />
                      <Score lead={l} />
                    </span>
                  ) : (
                    <Incomplete />
                  )}
                  {l.wantsVisit && <Visit withLabel />}
                </div>
                <p className="text-xs text-ink-faint">
                  {CHANNEL_LABELS[l.channel]}, {formatDateTime(l.createdAt)}
                </p>
              </div>
              <ChevronRight aria-hidden className="size-5 shrink-0 self-center text-ink-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
