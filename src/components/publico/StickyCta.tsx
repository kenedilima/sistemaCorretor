"use client";
import { INTEREST_NAME_ID } from "./InterestStart";

/** Barra fixa no rodapé (somente celular/tablet) com o preço e o atalho para o formulário de interesse. */
export function StickyCta({ price, priceSuffix }: { price: string; priceSuffix?: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
        <p className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-display text-[1.3125rem] text-ink tabular-nums">{price}</span>
          {priceSuffix && <span className="block text-[0.8125rem] text-ink-muted">{priceSuffix}</span>}
        </p>
        <a
          href="#comecar"
          onClick={(e) => {
            const input = document.getElementById(INTEREST_NAME_ID);
            if (!input) return;
            e.preventDefault();
            document.getElementById("comecar")?.scrollIntoView({ behavior: "smooth", block: "start" });
            input.focus({ preventScroll: true });
          }}
          className="inline-flex h-14 shrink-0 items-center justify-center rounded-control bg-brand px-5 text-base font-semibold text-on-brand hover:bg-brand-strong active:bg-brand-strong"
        >
          Tenho interesse
        </a>
      </div>
    </div>
  );
}
