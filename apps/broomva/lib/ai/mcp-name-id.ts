const UNDERSCORE_COLLAPSE_REGEX = /_+/g;
const UNDERSCORE_TRIM_REGEX = /^_|_$/g;
const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]/g;

/** Maximum length for connector names */
export const MCP_NAME_MAX_LENGTH = 20;

/** Reserved namespace prefix for global connectors (userId = null) */
const GLOBAL_NAMESPACE_PREFIX = "global";

/** Separator between namespace and tool name (OpenAI requires ^[a-zA-Z0-9_-]+$) */
const TOOL_ID_SEPARATOR = "__";

export type GenerateMcpNameIdResult =
  | { ok: true; nameId: string }
  | { ok: false; error: "empty" | "reserved" };

/**
 * Generates a namespace (nameId) from a connector name.
 * Rules:
 * - Lowercase, replace non-alphanumeric with underscores
 * - Collapse consecutive underscores, trim leading/trailing
 * - Cannot equal "global" exactly (reserved for global connectors)
 * - Cannot result in empty string
 */
export function generateMcpNameId(name: string): GenerateMcpNameIdResult {
  const nameId = name
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_REGEX, "_")
    .replace(UNDERSCORE_COLLAPSE_REGEX, "_")
    .replace(UNDERSCORE_TRIM_REGEX, "");

  if (!nameId) {
    return { ok: false, error: "empty" };
  }

  if (nameId === GLOBAL_NAMESPACE_PREFIX) {
    return { ok: false, error: "reserved" };
  }

  return { ok: true, nameId };
}

/**
 * Creates a fully qualified tool ID from namespace and tool name.
 * Format: `{namespace}__{toolName}`
 * For global connectors: `global__{nameId}__{toolName}`
 * Uses `__` separator for OpenAI compatibility (requires ^[a-zA-Z0-9_-]+$)
 */
export function createToolId(
  namespace: string,
  toolName: string,
  isGlobal: boolean
): string {
  if (isGlobal) {
    return `${GLOBAL_NAMESPACE_PREFIX}${TOOL_ID_SEPARATOR}${namespace}${TOOL_ID_SEPARATOR}${toolName}`;
  }
  return `${namespace}${TOOL_ID_SEPARATOR}${toolName}`;
}

/**
 * Parses a tool ID back into its components.
 * Splits on `__` separator to get namespace and tool name.
 * For global tools, returns { isGlobal: true, namespace, toolName }
 */
export function parseToolId(toolId: string): {
  isGlobal: boolean;
  namespace: string;
  toolName: string;
} | null {
  const firstSep = toolId.indexOf(TOOL_ID_SEPARATOR);
  if (firstSep === -1) {
    return null; // No namespace, not an MCP tool
  }

  const firstPart = toolId.slice(0, firstSep);
  const rest = toolId.slice(firstSep + TOOL_ID_SEPARATOR.length);

  if (firstPart === GLOBAL_NAMESPACE_PREFIX) {
    // Global tool: global__{namespace}__{toolName}
    const secondSep = rest.indexOf(TOOL_ID_SEPARATOR);
    if (secondSep === -1) {
      return null; // Malformed
    }
    return {
      isGlobal: true,
      namespace: rest.slice(0, secondSep),
      toolName: rest.slice(secondSep + TOOL_ID_SEPARATOR.length),
    };
  }

  // User tool: {namespace}__{toolName}
  return {
    isGlobal: false,
    namespace: firstPart,
    toolName: rest,
  };
}
