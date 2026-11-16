import { z } from "zod";

const text = z.string().trim().min(1, "Preencha os campos obrigatórios.").max(200);
export const cnpjSchema = z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => /^\d{14}$/.test(v), "Informe um CNPJ com 14 dígitos.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.").refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, "Data inválida.");
export const carrierSchema = z.object({ id: z.string().uuid().optional(), legal_name: text, cnpj: cnpjSchema, display_name: z.string().trim().max(200), active: z.boolean() });
export const branchSchema = z.object({ id: z.string().uuid().optional(), code: text, name: text, cnpj: cnpjSchema, city: text, state: z.string().toUpperCase().regex(/^[A-Z]{2}$/, "Informe a UF."), address: z.string().max(500), active: z.boolean() });
export const accessSchema = z.object({ email: z.string().trim().email().toLowerCase(), name: text, team: text, role: z.enum(["admin", "transportes", "consulta"]), active: z.boolean() });
export const squareSchema = z.object({ name: text, state: z.string().regex(/^[A-Z]{2}$/), code: text, notes: z.string().max(1000) });
export const versionSchema = z.object({ carrier_id: z.string().uuid(), branch_id: z.string().uuid(), square_id: z.string().uuid().nullable(), destination: z.string().max(200), valid_from: date, valid_until: date.nullable(), commercial: z.record(z.object({ value: z.number().nonnegative().nullable(), state: z.enum(["provided", "missing", "not_applicable"]) })), calculation_rules: z.array(z.record(z.string().max(1000))), weight_bands: z.array(z.object({ weight: z.number().positive(), value: z.number().nonnegative() })), configuration: z.record(z.union([z.string().max(1000), z.boolean(), z.number().nonnegative(), z.null()])), notes: z.string().max(2000), previous_version_id: z.string().uuid().nullable() }).refine((v) => !v.valid_until || v.valid_until >= v.valid_from, "O fim da vigência deve ser posterior ao início.");
export const mutationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("carrier"), value: carrierSchema }),
  z.object({ kind: z.literal("branch"), value: branchSchema }),
  z.object({ kind: z.literal("access"), value: accessSchema }),
  z.object({ kind: z.literal("square"), value: squareSchema }),
  z.object({ kind: z.literal("version"), value: versionSchema }),
]);
export const importSchema = z.object({ file_name: text, csv: z.string().min(1).max(5_000_000, "O arquivo excede o limite de 5 MB.") });

export function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Confira os campos.";
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}