/**
 * Typed event catalog — BRO-205
 *
 * Single source of truth for all 20 tracked events.
 * Import and use these constants instead of string literals.
 */

// ── Auth ──────────────────────────────────────────────────────────────────────
export const EVENT_USER_SIGNED_UP = "user_signed_up";
export const EVENT_USER_LOGGED_IN = "user_logged_in";
export const EVENT_USER_LOGGED_OUT = "user_logged_out";

// ── Onboarding ────────────────────────────────────────────────────────────────
export const EVENT_ONBOARDING_STARTED = "onboarding_started";
export const EVENT_ORG_CREATED = "org_created";
export const EVENT_ORG_SKIPPED = "org_skipped";
export const EVENT_PLAN_SELECTED = "plan_selected";

// ── Chat ──────────────────────────────────────────────────────────────────────
export const EVENT_CHAT_STARTED = "chat_started";
export const EVENT_MESSAGE_SENT = "message_sent";
export const EVENT_MODEL_SELECTED = "model_selected";
export const EVENT_TOOL_USED = "tool_used";

// ── Billing ───────────────────────────────────────────────────────────────────
export const EVENT_CHECKOUT_STARTED = "checkout_started";
export const EVENT_SUBSCRIPTION_CREATED = "subscription_created";
export const EVENT_SUBSCRIPTION_UPGRADED = "subscription_upgraded";
export const EVENT_SUBSCRIPTION_CANCELLED = "subscription_cancelled";
export const EVENT_CREDITS_EXHAUSTED = "credits_exhausted";

// ── Marketplace ───────────────────────────────────────────────────────────────
export const EVENT_AGENT_REGISTERED = "agent_registered";
export const EVENT_AGENT_DISCOVERED = "agent_discovered";
export const EVENT_ESCROW_CREATED = "escrow_created";

// ── Console / Platform ────────────────────────────────────────────────────────
export const EVENT_CONSOLE_PAGE_VIEWED = "console_page_viewed";
export const EVENT_DEPLOYMENT_PROVISIONED = "deployment_provisioned";
