/**
 * Barrel export for the lago-auth Agent JWT verifier.
 *
 * TypeScript port of `crates/lago/lago-auth/src/agent_jwt.rs` from
 * broomva/core/life (commit `944f2ba9`). Mounted on `/api/v1/*` only
 * (BRO-1217); existing routes keep Better Auth.
 */

export {
  type AgentJwtAlg,
  detectAlg,
  extractKid,
  JwtError,
  type VerifiedAgentJwt,
  verifyJwt,
} from "./verify-jwt";

export {
  type AuthAlg,
  type DidResolution,
  DidKeyError,
  resolveDidKey,
} from "./did-key";

export {
  type DidRotation,
  EmptyJournal,
  type JournalResolver,
  type RotationChainQuery,
  walkRotationChain,
} from "./rotation-chain";

export {
  LifegwJournalResolver,
  type LifegwJournalResolverConfig,
} from "./jwks-cache";

export {
  type VerifiedRouteHandler,
  withVerifiedAuth,
  type WithVerifiedAuthConfig,
} from "./with-verified-auth";
