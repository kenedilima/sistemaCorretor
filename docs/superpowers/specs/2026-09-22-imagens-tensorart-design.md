# Imagens geradas (TensorArt) no visual do produto

- Status: aprovado para plano de implementação
- Data: 2026-09-22

## Objetivo

Melhorar o visual de duas frentes específicas, usando fotos fotorrealistas geradas
com o TensorArt (`photoreal_studio_z_image`), inspirado em como portais imobiliários
do nicho (QuintoAndar, Loft, Zap, Zillow) usam foto de fundo + camada de cor nas
telas de entrada e fotos reais soltas na página do anúncio:

- **(A) Vender o produto ao corretor**: telas de login, cadastro e primeiro
  acesso ao painel precisam parecer profissionais e convencer o corretor a
  usar o produto.
- **(B) Passar confiança ao visitante**: a página do imóvel e o fluxo de
  interesse (questionário → WhatsApp) precisam parecer um portal imobiliário
  sério.

Fora de escopo: o painel do dia a dia (listas, formulários de cadastro de
imóvel, contatos) não muda, exceto pelos estados vazios, que ganham o
tratamento de ícone melhorado de graça por reutilizarem o mesmo componente.

## Não-objetivos

- Não gerar ícones com o TensorArt — ícones continuam vetoriais (`lucide-react`).
  Um ícone gerado como foto fica borrado em tamanho pequeno e não acompanha a
  cor da marca por corretor (`--color-brand` sobrescrita via `data-brand`).
- Não gerar imagem em tempo real (sem chamada ao TensorArt em produção/servidor).
- Não usar imagem gerada como capa real de imóvel, nem no preview de
  compartilhamento (Open Graph/Twitter Card) — o visitante não pode confundir
  uma imagem gerada com uma foto real do imóvel ou do corretor.
- Não mudar o banco de dados nem adicionar campos novos (ex.: corretor
  escolher o próprio fundo fica para uma iteração futura, sem retrabalho
  porque as imagens ficam organizadas em `src/assets/images/`).

## Estilo das imagens

- **Conteúdo**: neutro e variado — mistura de apartamento e casa, sem puxar
  para nenhum padrão social específico (nem alto padrão, nem popular, nem luxo).
- **Pessoas**: podem aparecer onde fizer sentido (ex.: corretor entregando
  chaves, alguém chegando em casa), sempre em plano médio, de costas ou de
  perfil — nunca em close de rosto, ponto fraco conhecido do modelo.
- **Regra de segurança**: nas páginas públicas (fluxo de interesse), pessoas
  aparecem só em cenas de ambientação genérica. Nunca perto do `AgentCard`
  nem como retrato "depoimento", para o visitante não confundir a pessoa da
  foto com o corretor real ou um cliente real.
- **Consistência**: todas as imagens usam a mesma base de prompt (luz natural,
  tons neutros/quentes, "editorial real estate photography", 35mm, sem texto,
  sem marca d'água) para parecerem da mesma sessão de fotos.

## Onde as imagens entram

### (A) Vender o produto ao corretor

1. **Login** (`src/app/(auth)/login/page.tsx` via `AuthLayout`): o painel
   lateral petróleo liso (`aside` em `src/app/(auth)/layout.tsx`) ganha uma
   foto de interior (sala ao entardecer) com gradiente petróleo por cima. O
   card de exemplo "Juliana Prado" e o texto continuam sobre a foto.
2. **Cadastro** (`src/app/(auth)/cadastro/page.tsx`): mesmo painel, foto
   diferente — corretor entregando chaves a um casal.
3. **Login/cadastro no celular**: hoje o painel lateral (`aside`) é
   `hidden lg:flex`, ou seja, some completamente no celular. Passa a existir
   uma faixa de foto de ~160px no topo da coluna esquerda, com a mesma
   camada de cor, atrás do `Wordmark`.
4. **Primeiro acesso ao painel** (`FirstRun` em `src/app/painel/page.tsx`):
   ganha um banner com foto acima da lista de 3 passos.

### (B) Confiança para o visitante

5. **Fluxo de interesse, desktop** (`InterestFlow.tsx`): hoje é uma coluna
   única centralizada (`max-w-lg`) em qualquer largura de tela. A partir do
   breakpoint `lg`, vira duas colunas: formulário à esquerda (mesma largura
   de hoje) e uma foto à direita. A foto é a **capa real do imóvel**
   (`property.coverUrl`); só quando o imóvel não tem nenhuma foto entra uma
   imagem gerada genérica de ambiente. No celular o layout de hoje não muda.
6. **Tela final do fluxo** (`step.kind === "done"`): ganha uma cena de
   ambientação com pessoas acima da confirmação (ex.: alguém abrindo a porta
   de casa), no lugar do espaço vazio atual.
7. **Imóvel sem nenhuma foto** (`Gallery.tsx`, caso `total === 0`): hoje é um
   retângulo cinza vazio (`bg-surface-sunken`). Vira uma foto genérica de
   ambiente, desfocada (`blur` via CSS) com uma camada de cor e um selo
   "Fotos em breve" — para nunca ser confundida com o imóvel real.
8. **Página 404** (imóvel não encontrado / rota inexistente): hoje é a
   página padrão do Next. Ganha uma página customizada com foto e botão de
   voltar (`src/app/not-found.tsx` e, se necessário, um específico para
   `imovel/[slug]`).

### Brinde no painel

9. **Estados vazios** (`EmptyState.tsx`, usado em imóveis/contatos sem
   dados): o ícone hoje fica solto num círculo com fundo `bg-brand-soft`.
   `EmptyState` ganha uma prop opcional `image` — quando presente, mostra a
   foto pequena arredondada no lugar do ícone; o uso existente com `icon`
   continua funcionando sem alteração de código nos chamadores atuais.

**Ícones**: continuam `lucide-react`. Ganham um componente `IconBadge`
(fundo em gradiente suave da cor da marca, cantos arredondados, dois
tamanhos `sm`/`md`) usado nos fatos do imóvel (`PropertyFacts`), nos passos
do primeiro acesso (`FirstRun`) e no `EmptyState`.

## Pipeline de geração (fora do projeto, execução única)

1. Gerar cada imagem da lista acima via
   `scripts/create_task.py photoreal_studio_z_image '[...]'` da skill
   `tensorart-generate`, com 3 variações por lugar (~30 gerações × 0,36
   créditos ≈ 11 créditos no total).
2. Tamanho por orientação: paisagem `1536×1024` (heróis de login/cadastro,
   banner do primeiro acesso, fundo do fluxo de interesse, 404, imagem
   genérica de imóvel sem foto); retrato/quadrado menor conforme o
   componente pedir (ex.: imagem do `EmptyState`).
3. Prompt-base comum + variação específica do lugar (registrado em
   `docs/imagens.md`, ver abaixo).
4. Eu descarto de cara qualquer imagem com defeito óbvio (mãos deformadas,
   texto ilegível embutido, geometria impossível).
5. As sobreviventes vão para uma página HTML local de comparação
   (`scripts/scratch` ou artifact), lado a lado por lugar, para você
   escolher uma por lugar (ou pedir nova geração).

## Armazenamento e uso no código

- Escolhidas → convertidas para **WebP** com `sharp` (já é dependência do
  projeto) e salvas em `src/assets/images/<nome-semantico>.webp`
  (ex.: `login-hero.webp`, `signup-hero.webp`, `painel-primeiro-acesso.webp`,
  `interesse-fallback.webp`, `interesse-concluido.webp`,
  `imovel-sem-fotos.webp`, `404.webp`, `estado-vazio-imoveis.webp`,
  `estado-vazio-contatos.webp`).
- Import estático (`import loginHero from "@/assets/images/login-hero.webp"`)
  e renderização com `next/image`, que já resolve dimensões (sem layout
  shift) e placeholder borrado automático (`placeholder="blur"`).
- `docs/imagens.md` documenta, por arquivo: prompt completo (inglês),
  dimensões, ferramenta usada, data de geração e onde é usado — para
  regeneração futura sem precisar redescobrir o prompt.
- Nenhuma chave do TensorArt, script ou dependência nova entra no projeto
  publicado (Vercel); o pipeline de geração roda só localmente, uma vez.

## Componentes novos/alterados

- **`PhotoPanel`** (novo, `src/components/ui/PhotoPanel.tsx`): recebe a
  imagem (via `next/image`) e o conteúdo (`children`), aplica o gradiente
  petróleo por cima e garante contraste do texto. Reuso: painel de
  login/cadastro, banner do primeiro acesso, 404, lado direito do fluxo de
  interesse.
- **`AuthLayout`** (`src/app/(auth)/layout.tsx`, alterado): escolhe a foto
  certa por rota (`usePathname`/segmento) para login vs. cadastro; adiciona
  a faixa de foto no celular reutilizando `PhotoPanel`.
- **`IconBadge`** (novo, `src/components/ui/IconBadge.tsx`): wrapper de
  ícone com fundo em gradiente, tamanhos `sm`/`md`.
- **`EmptyState`** (`src/components/ui/EmptyState.tsx`, alterado): nova prop
  opcional `image?: StaticImageData`, mostrada no lugar do ícone quando
  presente. Assinatura atual (`icon`, `title`, `text`, `action`) permanece
  válida.
- **`Gallery`** (`src/components/publico/Gallery.tsx`, alterado): caso
  `total === 0` passa a renderizar a imagem genérica desfocada + selo
  "Fotos em breve" no lugar do retângulo cinza.
- **`InterestFlow`** (`src/components/publico/InterestFlow.tsx`, alterado):
  layout de duas colunas em `lg:`, usando `PhotoPanel` (com a capa real do
  imóvel ou o fallback genérico) e uma imagem de ambientação na etapa
  `done`.
- **`not-found.tsx`** (novo, `src/app/not-found.tsx`): página 404 com
  `PhotoPanel`.
- **`FirstRun`** (dentro de `src/app/painel/page.tsx`, alterado): banner com
  `PhotoPanel` acima da lista de passos; passos usam `IconBadge`.
- **`PropertyFacts`** (`src/components/publico/PropertyFacts.tsx`, alterado):
  ícones existentes passam a usar `IconBadge`.

## Regras de visual e acessibilidade

- Texto sobre foto sempre tem camada de cor suficiente atrás para manter
  contraste ≥ 4,5:1 (conferido visualmente nas capturas de tela, não só no
  código).
- Todas as imagens decorativas têm `alt=""` (ignoradas por leitor de tela).
  Exceção: a capa real do imóvel no `InterestFlow`, que mantém o `alt`
  descritivo que já existe hoje.
- A imagem gerada **nunca** entra no Open Graph/Twitter Card do imóvel
  (`generateMetadata` em `src/app/imovel/[slug]/page.tsx` não muda: sem foto
  real, `images` continua `undefined`).
- Carregamento: a foto do login/cadastro carrega com prioridade (`priority`
  no `next/image`, é o maior elemento visual da primeira tela); as demais
  carregam sob demanda (`loading="lazy"`, padrão do `next/image`).
- Nenhuma animação nova além do que já existe (`step-in` no questionário,
  inalterado).

## Testes e verificação

- `npm run lint`, checagem de tipos (`tsc`/build do Next) e
  `npm run test:unit` continuam passando.
- `npm run test:e2e` (Playwright) — atenção especial ao fluxo completo do
  visitante, já que `InterestFlow` muda de layout em `lg:`.
- Capturas de tela reais (celular 390px, desktop 1440px) de cada tela
  alterada — login, cadastro, painel/primeiro acesso, fluxo de interesse
  (contato, uma pergunta, tela final), imóvel sem fotos, 404 — para revisão
  visual antes de considerar concluído.

## Riscos e mitigação

- **Imagem gerada com defeito visível** (mãos, texto embutido, geometria
  estranha): mitigado pela curadoria manual antes de qualquer imagem entrar
  no repositório — nenhuma imagem vai para `src/assets/images/` sem
  aprovação explícita.
- **Peso de página**: mitigado por WebP + `next/image` (dimensões
  responsivas, `priority` só onde necessário).
- **Confusão visitante/imagem real**: mitigado pelas regras de não-objetivo
  (nunca como capa de imóvel, nunca no preview de compartilhamento, sempre
  com selo "Fotos em breve" quando substitui fotos ausentes).
