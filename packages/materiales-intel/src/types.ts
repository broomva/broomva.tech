import { z } from "zod";

export const ResearchModeSchema = z.enum(["fast", "standard", "deep"]);
export type ResearchMode = z.infer<typeof ResearchModeSchema>;

export const MaterialQuerySchema = z.object({
  family: z.string(),
  item: z.string(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  region: z.string().default("Bogotá"),
  mode: ResearchModeSchema.default("standard"),
  context: z.string().optional(),
});
export type MaterialQuery = z.infer<typeof MaterialQuerySchema>;

export const SupplierQuoteSchema = z.object({
  supplier: z.string(),
  unitPriceCop: z.number().positive(),
  unitPriceFormatted: z.string(),
  unit: z.string(),
  stockNotes: z.string().optional(),
  sourceUrl: z.string().url(),
  sourceTitle: z.string(),
  confidence: z.number().min(0).max(1),
  fetchedAt: z.string().datetime(),
});
export type SupplierQuote = z.infer<typeof SupplierQuoteSchema>;

export const QueryResultSchema = z.object({
  query: MaterialQuerySchema,
  suppliers: z.array(SupplierQuoteSchema).min(1),
  medianUnitPriceCop: z.number(),
  spread: z.number(),
  notes: z.string().optional(),
  runId: z.string(),
  runAt: z.string().datetime(),
});
export type QueryResult = z.infer<typeof QueryResultSchema>;
