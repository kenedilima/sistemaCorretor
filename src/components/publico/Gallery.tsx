"use client";
import { ImageOff, Images, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";

export type GalleryImage = { id: string; url: string };

/**
 * Galeria do imóvel.
 * - Celular: carrossel horizontal com scroll-snap e contador.
 * - Desktop (≥1024px): uma foto grande + até 4 menores.
 * - "Ver todas as fotos": `<dialog>` em tela cheia com todas as fotos em sequência.
 */
export function Gallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const [current, setCurrent] = useState(0);
  const [openAt, setOpenAt] = useState<number | null>(null);
  const scroller = useRef<HTMLUListElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const total = images.length;

  function onScroll() {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    setCurrent(Math.min(total - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
  }

  useEffect(() => {
    const d = dialog.current;
    if (!d || openAt === null) return;
    if (!d.open) d.showModal();
    document.documentElement.style.overflow = "hidden";
    d.querySelector<HTMLElement>(`[data-photo="${openAt}"]`)?.scrollIntoView({ block: "start" });
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [openAt]);

  if (total === 0) {
    return (
      <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 bg-surface-sunken text-ink-muted lg:aspect-[21/7] lg:rounded-panel">
        <ImageOff aria-hidden className="size-7 text-ink-faint" strokeWidth={1.5} />
        <p className="text-[0.9375rem]">As fotos deste imóvel ainda não foram publicadas</p>
      </div>
    );
  }

  const thumbs = images.slice(1, total >= 5 ? 5 : total >= 3 ? 3 : 2);

  return (
    <>
      {/* celular / tablet */}
      <div className="relative lg:hidden">
        <ul
          ref={scroller}
          onScroll={onScroll}
          aria-label={`Fotos do imóvel (${total})`}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((img, i) => (
            <li key={img.id} className="aspect-[4/3] w-full shrink-0 snap-center snap-always bg-surface-sunken md:aspect-[16/9]">
              <button type="button" onClick={() => setOpenAt(i)} className="block size-full" aria-label={`Ampliar foto ${i + 1} de ${total}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- fotos do storage (local ou Supabase) */}
                <img
                  src={img.url}
                  alt={i === 0 ? title : ""}
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : undefined}
                  decoding="async"
                  className="size-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
        {total > 1 && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-ink/70 px-2.5 py-1 text-[0.8125rem] font-medium text-white tabular-nums backdrop-blur-sm"
          >
            {current + 1} / {total}
          </span>
        )}
      </div>

      {/* desktop */}
      <div className="relative hidden lg:block">
        <div
          className={cn(
            "grid h-[min(36rem,62vh)] gap-2 overflow-hidden rounded-panel",
            thumbs.length === 0 && "grid-cols-1",
            thumbs.length === 1 && "grid-cols-[2fr_1fr]",
            thumbs.length === 2 && "grid-cols-[2fr_1fr] grid-rows-2",
            thumbs.length === 4 && "grid-cols-[2fr_1fr_1fr] grid-rows-2",
          )}
        >
          <PhotoButton img={images[0]} index={0} total={total} title={title} onOpen={setOpenAt} className={thumbs.length > 1 ? "row-span-2" : ""} priority />
          {thumbs.map((img, i) => (
            <PhotoButton key={img.id} img={img} index={i + 1} total={total} title={title} onOpen={setOpenAt} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOpenAt(0)}
          className="absolute right-4 bottom-4 inline-flex h-11 items-center gap-2 rounded-control bg-surface/95 px-4 text-[0.9375rem] font-medium text-ink shadow-raised hover:bg-surface"
        >
          <Images aria-hidden className="size-[1.1em]" />
          Ver todas as fotos ({total})
        </button>
      </div>

      <dialog
        ref={dialog}
        onClose={() => setOpenAt(null)}
        aria-label={`Fotos de ${title}`}
        className="m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto overscroll-contain bg-ink p-0 text-white backdrop:bg-ink"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-ink/90 px-4 py-2 backdrop-blur-sm sm:px-6">
          <p className="truncate text-[0.9375rem] text-white/85">
            {total} {total === 1 ? "foto" : "fotos"}
          </p>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="inline-flex size-12 items-center justify-center rounded-full text-white hover:bg-white/10"
            aria-label="Fechar fotos"
            autoFocus
          >
            <X aria-hidden className="size-6" />
          </button>
        </div>
        {openAt !== null && (
          <ul className="mx-auto flex max-w-5xl flex-col gap-2 px-0 pb-10 sm:gap-3 sm:px-6">
            {images.map((img, i) => (
              // proporção fixa: a posição de cada foto é conhecida antes do carregamento (rolagem até a foto tocada)
              <li key={img.id} data-photo={i} className="aspect-[4/3] scroll-mt-16">
                {/* eslint-disable-next-line @next/next/no-img-element -- fotos do storage (local ou Supabase) */}
                <img src={img.url} alt={`Foto ${i + 1} de ${total}`} loading="lazy" decoding="async" className="size-full object-contain" />
              </li>
            ))}
          </ul>
        )}
      </dialog>
    </>
  );
}

function PhotoButton({
  img, index, total, title, onOpen, className, priority,
}: {
  img: GalleryImage; index: number; total: number; title: string; onOpen: (i: number) => void; className?: string; priority?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      className={cn("group relative min-h-0 overflow-hidden bg-surface-sunken", className)}
      aria-label={`Ampliar foto ${index + 1} de ${total}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- fotos do storage (local ou Supabase) */}
      <img
        src={img.url}
        alt={index === 0 ? title : ""}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="size-full object-cover transition-[filter] duration-200 group-hover:brightness-95"
      />
    </button>
  );
}
