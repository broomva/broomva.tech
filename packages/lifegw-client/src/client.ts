import {
  createPromiseClient,
  type Interceptor,
  type PromiseClient,
} from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { createConnectTransport as createWebTransport } from "@connectrpc/connect-web";

import { Agent } from "./gen/life/v1/agent_connect.js";
import { Events } from "./gen/life/v1/events_connect.js";
import { Identity } from "./gen/life/v1/identity_connect.js";
import { Wallet } from "./gen/life/v1/wallet_connect.js";

import type { TokenProvider } from "./auth.js";

export type { TokenProvider } from "./auth.js";

export interface BrowserClientOptions {
  /** Base URL for unary RPCs, proxied through Next.js (e.g. /api/life-proxy). */
  proxyBaseUrl: string;
  /** Base URL for WebSocket streaming (e.g. wss://life.broomva.tech). */
  wsBaseUrl: string;
  /** Token provider — called once per unary RPC and once per WS open. */
  getToken: TokenProvider;
}

export interface ServerClientOptions {
  /** Direct base URL for gRPC (e.g. http://lifed.internal:8081). */
  baseUrl: string;
  /** Token provider — called once per RPC. */
  getToken: TokenProvider;
}

export interface LifegwClient {
  agent: PromiseClient<typeof Agent>;
  events: PromiseClient<typeof Events>;
  identity: PromiseClient<typeof Identity>;
  wallet: PromiseClient<typeof Wallet>;
}

/**
 * Create a client that runs in a browser. Unary RPCs go through the Next.js
 * proxy; streaming RPCs use the WebSocket URL directly (handled separately by
 * call sites that need bidi streams).
 */
export function createBrowserClient(opts: BrowserClientOptions): LifegwClient {
  const transport = createWebTransport({
    baseUrl: opts.proxyBaseUrl,
    interceptors: [authInterceptor(opts.getToken)],
  });
  return {
    agent: createPromiseClient(Agent, transport),
    events: createPromiseClient(Events, transport),
    identity: createPromiseClient(Identity, transport),
    wallet: createPromiseClient(Wallet, transport),
  };
}

/** Create a client for use in Node (Next.js Server Actions, Route Handlers). */
export function createServerClient(opts: ServerClientOptions): LifegwClient {
  const transport = createGrpcTransport({
    baseUrl: opts.baseUrl,
    interceptors: [authInterceptor(opts.getToken)],
  });
  return {
    agent: createPromiseClient(Agent, transport),
    events: createPromiseClient(Events, transport),
    identity: createPromiseClient(Identity, transport),
    wallet: createPromiseClient(Wallet, transport),
  };
}

/** Connect interceptor that attaches a fresh JWT to every RPC. */
function authInterceptor(getToken: TokenProvider): Interceptor {
  return (next) => async (req) => {
    const token = await getToken();
    req.header.set("Authorization", `Bearer ${token}`);
    return next(req);
  };
}
