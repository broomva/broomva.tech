// @broomva/lifegw-client — typed clients for life.v1.* services.

export {
  type BrowserClientOptions,
  type LifegwClient,
  type ServerClientOptions,
  createBrowserClient,
  createServerClient,
} from "./client.js";

export {
  type TokenProvider,
  cachedTokenProvider,
  staticTokenProvider,
} from "./auth.js";

// Re-export proto-generated service descriptors so consumers don't import
// from ./gen directly.
export { Agent } from "./gen/life/v1/agent_connect.js";
export { Events } from "./gen/life/v1/events_connect.js";
export { Identity } from "./gen/life/v1/identity_connect.js";
export { Wallet } from "./gen/life/v1/wallet_connect.js";

// Re-export message types (proto-generated structs) under namespaces.
export * as agentPb from "./gen/life/v1/agent_pb.js";
export * as eventsPb from "./gen/life/v1/events_pb.js";
export * as identityPb from "./gen/life/v1/identity_pb.js";
export * as walletPb from "./gen/life/v1/wallet_pb.js";
