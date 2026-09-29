export type PropertyFactsProps = {
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  builtArea: number | null;
  landArea: number | null;
};

const area = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Ficha do imóvel: números grandes em serifa, lidos de relance como numa ficha de corretor.
 * Campos vazios não aparecem. A área vem primeiro porque é o dado que mais filtra a decisão.
 */
export function PropertyFacts(p: PropertyFactsProps) {
  const facts: { value: string; unit?: string; label: string }[] = [];
  if (p.builtArea != null) facts.push({ value: area.format(p.builtArea), unit: "m²", label: "área construída" });
  if (p.bedrooms != null) facts.push({ value: String(p.bedrooms), label: plural(p.bedrooms, "quarto", "quartos") });
  if (p.suites != null && p.suites > 0) facts.push({ value: String(p.suites), label: plural(p.suites, "suíte", "suítes") });
  if (p.bathrooms != null) facts.push({ value: String(p.bathrooms), label: plural(p.bathrooms, "banheiro", "banheiros") });
  if (p.parkingSpots != null) facts.push({ value: String(p.parkingSpots), label: plural(p.parkingSpots, "vaga", "vagas") });
  if (p.landArea != null) facts.push({ value: area.format(p.landArea), unit: "m²", label: "terreno" });
  if (facts.length === 0) return null;

  return (
    <dl
      aria-label="Características"
      className="grid grid-cols-3 gap-y-5 border-y border-line py-5 sm:flex sm:flex-wrap sm:gap-y-5 sm:divide-x sm:divide-line"
    >
      {facts.map(({ value, unit, label }) => (
        <div key={label} className="flex flex-col-reverse gap-1 pr-3 sm:px-6 sm:first:pl-0 sm:last:pr-0">
          <dt className="text-sm leading-tight text-ink-muted">{label}</dt>
          <dd className="font-display text-[1.75rem] leading-none tracking-[-0.02em] text-ink tabular-nums sm:text-[2rem]">
            {value}
            {unit && <span className="ml-1 font-sans text-base tracking-normal text-ink-muted">{unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
