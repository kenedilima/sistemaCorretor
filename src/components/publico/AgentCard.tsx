import { AtSign, BadgeCheck } from "lucide-react";
import { cn } from "@/components/ui/cn";

export type PublicAgent = {
  name: string;
  photoUrl: string | null;
  creci: string | null;
  agencyName: string | null;
  bio: string | null;
  instagramUrl: string | null;
};

function instagramHandle(url: string) {
  try {
    const handle = new URL(url).pathname.split("/").filter(Boolean)[0];
    return handle ? `@${handle}` : "Instagram";
  } catch {
    return "Instagram";
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Foto do corretor (ou iniciais). `ring` desenha um contorno para destacar sobre fundos de cor. */
export function AgentAvatar({
  agent,
  className,
  ring,
}: {
  agent: Pick<PublicAgent, "name" | "photoUrl">;
  className?: string;
  ring?: boolean;
}) {
  const base = cn("shrink-0 rounded-full", ring && "ring-2 ring-white/80", className);
  return agent.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- foto do storage (local ou Supabase)
    <img src={agent.photoUrl} alt="" loading="lazy" className={cn(base, "object-cover")} />
  ) : (
    <span aria-hidden className={cn(base, "grid place-items-center bg-brand-soft font-display text-brand")}>
      {initials(agent.name)}
    </span>
  );
}

/** Corretor responsável. Sem link direto de WhatsApp: o contato passa sempre pelo questionário. */
export function AgentCard({ agent, className }: { agent: PublicAgent; className?: string }) {
  return (
    <section aria-labelledby="corretor-titulo" className={cn("flex flex-col gap-5", className)}>
      <h2 id="corretor-titulo" className="font-display text-[1.625rem] leading-tight text-ink">
        Quem atende este imóvel
      </h2>
      <div className="flex items-center gap-4">
        <AgentAvatar agent={agent} className="size-20 text-2xl" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-lg leading-tight font-semibold text-ink">{agent.name}</p>
          {agent.creci && (
            <p className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
              <BadgeCheck aria-hidden className="size-4 shrink-0 text-brand" />
              CRECI {agent.creci}
            </p>
          )}
          {agent.agencyName && <p className="text-sm text-ink-muted">{agent.agencyName}</p>}
        </div>
      </div>
      {agent.bio && <p className="max-w-[60ch] text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink-muted">{agent.bio}</p>}
      {agent.instagramUrl && (
        <a
          href={agent.instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center gap-2 self-start text-[0.9375rem] font-medium text-brand underline-offset-4 hover:underline"
        >
          <AtSign aria-hidden className="size-4" />
          {instagramHandle(agent.instagramUrl)} no Instagram
        </a>
      )}
    </section>
  );
}
