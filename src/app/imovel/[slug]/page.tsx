import { Check, Landmark, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AgentAvatar, AgentCard } from "@/components/publico/AgentCard";
import { Gallery } from "@/components/publico/Gallery";
import { InterestStart } from "@/components/publico/InterestStart";
import { PropertyFacts } from "@/components/publico/PropertyFacts";
import { ShareButton } from "@/components/publico/ShareButton";
import { StickyCta } from "@/components/publico/StickyCta";
import { TrackPageView } from "@/components/publico/TrackPageView";
import { cn } from "@/components/ui/cn";
import { CONSENT_TEXT } from "@/domain/consent";
import { formatBRL } from "@/domain/format";
import { PROPERTY_TYPE_LABELS } from "@/domain/labels";
import { getAppUrl } from "@/lib/app-url";
import { getPublicPropertyBySlug } from "@/server/services/properties";
import { getPublicQuestions } from "@/server/services/public-leads";

export const revalidate = 60;

const loadProperty = cache((slug: string) => getPublicPropertyBySlug(slug));

const absolute = (appUrl: string, url: string) => (/^https?:\/\//.test(url) ? url : `${appUrl}${url.startsWith("/") ? "" : "/"}${url}`);

export async function generateMetadata({ params }: PageProps<"/imovel/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = await loadProperty(slug);
  if (!p) return { title: "Imóvel não encontrado", robots: { index: false } };
  const appUrl = await getAppUrl();
  const title = `${p.title} — ${formatBRL(p.price)} · ${p.neighborhood}, ${p.city}`;
  const description = p.description.replace(/\s+/g, " ").trim().slice(0, 155);
  const url = `${appUrl}/imovel/${p.slug}`;
  const cover = p.images[0]?.url;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      url,
      title,
      description,
      images: cover ? [{ url: absolute(appUrl, cover), width: 1200, height: 630, alt: p.title }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description, images: cover ? [absolute(appUrl, cover)] : undefined },
  };
}

export default async function PropertyPage({ params }: PageProps<"/imovel/[slug]">) {
  const { slug } = await params;
  const p = await loadProperty(slug);
  if (!p) notFound();

  const appUrl = await getAppUrl();
  const available = p.status === "PUBLISHED";
  /** Sem WhatsApp do corretor não há para onde encaminhar o visitante: esconde o CTA e avisa. */
  const contactable = available && Boolean(p.agent.whatsapp);
  /** Quantas perguntas o visitante vai responder: saber o tamanho do caminho reduz o abandono. */
  const questionCount = contactable ? (await getPublicQuestions(p.id)).length : 0;
  const isRent = p.purpose === "RENT";
  const price = formatBRL(p.price);
  const priceNote = isRent ? "por mês" : null;
  const location = [p.showAddress && p.address ? p.address : null, p.neighborhood, p.city].filter(Boolean).join(", ");
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  const costs = [
    p.condoFee ? `Condomínio ${formatBRL(p.condoFee)}/mês` : null,
    p.iptu ? `IPTU ${formatBRL(p.iptu)}/ano` : null,
  ].filter((c): c is string => c !== null);
  /** Aluguel: o que o inquilino paga por mês de fato (aluguel + condomínio + IPTU mensalizado). */
  const monthlyTotal = isRent && (p.condoFee || p.iptu) ? p.price + (p.condoFee ?? 0) + Math.round((p.iptu ?? 0) / 12) : null;
  const agentFirstName = p.agent.name.trim().split(/\s+/)[0];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: p.title,
    description: p.description,
    url: `${appUrl}/imovel/${p.slug}`,
    image: p.images.map((i) => absolute(appUrl, i.url)),
    offers: { "@type": "Offer", price: p.price, priceCurrency: "BRL" },
    address: {
      "@type": "PostalAddress",
      addressLocality: p.city,
      ...(p.showAddress && p.address ? { streetAddress: p.address } : {}),
    },
  };

  const priceBlock = (tone: "ink" | "onBrand") => {
    const muted = tone === "ink" ? "text-ink-muted" : "text-white/80";
    return (
      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={cn(
              "font-display text-[2.5rem] leading-none tracking-[-0.025em] tabular-nums",
              tone === "ink" ? "text-ink" : "text-white",
            )}
          >
            {price}
          </span>
          {priceNote && <span className={cn("text-[0.9375rem]", muted)}>{priceNote}</span>}
        </p>
        {costs.length > 0 && (
          <p className={cn("flex flex-wrap gap-x-4 gap-y-0.5 text-sm", muted)}>
            {costs.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </p>
        )}
        {monthlyTotal !== null && (
          <p className={cn("text-sm font-medium", tone === "ink" ? "text-ink" : "text-white")}>
            Total mensal estimado {formatBRL(monthlyTotal)}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className={cn("min-h-dvh bg-surface", contactable && "pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0")}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {available && <TrackPageView propertyId={p.id} />}

      <div className="mx-auto max-w-6xl lg:px-8 lg:pt-8">
        <Gallery images={p.images.map(({ id, url }) => ({ id, url }))} title={p.title} />
      </div>

      {!available && (
        <div role="status" className="mx-auto mt-4 max-w-6xl px-4 sm:px-6 lg:mt-6 lg:px-8">
          <p className="rounded-card border border-warning/25 bg-warning-soft px-4 py-3.5 text-[0.9375rem] text-warning">
            <strong className="font-semibold">Este imóvel foi {p.status === "RENTED" ? "alugado" : "vendido"}.</strong> A página continua
            disponível apenas para consulta.
          </p>
        </div>
      )}

      {/*
        Celular: título e ficha → formulário → descrição (o contato aparece antes do texto longo).
        Desktop: formulário fixo na coluna da direita, ocupando as duas linhas da grade.
      */}
      <main className="mx-auto grid max-w-6xl gap-y-10 px-4 pt-6 pb-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-x-16 lg:gap-y-12 lg:px-8 lg:pt-10 lg:pb-24">
        <header className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[0.9375rem] font-medium text-brand">
                {PROPERTY_TYPE_LABELS[p.type]}
                {available && (isRent ? " para alugar" : " à venda")}
              </p>
              <ShareButton title={p.title} />
            </div>
            <h1 className="font-display text-[2.125rem] leading-[1.05] tracking-[-0.025em] text-balance text-ink sm:text-[2.75rem] lg:text-[3.25rem]">
              {p.title}
            </h1>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[0.9375rem] text-ink-muted">
              <span className="inline-flex items-start gap-1.5">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
                {location}
              </span>
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-8 items-center font-medium text-brand underline decoration-brand/30 underline-offset-4 hover:decoration-brand"
              >
                Ver no mapa
              </a>
            </p>
          </div>
          <div className="lg:hidden">{priceBlock("ink")}</div>
          <PropertyFacts
            bedrooms={p.bedrooms}
            suites={p.suites}
            bathrooms={p.bathrooms}
            parkingSpots={p.parkingSpots}
            builtArea={p.builtArea}
            landArea={p.landArea}
          />
        </header>

        <aside className="flex flex-col gap-8 lg:sticky lg:top-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          {available && !contactable && (
            <section aria-labelledby="interesse" className="flex flex-col gap-4 rounded-panel border border-line bg-surface-sunken p-6">
              <div className="hidden lg:block">{priceBlock("ink")}</div>
              <h2 id="interesse" className="text-base font-semibold text-ink">
                Contato indisponível no momento
              </h2>
              <p role="status" className="text-[0.9375rem] leading-relaxed text-ink-muted">
                O corretor está sem um canal de atendimento ativo. Tente novamente mais tarde.
              </p>
            </section>
          )}
          {contactable && (
            <section
              id="comecar"
              aria-labelledby="interesse"
              className="-mx-4 flex scroll-mt-4 flex-col gap-6 bg-brand px-5 py-7 text-white sm:mx-0 sm:rounded-panel sm:p-7 lg:shadow-raised"
            >
              <div className="hidden border-b border-white/15 pb-6 lg:block">{priceBlock("onBrand")}</div>
              <div className="flex items-center gap-3.5">
                <AgentAvatar agent={p.agent} ring className="size-14 text-lg" />
                <div className="min-w-0">
                  <h2 id="interesse" className="font-display text-[1.5rem] leading-tight text-white">
                    Fale com {agentFirstName}
                  </h2>
                  <p className="text-sm text-white/80">{p.agent.creci ? `CRECI ${p.agent.creci}` : "Corretor responsável"}</p>
                </div>
              </div>
              <p className="text-[0.9375rem] leading-relaxed text-white/90">
                {questionCount > 0
                  ? `Responda ${questionCount === 1 ? "1 pergunta rápida" : `até ${questionCount} perguntas rápidas`} e a conversa continua no WhatsApp, com suas respostas já enviadas.`
                  : "Informe seu nome e a conversa continua no WhatsApp."}
              </p>
              <InterestStart propertyId={p.id} slug={p.slug} consentText={CONSENT_TEXT} />
            </section>
          )}
          {!available && <div className="hidden lg:block">{priceBlock("ink")}</div>}
        </aside>

        <div className="flex min-w-0 flex-col gap-12">
          <section aria-labelledby="sobre" className="flex flex-col gap-4">
            <h2 id="sobre" className="font-display text-[1.625rem] leading-tight text-ink">
              Sobre o imóvel
            </h2>
            <p className="max-w-[65ch] text-[1.0625rem] leading-[1.7] whitespace-pre-line text-ink/90">{p.description}</p>
          </section>

          {p.highlights.length > 0 && (
            <section aria-labelledby="diferenciais" className="flex flex-col gap-4">
              <h2 id="diferenciais" className="font-display text-[1.625rem] leading-tight text-ink">
                Diferenciais
              </h2>
              <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {p.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-3 text-[1.0625rem] leading-snug text-ink">
                    <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                      <Check className="size-3.5" strokeWidth={2.5} />
                    </span>
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {p.financingInfo && (
            <section aria-labelledby="financiamento" className="flex gap-4 rounded-card bg-surface-sunken p-5 sm:p-6">
              <Landmark aria-hidden className="mt-1 size-5 shrink-0 text-brand" strokeWidth={1.6} />
              <div className="flex flex-col gap-1.5">
                <h2 id="financiamento" className="text-base font-semibold text-ink">
                  Financiamento
                </h2>
                <p className="text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink-muted">{p.financingInfo}</p>
              </div>
            </section>
          )}

          <AgentCard
            agent={{
              name: p.agent.name,
              photoUrl: p.agent.photoUrl,
              creci: p.agent.creci,
              agencyName: p.agent.agencyName,
              bio: p.agent.bio,
              instagramUrl: p.agent.instagramUrl,
            }}
            className="border-t border-line pt-10"
          />
        </div>
      </main>

      <footer className="border-t border-line bg-surface-sunken">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-4 text-sm text-ink-muted sm:px-6 lg:px-8">
          <p>
            Anúncio de {p.agent.name}
            {p.agent.agencyName ? `, ${p.agent.agencyName}` : ""}
          </p>
          <Link href="/privacidade" className="inline-flex min-h-12 items-center underline-offset-4 hover:underline">
            Política de privacidade
          </Link>
        </div>
      </footer>

      {contactable && <StickyCta price={price} priceSuffix={isRent ? "por mês" : undefined} />}
    </div>
  );
}
