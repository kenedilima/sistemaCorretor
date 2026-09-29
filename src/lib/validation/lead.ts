import { z } from "zod";
import { normalizeBrPhone } from "@/domain/phone";

const attributionSchema = z
  .object({
    utmSource: z.string().max(1000).nullish(),
    utmMedium: z.string().max(1000).nullish(),
    utmCampaign: z.string().max(1000).nullish(),
    utmContent: z.string().max(1000).nullish(),
    utmTerm: z.string().max(1000).nullish(),
    referrer: z.string().max(2000).nullish(),
    gclid: z.string().max(1000).nullish(),
    fbclid: z.string().max(1000).nullish(),
  })
  .default({});

/** Id aleatório do navegador (UUID). Recusa valores genéricos como "anon", que misturariam visitantes. */
const visitorIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9-]{8,64}$/, "Identificador de visitante inválido")
  .refine((v) => v.toLowerCase() !== "anon", "Identificador de visitante inválido")
  .optional();

export const startLeadSchema = z.object({
  propertyId: z.string().min(1).max(50),
  name: z.string().trim().min(2, "Informe seu nome").max(100),
  /** Opcional: o visitante chama o corretor pelo WhatsApp de qualquer forma; vazio vira null. */
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const n = normalizeBrPhone(v);
      if (!n) {
        ctx.addIssue({ code: "custom", message: "WhatsApp inválido. Use DDD + número" });
        return z.NEVER;
      }
      return n;
    }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .optional()
    .transform((v) => v || null)
    .pipe(z.union([z.null(), z.email("E-mail inválido")])),
  consent: z.literal(true, "É preciso concordar para continuar"),
  visitorId: visitorIdSchema,
  landingUrl: z.string().max(1000).optional(),
  attribution: attributionSchema,
});

export const answersSchema = z.object({
  answers: z
    .record(
      z.string().max(50),
      z.object({
        optionIds: z.array(z.string().max(50)).max(20).optional(),
        text: z.string().max(2000).optional(),
        number: z.number().optional(),
      }),
    )
    .refine((v) => Object.keys(v).length <= 20, "Respostas demais"),
});

export const publicEventSchema = z.object({
  propertyId: z.string().min(1).max(50),
  type: z.enum(["PAGE_VIEW", "QUESTIONNAIRE_START"]),
  visitorId: visitorIdSchema,
  attribution: attributionSchema,
});
