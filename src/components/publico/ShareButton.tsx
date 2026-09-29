"use client";
import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Compartilhar o anúncio (quem decide costuma mandar o link para a família antes de chamar o corretor).
 * Usa o menu nativo do celular; sem ele, copia o link e confirma no próprio botão.
 */
export function ShareButton({ title, className }: { title: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href.split("#")[0];
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        /* compartilhamento cancelado */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* área de transferência bloqueada */
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-line-strong px-4 text-sm font-medium text-ink",
        "transition-colors hover:border-ink-faint hover:bg-surface-sunken",
        className,
      )}
    >
      {copied ? <Check aria-hidden className="size-4 text-success" /> : <Share2 aria-hidden className="size-4" />}
      <span aria-live="polite">{copied ? "Link copiado" : "Compartilhar"}</span>
    </button>
  );
}
