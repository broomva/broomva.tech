import type { InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { encryptedJson, encryptedText } from "./encrypted-text";

export type User = InferSelectModel<typeof user>;

export const userCredit = pgTable("UserCredit", {
  userId: text("userId")
    .primaryKey()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Balance in cents. Default = $0.50 */
  credits: integer("credits").notNull().default(50),
});

export type UserCredit = InferSelectModel<typeof userCredit>;

export const userModelPreference = pgTable(
  "UserModelPreference",
  {
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    modelId: varchar("modelId", { length: 256 }).notNull(),
    enabled: boolean("enabled").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.modelId] }),
    UserModelPreference_user_id_idx: index(
      "UserModelPreference_user_id_idx",
    ).on(t.userId),
  }),
);

export type UserModelPreference = InferSelectModel<typeof userModelPreference>;

export const project = pgTable(
  "Project",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    instructions: text("instructions").notNull().default(""),
    icon: varchar("icon", { length: 64 }).notNull().default("folder"),
    iconColor: varchar("iconColor", { length: 32 }).notNull().default("gray"),
  },
  (t) => ({
    Project_user_id_idx: index("Project_user_id_idx").on(t.userId),
  }),
);

export type Project = InferSelectModel<typeof project>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  title: text("title").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
  isPinned: boolean("isPinned").notNull().default(false),
  projectId: uuid("projectId").references(() => project.id, {
    onDelete: "set null",
  }),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable("Message", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id, {
      onDelete: "cascade",
    }),
  parentMessageId: uuid("parentMessageId"),
  role: varchar("role").notNull(),
  // parts column removed - parts are now stored in Part table
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
  annotations: json("annotations"),
  selectedModel: varchar("selectedModel", { length: 256 }).default(""),
  selectedTool: varchar("selectedTool", { length: 256 }).default(""),
  lastContext: json("lastContext"),
  activeStreamId: varchar("activeStreamId", { length: 64 }),
  /** Timestamp when this message's stream was canceled by the user. Null means not canceled. */
  canceledAt: timestamp("canceledAt"),
});

export type DBMessage = InferSelectModel<typeof message>;

/**
 * Prefix-based Part Storage
 *
 * This table replaces the JSON `Message.parts` column with a normalized,
 * prefix-based column structure. Each row represents a single message part.
 *
 * Rationale:
 * - Type safety: Strongly-typed columns instead of flexible JSONB
 * - Data integrity: Database-level check constraints ensure valid part data
 * - Query performance: Direct column access with proper indexes
 * - Migration-friendly: Schema changes can be applied incrementally
 * - Extensibility: New part types can be added via new columns with prefixes
 *
 * Prefix Convention:
 * - text_*: Text content parts
 * - reasoning_*: Reasoning/thinking parts
 * - file_*: File attachments
 * - source_url_*: URL sources
 * - source_document_*: Document sources
 * - tool_*: Tool calls (generic for all tool-[name] parts)
 * - data_*: Custom data parts (generic bucket for all data-[type] parts)
 *
 */
export const part = pgTable(
  "Part",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    order: integer("order").notNull().default(0),
    type: varchar("type").notNull(),
    // Text fields
    text_text: text("text_text"),
    // Reasoning fields
    reasoning_text: text("reasoning_text"),
    // File fields
    file_mediaType: varchar("file_mediaType"),
    file_filename: varchar("file_filename"),
    file_url: varchar("file_url"),
    // Source URL fields
    source_url_sourceId: varchar("source_url_sourceId"),
    source_url_url: varchar("source_url_url"),
    source_url_title: varchar("source_url_title"),
    // Source Document fields
    source_document_sourceId: varchar("source_document_sourceId"),
    source_document_mediaType: varchar("source_document_mediaType"),
    source_document_title: varchar("source_document_title"),
    source_document_filename: varchar("source_document_filename"),
    // Tool fields (generic for all tool-* parts)
    tool_name: varchar("tool_name"),
    tool_toolCallId: varchar("tool_toolCallId"),
    tool_state: varchar("tool_state"),
    tool_input: json("tool_input"),
    tool_output: json("tool_output"),
    tool_errorText: varchar("tool_errorText"),
    // Data fields (generic bucket for all data-* parts)
    data_type: varchar("data_type"),
    data_blob: json("data_blob"),
    // Provider metadata
    providerMetadata: json("providerMetadata"),
  },
  (t) => ({
    Part_message_id_idx: index("Part_message_id_idx").on(t.messageId),
    Part_message_id_order_idx: index("Part_message_id_order_idx").on(
      t.messageId,
      t.order,
    ),
    text_chk: check(
      "Part_text_required_if_type_text",
      sql`CASE WHEN ${t.type} = 'text' THEN ${t.text_text} IS NOT NULL ELSE TRUE END`,
    ),
    reasoning_chk: check(
      "Part_reasoning_required_if_type_reasoning",
      sql`CASE WHEN ${t.type} = 'reasoning' THEN ${t.reasoning_text} IS NOT NULL ELSE TRUE END`,
    ),
    file_chk: check(
      "Part_file_required_if_type_file",
      sql`CASE WHEN ${t.type} = 'file' THEN ${t.file_mediaType} IS NOT NULL AND ${t.file_url} IS NOT NULL ELSE TRUE END`,
    ),
    source_url_chk: check(
      "Part_source_url_required_if_type_source_url",
      sql`CASE WHEN ${t.type} = 'source-url' THEN ${t.source_url_sourceId} IS NOT NULL AND ${t.source_url_url} IS NOT NULL ELSE TRUE END`,
    ),
    source_document_chk: check(
      "Part_source_document_required_if_type_source_document",
      sql`CASE WHEN ${t.type} = 'source-document' THEN ${t.source_document_sourceId} IS NOT NULL AND ${t.source_document_mediaType} IS NOT NULL AND ${t.source_document_title} IS NOT NULL ELSE TRUE END`,
    ),
    tool_chk: check(
      "Part_tool_required_if_type_tool",
      sql`CASE WHEN ${t.type} LIKE 'tool-%' THEN ${t.tool_toolCallId} IS NOT NULL AND ${t.tool_state} IS NOT NULL ELSE TRUE END`,
    ),
    data_chk: check(
      "Part_data_required_if_type_data",
      sql`CASE WHEN ${t.type} LIKE 'data-%' THEN ${t.data_type} IS NOT NULL ELSE TRUE END`,
    ),
  }),
);

export type Part = InferSelectModel<typeof part>;

export const vote = pgTable(
  "Vote",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id, {
        onDelete: "cascade",
      }),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id, {
        onDelete: "cascade",
      }),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.chatId, table.messageId] }),
  }),
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("kind", { enum: ["text", "code", "sheet"] })
      .notNull()
      .default("text"),
    userId: text("userId")
      .notNull()
      .references(() => user.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id, {
        onDelete: "cascade",
      }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
    document_message_id_idx: index("Document_message_id_idx").on(
      table.messageId,
    ),
  }),
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: text("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  }),
);

export type Suggestion = InferSelectModel<typeof suggestion>;
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const mcpConnector = pgTable(
  "McpConnector",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: text("userId").references(() => user.id, { onDelete: "cascade" }), // null = global
    name: varchar("name", { length: 256 }).notNull(),
    nameId: varchar("nameId", { length: 256 }).notNull(), // unique per user, used as namespace for tool IDs
    url: encryptedText("url").notNull(),
    type: varchar("type", { enum: ["http", "sse"] })
      .notNull()
      .default("http"),
    oauthClientId: text("oauthClientId"),
    oauthClientSecret: encryptedText("oauthClientSecret"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    McpConnector_user_id_idx: index("McpConnector_user_id_idx").on(t.userId),
    McpConnector_user_name_id_idx: index("McpConnector_user_name_id_idx").on(
      t.userId,
      t.nameId,
    ),
    McpConnector_user_name_id_unique: uniqueIndex(
      "McpConnector_user_name_id_unique",
    ).on(t.userId, t.nameId),
  }),
);

export type McpConnector = InferSelectModel<typeof mcpConnector>;

export const mcpOAuthSession = pgTable(
  "McpOAuthSession",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    mcpConnectorId: uuid("mcpConnectorId")
      .notNull()
      .references(() => mcpConnector.id, { onDelete: "cascade" }),
    serverUrl: text("serverUrl").notNull(),
    clientInfo: encryptedJson<Record<string, unknown>>()("clientInfo"), // OAuthClientInformationFull from MCP SDK
    tokens: encryptedJson<Record<string, unknown>>()("tokens"), // OAuthTokens from MCP SDK
    codeVerifier: encryptedText("codeVerifier"), // PKCE verifier
    state: text("state").unique(), // OAuth state param (unique for security)
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    McpOAuthSession_connector_idx: index("McpOAuthSession_connector_idx").on(
      t.mcpConnectorId,
    ),
    McpOAuthSession_state_idx: index("McpOAuthSession_state_idx").on(t.state),
  }),
);

export type McpOAuthSession = InferSelectModel<typeof mcpOAuthSession>;

export const userPrompt = pgTable(
  "UserPrompt",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 256 }).notNull(),
    title: varchar("title", { length: 256 }).notNull(),
    content: text("content").notNull(),
    summary: text("summary"),
    category: varchar("category", { length: 128 }),
    model: varchar("model", { length: 128 }),
    version: varchar("version", { length: 32 }),
    tags: json("tags").$type<string[]>().default([]),
    variables:
      json("variables").$type<
        Array<{ name: string; description: string; default?: string }>
      >(),
    links: json("links").$type<Array<{ label: string; url: string }>>(),
    visibility: varchar("visibility", { enum: ["public", "private"] })
      .notNull()
      .default("private"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deletedAt"),
    /** Number of times this prompt has been copied. */
    copyCount: integer("copyCount").notNull().default(0),
    /** Admin-highlighted prompt — shown with visual distinction. */
    isHighlighted: boolean("isHighlighted").notNull().default(false),
  },
  (t) => ({
    UserPrompt_user_id_idx: index("UserPrompt_user_id_idx").on(t.userId),
    UserPrompt_visibility_idx: index("UserPrompt_visibility_idx").on(
      t.visibility,
    ),
    UserPrompt_slug_idx: uniqueIndex("UserPrompt_slug_unique").on(t.slug),
  }),
);

export type UserPrompt = InferSelectModel<typeof userPrompt>;

export const deviceAuthCode = pgTable(
  "DeviceAuthCode",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    deviceCode: varchar("deviceCode", { length: 64 }).notNull().unique(),
    userCode: varchar("userCode", { length: 12 }).notNull().unique(),
    /** Scopes requested (space-separated). Empty = full access. */
    scope: text("scope").notNull().default(""),
    /** Client identifier (e.g. "broomva-cli", "agent-browser") */
    clientId: varchar("clientId", { length: 128 }).notNull().default("cli"),
    /** pending | approved | denied | expired */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    /** Set when the user approves */
    userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
    /** The session token issued on approval */
    sessionToken: text("sessionToken"),
    expiresAt: timestamp("expiresAt").notNull(),
    pollingInterval: integer("pollingInterval").notNull().default(5),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    DeviceAuthCode_device_code_idx: index("DeviceAuthCode_device_code_idx").on(
      t.deviceCode,
    ),
    DeviceAuthCode_user_code_idx: index("DeviceAuthCode_user_code_idx").on(
      t.userCode,
    ),
  }),
);

export type DeviceAuthCode = InferSelectModel<typeof deviceAuthCode>;

export const userVault = pgTable(
  "UserVault",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lagoSessionId: varchar("lagoSessionId", { length: 32 }).notNull(),
    name: varchar("name", { length: 256 }).notNull().default("default"),
    isPrimary: boolean("isPrimary").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    UserVault_user_id_idx: index("UserVault_user_id_idx").on(t.userId),
    UserVault_lago_session_unique: uniqueIndex(
      "UserVault_lago_session_unique",
    ).on(t.lagoSessionId),
  }),
);

export type UserVault = InferSelectModel<typeof userVault>;

/**
 * Life JWT Refresh Tokens (BRO-121)
 *
 * Stores SHA-256 hashed refresh tokens for the Life Agent OS JWT flow.
 * Raw tokens are never persisted — only the hash is stored.
 *
 * Flow:
 *   1. User authenticates → receives access JWT (24h) + refresh token (7d)
 *   2. Access JWT expires → client POSTs refresh token to /api/auth/refresh
 *   3. Old refresh token is revoked, new pair (access + refresh) issued
 */
export const refreshToken = pgTable(
  "RefreshToken",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** SHA-256 hash of the refresh token — never store the raw value */
    tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
    /** When this refresh token expires (7 days from creation) */
    expiresAt: timestamp("expiresAt").notNull(),
    /** Set when the token is revoked (rotation or explicit revocation) */
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    RefreshToken_user_id_idx: index("RefreshToken_user_id_idx").on(t.userId),
    RefreshToken_token_hash_idx: index("RefreshToken_token_hash_idx").on(
      t.tokenHash,
    ),
    RefreshToken_expires_at_idx: index("RefreshToken_expires_at_idx").on(
      t.expiresAt,
    ),
  }),
);

export type RefreshToken = InferSelectModel<typeof refreshToken>;

export const audioPlaybackState = pgTable("AudioPlaybackState", {
  userId: text("userId")
    .primaryKey()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  audioSrc: text("audioSrc").notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  currentTime: integer("currentTime").notNull().default(0),
  duration: integer("duration").notNull().default(0),
  updatedAt: timestamp("updatedAt")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type AudioPlaybackState = InferSelectModel<typeof audioPlaybackState>;

// ---------------------------------------------------------------------------
// Multi-Tenant / Platform Tables
// ---------------------------------------------------------------------------

/** Tenant/organization — the billing and isolation unit */
export const organization = pgTable(
  "Organization",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    name: varchar("name", { length: 256 }).notNull(),
    slug: varchar("slug", { length: 128 }).notNull().unique(),
    plan: varchar("plan", {
      enum: ["free", "pro", "team", "enterprise"],
    })
      .notNull()
      .default("free"),
    stripeCustomerId: varchar("stripeCustomerId", { length: 256 }),
    stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 256 }),
    /** Monthly credit allocation based on plan (in cents) */
    planCreditsMonthly: integer("planCreditsMonthly").notNull().default(50),
    /** Remaining credits this billing period (in cents) */
    planCreditsRemaining: integer("planCreditsRemaining").notNull().default(50),
    /** When the current billing period resets */
    billingPeriodStart: timestamp("billingPeriodStart"),
    /** Neon branch ID for enterprise tenants needing full data isolation */
    neonBranchId: varchar("neonBranchId", { length: 256 }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    Organization_slug_idx: uniqueIndex("Organization_slug_idx").on(t.slug),
    Organization_stripe_customer_idx: index(
      "Organization_stripe_customer_idx",
    ).on(t.stripeCustomerId),
  }),
);

export type Organization = InferSelectModel<typeof organization>;

/** Organization membership — maps users to organizations with roles */
export const organizationMember = pgTable(
  "OrganizationMember",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: varchar("role", {
      enum: ["owner", "admin", "member", "viewer"],
    })
      .notNull()
      .default("member"),
    invitedAt: timestamp("invitedAt"),
    joinedAt: timestamp("joinedAt").notNull().defaultNow(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    OrganizationMember_org_id_idx: index("OrganizationMember_org_id_idx").on(
      t.organizationId,
    ),
    OrganizationMember_user_id_idx: index("OrganizationMember_user_id_idx").on(
      t.userId,
    ),
    OrganizationMember_org_user_unique: uniqueIndex(
      "OrganizationMember_org_user_unique",
    ).on(t.organizationId, t.userId),
  }),
);

export type OrganizationMember = InferSelectModel<typeof organizationMember>;

/** API keys for programmatic access, scoped to an organization */
export const organizationApiKey = pgTable(
  "OrganizationApiKey",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdByUserId: text("createdByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 256 }).notNull(),
    /** bcrypt hash of the API key — never store plaintext */
    keyHash: varchar("keyHash", { length: 256 }).notNull(),
    /** First 8 chars of the key for display (e.g., "brv_sk_a1b2...") */
    keyPrefix: varchar("keyPrefix", { length: 16 }).notNull(),
    /** Comma-separated permission scopes */
    scopes: text("scopes").notNull().default("*"),
    lastUsedAt: timestamp("lastUsedAt"),
    expiresAt: timestamp("expiresAt"),
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    OrganizationApiKey_org_id_idx: index("OrganizationApiKey_org_id_idx").on(
      t.organizationId,
    ),
    OrganizationApiKey_key_prefix_idx: index(
      "OrganizationApiKey_key_prefix_idx",
    ).on(t.keyPrefix),
  }),
);

export type OrganizationApiKey = InferSelectModel<typeof organizationApiKey>;

/** Managed Life Agent OS instances deployed on Railway */
export const organizationLifeInstance = pgTable(
  "OrganizationLifeInstance",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Railway project ID */
    railwayProjectId: varchar("railwayProjectId", { length: 256 }),
    /** Railway environment ID */
    railwayEnvironmentId: varchar("railwayEnvironmentId", { length: 256 }),
    status: varchar("status", {
      enum: [
        "provisioning",
        "running",
        "stopped",
        "degraded",
        "failed",
        "deprovisioning",
      ],
    })
      .notNull()
      .default("provisioning"),
    arcanUrl: varchar("arcanUrl", { length: 512 }),
    lagoUrl: varchar("lagoUrl", { length: 512 }),
    autonomicUrl: varchar("autonomicUrl", { length: 512 }),
    haimaUrl: varchar("haimaUrl", { length: 512 }),
    /** Last health check result */
    lastHealthCheck: timestamp("lastHealthCheck"),
    lastHealthStatus: json("lastHealthStatus"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    OrganizationLifeInstance_org_id_idx: index(
      "OrganizationLifeInstance_org_id_idx",
    ).on(t.organizationId),
  }),
);

export type OrganizationLifeInstance = InferSelectModel<
  typeof organizationLifeInstance
>;

/** Usage events — granular per-request cost records for billing */
export const usageEvent = pgTable(
  "UsageEvent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organizationId").references(() => organization.id, {
      onDelete: "set null",
    }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Type of usage: ai_tokens, life_compute, storage, api_call */
    type: varchar("type", { length: 64 }).notNull(),
    /** Model ID or service name */
    resource: varchar("resource", { length: 256 }),
    /** Input tokens (for ai_tokens type) */
    inputTokens: integer("inputTokens"),
    /** Output tokens (for ai_tokens type) */
    outputTokens: integer("outputTokens"),
    /** Cost in cents */
    costCents: integer("costCents").notNull(),
    /** Conversation ID for AI usage attribution */
    chatId: uuid("chatId"),
    /** Stripe meter event ID after reporting */
    stripeMeterEventId: varchar("stripeMeterEventId", { length: 256 }),
    /** Agent that generated this usage (null = direct user action) */
    agentId: text("agentId"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    UsageEvent_org_id_idx: index("UsageEvent_org_id_idx").on(t.organizationId),
    UsageEvent_user_id_idx: index("UsageEvent_user_id_idx").on(t.userId),
    UsageEvent_created_at_idx: index("UsageEvent_created_at_idx").on(
      t.createdAt,
    ),
    UsageEvent_org_created_idx: index("UsageEvent_org_created_idx").on(
      t.organizationId,
      t.createdAt,
    ),
    UsageEvent_agent_id_idx: index("UsageEvent_agent_id_idx").on(t.agentId),
  }),
);

export type UsageEvent = InferSelectModel<typeof usageEvent>;

/** Immutable audit log for compliance (append-only) */
export const auditLog = pgTable(
  "AuditLog",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organizationId").references(() => organization.id, {
      onDelete: "set null",
    }),
    actorId: text("actorId").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Action performed (e.g., "org.create", "member.invite", "api_key.create") */
    action: varchar("action", { length: 256 }).notNull(),
    /** Resource type affected (e.g., "organization", "chat", "api_key") */
    resourceType: varchar("resourceType", { length: 128 }),
    /** Resource ID affected */
    resourceId: varchar("resourceId", { length: 256 }),
    /** Additional context as JSON */
    metadata: json("metadata"),
    /** IP address of the actor */
    ipAddress: varchar("ipAddress", { length: 64 }),
    /** User agent string */
    userAgent: text("userAgent"),
    /** Agent that performed this action (null = direct user action) */
    agentId: text("agentId"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    AuditLog_org_id_idx: index("AuditLog_org_id_idx").on(t.organizationId),
    AuditLog_actor_id_idx: index("AuditLog_actor_id_idx").on(t.actorId),
    AuditLog_action_idx: index("AuditLog_action_idx").on(t.action),
    AuditLog_created_at_idx: index("AuditLog_created_at_idx").on(t.createdAt),
    AuditLog_agent_id_idx: index("AuditLog_agent_id_idx").on(t.agentId),
  }),
);

export type AuditLog = InferSelectModel<typeof auditLog>;

// ---------------------------------------------------------------------------
// User-Owned Agent Table (BRO-60 + BRO-56)
// ---------------------------------------------------------------------------

/**
 * Agents registered by a user for programmatic access and usage attribution.
 *
 * BRO-56: Each CLI session generates an Ed25519 keypair. The agentKeyId is the
 * first 16 hex chars of SHA-256(publicKey), providing a deterministic identity.
 */
export const agent = pgTable(
  "Agent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 256 }).notNull(),
    /** Ed25519 public key (hex-encoded DER) for agent authentication */
    publicKey: text("publicKey"),
    /** Deterministic agent key ID -- first 16 hex chars of SHA-256(publicKey) (BRO-56) */
    agentKeyId: varchar("agentKeyId", { length: 64 }),
    /** Capabilities this agent is allowed to use */
    capabilities: json("capabilities").$type<string[]>().default([]),
    /** active | revoked | expired */
    status: varchar("status", {
      enum: ["active", "revoked", "expired"],
    })
      .notNull()
      .default("active"),
    lastActiveAt: timestamp("lastActiveAt"),
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    Agent_user_id_idx: index("Agent_user_id_idx").on(t.userId),
    Agent_status_idx: index("Agent_status_idx").on(t.status),
    Agent_agent_key_id_unique: uniqueIndex("Agent_agent_key_id_unique").on(
      t.agentKeyId,
    ),
    Agent_public_key_unique: uniqueIndex("Agent_public_key_unique").on(
      t.publicKey,
    ),
  }),
);

export type Agent = InferSelectModel<typeof agent>;

// ---------------------------------------------------------------------------
// Agent Trust / Certification Tables
// ---------------------------------------------------------------------------

/** Agent registered for certification (Moody's model — submit, evaluate, certify) */
export const agentRegistration = pgTable(
  "AgentRegistration",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organizationId").references(() => organization.id, {
      onDelete: "cascade",
    }),
    name: varchar("name", { length: 256 }).notNull(),
    description: text("description"),
    version: varchar("version", { length: 64 }),
    sourceUrl: varchar("sourceUrl", { length: 512 }), // github repo, docker image, etc.
    capabilities: json("capabilities").$type<string[]>().default([]),
    trustScore: integer("trustScore"), // 0-100 composite score
    trustLevel: varchar("trustLevel", {
      enum: ["unrated", "bronze", "silver", "gold", "platinum"],
    })
      .notNull()
      .default("unrated"),
    lastEvaluatedAt: timestamp("lastEvaluatedAt"),
    credentialId: varchar("credentialId", { length: 256 }), // signed credential identifier
    status: varchar("status", {
      enum: ["pending", "evaluating", "certified", "failed", "revoked"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    AgentRegistration_org_id_idx: index("AgentRegistration_org_id_idx").on(
      t.organizationId,
    ),
    AgentRegistration_trust_level_idx: index(
      "AgentRegistration_trust_level_idx",
    ).on(t.trustLevel),
    AgentRegistration_status_idx: index("AgentRegistration_status_idx").on(
      t.status,
    ),
  }),
);

export type AgentRegistration = InferSelectModel<typeof agentRegistration>;

// ---------------------------------------------------------------------------
// Marketplace / Escrow Tables
// ---------------------------------------------------------------------------

/** Marketplace task listing — an agent offering a service */
export const marketplaceTask = pgTable(
  "MarketplaceTask",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    agentId: uuid("agentId")
      .notNull()
      .references(() => agentRegistration.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 256 }).notNull(),
    description: text("description"),
    priceCredits: integer("priceCredits").notNull(), // cost in credits (cents)
    currency: varchar("currency", { length: 8 }).notNull().default("USD"),
    estimatedDurationMs: integer("estimatedDurationMs"), // expected completion time
    status: varchar("status", {
      enum: ["active", "paused", "completed", "cancelled"],
    })
      .notNull()
      .default("active"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    MarketplaceTask_agent_id_idx: index("MarketplaceTask_agent_id_idx").on(
      t.agentId,
    ),
    MarketplaceTask_status_idx: index("MarketplaceTask_status_idx").on(
      t.status,
    ),
  }),
);

export type MarketplaceTask = InferSelectModel<typeof marketplaceTask>;

/** Escrow transaction — funds held during task execution */
export const escrowTransaction = pgTable(
  "EscrowTransaction",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    taskId: uuid("taskId")
      .notNull()
      .references(() => marketplaceTask.id),
    buyerOrgId: uuid("buyerOrgId")
      .notNull()
      .references(() => organization.id),
    sellerOrgId: uuid("sellerOrgId")
      .notNull()
      .references(() => organization.id),
    amountCredits: integer("amountCredits").notNull(),
    commissionCredits: integer("commissionCredits").notNull().default(0), // platform fee
    status: varchar("status", {
      enum: ["held", "released", "refunded", "disputed"],
    })
      .notNull()
      .default("held"),
    heldAt: timestamp("heldAt").notNull().defaultNow(),
    releasedAt: timestamp("releasedAt"),
    disputeReason: text("disputeReason"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    EscrowTransaction_task_id_idx: index("EscrowTransaction_task_id_idx").on(
      t.taskId,
    ),
    EscrowTransaction_buyer_idx: index("EscrowTransaction_buyer_idx").on(
      t.buyerOrgId,
    ),
    EscrowTransaction_seller_idx: index("EscrowTransaction_seller_idx").on(
      t.sellerOrgId,
    ),
    EscrowTransaction_status_idx: index("EscrowTransaction_status_idx").on(
      t.status,
    ),
  }),
);

export type EscrowTransaction = InferSelectModel<typeof escrowTransaction>;

// ---------------------------------------------------------------------------
// Agent Service Marketplace Tables (services + transactions)
// ---------------------------------------------------------------------------

/**
 * Agent services listed on the marketplace.
 *
 * Agents register capabilities as discoverable services that other agents
 * can invoke. Pricing is stored as micro-USD (1 USD = 1_000_000 micro-USD)
 * for sub-cent granularity.
 */
export const agentService = pgTable(
  "AgentService",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Registered agent ID (Agent table) */
    agentId: text("agentId").notNull(),
    /** Owner user ID */
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Service category: research, code, data, creative, finance */
    category: text("category").notNull(),
    /** Pricing model: { model: "per_call" | "per_token" | "fixed", amount_micro_usd: number } */
    pricing: json("pricing")
      .$type<{
        model: "per_call" | "per_token" | "fixed";
        amount_micro_usd: number;
      }>()
      .notNull(),
    /** External service URL (if applicable) */
    endpoint: text("endpoint"),
    /** List of capability tags */
    capabilities: json("capabilities").$type<string[]>().default([]),
    /** Minimum trust score (0-100) required to use this service */
    trustMinimum: integer("trustMinimum").notNull().default(0),
    /** Service status: active, paused, retired */
    status: text("status").notNull().default("active"),
    /** Total number of calls served */
    callCount: integer("callCount").notNull().default(0),
    /** Total revenue earned in micro-USD */
    totalRevenue: integer("totalRevenue").notNull().default(0),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    AgentService_agent_id_idx: index("AgentService_agent_id_idx").on(t.agentId),
    AgentService_user_id_idx: index("AgentService_user_id_idx").on(t.userId),
    AgentService_category_idx: index("AgentService_category_idx").on(
      t.category,
    ),
    AgentService_status_idx: index("AgentService_status_idx").on(t.status),
  }),
);

export type AgentService = InferSelectModel<typeof agentService>;

/**
 * Marketplace transactions — records of service invocations between agents.
 */
export const marketplaceTransaction = pgTable(
  "MarketplaceTransaction",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    serviceId: text("serviceId").notNull(),
    buyerAgentId: text("buyerAgentId").notNull(),
    sellerAgentId: text("sellerAgentId").notNull(),
    /** Amount charged in micro-USD */
    amountMicroUsd: integer("amountMicroUsd").notNull(),
    /** Platform facilitator fee in micro-USD */
    facilitatorFeeMicroUsd: integer("facilitatorFeeMicroUsd")
      .notNull()
      .default(0),
    /** Transaction status: pending, completed, failed, disputed */
    status: text("status").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    completedAt: timestamp("completedAt"),
  },
  (t) => ({
    MarketplaceTransaction_service_id_idx: index(
      "MarketplaceTransaction_service_id_idx",
    ).on(t.serviceId),
    MarketplaceTransaction_buyer_idx: index(
      "MarketplaceTransaction_buyer_idx",
    ).on(t.buyerAgentId),
    MarketplaceTransaction_seller_idx: index(
      "MarketplaceTransaction_seller_idx",
    ).on(t.sellerAgentId),
    MarketplaceTransaction_status_idx: index(
      "MarketplaceTransaction_status_idx",
    ).on(t.status),
  }),
);

export type MarketplaceTransaction = InferSelectModel<
  typeof marketplaceTransaction
>;

// ─── BRO-228: Tenant Admin Portal tables ──────────────────────────────────────

/**
 * Per-org RBAC capability overrides for Arcan (BRO-228 — Capability Policy).
 *
 * Enterprise admins can configure which Arcan capability strings are
 * allow-listed for each named role. When present, these override arcand's
 * built-in tier defaults for sessions belonging to that org.
 */
export const organizationArcanRole = pgTable(
  "OrganizationArcanRole",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Role name matching the Better Auth / tenant role (e.g. "admin", "member"). */
    roleName: varchar("roleName", { length: 128 }).notNull(),
    /** JSON array of Arcan capability strings, e.g. ["*"] or ["exec:cmd:ls"]. */
    allowCapabilities: json("allowCapabilities")
      .notNull()
      .$type<string[]>()
      .default([]),
    /** Max events allowed per agent turn for this role. */
    maxEventsPerTurn: integer("maxEventsPerTurn").notNull().default(20),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    OrgArcanRole_org_idx: index("OrgArcanRole_org_idx").on(t.organizationId),
    OrgArcanRole_org_role_unique: uniqueIndex(
      "OrgArcanRole_org_role_unique",
    ).on(t.organizationId, t.roleName),
  }),
);

export type OrganizationArcanRole = InferSelectModel<
  typeof organizationArcanRole
>;

/**
 * Custom SKILL.md manifests uploaded by enterprise org admins (BRO-228).
 *
 * Manifests are stored as raw TOML text, validated server-side before saving.
 * Skills are assigned to specific roles within the org.
 */
export const organizationCustomSkill = pgTable(
  "OrganizationCustomSkill",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Unique skill name within the org (from TOML `[skill] name`). */
    name: varchar("name", { length: 256 }).notNull(),
    /** Raw TOML content of the SKILL.md manifest. */
    manifestToml: text("manifestToml").notNull(),
    /** Role names allowed to use this skill. Empty = all roles. */
    assignedRoles: json("assignedRoles")
      .notNull()
      .$type<string[]>()
      .default([]),
    /** Whether the skill is active (false = staged/draft). */
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    OrgCustomSkill_org_idx: index("OrgCustomSkill_org_idx").on(
      t.organizationId,
    ),
    OrgCustomSkill_org_name_unique: uniqueIndex(
      "OrgCustomSkill_org_name_unique",
    ).on(t.organizationId, t.name),
  }),
);

export type OrganizationCustomSkill = InferSelectModel<
  typeof organizationCustomSkill
>;

/**
 * Private MCP servers registered by enterprise org admins (BRO-226 / BRO-228).
 *
 * URL and bearer token are encrypted at rest. The server is injected into
 * Arcan sessions for org members whose role is in `assignedRoles`.
 */
export const organizationMcpServer = pgTable(
  "OrganizationMcpServer",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Logical server name (matches SKILL.md `mcp_servers[].name`). */
    name: varchar("name", { length: 256 }).notNull(),
    /** MCP server URL — encrypted at rest. */
    url: encryptedText("url").notNull(),
    /** Auth bearer token or API key — encrypted at rest. Null for public servers. */
    bearerToken: encryptedText("bearerToken"),
    /** Role names allowed to use this server. Empty = all org roles. */
    assignedRoles: json("assignedRoles")
      .notNull()
      .$type<string[]>()
      .default([]),
    /** Whether the server is active. */
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    OrgMcpServer_org_idx: index("OrgMcpServer_org_idx").on(t.organizationId),
    OrgMcpServer_org_name_unique: uniqueIndex(
      "OrgMcpServer_org_name_unique",
    ).on(t.organizationId, t.name),
  }),
);

export type OrganizationMcpServer = InferSelectModel<
  typeof organizationMcpServer
>;

// ---------------------------------------------------------------------------
// Sandbox Tables (BRO-261)
// ---------------------------------------------------------------------------

/** Live state of a sandbox execution environment managed by arcand. */
export const sandboxInstance = pgTable(
  "SandboxInstance",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    /** Owning organization. Null for personal (user-scoped) sandboxes. */
    organizationId: uuid("organizationId").references(() => organization.id, {
      onDelete: "cascade",
    }),
    /** The registered agent that owns this sandbox. Null for ad-hoc sandboxes. */
    agentId: uuid("agentId").references(() => agentRegistration.id, {
      onDelete: "set null",
    }),
    /** Provider-assigned sandbox ID (e.g. Vercel sandbox name, e2b sandbox id). */
    sandboxId: varchar("sandboxId", { length: 256 }).notNull().unique(),
    /** Arcan session ID that created this sandbox. */
    sessionId: varchar("sessionId", { length: 256 }),
    /** Backend provider: vercel, e2b, local. */
    provider: varchar("provider", {
      enum: ["vercel", "e2b", "local"],
      length: 32,
    }).notNull(),
    /** Current lifecycle status. */
    status: varchar("status", {
      enum: ["starting", "running", "snapshotted", "stopped", "failed"],
      length: 32,
    })
      .notNull()
      .default("starting"),
    /** vCPUs allocated. Null = provider default. */
    vcpus: integer("vcpus"),
    /** Memory in MB. Null = provider default. */
    memoryMb: integer("memoryMb"),
    /** Whether the sandbox auto-snapshots on session end. */
    persistent: boolean("persistent").notNull().default(false),
    /** Last time a command was executed in this sandbox. */
    lastExecAt: timestamp("lastExecAt"),
    /** Total number of commands executed. */
    execCount: integer("execCount").notNull().default(0),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    SandboxInstance_org_idx: index("SandboxInstance_org_idx").on(
      t.organizationId,
    ),
    SandboxInstance_agent_idx: index("SandboxInstance_agent_idx").on(t.agentId),
    SandboxInstance_status_idx: index("SandboxInstance_status_idx").on(
      t.status,
    ),
    SandboxInstance_provider_idx: index("SandboxInstance_provider_idx").on(
      t.provider,
    ),
  }),
);

export type SandboxInstance = InferSelectModel<typeof sandboxInstance>;

/** Point-in-time filesystem snapshot of a sandbox. */
export const sandboxSnapshot = pgTable(
  "SandboxSnapshot",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    sandboxInstanceId: uuid("sandboxInstanceId")
      .notNull()
      .references(() => sandboxInstance.id, { onDelete: "cascade" }),
    /** Provider-assigned snapshot ID. */
    snapshotId: varchar("snapshotId", { length: 256 }).notNull(),
    /** What triggered this snapshot. */
    trigger: varchar("trigger", {
      enum: ["idle_reaper", "manual", "session_end", "api"],
      length: 32,
    }).notNull(),
    /** Snapshot size in bytes. Null = not yet known. */
    sizeBytes: integer("sizeBytes"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    SandboxSnapshot_instance_idx: index("SandboxSnapshot_instance_idx").on(
      t.sandboxInstanceId,
    ),
  }),
);

export type SandboxSnapshot = InferSelectModel<typeof sandboxSnapshot>;

// ── Relay ─────────────────────────────────────────────────────────────────

/** Relay node — a user's machine running the relayd daemon. */
export const relayNode = pgTable(
  "RelayNode",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Display name (defaults to hostname). */
    name: varchar("name", { length: 128 }).notNull(),
    /** Machine hostname. */
    hostname: varchar("hostname", { length: 256 }),
    /** Connection status. */
    status: varchar("status", {
      enum: ["online", "offline", "degraded"],
      length: 16,
    })
      .notNull()
      .default("offline"),
    lastSeenAt: timestamp("lastSeenAt"),
    /** Supported session types (e.g. ["claude-code","arcan","codex"]). */
    capabilities: json("capabilities").$type<string[]>().default([]),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    RelayNode_user_idx: index("RelayNode_user_idx").on(t.userId),
    RelayNode_status_idx: index("RelayNode_status_idx").on(t.status),
  }),
);

export type RelayNode = InferSelectModel<typeof relayNode>;

/** Relay session — an agent session accessible via relay. */
export const relaySession = pgTable(
  "RelaySession",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    nodeId: uuid("nodeId")
      .notNull()
      .references(() => relayNode.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Agent runtime type. */
    sessionType: varchar("sessionType", {
      enum: ["arcan", "claude-code", "codex"],
      length: 32,
    }).notNull(),
    /** Lifecycle status. */
    status: varchar("status", {
      enum: ["active", "idle", "completed", "failed"],
      length: 16,
    })
      .notNull()
      .default("active"),
    /** Display name for the session. */
    name: varchar("name", { length: 256 }),
    /** Working directory on the remote machine. */
    workdir: varchar("workdir", { length: 1024 }),
    /** Remote session identifier (Arcan session_id or tmux session name). */
    remoteSessionId: varchar("remoteSessionId", { length: 256 }),
    /** Last received output sequence number (for resumability). */
    lastSequence: integer("lastSequence").notNull().default(0),
    /** Model currently in use. */
    model: varchar("model", { length: 128 }),
    /** Claude Code's internal session ID (for loading conversation history). */
    claudeSessionId: varchar("claudeSessionId", { length: 256 }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    RelaySession_node_idx: index("RelaySession_node_idx").on(t.nodeId),
    RelaySession_user_idx: index("RelaySession_user_idx").on(t.userId),
    RelaySession_status_idx: index("RelaySession_status_idx").on(t.status),
  }),
);

export type RelaySession = InferSelectModel<typeof relaySession>;

// ---------------------------------------------------------------------------
// LIFE RUNTIME PLATFORM (BRO-846)
// ---------------------------------------------------------------------------
// User-facing /life/[project] surface. Every Life project (Broomva-owned,
// user-owned, or org-owned) is a row in LifeProject. Rules packages live
// in LifeRulesVersion (git-style parent pointer). Runs in LifeRun + its
// event log in LifeRunEvent. Module types are a registry in LifeModuleType.
// BYOK provider keys in LifeByokKey (encrypted at rest via encryptedText).
// ---------------------------------------------------------------------------

/** Registry of runner implementations. Each LifeProject references one. */
export const lifeModuleType = pgTable("LifeModuleType", {
  /** e.g. 'sentinel-property-ops', 'materiales-intel', 'generic-rules-runner', 'module-builder' */
  id: varchar("id", { length: 128 }).primaryKey().notNull(),
  version: varchar("version", { length: 32 }).notNull(),
  displayName: varchar("displayName", { length: 256 }).notNull(),
  description: text("description"),
  /** npm package name where the runner implementation lives */
  runnerRef: varchar("runnerRef", { length: 128 }).notNull(),
  /** JSON Schema for the input shape */
  inputSchema: json("inputSchema").notNull(),
  /** JSON Schema for the output shape */
  outputSchema: json("outputSchema").notNull(),
  /** Array of tool names the runner requires (['web_search'], etc.) */
  requiredTools: json("requiredTools").notNull().default(sql`'[]'::jsonb`),
  defaultUi: varchar("defaultUi", { length: 128 })
    .notNull()
    .default("life-interface-classic"),
  /** { avgCents, p95Cents } */
  costEstimateCents: json("costEstimateCents")
    .notNull()
    .default(sql`'{"avg":10,"p95":30}'::jsonb`),
  status: varchar("status", {
    length: 32,
    enum: ["active", "deprecated"],
  })
    .notNull()
    .default("active"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type LifeModuleType = InferSelectModel<typeof lifeModuleType>;

/** Platform-reserved slugs, blocks user claims on /life/<slug>. */
export const lifeReservedSlug = pgTable("LifeReservedSlug", {
  slug: varchar("slug", { length: 64 }).primaryKey().notNull(),
  reason: varchar("reason", { length: 128 })
    .notNull()
    .default("platform-reserved"),
});

export type LifeReservedSlug = InferSelectModel<typeof lifeReservedSlug>;

/**
 * One row per Life project.
 * Slug is global; `@handle/slug` URL form is app-layer convention.
 * ownerKind='platform' + ownerId='platform' marks Broomva-owned projects (sentinel, materiales).
 */
export const lifeProject = pgTable(
  "LifeProject",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    slug: varchar("slug", { length: 128 }).notNull().unique(),
    displayName: varchar("displayName", { length: 256 }).notNull(),
    description: text("description"),
    /** 'user' | 'org' | 'platform' */
    ownerKind: varchar("ownerKind", {
      length: 16,
      enum: ["user", "org", "platform"],
    }).notNull(),
    /** userId | orgId | 'platform' */
    ownerId: varchar("ownerId", { length: 256 }).notNull(),
    moduleTypeId: varchar("moduleTypeId", { length: 128 })
      .notNull()
      .references(() => lifeModuleType.id),
    /** Pointer to the HEAD of the rules version tree. Nullable while draft. */
    currentRulesVersionId: uuid("currentRulesVersionId"),
    visibility: varchar("visibility", {
      length: 32,
      enum: ["private", "unlisted", "public"],
    })
      .notNull()
      .default("private"),
    /**
     * Pricing config. null = free. Shape:
     * { model: 'per_run'|'per_token'|'tiered'|'free', rail, consumerPriceCents,
     *   maxCostCents, creatorSharePct, platformFeePct, creatorSubsidyCents,
     *   freeRunsPerMonthPerConsumer, currency }
     */
    pricing: json("pricing"),
    /** 'platform' | 'creator_byok' | 'consumer_byok' */
    secretsMode: varchar("secretsMode", {
      length: 32,
      enum: ["platform", "creator_byok", "consumer_byok"],
    })
      .notNull()
      .default("platform"),
    status: varchar("status", {
      length: 32,
      enum: ["draft", "active", "suspended", "archived"],
    })
      .notNull()
      .default("draft"),
    safetyFlags: json("safetyFlags").notNull().default(sql`'{}'::jsonb`),
    /** Denormalized counters: { totalRuns, lastRunAt, avgCostCents } */
    stats: json("stats").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    LifeProject_owner_idx: index("LifeProject_owner_idx").on(
      t.ownerKind,
      t.ownerId,
    ),
    LifeProject_visibility_idx: index("LifeProject_visibility_idx").on(
      t.visibility,
      t.status,
    ),
    LifeProject_module_idx: index("LifeProject_module_idx").on(t.moduleTypeId),
  }),
);

export type LifeProject = InferSelectModel<typeof lifeProject>;

/** Versioned rules payload. Parent pointer supports revert/branch. */
export const lifeRulesVersion = pgTable(
  "LifeRulesVersion",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => lifeProject.id, { onDelete: "cascade" }),
    /** Full RulesPackage JSON (taxonomy, sources, rules, prompts, policy, schemas) */
    rulesJson: json("rulesJson").notNull(),
    semver: varchar("semver", { length: 32 }).notNull(),
    parentId: uuid("parentId"),
    createdByUserId: text("createdByUserId"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    LifeRulesVersion_project_idx: index("LifeRulesVersion_project_idx").on(
      t.projectId,
      t.createdAt,
    ),
    LifeRulesVersion_parent_fk: foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id],
      name: "LifeRulesVersion_parentId_fk",
    }),
  }),
);

export type LifeRulesVersion = InferSelectModel<typeof lifeRulesVersion>;

/** BYOK provider keys, encrypted at rest. Runtime decrypts via KMS. */
export const lifeByokKey = pgTable(
  "LifeByokKey",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    ownerKind: varchar("ownerKind", {
      length: 16,
      enum: ["user", "org"],
    }).notNull(),
    ownerId: varchar("ownerId", { length: 256 }).notNull(),
    provider: varchar("provider", {
      length: 32,
      enum: ["anthropic", "openai", "google", "vercel-gateway"],
    }).notNull(),
    label: varchar("label", { length: 128 }).notNull(),
    /** Ciphertext. Decrypt via platform KMS. */
    encryptedPayload: encryptedText("encryptedPayload").notNull(),
    /** Last 4 chars of raw key for UI identification */
    keyHint: varchar("keyHint", { length: 16 }),
    /**
     * 'internal' = creator uses this in their own projects only.
     * 'public' = exposed to consumers when project.secretsMode='creator_byok'.
     */
    scope: varchar("scope", {
      length: 32,
      enum: ["internal", "public"],
    })
      .notNull()
      .default("internal"),
    status: varchar("status", {
      length: 32,
      enum: ["active", "revoked", "invalid"],
    })
      .notNull()
      .default("active"),
    lastUsedAt: timestamp("lastUsedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    LifeByokKey_owner_idx: index("LifeByokKey_owner_idx").on(
      t.ownerKind,
      t.ownerId,
      t.status,
    ),
  }),
);

export type LifeByokKey = InferSelectModel<typeof lifeByokKey>;

/**
 * A conversation thread attached to a Life project. Groups one or more
 * LifeRuns (user-turns) so multi-turn agent sessions have history.
 * Anon sessions key by cookie id; authed sessions by userId.
 */
export const lifeSession = pgTable(
  "LifeSession",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => lifeProject.id, { onDelete: "cascade" }),
    /**
     * 'user' | 'anon' | 'agent'
     *
     * Widened from the original ('user' | 'anon') so x402 wallet
     * callers and the auth-less fallback (both use kind='agent')
     * can also own LifeSessions and be persisted + rehydrated via
     * /api/life/run/[project]/session/[id]/state.
     *
     * The DB column is plain VARCHAR(16) with no CHECK constraint —
     * widening the enum is TypeScript-only; no migration required.
     */
    consumerKind: varchar("consumerKind", {
      length: 16,
      enum: ["user", "anon", "agent"],
    }).notNull(),
    consumerId: varchar("consumerId", { length: 256 }).notNull(),
    /** Optional org context for authed sessions. */
    organizationId: uuid("organizationId").references(() => organization.id, {
      onDelete: "set null",
    }),
    /**
     * Optional link to a `Chat` row. Populated only for `consumerKind === 'user'`
     * (Chat.userId is NOT NULL + FKs to `user(id)`, so anon/agent consumers can't
     * have one). When present, the Chat row carries thread-level metadata
     * (title, pinning, visibility, sharing) and surfaces the Life session in the
     * existing chat sidebar. When absent, the session is still fully persisted
     * via `LifeRunEvent` and rehydratable via the localStorage cursor.
     *
     * ON DELETE SET NULL: deleting a Chat must never cascade-delete the Life run
     * history. Chat is metadata; `LifeRunEvent` is the source of truth.
     */
    chatId: uuid("chatId").references(() => chat.id, {
      onDelete: "set null",
    }),
    /**
     * Serialised `VmHandle` for this session's kernel VM (see
     * `lib/life-runtime/kernel/types.ts::VmHandle`). Nullable because existing
     * sessions predate kernel-client integration; populated on the first turn
     * that dispatches through `KernelClient.createVm` and reused on subsequent
     * turns. Stored as Postgres `json` (matching the rest of the schema's
     * `json(…)` columns); a future migration can flip to `jsonb` if we need
     * to index on `backend` / `status` without rewriting callers.
     *
     * Today (Phase A/B with `InProcessKernelClient`) this is a free-form record
     * of the VM identity — no backend resources are held across turns. When
     * `LifedHttpKernelClient` ships (Phase D), this handle is how we reattach
     * to a long-running `lifed` VM across Vercel function cold starts.
     */
    kernelVmHandleJson: json("kernelVmHandleJson"),
    title: varchar("title", { length: 256 }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    LifeSession_project_idx: index("LifeSession_project_idx").on(
      t.projectId,
      t.updatedAt,
    ),
    LifeSession_consumer_idx: index("LifeSession_consumer_idx").on(
      t.consumerKind,
      t.consumerId,
    ),
    LifeSession_chat_idx: index("LifeSession_chat_idx").on(t.chatId),
  }),
);

export type LifeSession = InferSelectModel<typeof lifeSession>;

/**
 * One row per execution. Cost columns are all in USD cents.
 * paymentMode: 'credits' | 'x402' | 'haima_balance' | 'byok' | 'free_tier'.
 */
export const lifeRun = pgTable(
  "LifeRun",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => lifeProject.id, { onDelete: "restrict" }),
    /** Groups turns into a conversation. Nullable for back-compat. */
    sessionId: uuid("sessionId").references(() => lifeSession.id, {
      onDelete: "cascade",
    }),
    /** Shorthand text of the user message that started this turn. */
    inputText: text("inputText"),
    rulesVersionId: uuid("rulesVersionId")
      .notNull()
      .references(() => lifeRulesVersion.id),
    /** 'user' | 'anon' | 'agent' */
    consumerKind: varchar("consumerKind", {
      length: 16,
      enum: ["user", "anon", "agent"],
    }).notNull(),
    /** userId | anon session id | wallet address */
    consumerId: varchar("consumerId", { length: 256 }).notNull(),
    /** Null for anon/agent; present for credits-debit path */
    organizationId: uuid("organizationId").references(() => organization.id, {
      onDelete: "set null",
    }),
    input: json("input").notNull(),
    output: json("output"),
    status: varchar("status", {
      length: 32,
      enum: [
        "queued",
        "streaming",
        "succeeded",
        "failed",
        "refunded",
        "cancelled",
      ],
    })
      .notNull()
      .default("queued"),
    errorReason: text("errorReason"),
    // cost accounting (USD cents)
    llmCostCents: integer("llmCostCents").notNull().default(0),
    platformFeeCents: integer("platformFeeCents").notNull().default(0),
    creatorFeeCents: integer("creatorFeeCents").notNull().default(0),
    consumerPaidCents: integer("consumerPaidCents").notNull().default(0),
    // payment source
    paymentMode: varchar("paymentMode", {
      length: 32,
      enum: ["credits", "x402", "haima_balance", "byok", "free_tier"],
    })
      .notNull()
      .default("credits"),
    paymentRail: varchar("paymentRail", { length: 32 }),
    paymentTxId: varchar("paymentTxId", { length: 256 }),
    // model identity
    model: varchar("model", { length: 128 }),
    provider: varchar("provider", { length: 32 }),
    byokKeyId: uuid("byokKeyId").references(() => lifeByokKey.id),
    // timing
    startedAt: timestamp("startedAt"),
    finishedAt: timestamp("finishedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    LifeRun_project_idx: index("LifeRun_project_idx").on(
      t.projectId,
      t.createdAt,
    ),
    LifeRun_consumer_idx: index("LifeRun_consumer_idx").on(
      t.consumerKind,
      t.consumerId,
    ),
    LifeRun_status_idx: index("LifeRun_status_idx").on(t.status),
    LifeRun_org_idx: index("LifeRun_org_idx").on(t.organizationId),
  }),
);

export type LifeRun = InferSelectModel<typeof lifeRun>;

/** Append-only event log per run. Feeds SSE streaming + replay. */
export const lifeRunEvent = pgTable(
  "LifeRunEvent",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    runId: uuid("runId")
      .notNull()
      .references(() => lifeRun.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    /** 'thinking_start' | 'thinking_delta' | 'tool_call' | 'tool_result' | 'output_delta' | 'fs_op' | 'nous_score' | 'error' | 'done' | ... */
    type: varchar("type", { length: 64 }).notNull(),
    payload: json("payload").notNull().default(sql`'{}'::jsonb`),
    at: timestamp("at").notNull().defaultNow(),
  },
  (t) => ({
    LifeRunEvent_run_seq_uq: uniqueIndex("LifeRunEvent_run_seq_uq").on(
      t.runId,
      t.seq,
    ),
  }),
);

export type LifeRunEvent = InferSelectModel<typeof lifeRunEvent>;

/**
 * Periodic scene snapshot for bounded replay. Captures the full Scene
 * tree + signal cache at a specific envelope seq so long sessions don't
 * have to replay every event on page load. See
 * `docs/superpowers/specs/2026-04-24-life-session-persistence.md` for
 * the full architecture (Layer 3 snapshot policy, Phase 4 cadence).
 *
 * The event log stays authoritative — snapshots are a read-side
 * optimization only. Regenerating from events MUST produce the same
 * scene + signals.
 */
export const lifeRunSnapshot = pgTable(
  "LifeRunSnapshot",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    sessionId: uuid("sessionId")
      .notNull()
      .references(() => lifeSession.id, { onDelete: "cascade" }),
    runId: uuid("runId")
      .notNull()
      .references(() => lifeRun.id, { onDelete: "cascade" }),
    /** Snapshot is accurate up to and INCLUDING this envelope seq. */
    atEventSeq: integer("atEventSeq").notNull(),
    sceneJson: json("sceneJson").notNull(),
    signalsJson: json("signalsJson").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    LifeRunSnapshot_session_seq_idx: index(
      "LifeRunSnapshot_session_seq_idx",
    ).on(t.sessionId, t.atEventSeq),
  }),
);

export type LifeRunSnapshot = InferSelectModel<typeof lifeRunSnapshot>;

/**
 * Project-level persistent filesystem. Artifacts written by the agent
 * that survive across all sessions for this project — the agent's
 * long-term memory for this workspace. Written by the `persist` tool
 * (future Phase 5) or promoted from a session file.
 */
export const lifeProjectFile = pgTable(
  "LifeProjectFile",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => lifeProject.id, { onDelete: "cascade" }),
    /** Virtual path within the project, e.g. "notes/audit-2026-04.md". */
    path: varchar("path", { length: 1024 }).notNull(),
    /** Content hash (sha256 hex) — matches the Vercel Blob object. */
    blobSha: varchar("blobSha", { length: 64 }).notNull(),
    /** Stable Vercel Blob URL. */
    blobUrl: text("blobUrl").notNull(),
    sizeBytes: integer("sizeBytes").notNull(),
    mime: varchar("mime", { length: 128 }),
    /** Consumer id of the writer (user.id, anon-session id, or wallet). */
    writtenBy: varchar("writtenBy", { length: 256 }).notNull(),
    /** Origin session — nullable after session deletion for audit. */
    sessionId: uuid("sessionId").references(() => lifeSession.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    LifeProjectFile_project_path_uq: uniqueIndex(
      "LifeProjectFile_project_path_uq",
    ).on(t.projectId, t.path),
    LifeProjectFile_written_by_idx: index("LifeProjectFile_written_by_idx").on(
      t.writtenBy,
    ),
  }),
);

export type LifeProjectFile = InferSelectModel<typeof lifeProjectFile>;

/**
 * Session-level ephemeral filesystem. Scratch space during a thread —
 * the agent's working memory. Cascades on session delete. A session
 * file promoted to project level is duplicated into LifeProjectFile;
 * the session row stays for transcript fidelity.
 */
export const lifeSessionFile = pgTable(
  "LifeSessionFile",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    sessionId: uuid("sessionId")
      .notNull()
      .references(() => lifeSession.id, { onDelete: "cascade" }),
    path: varchar("path", { length: 1024 }).notNull(),
    blobSha: varchar("blobSha", { length: 64 }).notNull(),
    blobUrl: text("blobUrl").notNull(),
    sizeBytes: integer("sizeBytes").notNull(),
    mime: varchar("mime", { length: 128 }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    LifeSessionFile_session_path_uq: uniqueIndex(
      "LifeSessionFile_session_path_uq",
    ).on(t.sessionId, t.path),
  }),
);

export type LifeSessionFile = InferSelectModel<typeof lifeSessionFile>;

export const schema = { user, session, account, verification };
