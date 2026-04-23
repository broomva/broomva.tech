import { z } from "zod";
import { CitationSchema } from "@broomva/life-modules-core";

/** Canonical closed-work-order shape (mirrors PropertyWare fields). */
export const WorkOrderSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  unitId: z.string().optional(),
  category: z.string(),
  description: z.string(),
  openedAt: z.string().datetime({ offset: true }),
  closedAt: z.string().datetime({ offset: true }).optional(),
  vendorId: z.string().optional(),
  vendorName: z.string().optional(),
  closureNotes: z.string().optional(),
  costUsd: z.number().optional(),
  photosCount: z.number().optional(),
});
export type WorkOrder = z.infer<typeof WorkOrderSchema>;

export const AuditAlertTypeSchema = z.enum([
  "DUPLICATE_WO",
  "WEAK_CLOSURE",
  "FOLLOW_UP_RISK",
  "MISSING_EVIDENCE",
]);
export type AuditAlertType = z.infer<typeof AuditAlertTypeSchema>;

export const AuditAlertSchema = z.object({
  type: AuditAlertTypeSchema,
  severity: z.enum(["low", "medium", "high"]),
  relatedWoIds: z.array(z.string()).min(1),
  rationale: z.string(),
  suggestedAction: z.string().optional(),
  confidence: z.number().min(0).max(1),
  citations: z.array(CitationSchema).default([]),
  source: z.enum(["deterministic", "llm"]).default("llm"),
});
export type AuditAlert = z.infer<typeof AuditAlertSchema>;

export const AuditSummarySchema = z.object({
  workOrdersScanned: z.number(),
  alertsByType: z.record(AuditAlertTypeSchema, z.number()),
  highSeverityCount: z.number(),
});
export type AuditSummary = z.infer<typeof AuditSummarySchema>;

export const AuditResultSchema = z.object({
  alerts: z.array(AuditAlertSchema),
  summary: AuditSummarySchema,
});
export type AuditResult = z.infer<typeof AuditResultSchema>;
