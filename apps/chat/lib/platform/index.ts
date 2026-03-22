/**
 * Platform adapter singletons — bridges broomva.tech's db client
 * to the private @broomva/* package adapter interfaces.
 *
 * The @broomva/database schema is aligned to broomva.tech's naming
 * conventions, so adapters work directly against the same database.
 *
 * aiOS-compliant: platform events flow to SQL audit log (not Lago
 * EventStore), using platform.* dotted namespace convention.
 */

import {
  createAnalyticsDbAdapter,
  createAuditDbAdapter,
  createComplianceDbAdapter,
  createCreditDbAdapter,
  createDeployDbAdapter,
  createPlanChangeDbAdapter,
  createQuotaDbAdapter,
  createRbacDbAdapter,
  createRetentionDbAdapter,
  createTenantDbAdapter,
  createTenantLifecycleDbAdapter,
  createUsageDbAdapter,
} from "@broomva/database";

import { db } from "@/lib/db/client";

// Tenant adapters
export const tenantDb = createTenantDbAdapter(db);
export const tenantLifecycleDb = createTenantLifecycleDbAdapter(db);
export const quotaDb = createQuotaDbAdapter(db);

// Billing adapters
export const usageDb = createUsageDbAdapter(db);
export const creditDb = createCreditDbAdapter(db);
export const planChangeDb = createPlanChangeDbAdapter(db);
export const analyticsDb = createAnalyticsDbAdapter(db);

// Deploy adapters
export const deployDb = createDeployDbAdapter(db);

// Conformance adapters
export const auditDb = createAuditDbAdapter(db);
export const complianceDb = createComplianceDbAdapter(db);
export const rbacDb = createRbacDbAdapter(db);
export const retentionDb = createRetentionDbAdapter(db);
