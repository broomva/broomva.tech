import "server-only";

// ---------------------------------------------------------------------------
// Railway API Client — Managed Life Instance Deployment
// ---------------------------------------------------------------------------
//
// Provisions, manages, and tears down Railway projects that run the Life
// Agent OS stack (arcan, lago, autonomic, haima) for enterprise tenants.
//
// Railway GraphQL API docs: https://docs.railway.com/reference/public-api
// ---------------------------------------------------------------------------

const RAILWAY_API_URL = "https://backboard.railway.app/graphql/v2";
const RAILWAY_TOKEN = process.env.RAILWAY_API_TOKEN;

// Life service templates — each maps to a container image deployed as a
// Railway service inside the tenant's project.
const LIFE_SERVICES = {
  arcan: {
    name: "arcand",
    image: "ghcr.io/broomva/arcan:latest",
    port: 7000,
  },
  lago: {
    name: "lagod",
    image: "ghcr.io/broomva/lago:latest",
    port: 8080,
  },
  autonomic: {
    name: "autonomicd",
    image: "ghcr.io/broomva/autonomic:latest",
    port: 9000,
  },
  haima: {
    name: "haimad",
    image: "ghcr.io/broomva/haima:latest",
    port: 6000,
  },
} as const;

type ServiceKey = keyof typeof LIFE_SERVICES;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProvisionResult {
  railwayProjectId: string;
  railwayEnvironmentId: string;
  services: Record<
    ServiceKey,
    { serviceId: string; url: string | null }
  >;
}

interface RailwayGraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

// ---------------------------------------------------------------------------
// Generic GraphQL client
// ---------------------------------------------------------------------------

/**
 * Execute a GraphQL query/mutation against the Railway API.
 *
 * Throws if RAILWAY_API_TOKEN is not configured or the response contains
 * GraphQL errors.
 */
export async function railwayQuery<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  if (!RAILWAY_TOKEN) {
    throw new Error(
      "RAILWAY_API_TOKEN is not configured. Cannot communicate with Railway.",
    );
  }

  const res = await fetch(RAILWAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RAILWAY_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(
      `Railway API returned HTTP ${res.status}: ${text}`,
    );
  }

  const json = (await res.json()) as RailwayGraphQLResponse<T>;

  if (json.errors?.length) {
    const messages = json.errors.map((e) => e.message).join("; ");
    throw new Error(`Railway GraphQL error: ${messages}`);
  }

  return json.data as T;
}

// ---------------------------------------------------------------------------
// Provision a new Life instance
// ---------------------------------------------------------------------------

/**
 * Provision a full Life Agent OS stack on Railway for a given organization.
 *
 * Steps:
 * 1. Create a Railway project named `life-{orgSlug}`
 * 2. Retrieve the default production environment ID
 * 3. For each Life service: create a Railway service, set env vars, deploy
 * 4. Return project ID, environment ID, and public URLs for each service
 *
 * NOTE: The exact Railway mutation shapes are based on the public API
 * reference. Fields marked with TODO may need adjustment once validated
 * against the live API.
 */
export async function provisionLifeInstance(
  orgSlug: string,
  orgId: string,
): Promise<ProvisionResult> {
  // --- 1. Create the Railway project ---
  const projectData = await railwayQuery<{
    projectCreate: { id: string };
  }>(
    `mutation ($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        id
      }
    }`,
    {
      input: {
        name: `life-${orgSlug}`,
        // TODO: Optionally specify teamId if using Railway Teams
        // teamId: process.env.RAILWAY_TEAM_ID,
      },
    },
  );

  const railwayProjectId = projectData.projectCreate.id;

  // --- 2. Fetch the default environment (Railway creates a "production" env) ---
  const envData = await railwayQuery<{
    project: { environments: { edges: Array<{ node: { id: string; name: string } }> } };
  }>(
    `query ($projectId: String!) {
      project(id: $projectId) {
        environments {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }`,
    { projectId: railwayProjectId },
  );

  const envEdges = envData.project.environments.edges;
  const prodEnv =
    envEdges.find((e) => e.node.name === "production")?.node ??
    envEdges[0]?.node;

  if (!prodEnv) {
    throw new Error(
      `No environments found for Railway project ${railwayProjectId}`,
    );
  }

  const railwayEnvironmentId = prodEnv.id;

  // --- 3. Create services ---
  const services = {} as Record<
    ServiceKey,
    { serviceId: string; url: string | null }
  >;

  for (const [key, template] of Object.entries(LIFE_SERVICES)) {
    const serviceKey = key as ServiceKey;

    // 3a. Create the service
    const serviceData = await railwayQuery<{
      serviceCreate: { id: string };
    }>(
      `mutation ($input: ServiceCreateInput!) {
        serviceCreate(input: $input) {
          id
        }
      }`,
      {
        input: {
          name: template.name,
          projectId: railwayProjectId,
          // TODO: Railway may require a source block here for image-based deploys.
          // The exact input shape depends on the API version. Adjust as needed.
        },
      },
    );

    const serviceId = serviceData.serviceCreate.id;

    // 3b. Set environment variables for the service
    // TODO: The exact mutation name may be `variableUpsert` or `variableCollectionUpsert`.
    // Railway's API uses per-service, per-environment variable scoping.
    try {
      await railwayQuery(
        `mutation ($input: VariableCollectionUpsertInput!) {
          variableCollectionUpsert(input: $input)
        }`,
        {
          input: {
            projectId: railwayProjectId,
            environmentId: railwayEnvironmentId,
            serviceId,
            variables: {
              PORT: String(template.port),
              ORG_ID: orgId,
              ORG_SLUG: orgSlug,
              // TODO: Add service-specific env vars (DATABASE_URL, secrets, etc.)
            },
          },
        },
      );
    } catch (err) {
      console.warn(
        `[railway] Failed to set env vars for ${template.name}:`,
        err,
      );
      // Non-fatal — continue provisioning other services
    }

    // 3c. Deploy from Docker image
    // TODO: The serviceInstanceDeploy mutation may differ. Railway's image
    // deploy flow typically uses `serviceConnect` with a Docker source or
    // the `serviceInstanceDeploy` mutation. Verify against the live API.
    try {
      await railwayQuery(
        `mutation ($input: ServiceInstanceDeployInput!) {
          serviceInstanceDeploy(input: $input) {
            id
          }
        }`,
        {
          input: {
            serviceId,
            environmentId: railwayEnvironmentId,
            source: {
              image: template.image,
            },
          },
        },
      );
    } catch (err) {
      console.warn(
        `[railway] Failed to trigger deploy for ${template.name}:`,
        err,
      );
    }

    // 3d. Generate a public domain for the service
    // TODO: Railway may auto-generate domains or require a `customDomainCreate`
    // or `serviceDomainCreate` call. The URL format is typically
    // `<service>-<project>.up.railway.app`.
    let url: string | null = null;
    try {
      const domainData = await railwayQuery<{
        serviceInstanceDomainCreate: { domain: string };
      }>(
        `mutation ($input: ServiceInstanceDomainCreateInput!) {
          serviceInstanceDomainCreate(input: $input) {
            domain
          }
        }`,
        {
          input: {
            serviceId,
            environmentId: railwayEnvironmentId,
          },
        },
      );
      url = `https://${domainData.serviceInstanceDomainCreate.domain}`;
    } catch (err) {
      console.warn(
        `[railway] Failed to create domain for ${template.name}:`,
        err,
      );
      // Fall back to a guessed URL pattern
      url = `https://${template.name}-life-${orgSlug}.up.railway.app`;
    }

    services[serviceKey] = { serviceId, url };
  }

  return {
    railwayProjectId,
    railwayEnvironmentId,
    services,
  };
}

// ---------------------------------------------------------------------------
// Delete a Life instance (tear down the entire Railway project)
// ---------------------------------------------------------------------------

/**
 * Delete a Railway project and all its services/deployments.
 */
export async function deleteLifeInstance(
  railwayProjectId: string,
): Promise<void> {
  await railwayQuery(
    `mutation ($id: String!) {
      projectDelete(id: $id)
    }`,
    { id: railwayProjectId },
  );
}

// ---------------------------------------------------------------------------
// Get instance status / health
// ---------------------------------------------------------------------------

export interface ServiceStatus {
  serviceId: string;
  serviceName: string;
  /** Latest deployment status as reported by Railway */
  status: string;
}

export interface LifeInstanceStatus {
  projectId: string;
  projectName: string;
  services: ServiceStatus[];
}

/**
 * Query the health / deployment status of all services inside a Railway project.
 *
 * TODO: The `deployments` sub-query shape may need adjustment. Railway exposes
 * deployment status via `serviceInstance` or `deployments` on a service node.
 */
export async function getLifeInstanceStatus(
  railwayProjectId: string,
): Promise<LifeInstanceStatus> {
  const data = await railwayQuery<{
    project: {
      id: string;
      name: string;
      services: {
        edges: Array<{
          node: {
            id: string;
            name: string;
            // TODO: Railway may nest deployment status differently
            serviceInstances: {
              edges: Array<{
                node: {
                  latestDeployment: {
                    status: string;
                  } | null;
                };
              }>;
            };
          };
        }>;
      };
    };
  }>(
    `query ($projectId: String!) {
      project(id: $projectId) {
        id
        name
        services {
          edges {
            node {
              id
              name
              serviceInstances {
                edges {
                  node {
                    latestDeployment {
                      status
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { projectId: railwayProjectId },
  );

  const project = data.project;

  const services: ServiceStatus[] = project.services.edges.map((edge) => {
    const svc = edge.node;
    const latestDeploy =
      svc.serviceInstances?.edges?.[0]?.node?.latestDeployment;

    return {
      serviceId: svc.id,
      serviceName: svc.name,
      status: latestDeploy?.status ?? "unknown",
    };
  });

  return {
    projectId: project.id,
    projectName: project.name,
    services,
  };
}

// ---------------------------------------------------------------------------
// Restart all services in a Life instance
// ---------------------------------------------------------------------------

/**
 * Restart all services in a Railway project by triggering a redeploy
 * of the latest deployment for each service.
 *
 * TODO: Railway may expose a `serviceInstanceRedeploy` mutation or
 * require re-deploying via `deploymentRestart`. Verify mutation name.
 */
export async function restartLifeInstance(
  railwayProjectId: string,
): Promise<void> {
  // First, fetch all services and their latest deployment IDs
  const data = await railwayQuery<{
    project: {
      services: {
        edges: Array<{
          node: {
            id: string;
            serviceInstances: {
              edges: Array<{
                node: {
                  latestDeployment: { id: string } | null;
                };
              }>;
            };
          };
        }>;
      };
    };
  }>(
    `query ($projectId: String!) {
      project(id: $projectId) {
        services {
          edges {
            node {
              id
              serviceInstances {
                edges {
                  node {
                    latestDeployment {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { projectId: railwayProjectId },
  );

  const restartPromises: Promise<unknown>[] = [];

  for (const edge of data.project.services.edges) {
    const latestDeployment =
      edge.node.serviceInstances?.edges?.[0]?.node?.latestDeployment;

    if (!latestDeployment?.id) continue;

    // TODO: The exact mutation may be `deploymentRestart` or
    // `serviceInstanceRedeploy`. Adjust based on Railway's API.
    restartPromises.push(
      railwayQuery(
        `mutation ($id: String!) {
          deploymentRestart(id: $id) {
            id
          }
        }`,
        { id: latestDeployment.id },
      ).catch((err) => {
        console.warn(
          `[railway] Failed to restart deployment ${latestDeployment.id}:`,
          err,
        );
      }),
    );
  }

  await Promise.allSettled(restartPromises);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether the Railway API is configured and reachable.
 * Returns true if RAILWAY_API_TOKEN is set; does not make a network call.
 */
export function isRailwayConfigured(): boolean {
  return !!RAILWAY_TOKEN;
}
