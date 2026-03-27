/**
 * Redis pub/sub channel naming for relay communication.
 *
 * Pattern: relay:{nodeId}:{channel}
 * - commands: server → daemon commands (spawn, input, kill)
 * - events:   daemon → server events (output, session_created)
 * - session:{sessionId}:output: per-session output stream
 */

const PREFIX = "relay";

/** Channel for commands sent to a specific relay node. */
export function nodeCommandsChannel(nodeId: string): string {
  return `${PREFIX}:${nodeId}:commands`;
}

/** Channel for events from a specific relay node. */
export function nodeEventsChannel(nodeId: string): string {
  return `${PREFIX}:${nodeId}:events`;
}

/** Channel for output from a specific session. */
export function sessionOutputChannel(sessionId: string): string {
  return `${PREFIX}:session:${sessionId}:output`;
}

/** Channel for input to a specific session. */
export function sessionInputChannel(sessionId: string): string {
  return `${PREFIX}:session:${sessionId}:input`;
}

/**
 * Redis list key for session event replay buffer.
 * Stores the last 500 session events (any type) as JSON strings.
 * Used by SSE stream to replay missed events on reconnect.
 */
export function sessionReplayKey(sessionId: string): string {
  return `${PREFIX}:session:${sessionId}:replay`;
}

/** Maximum number of events to keep in the replay buffer. */
export const REPLAY_BUFFER_SIZE = 500;
