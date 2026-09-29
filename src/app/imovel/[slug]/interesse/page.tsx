import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { InterestFlow } from "@/components/publico/InterestFlow";
import { getPublicPropertyBySlug } from "@/server/services/properties";
import { getPublicQuestions } from "@/server/services/public-leads";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Tenho interesse", robots: { index: false } };

export default async function InterestPage({ params }: PageProps<"/imovel/[slug]/interesse">) {
  const { slug } = await params;
  const p = await getPublicPropertyBySlug(slug);
  if (!p) notFound();
  if (p.status !== "PUBLISHED") redirect(`/imovel/${slug}`);
  if (!p.agent.whatsapp) return <ContactUnavailable slug={p.slug} title={p.title} />;
  const questions = await getPublicQuestions(p.id);

  return (
    <InterestFlow
      property={{
        id: p.id,
        title: p.title,
        slug: p.slug,
        coverUrl: p.images[0]?.url ?? null,
      }}
      questions={questions}
    />
  );
}

/** O corretor está sem WhatsApp: não inicia o fluxo (o visitante não teria para onde ser encaminhado). */
function ContactUnavailable({ slug, title }: { slug: string; title: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-4 bg-surface px-4 py-10 sm:px-6">
      <p className="text-[0.9375rem] text-ink-muted">{title}</p>
      <h1 className="font-display text-[1.875rem] leading-[1.15] tracking-[-0.015em] text-balance text-ink">
        Contato indisponível no momento
      </h1>
      <p role="status" className="text-base leading-relaxed text-ink-muted">
        O corretor responsável por este imóvel está sem um canal de atendimento ativo. Tente novamente mais tarde.
      </p>
      <Link
        href={`/imovel/${slug}`}
        className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-control border border-line-strong text-base font-medium text-ink hover:bg-ink/5"
      >
        Voltar ao imóvel
      </Link>
    </main>
  );
}
