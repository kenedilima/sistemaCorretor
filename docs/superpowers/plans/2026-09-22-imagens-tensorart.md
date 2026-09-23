# Imagens geradas (TensorArt) no visual do produto — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Exceção da Tarefa 1:** a curadoria das imagens exige que um humano escolha, entre 3 variações, a favorita de cada lugar — isso não pode acontecer dentro de um subagente isolado sem interação. A Tarefa 1 roda sempre na sessão principal, com o parceiro humano por perto; as tarefas 2–9 (código) podem seguir subagent-driven normalmente, pois só dependem dos arquivos `.webp` que a Tarefa 1 produz.

**Goal:** Adicionar fotos fotorrealistas geradas pelo TensorArt (`photoreal_studio_z_image`) nas telas de login/cadastro/primeiro acesso (vender o produto ao corretor) e no fluxo público do imóvel (passar confiança ao visitante), mantendo os ícones em `lucide-react`.

**Architecture:** Pipeline de geração roda uma única vez, fora do build (skill `tensorart-generate`); as imagens escolhidas viram arquivos `.webp` estáticos em `src/assets/images/`, importados diretamente pelos componentes e servidos via `next/image` (otimização, blur automático, sem chamada de rede em produção). Dois componentes novos e pequenos (`PhotoPanel`, `IconBadge`) concentram os padrões visuais repetidos; os demais arquivos só passam a consumi-los.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, `next/image`, `sharp` (já é dependência do projeto), skill `tensorart-generate` (fora do repositório, em `~/.claude/skills/tensorart-generate`).

**Spec:** `docs/superpowers/specs/2026-09-22-imagens-tensorart-design.md`

## Global Constraints

- Ícones continuam vetoriais (`lucide-react`); nunca gerar ícone com o TensorArt.
- Nenhuma imagem gerada é usada como capa real de um imóvel nem entra no Open Graph/Twitter Card (`generateMetadata` de `src/app/imovel/[slug]/page.tsx` não muda).
- Nenhuma chamada ao TensorArt em tempo real ou em produção — o pipeline roda só localmente, uma vez; nenhuma chave nova entra no Vercel.
- Nenhuma mudança no schema do banco de dados.
- Pessoas nas fotos aparecem em plano médio, de costas ou de perfil — nunca em close de rosto; nunca perto do `AgentCard` nem como "depoimento".
- Todo texto sobre foto mantém contraste ≥ 4,5:1; toda imagem decorativa usa `alt=""`.
- Estilo neutro e variado (sem puxar para um padrão social específico), com a mesma base de prompt em todas as imagens para parecerem da mesma sessão de fotos.
- Cada arquivo `.webp` final fica com no máximo 300 KB.

## Desvios da spec (decisões tomadas ao detalhar o plano)

- **`IconBadge` não entra no `FirstRun`** (passos do primeiro acesso, `src/app/painel/page.tsx`): esses passos hoje mostram um número (1, 2, 3) ou um check quando concluído — não um ícone temático. Trocar por `IconBadge` (que só aceita um ícone lucide) perderia a indicação de sequência. O `FirstRun` ganha só o banner com foto (Tarefa 6); os marcadores numerados continuam como estão.
- **`EmptyState` não ganha o fundo em degradê do `IconBadge` no ramo `icon`**: para garantir zero regressão visual nos dois usos existentes com `icon` (Review Focus, item 2), esse ramo fica byte-a-byte igual ao de hoje. Só o novo ramo `image` foi adicionado.
- **A coluna de foto do `InterestFlow` não usa `PhotoPanel`**: ali a foto não tem texto por cima (o texto fica na coluna do formulário), então o degradê petróleo do `PhotoPanel` não se aplica — só uma vinheta bem sutil no rodapé, puramente decorativa. Manter `PhotoPanel` restrito a "foto + degradê forte + conteúdo por cima" evita esticar o componente para um caso que não precisa dele (ver Tarefa 8).

## Review Focus

- Contraste do texto sobre a foto em `PhotoPanel`/`AuthHero` (≥ 4,5:1) — verificado na Tarefa 4.
- `EmptyState` sem a prop `image` deve renderizar exatamente como hoje — sem regressão nos 2 usos atuais com `icon` — verificado na Tarefa 3.
- O teste E2E existente (`e2e/fluxo-completo.spec.ts`, visitante em viewport `iPhone 13`) precisa continuar passando sem alteração depois do layout de duas colunas do fluxo de interesse — verificado na Tarefa 8.
- Imagem gerada nunca aparece no Open Graph/Twitter Card do imóvel — verificado na Tarefa 7 (a função `generateMetadata` continua lendo só `p.images[0]?.url`, nunca o fallback da `Gallery`).
- Peso de cada arquivo WebP gerado (≤ 300 KB) para não piorar o carregamento — verificado na Tarefa 1.

---

## Task 1: Gerar e curar as imagens no TensorArt

**Executa na sessão principal (não em subagente isolado) — exige escolha humana entre variações.**

**Files:**
- Create: `src/assets/images/login-hero.webp`
- Create: `src/assets/images/signup-hero.webp`
- Create: `src/assets/images/painel-primeiro-acesso.webp`
- Create: `src/assets/images/interesse-fallback.webp`
- Create: `src/assets/images/interesse-concluido.webp`
- Create: `src/assets/images/imovel-sem-fotos.webp`
- Create: `src/assets/images/404.webp`
- Create: `src/assets/images/estado-vazio-imoveis.webp`
- Create: `src/assets/images/estado-vazio-contatos.webp`
- Create: `scripts/to-webp.mjs`
- Create: `docs/imagens.md`

**Interfaces:**
- Produces: 9 arquivos `.webp` em `src/assets/images/`, cada um importável como `import x from "@/assets/images/<nome>.webp"` (tipagem `StaticImageData` do `next/image`, resolvida automaticamente pelo Next). Tarefas 2–8 consomem esses arquivos pelos nomes exatos acima.

- [ ] **Step 1: Prompt-base comum**

Todas as gerações usam o mesmo prompt-base, concatenado com a variação específica de cada lugar:

```
editorial real estate photography, natural daylight, warm neutral tones, contemporary Brazilian home, 35mm lens, shallow depth of field, photorealistic, high detail, no text, no watermark, no logo
```

- [ ] **Step 2: Gerar as 9 imagens (3 variações cada) no TensorArt**

Para cada linha da tabela abaixo, rode (substituindo `<prompt completo>`, `<largura>`, `<altura>` pelos valores da linha — o prompt completo é o prompt-base do Step 1 + a variação específica, separados por vírgula):

```bash
cd ~/.claude/skills/tensorart-generate && PYTHONIOENCODING=utf-8 python scripts/create_task.py photoreal_studio_z_image \
  '[{"type":"STRING","value":"<prompt completo>"},{"type":"INTEGER","value":<largura>},{"type":"INTEGER","value":<altura>},{"type":"INTEGER","value":3}]'
```

Anote o `taskId` retornado e rode:

```bash
cd ~/.claude/skills/tensorart-generate && PYTHONIOENCODING=utf-8 python scripts/query_task.py "<taskId>" --poll
```

| # | Nome do arquivo | Tamanho | Variação específica do prompt |
|---|---|---|---|
| 1 | `login-hero` | 1536×1024 | wide living room with a large window, golden hour light, minimal furniture, empty room, no people |
| 2 | `signup-hero` | 1536×1024 | real estate agent handing house keys to a couple, viewed from behind or in side profile, at a modern front door, warm afternoon light, candid, no close-up faces |
| 3 | `painel-primeiro-acesso` | 1536×1024 | modern Brazilian house exterior, street view, clear sky, welcoming curb appeal, no people |
| 4 | `interesse-fallback` | 1536×1024 | bright modern living room, wide window, plants, cozy neutral décor, no people |
| 5 | `interesse-concluido` | 1536×1024 | person seen from behind opening the front door of a house holding keys, warm entryway light, feeling of arriving home, no visible face |
| 6 | `imovel-sem-fotos` | 1536×1024 | bright empty living room with large windows, neutral tones, minimalist, no people |
| 7 | `404` | 1536×1024 | quiet residential street at dusk with a single closed house gate, soft light, calm and slightly empty mood, no people |
| 8 | `estado-vazio-imoveis` | 1024×1024 | top-down flat lay of an architectural blueprint, a set of house keys and a small model house on a wooden table, soft natural light, no people |
| 9 | `estado-vazio-contatos` | 1024×1024 | wooden table with a smartphone face-down, a notebook and a pen, warm morning light, calm workspace, no people, no readable text |

Isso soma 27 gerações × 0,36 créditos ≈ 10 créditos.

- [ ] **Step 3: Descartar variações com defeito**

Para cada `taskId`, baixe as 3 variações para o scratchpad:

```bash
cd ~/.claude/skills/tensorart-generate && python scripts/download_result.py "<url-da-variação>" "$TEMP/tensorart/<nome>-<n>.png"
```

Descarte de cara qualquer imagem com mãos deformadas, texto/logo ilegível embutido, ou geometria impossível (móvel derretendo, porta flutuando). Se as 3 variações de um lugar forem descartadas, repita o Step 2 só para esse lugar.

- [ ] **Step 4: Mostrar as sobreviventes para escolha**

Monte uma página HTML simples no scratchpad (uma seção por lugar, imagens lado a lado) e abra para o parceiro humano escolher uma por lugar. Aguarde a resposta antes de seguir.

- [ ] **Step 5: Criar o script de conversão para WebP**

```js
// scripts/to-webp.mjs
// Converte uma imagem baixada do TensorArt para WebP e salva em src/assets/images/.
// Uso: node scripts/to-webp.mjs <arquivo-origem> <nome-sem-extensao> [largura-max]
import sharp from "sharp";
import path from "node:path";

const [, , src, name, width] = process.argv;
if (!src || !name) {
  console.error("Uso: node scripts/to-webp.mjs <arquivo-origem> <nome-sem-extensao> [largura-max]");
  process.exit(1);
}

const dest = path.join("src/assets/images", `${name}.webp`);
let pipeline = sharp(src);
if (width) pipeline = pipeline.resize({ width: Number(width) });
await pipeline.webp({ quality: 82 }).toFile(dest);
console.log(`OK: ${dest}`);
```

- [ ] **Step 6: Converter as 9 escolhidas**

```bash
node scripts/to-webp.mjs "$TEMP/tensorart/login-hero-2.png" login-hero
node scripts/to-webp.mjs "$TEMP/tensorart/signup-hero-1.png" signup-hero
node scripts/to-webp.mjs "$TEMP/tensorart/painel-primeiro-acesso-3.png" painel-primeiro-acesso
node scripts/to-webp.mjs "$TEMP/tensorart/interesse-fallback-1.png" interesse-fallback
node scripts/to-webp.mjs "$TEMP/tensorart/interesse-concluido-2.png" interesse-concluido
node scripts/to-webp.mjs "$TEMP/tensorart/imovel-sem-fotos-1.png" imovel-sem-fotos
node scripts/to-webp.mjs "$TEMP/tensorart/404-3.png" 404
node scripts/to-webp.mjs "$TEMP/tensorart/estado-vazio-imoveis-1.png" estado-vazio-imoveis
node scripts/to-webp.mjs "$TEMP/tensorart/estado-vazio-contatos-2.png" estado-vazio-contatos
```

(Os sufixos `-1`/`-2`/`-3` acima são exemplos — use o número da variação escolhida no Step 4.)

- [ ] **Step 7: Verificar o peso dos arquivos (≤ 300 KB cada)**

```bash
ls -la src/assets/images/*.webp
```

Expected: cada arquivo com no máximo 300 KB. Se algum passar disso, rode `scripts/to-webp.mjs` de novo para esse arquivo com um `<largura-max>` menor (ex.: `1280` no lugar de `1536`) ou reduza a `quality` no script para `70`.

- [ ] **Step 8: Escrever `docs/imagens.md`**

```markdown
# Imagens geradas (TensorArt)

Geradas com `photoreal_studio_z_image` via skill `tensorart-generate`. Prompt-base comum a todas:

> editorial real estate photography, natural daylight, warm neutral tones, contemporary Brazilian home, 35mm lens, shallow depth of field, photorealistic, high detail, no text, no watermark, no logo

Para regenerar uma imagem: `cd ~/.claude/skills/tensorart-generate && PYTHONIOENCODING=utf-8 python scripts/create_task.py photoreal_studio_z_image '[{"type":"STRING","value":"<prompt-base>, <variação>"},{"type":"INTEGER","value":<largura>},{"type":"INTEGER","value":<altura>},{"type":"INTEGER","value":3}]'`, depois `python scripts/query_task.py "<taskId>" --poll`, baixar com `scripts/download_result.py` e converter com `node scripts/to-webp.mjs <origem> <nome>`.

| Arquivo | Usado em | Tamanho | Variação do prompt |
|---|---|---|---|
| `login-hero.webp` | Painel do login (`src/components/auth/AuthHero.tsx`) | 1536×1024 | wide living room with a large window, golden hour light, minimal furniture, empty room, no people |
| `signup-hero.webp` | Painel do cadastro (`AuthHero.tsx`) | 1536×1024 | real estate agent handing house keys to a couple, viewed from behind or in side profile, at a modern front door, warm afternoon light, candid, no close-up faces |
| `painel-primeiro-acesso.webp` | Banner do primeiro acesso (`src/app/painel/page.tsx`) | 1536×1024 | modern Brazilian house exterior, street view, clear sky, welcoming curb appeal, no people |
| `interesse-fallback.webp` | Coluna de foto do fluxo de interesse quando o imóvel não tem fotos (`InterestFlow.tsx`) | 1536×1024 | bright modern living room, wide window, plants, cozy neutral décor, no people |
| `interesse-concluido.webp` | Etapa final do fluxo de interesse (`InterestFlow.tsx`) | 1536×1024 | person seen from behind opening the front door of a house holding keys, warm entryway light, feeling of arriving home, no visible face |
| `imovel-sem-fotos.webp` | Galeria sem fotos, desfocada (`Gallery.tsx`) | 1536×1024 | bright empty living room with large windows, neutral tones, minimalist, no people |
| `404.webp` | Página não encontrada (`src/app/not-found.tsx`) | 1536×1024 | quiet residential street at dusk with a single closed house gate, soft light, calm and slightly empty mood, no people |
| `estado-vazio-imoveis.webp` | Estado vazio de imóveis (`src/app/painel/imoveis/page.tsx`) | 1024×1024 | top-down flat lay of an architectural blueprint, a set of house keys and a small model house on a wooden table, soft natural light, no people |
| `estado-vazio-contatos.webp` | Estado vazio de contatos (`src/app/painel/leads/page.tsx`) | 1024×1024 | wooden table with a smartphone face-down, a notebook and a pen, warm morning light, calm workspace, no people, no readable text |
```

- [ ] **Step 9: Commit**

```bash
git add src/assets/images scripts/to-webp.mjs docs/imagens.md
git commit -m "feat: gera e cura imagens do TensorArt para o visual do produto

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `IconBadge` e uso em `PropertyFacts`

**Files:**
- Create: `src/components/ui/IconBadge.tsx`
- Modify: `src/components/publico/PropertyFacts.tsx:1,30` (import e troca do ícone solto pelo `IconBadge`)

**Interfaces:**
- Produces:
  ```ts
  export type IconBadgeProps = { icon: LucideIcon; size?: "sm" | "md"; className?: string };
  export function IconBadge(props: IconBadgeProps): JSX.Element
  ```

- [ ] **Step 1: Criar `IconBadge`**

```tsx
// src/components/ui/IconBadge.tsx
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

export type IconBadgeProps = {
  icon: LucideIcon;
  /** `md` (padrão) ou `sm` para contextos compactos (ex.: lista de fatos do imóvel). */
  size?: "sm" | "md";
  className?: string;
};

/** Ícone com fundo em degradê suave da cor da marca. */
export function IconBadge({ icon: Icon, size = "md", className }: IconBadgeProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-linear-to-br from-brand-soft to-brand/15 text-brand",
        size === "sm" ? "size-9 [&_svg]:size-4" : "size-12 [&_svg]:size-[1.35rem]",
        className,
      )}
    >
      <Icon strokeWidth={1.6} />
    </span>
  );
}
```

- [ ] **Step 2: Usar em `PropertyFacts`**

Em `src/components/publico/PropertyFacts.tsx`, adicione o import:

```tsx
import { IconBadge } from "@/components/ui/IconBadge";
```

E troque a linha do ícone dentro do `<li>` (hoje `<Icon aria-hidden className="size-5 shrink-0 text-brand" strokeWidth={1.6} />`) por:

```tsx
<IconBadge icon={Icon} size="sm" />
```

- [ ] **Step 3: Checar tipos e lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: nenhum erro.

- [ ] **Step 4: Conferir visualmente**

Rode `npm run dev`, abra a página pública de um imóvel publicado com quartos/vagas/área preenchidos e confirme que cada fato mostra um círculo com degradê da cor da marca em vez do ícone solto.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/IconBadge.tsx src/components/publico/PropertyFacts.tsx
git commit -m "feat: IconBadge (ícone com fundo em degradê) e uso nos fatos do imóvel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `EmptyState` com foto opcional + uso nos dois estados vazios "primeiro uso"

**Files:**
- Modify: `src/components/ui/EmptyState.tsx` (arquivo inteiro, 33 linhas — ver spec)
- Modify: `src/app/painel/imoveis/page.tsx:40-49` (`EmptyState` de "Cadastre seu primeiro imóvel")
- Modify: `src/app/painel/leads/page.tsx:37-46` (`EmptyState` de "Nenhum contato ainda")

**Interfaces:**
- Consumes: `estado-vazio-imoveis.webp`, `estado-vazio-contatos.webp` (Tarefa 1).
- Produces:
  ```ts
  export type EmptyStateProps = {
    icon?: ReactNode;
    image?: StaticImageData; // novo — ignorado se `icon` também for passado
    title: ReactNode;
    text?: ReactNode;
    action?: ReactNode;
    className?: string;
  };
  export function EmptyState(props: EmptyStateProps): JSX.Element
  ```

- [ ] **Step 1: Reescrever `EmptyState.tsx`**

```tsx
// src/components/ui/EmptyState.tsx
import type { StaticImageData } from "next/image";
import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "./cn";

export type EmptyStateProps = {
  /** Ícone lucide (ex.: `<Building2 />`). */
  icon?: ReactNode;
  /** Foto pequena e arredondada no lugar do ícone (ex.: primeiro acesso). Ignorada se `icon` também for passado. */
  image?: StaticImageData;
  /** O que falta, em uma frase curta ("Nenhum imóvel ainda"). */
  title: ReactNode;
  /** O que fazer a seguir. */
  text?: ReactNode;
  /** Botão/link da próxima ação. */
  action?: ReactNode;
  className?: string;
};

/** Estado vazio: convida à próxima ação em vez de só dizer que não há nada. */
export function EmptyState({ icon, image, title, text, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div
          aria-hidden
          className="mb-4 grid size-12 place-items-center rounded-full bg-brand-soft text-brand [&_svg]:size-6"
        >
          {icon}
        </div>
      )}
      {!icon && image && <Image src={image} alt="" width={112} height={112} className="mb-5 size-28 rounded-full object-cover" />}
      <p className="font-display text-xl text-ink">{title}</p>
      {text && <p className="mt-1.5 max-w-sm text-sm text-pretty text-ink-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
```

A ramificação `icon` não mudou uma linha — quem já passa `icon` continua vendo exatamente o mesmo círculo `bg-brand-soft` de hoje.

- [ ] **Step 2: Usar a foto no estado vazio de imóveis**

Em `src/app/painel/imoveis/page.tsx`, adicione o import:

```tsx
import imoveisEmpty from "@/assets/images/estado-vazio-imoveis.webp";
```

E troque `icon={<Building2 />}` por `image={imoveisEmpty}` no `EmptyState` de "Cadastre seu primeiro imóvel" (o import de `Building2` de `lucide-react` pode ficar, se ainda for usado em outro ponto do arquivo; se não for, remova-o da lista de imports).

- [ ] **Step 3: Usar a foto no estado vazio de contatos**

Em `src/app/painel/leads/page.tsx`, adicione o import:

```tsx
import contatosEmpty from "@/assets/images/estado-vazio-contatos.webp";
```

E troque `icon={<Users />}` por `image={contatosEmpty}` no `EmptyState` de "Nenhum contato ainda" (não mexa no segundo `EmptyState` da mesma página, o de "Nenhum contato com esses filtros" com `icon={<SearchX />}` — esse continua com ícone, pois não é um estado de primeiro uso).

- [ ] **Step 4: Checar tipos e lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: nenhum erro.

- [ ] **Step 5: Conferir visualmente as duas variações**

Rode `npm run dev`. Em uma conta sem imóveis, `/painel/imoveis` deve mostrar a foto no lugar do ícone. Em uma conta com imóveis mas sem contatos, `/painel/leads` deve mostrar a outra foto; ao aplicar um filtro sem resultado, o estado com `SearchX` continua igual a hoje (ícone, sem foto).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/EmptyState.tsx src/app/painel/imoveis/page.tsx src/app/painel/leads/page.tsx
git commit -m "feat: EmptyState aceita foto opcional; usa nos estados de primeiro uso

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `PhotoPanel` + `AuthHero` (login e cadastro)

**Files:**
- Create: `src/components/ui/PhotoPanel.tsx`
- Create: `src/components/auth/AuthHero.tsx`
- Modify: `src/app/(auth)/layout.tsx` (arquivo inteiro, 45 linhas)

**Interfaces:**
- Consumes: `login-hero.webp`, `signup-hero.webp` (Tarefa 1).
- Produces:
  ```ts
  export type PhotoPanelProps = {
    image: StaticImageData;
    alt?: string;          // padrão: ""
    priority?: boolean;
    overlay?: "strong" | "soft"; // padrão: "strong"
    sizes?: string;         // padrão: "100vw"
    className?: string;
    children?: ReactNode;
  };
  export function PhotoPanel(props: PhotoPanelProps): JSX.Element

  export function AuthHeroMobile(): JSX.Element
  export function AuthHeroDesktop(): JSX.Element
  ```
  Consumido pelas Tarefas 5 e 6 (`PhotoPanel`).

- [ ] **Step 1: Criar `PhotoPanel`**

```tsx
// src/components/ui/PhotoPanel.tsx
import type { StaticImageData } from "next/image";
import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "./cn";

export type PhotoPanelProps = {
  image: StaticImageData;
  /** Deixe vazio (padrão) quando a foto for puramente decorativa. */
  alt?: string;
  /** Prioriza o carregamento — só na maior imagem da primeira tela (ex.: hero do login). */
  priority?: boolean;
  /** `strong` (padrão, tom petróleo) garante contraste para texto claro; `soft` (tom grafite) escurece menos. */
  overlay?: "strong" | "soft";
  sizes?: string;
  className?: string;
  children?: ReactNode;
};

/**
 * Foto de fundo com um degradê por cima, para manter o texto legível.
 * Usada nos painéis de login/cadastro, no banner do primeiro acesso e na página 404.
 * O elemento raiz precisa de altura definida pelo chamador (`h-*`, `h-full`, `h-dvh`…) — o
 * componente não define uma sozinho.
 */
export function PhotoPanel({ image, alt = "", priority, overlay = "strong", sizes = "100vw", className, children }: PhotoPanelProps) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <Image src={image} alt={alt} fill priority={priority} placeholder="blur" sizes={sizes} className="object-cover" />
      <div
        aria-hidden
        className={cn(
          "absolute inset-0",
          overlay === "strong"
            ? "bg-linear-to-t from-brand-strong/95 via-brand/80 to-brand/50"
            : "bg-linear-to-t from-ink/75 via-ink/30 to-transparent",
        )}
      />
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Criar `AuthHero`**

```tsx
// src/components/auth/AuthHero.tsx
"use client";
import { MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import loginHero from "@/assets/images/login-hero.webp";
import signupHero from "@/assets/images/signup-hero.webp";
import { ClassificationBadge } from "@/components/ui/ClassificationBadge";
import { PhotoPanel } from "@/components/ui/PhotoPanel";
import { Wordmark } from "@/components/ui/Wordmark";

/** Foto de login (sala vazia) ou de cadastro (corretor entregando as chaves), conforme a rota. */
function useAuthHeroImage() {
  const pathname = usePathname();
  return pathname?.startsWith("/cadastro") ? signupHero : loginHero;
}

/** Faixa de foto no topo da coluna esquerda, só no celular (`lg:hidden`). */
export function AuthHeroMobile() {
  const image = useAuthHeroImage();
  return (
    <PhotoPanel
      image={image}
      priority
      overlay="soft"
      className="-mx-5 -mt-6 mb-5 flex h-40 items-end p-5 sm:-mx-10 sm:p-10 lg:hidden"
    >
      <Wordmark tone="onBrand" size="sm" />
    </PhotoPanel>
  );
}

/** Painel lateral do desktop (≥ 1024px): a mesma foto da faixa do celular, com o texto de venda e o card de exemplo por cima. */
export function AuthHeroDesktop() {
  const image = useAuthHeroImage();
  return (
    <aside aria-label="Como funciona" className="m-3 hidden lg:block">
      <PhotoPanel image={image} priority className="flex h-full flex-col justify-between rounded-panel p-12 text-on-brand xl:p-16">
        <div className="relative max-w-[30rem]">
          <h2 className="font-display text-[3.25rem] leading-[1.02] font-normal tracking-[-0.02em] text-balance">
            Transforme cliques em contatos qualificados.
          </h2>
          <p className="mt-6 max-w-[26rem] text-[1.0625rem] leading-relaxed text-white/80">
            Cada imóvel ganha uma página própria. Antes de chamar você no WhatsApp, o interessado responde a poucas
            perguntas — e você sabe com quem conversar primeiro.
          </p>
        </div>

        <figure className="relative mt-12 w-full max-w-[26rem] self-end">
          <div className="rounded-card bg-surface p-5 text-ink shadow-raised">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-semibold">Juliana Prado</p>
                <p className="truncate text-sm text-ink-muted">Apartamento 3 quartos no Jardim dos Estados</p>
              </div>
              <span className="shrink-0 pt-0.5 text-sm text-ink-muted tabular-nums">82/100</span>
            </div>
            <dl className="mt-4 space-y-2.5 border-t border-line pt-4 text-sm">
              {[
                ["Como pretende pagar?", "Financiamento já aprovado"],
                ["Quando quer se mudar?", "Nos próximos 3 meses"],
                ["Quer agendar uma visita?", "Sim, neste fim de semana"],
              ].map(([q, a]) => (
                <div key={q} className="flex justify-between gap-4">
                  <dt className="text-ink-muted">{q}</dt>
                  <dd className="text-right font-medium">{a}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex items-center justify-between gap-3">
              <ClassificationBadge value="HIGH" size="sm" />
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                <MessageCircle aria-hidden className="size-3.5 text-whatsapp" />
                Chegou no seu WhatsApp às 14:32
              </span>
            </div>
          </div>
          <figcaption className="mt-3 text-right text-sm text-white/80">Exemplo de contato recebido</figcaption>
        </figure>
      </PhotoPanel>
    </aside>
  );
}
```

Nota: os dois anéis decorativos (`border border-white/10`) do painel original foram removidos de propósito — com uma foto real de fundo, eles ficavam poluindo a composição.

- [ ] **Step 3: Atualizar `(auth)/layout.tsx`**

```tsx
// src/app/(auth)/layout.tsx
import type { ReactNode } from "react";
import { AuthHeroDesktop, AuthHeroMobile } from "@/components/auth/AuthHero";
import { Wordmark } from "@/components/ui/Wordmark";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-10 lg:px-14 lg:py-10">
        <AuthHeroMobile />
        <div className="hidden lg:block">
          <Wordmark />
        </div>
        <p className="mt-3 max-w-xs text-sm text-ink-muted lg:hidden">Transforme cliques em contatos qualificados.</p>
        <main className="flex flex-1 items-start py-10 sm:items-center">
          <div className="mx-auto w-full max-w-[24rem]">{children}</div>
        </main>
        <p className="text-xs text-ink-faint">Feito para corretores de imóveis.</p>
      </div>

      <AuthHeroDesktop />
    </div>
  );
}
```

- [ ] **Step 4: Checar tipos e lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: nenhum erro.

- [ ] **Step 5: Conferir contraste e as duas rotas**

Rode `npm run dev` e abra `/login` e `/cadastro` em 390px (celular) e 1440px (desktop). Confirme:
- Fotos diferentes em cada rota.
- No desktop, o texto "Transforme cliques…" e o card "Juliana Prado" continuam legíveis sobre a foto (o degradê `strong` deve deixar a base bem escura).
- No celular, a faixa de foto aparece encostada nas bordas (sem barra branca lateral) com a logo em branco no canto inferior esquerdo, legível.
- `/cadastro` não duplica logo (a versão `ink` do `Wordmark` só aparece a partir de 1024px).

- [ ] **Step 6: Rodar os testes existentes**

```bash
npm run test:unit
```

Expected: todos passam (nenhuma lógica de domínio foi tocada nesta tarefa).

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/PhotoPanel.tsx src/components/auth/AuthHero.tsx "src/app/(auth)/layout.tsx"
git commit -m "feat: PhotoPanel e fotos de fundo no login e cadastro

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Página 404 com `PhotoPanel`

**Files:**
- Create: `src/app/not-found.tsx`

**Interfaces:**
- Consumes: `PhotoPanel` (Tarefa 4), `404.webp` (Tarefa 1).

- [ ] **Step 1: Criar `not-found.tsx`**

```tsx
// src/app/not-found.tsx
import Link from "next/link";
import notFoundImage from "@/assets/images/404.webp";
import { PhotoPanel } from "@/components/ui/PhotoPanel";
import { Wordmark } from "@/components/ui/Wordmark";

export default function NotFound() {
  return (
    <PhotoPanel
      image={notFoundImage}
      priority
      className="flex min-h-dvh flex-col items-center justify-center px-4 py-10 text-center text-on-brand"
    >
      <Wordmark tone="onBrand" className="mb-8" />
      <h1 className="font-display text-[2.5rem] leading-tight tracking-[-0.02em]">Página não encontrada</h1>
      <p className="mt-3 max-w-sm text-white/85">O link pode estar errado ou a página pode ter sido removida.</p>
      <Link
        href="/"
        className="mt-8 inline-flex h-12 items-center justify-center rounded-control bg-white px-6 text-base font-semibold text-brand hover:bg-brand-soft"
      >
        Voltar ao início
      </Link>
    </PhotoPanel>
  );
}
```

- [ ] **Step 2: Checar tipos e lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: nenhum erro.

- [ ] **Step 3: Conferir visualmente**

Rode `npm run dev` e abra uma rota inexistente, ex. `http://localhost:3000/rota-que-nao-existe`. Confirme a foto de fundo, o degradê e a legibilidade do texto em 390px e 1440px.

- [ ] **Step 4: Commit**

```bash
git add src/app/not-found.tsx
git commit -m "feat: página 404 customizada com foto de fundo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Banner do primeiro acesso no painel

**Files:**
- Modify: `src/app/painel/page.tsx:167-228` (função `FirstRun`)

**Interfaces:**
- Consumes: `PhotoPanel` (Tarefa 4), `painel-primeiro-acesso.webp` (Tarefa 1).

- [ ] **Step 1: Adicionar o import**

No topo de `src/app/painel/page.tsx`, adicione:

```tsx
import primeiroAcessoImage from "@/assets/images/painel-primeiro-acesso.webp";
import { PhotoPanel } from "@/components/ui/PhotoPanel";
```

- [ ] **Step 2: Inserir o banner em `FirstRun`**

Na função `FirstRun`, logo depois de `const steps = [...]` e antes do `return`, nada muda na lista `steps`. No JSX retornado, troque:

```tsx
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
```

por:

```tsx
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PhotoPanel image={primeiroAcessoImage} priority overlay="soft" className="-mx-4 h-40 sm:mx-0 sm:h-48 sm:rounded-panel lg:-mx-10 lg:px-10" />
      <header>
```

- [ ] **Step 3: Checar tipos e lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: nenhum erro.

- [ ] **Step 4: Conferir visualmente**

Rode `npm run dev`, entre com uma conta recém-criada (sem imóveis) e confirme que `/painel` mostra o banner com foto acima da lista de 3 passos, em 390px e 1440px.

- [ ] **Step 5: Commit**

```bash
git add src/app/painel/page.tsx
git commit -m "feat: banner com foto no primeiro acesso ao painel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Galeria sem fotos — fallback com foto desfocada

**Files:**
- Modify: `src/components/publico/Gallery.tsx:38-40` (bloco `if (total === 0)`)

**Interfaces:**
- Consumes: `imovel-sem-fotos.webp` (Tarefa 1).

- [ ] **Step 1: Adicionar o import**

No topo de `src/components/publico/Gallery.tsx`, adicione:

```tsx
import Image from "next/image";
import semFotosImage from "@/assets/images/imovel-sem-fotos.webp";
```

- [ ] **Step 2: Trocar o retângulo vazio pelo fallback**

Troque:

```tsx
  if (total === 0) {
    return <div className="aspect-[4/3] w-full bg-surface-sunken lg:aspect-[21/9] lg:rounded-panel" aria-hidden />;
  }
```

por:

```tsx
  if (total === 0) {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-sunken lg:aspect-[21/9] lg:rounded-panel">
        <Image src={semFotosImage} alt="" fill priority sizes="100vw" className="scale-110 object-cover blur-md" />
        <div aria-hidden className="absolute inset-0 bg-ink/35" />
        <span className="absolute bottom-3 left-3 rounded-full bg-ink/70 px-3 py-1 text-[0.8125rem] font-medium text-white backdrop-blur-sm">
          Fotos em breve
        </span>
      </div>
    );
  }
```

`scale-110` esconde a borda desfocada que o `blur-md` revelaria nas bordas do contêiner.

- [ ] **Step 3: Confirmar que o Open Graph/Twitter Card não muda**

Rode:

```bash
git diff -- "src/app/imovel/[slug]/page.tsx"
```

Expected: nenhuma diferença — `generateMetadata` continua lendo só `p.images[0]?.url`. O fallback vive inteiramente dentro de `Gallery.tsx`, que não é chamado por `generateMetadata`.

- [ ] **Step 4: Checar tipos e lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: nenhum erro.

- [ ] **Step 5: Conferir visualmente**

Rode `npm run dev`, publique (ou edite) um imóvel sem nenhuma foto e abra a página pública dele. Confirme a foto desfocada com o selo "Fotos em breve" em 390px e 1440px, e que o link compartilhado (ex. copiar a URL num validador de Open Graph) não mostra essa imagem como capa.

- [ ] **Step 6: Commit**

```bash
git add src/components/publico/Gallery.tsx
git commit -m "feat: fallback com foto desfocada quando o imóvel não tem fotos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Fluxo de interesse — duas colunas no desktop + foto na etapa final

**Files:**
- Modify: `src/components/publico/InterestFlow.tsx:1-16` (imports), `:568-673` (etapa `done` e o `return` final)

**Interfaces:**
- Consumes: `interesse-fallback.webp`, `interesse-concluido.webp` (Tarefa 1). `property.coverUrl: string | null` (já existe em `InterestFlowProps`).

- [ ] **Step 1: Adicionar os imports**

No topo de `src/components/publico/InterestFlow.tsx`, adicione:

```tsx
import Image from "next/image";
import interesseConcluido from "@/assets/images/interesse-concluido.webp";
import interesseFallback from "@/assets/images/interesse-fallback.webp";
```

- [ ] **Step 2: Foto acima da confirmação na etapa `done`**

No bloco `else { const { handoff } = step; ... body = ( <> ... ) }`, logo depois de `body = (\n      <>` e antes do `<span aria-hidden className="grid size-14 place-items-center rounded-full bg-whatsapp/10 text-whatsapp">`, insira:

```tsx
        <div className="relative -mx-4 h-40 overflow-hidden sm:-mx-6 sm:h-48 sm:rounded-panel">
          <Image src={interesseConcluido} alt="" fill priority sizes="(min-width: 640px) 32rem, 100vw" className="object-cover" />
        </div>
```

E adicione `mt-6` na classe do `<span>` do ícone de check logo abaixo (hoje `className="grid size-14 place-items-center rounded-full bg-whatsapp/10 text-whatsapp"`, passa a `className="mt-6 grid size-14 place-items-center rounded-full bg-whatsapp/10 text-whatsapp"`).

- [ ] **Step 3: Layout de duas colunas no `return` final**

Troque:

```tsx
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur-md">
```

por:

```tsx
  return (
    <div className="flex min-h-dvh flex-col bg-surface lg:grid lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
      <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur-md">
```

E troque o fechamento (hoje):

```tsx
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pt-7 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-10">
        <div key={stepKey} className="flex flex-1 flex-col motion-safe:animate-[step-in_220ms_ease-out]">
          {body}
        </div>
      </main>
    </div>
  );
}
```

por:

```tsx
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pt-7 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-10">
        <div key={stepKey} className="flex flex-1 flex-col motion-safe:animate-[step-in_220ms_ease-out]">
          {body}
        </div>
      </main>
      </div>

      <div className="relative hidden overflow-hidden bg-surface-sunken lg:sticky lg:top-0 lg:block lg:h-dvh">
        {property.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto do storage (local ou Supabase)
          <img src={property.coverUrl} alt="" className="size-full object-cover" />
        ) : (
          <Image src={interesseFallback} alt="" fill sizes="(min-width: 1024px) 50vw, 0px" className="object-cover" />
        )}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-ink/25 to-transparent" />
      </div>
    </div>
  );
}
```

No celular (abaixo de `lg`), a coluna da foto fica `hidden` e o layout continua idêntico ao de hoje; a partir de 1024px, o formulário (agora dentro do `<div className="flex flex-1 flex-col">`) ocupa 32rem à esquerda e a foto preenche o resto à direita, fixa na tela enquanto o formulário rola.

- [ ] **Step 4: Checar tipos e lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: nenhum erro.

- [ ] **Step 5: Rodar o teste E2E completo**

```bash
npm run test:e2e
```

Expected: `e2e/fluxo-completo.spec.ts` passa. Esse teste roda o visitante em viewport `iPhone 13` (abaixo de `lg`), então cobre exatamente o caminho que não deveria ter mudado — incluindo a nova foto da etapa final, que aparece em qualquer largura.

- [ ] **Step 6: Conferir visualmente o desktop**

Rode `npm run dev`, abra o fluxo de interesse de um imóvel publicado (`/imovel/<slug>/interesse`) em 1440px. Confirme a foto à direita (a capa real do imóvel, se houver) fixa enquanto rola o formulário à esquerda; teste também um imóvel sem fotos para ver o fallback genérico. Confirme em 390px que nada mudou visualmente além da foto na tela final.

- [ ] **Step 7: Commit**

```bash
git add src/components/publico/InterestFlow.tsx
git commit -m "feat: fluxo de interesse em duas colunas no desktop e foto na etapa final

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Verificação final de toda a branch

**Files:** nenhum arquivo novo — só verificação.

- [ ] **Step 1: Lint e tipos**

```bash
npm run lint
npx tsc --noEmit
```

Expected: nenhum erro.

- [ ] **Step 2: Testes unitários e de integração**

```bash
npm run test:unit
npm run test:integration
```

Expected: todos passam (nenhuma lógica de domínio ou de serviço foi alterada neste plano — uma falha aqui indica regressão inesperada).

- [ ] **Step 3: Build de produção**

```bash
npm run build
```

Expected: build conclui sem erros — confirma que todos os `import ... from "@/assets/images/*.webp"` resolvem e que o `next/image` aceita os 9 arquivos.

- [ ] **Step 4: Testes E2E**

```bash
npm run test:e2e
```

Expected: `e2e/fluxo-completo.spec.ts` passa.

- [ ] **Step 5: Capturas de tela de revisão**

Com `npm run dev` rodando, capture (celular 390px e desktop 1440px) cada uma destas telas e reveja lado a lado com o parceiro humano antes de considerar concluído:
- `/login`
- `/cadastro`
- `/painel` (conta recém-criada, sem imóveis)
- `/imovel/<slug>/interesse` — etapa de contato, uma pergunta, e a etapa final
- `/imovel/<slug>` de um imóvel sem fotos
- uma rota inexistente (404)

Confirme em cada uma: contraste do texto sobre foto, nenhuma imagem cortada de forma estranha, nenhuma imagem generativa com defeito visível (mãos, texto embutido, geometria impossível).

- [ ] **Step 6: Commit final (se sobrar algum ajuste das capturas)**

Se as capturas revelarem ajustes finos (ex.: contraste insuficiente em algum breakpoint), aplique-os nos arquivos da tarefa correspondente e:

```bash
git add -A
git commit -m "fix: ajustes finos de contraste/recorte após revisão visual

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Se nada precisar mudar, não há commit nesta tarefa.
