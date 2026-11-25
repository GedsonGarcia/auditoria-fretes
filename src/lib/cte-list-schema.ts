import { z } from "zod";

/** Maior intervalo de emissão consultado de uma vez na base original. */
export const CTE_LIST_MAX_DAYS = 92;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Data inválida.");
const cnpj = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => value === "" || value.length === 14 || value.length === 11, "CNPJ inválido.")
  .optional();

export const cteListSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    search: z.string().trim().max(80).optional(),
    carrierCnpj: cnpj,
    branchCnpj: cnpj,
    limit: z.number().int().min(1).max(500).optional(),
  })
  .refine((v) => v.from <= v.to, { message: "A emissão inicial deve ser anterior à final." })
  .refine(
    (v) =>
      (Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`)) / 86_400_000 <
      CTE_LIST_MAX_DAYS,
    { message: `Consulte no máximo ${CTE_LIST_MAX_DAYS} dias de emissão por vez.` },
  );

export type CteListInput = z.input<typeof cteListSchema>;
