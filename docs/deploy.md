# Deploy

Stack recomendada: **Supabase** (PostgreSQL + armazenamento de arquivos) + **Vercel** (aplicação
Next.js).

## 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. **Database → Connection string**: você vai precisar de duas URLs:
   - **Transaction pooler** (Supavisor, porta 6543) — usada pela aplicação em produção; essa é a
     `DATABASE_URL` que vai no Vercel. A URL do pooler como o Supabase a entrega já basta: **não**
     acrescente `?pgbouncer=true&connection_limit=1` (são parâmetros do motor de consultas antigo do
     Prisma; o adaptador `@prisma/adapter-pg` usado aqui os ignora). O tamanho do pool por instância
     é controlado por `DATABASE_POOL_MAX` (padrão 5, ver `src/server/db.ts`).
   - **SSL**: termine a URL da aplicação com `?uselibpqcompat=true&sslmode=require`. Só
     `sslmode=require` **não** funciona: o driver `pg` (v8) o trata como `verify-full`, e a cadeia do
     certificado do Supabase não é reconhecida pelo Node → `SELF_SIGNED_CERT_IN_CHAIN` e erro 500 em
     toda página que consulta o banco. Com `uselibpqcompat=true` a conexão continua criptografada,
     sem validar o certificado (semântica do libpq).
   - **Direct connection / Session** (porta 5432) — usada só para rodar as migrações a partir da
     sua máquina (o pooler em modo transação não suporta os comandos que `prisma migrate deploy`
     precisa):
     ```bash
     DATABASE_URL="<direct-connection-url>" npx prisma migrate deploy
     ```
3. **Storage**: crie um bucket público chamado `property-images` (Storage → New bucket → marque
   "Public bucket"). É nele que ficam as fotos dos imóveis e as fotos de perfil.
4. **Project Settings → API**: copie a **service role key** (não a `anon key` — o backend precisa
   de permissão de escrita no bucket) e a **Project URL**.

## 2. Vercel

1. Importe o repositório (New Project → escolha o repo).
2. Build command: o padrão do Vercel já funciona (`npm run build`, que roda
   `prisma generate && next build`). Não é preciso customizar.
3. Configure as variáveis de ambiente (Project Settings → Environment Variables):

   | Variável | Valor |
   | --- | --- |
   | `DATABASE_URL` | a URL do **Transaction pooler** do Supabase (Supavisor), terminando em `?uselibpqcompat=true&sslmode=require` (ver SSL acima) — configure para **Production e Preview** (ver observações) |
   | `DATABASE_POOL_MAX` | opcional; conexões por instância no pool (padrão `5`) |
   | `APP_URL` | `https://<seu-domínio>` (o domínio que o Vercel atribuiu, ou o domínio próprio — ver abaixo). Obrigatória em produção: sem ela, as páginas que geram links absolutos falham com erro explícito |
   | `STORAGE_DRIVER` | `supabase` (em produção o driver `local` é recusado com erro explícito) |
   | `SUPABASE_URL` | a Project URL do Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | a service role key |
   | `SUPABASE_BUCKET` | `property-images` |

4. Antes do primeiro deploy (ou depois, mas antes de usar a aplicação), rode as migrações contra
   o banco do Supabase a partir da sua máquina, usando a **direct connection** (não o pooler):
   ```bash
   DATABASE_URL="<direct-connection-url>" npx prisma migrate deploy
   ```
5. Deploy.

## 3. Checklist pós-deploy

- [ ] Criar uma conta em `/cadastro` no domínio de produção.
- [ ] Completar o perfil (WhatsApp é obrigatório para publicar).
- [ ] Cadastrar um imóvel de teste, adicionar uma foto e publicar.
- [ ] Rodar o fluxo completo a partir de um celular: abrir o link público, clicar em "Tenho
      interesse", responder o questionário e confirmar que o link do WhatsApp abre com a
      mensagem correta.
- [ ] Conferir a prévia do link (Open Graph) enviando a URL do imóvel numa conversa do WhatsApp —
      deve aparecer a foto de capa, o título e o preço.
- [ ] Apagar a conta/imóvel de teste (ou deixar como demo, se preferir).

## Observações

- **`DATABASE_URL` também nos builds de Preview**: `prisma.config.ts` lê `env("DATABASE_URL")`, que
  falha se a variável não existir, e `npm run build` roda `prisma generate`. Por isso a variável
  precisa estar configurada para os ambientes Production **e** Preview no Vercel (pode ser um banco
  separado para Preview); senão os deploys de branch quebram no build.
- **`ALLOW_LOCAL_STORAGE`**: não defina em produção. Existe só para o servidor de produção local
  dos testes E2E (`playwright.config.ts`), que grava as fotos em disco.

- **Limite de envio (rate limit)**: a proteção contra abuso do formulário público é em memória,
  por instância do processo. Em produção na Vercel (funções serverless, múltiplas instâncias),
  isso significa que o limite é por instância, não global — na prática um visitante malicioso
  pode contornar o limite abrindo requisições que caem em instâncias diferentes. Para um limite
  realmente global, trocar por um backend compartilhado (ex.: Upstash Redis) é o próximo passo;
  não é bloqueante para o MVP.
- **Domínio próprio**: configure em Vercel → Project Settings → Domains. Depois de apontar o DNS,
  atualize `APP_URL` para o novo domínio (isso afeta os links absolutos gerados: página pública,
  Open Graph, QR Code, link compartilhado com o visitante).
