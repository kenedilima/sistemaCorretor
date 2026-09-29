import { Landmark, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AgentCard } from "@/components/publico/AgentCard";
import { Gallery } from "@/components/publico/Gallery";
import { InterestStart } from "@/components/publico/InterestStart";
import { PropertyFacts } from "@/components/publico/PropertyFacts";
import { StickyCta } from "@/components/publico/StickyCta";
import { TrackPageView } from "@/components/publico/TrackPageView";
import { cn } from "@/components/ui/cn";
import { CONSENT_TEXT } from "@/domain/consent";
import { formatBRL } from "@/domain/format";
import { PROPERTY_TYPE_LABELS } from "@/domain/labels";
import { getAppUrl } from "@/lib/app-url";
import { getPublicPropertyBySlug } from "@/server/services/properties";

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
  const isRent = p.purpose === "RENT";
  const price = formatBRL(p.price);
  const priceNote = isRent ? "por mês" : null;
  const location = [p.showAddress && p.address ? p.address : null, p.neighborhood, p.city].filter(Boolean).join(", ");
  const costs = [
    p.condoFee ? `Condomínio ${formatBRL(p.condoFee)}/mês` : null,
    p.iptu ? `IPTU ${formatBRL(p.iptu)}/ano` : null,
  ].filter((c): c is string => c !== null);

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

  const priceBlock = (tone: "ink" | "onBrand") => (
    <div className="flex flex-col gap-1">
      <p className="flex flex-wrap items-baseline gap-x-2.5">
        <span className={cn("font-display text-[2.25rem] leading-none tracking-[-0.02em] tabular-nums", tone === "ink" ? "text-ink" : "text-white")}>
          {price}
        </span>
        {priceNote && <span className={cn("text-[0.9375rem]", tone === "ink" ? "text-ink-muted" : "text-white/80")}>{priceNote}</span>}
      </p>
      {costs.length > 0 && (
        <p className={cn("flex flex-wrap gap-x-4 gap-y-0.5 text-sm", tone === "ink" ? "text-ink-muted" : "text-white/80")}>
          {costs.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </p>
      )}
    </div>
  );

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

      <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-6 pb-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-16 lg:px-8 lg:pt-10 lg:pb-20">
        <main className="flex min-w-0 flex-col gap-10">
          <header className="flex flex-col gap-4">
            <div className="flex flex-col gap-2.5">
              <p className="text-[0.9375rem] text-ink-muted">
                {PROPERTY_TYPE_LABELS[p.type]}
                {available && (isRent ? " para alugar" : " à venda")}
              </p>
              <h1 className="font-display text-[2rem] leading-[1.1] tracking-[-0.02em] text-balance text-ink sm:text-[2.5rem] lg:text-[3rem]">
                {p.title}
              </h1>
              <p className="flex items-start gap-1.5 text-[0.9375rem] text-ink-muted">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
                {location}
              </p>
            </div>
            <div className="lg:hidden">{priceBlock("ink")}</div>
          </header>

          <PropertyFacts
            bedrooms={p.bedrooms}
            suites={p.suites}
            bathrooms={p.bathrooms}
            parkingSpots={p.parkingSpots}
            builtArea={p.builtArea}
            landArea={p.landArea}
          />

          <section aria-labelledby="sobre" className="flex flex-col gap-3">
            <h2 id="sobre" className="font-display text-[1.625rem] leading-tight text-ink">
              Sobre o imóvel
            </h2>
            <p className="max-w-[65ch] text-[1.0625rem] leading-[1.7] whitespace-pre-line text-ink/90">{p.description}</p>
          </section>

          {p.highlights.length > 0 && (
            <section aria-labelledby="diferenciais" className="flex flex-col gap-3">
              <h2 id="diferenciais" className="font-display text-[1.625rem] leading-tight text-ink">
                Diferenciais
              </h2>
              <ul className="flex flex-wrap gap-2">
                {p.highlights.map((h) => (
                  <li key={h} className="rounded-full border border-line-strong px-3.5 py-1.5 text-[0.9375rem] text-ink">
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {p.financingInfo && (
            <section aria-labelledby="financiamento" className="flex gap-4 rounded-card bg-surface-sunken p-5">
              <Landmark aria-hidden className="mt-1 size-5 shrink-0 text-brand" strokeWidth={1.6} />
              <div className="flex flex-col gap-1.5">
                <h2 id="financiamento" className="text-base font-semibold text-ink">
                  Financiamento
                </h2>
                <p className="text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink-muted">{p.financingInfo}</p>
              </div>
            </section>
          )}
        </main>

        <aside className="flex flex-col gap-10 lg:sticky lg:top-8 lg:self-start">
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
              className="flex scroll-mt-6 flex-col gap-5 rounded-panel bg-brand p-6 text-white shadow-raised"
            >
              <div className="hidden lg:block">{priceBlock("onBrand")}</div>
              <div className="flex flex-col gap-1">
                <h2 id="interesse" className="text-lg font-semibold text-white">
                  Tenho interesse
                </h2>
                <p className="text-[0.9375rem] leading-relaxed text-white/85">
                  Leva menos de 1 minuto. O corretor recebe suas respostas e fala com você no WhatsApp.
                </p>
              </div>
              <InterestStart propertyId={p.id} slug={p.slug} consentText={CONSENT_TEXT} />
            </section>
          )}
          {!available && <div className="hidden lg:block">{priceBlock("ink")}</div>}
          <AgentCard
            agent={{
              name: p.agent.name,
              photoUrl: p.agent.photoUrl,
              creci: p.agent.creci,
              agencyName: p.agent.agencyName,
              bio: p.agent.bio,
              instagramUrl: p.agent.instagramUrl,
            }}
            className="border-t border-line pt-8 lg:border-0 lg:pt-0" />
        </aside>
      </div>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-5 text-sm text-ink-muted sm:px-6 lg:px-8">
          <Link href="/privacidade" className="inline-flex min-h-12 items-center underline-offset-4 hover:underline">
            Política de privacidade
          </Link>
        </div>
      </footer>

      {contactable && <StickyCta price={price} priceSuffix={isRent ? "por mês" : undefined} />}
    </div>
  );
}
