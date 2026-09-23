import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // process.env em vez de env(): `prisma generate` (postinstall/build) não precisa de banco e não deve
  // falhar sem DATABASE_URL; os comandos que conectam (migrate, seed) continuam exigindo a variável.
  datasource: { url: process.env.DATABASE_URL },
});
