/**
 * Agent Key Management (BRO-56)
 *
 * Each CLI session is a registered agent with a unique Ed25519 identity.
 *
 * Key storage layout:
 *   ~/.broomva/agent-keys/default.key  (private key, AES-256-GCM encrypted)
 *   ~/.broomva/agent-keys/default.pub  (public key, hex)
 *
 * The agent ID is the first 16 hex chars of the SHA-256 hash of the public key.
 */

import {
	createCipheriv,
	createDecipheriv,
	createHash,
	generateKeyPairSync,
	randomBytes,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const KEYS_DIR = join(homedir(), ".broomva", "agent-keys");
const PRIVATE_KEY_FILE = join(KEYS_DIR, "default.key");
const PUBLIC_KEY_FILE = join(KEYS_DIR, "default.pub");

// ─── Machine-derived encryption key ────────────────────────────────────────

/**
 * Derive a deterministic AES-256 key from machine-specific data.
 * This means the encrypted key file is only decryptable on this machine.
 */
function deriveEncryptionKey(): Buffer {
	const material = [
		homedir(),
		process.env.USER ?? process.env.USERNAME ?? "unknown",
		process.platform,
		process.arch,
	].join("|");

	return createHash("sha256").update(material).digest();
}

/**
 * Encrypt data with AES-256-GCM using the machine-derived key.
 * Returns: iv (12 bytes) + authTag (16 bytes) + ciphertext, all hex-encoded.
 */
function encryptPrivateKey(raw: Buffer): string {
	const key = deriveEncryptionKey();
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const encrypted = Buffer.concat([cipher.update(raw), cipher.final()]);
	const authTag = cipher.getAuthTag();

	// Pack: iv + authTag + ciphertext
	return Buffer.concat([iv, authTag, encrypted]).toString("hex");
}

/**
 * Decrypt a private key encrypted with encryptPrivateKey().
 */
function decryptPrivateKey(hexData: string): Buffer {
	const data = Buffer.from(hexData, "hex");
	const key = deriveEncryptionKey();
	const iv = data.subarray(0, 12);
	const authTag = data.subarray(12, 28);
	const ciphertext = data.subarray(28);

	const decipher = createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ─── Key Generation & Storage ──────────────────────────────────────────────

export interface AgentKeyPair {
	publicKey: string; // hex-encoded raw public key
	privateKey: Buffer; // raw private key bytes
	agentId: string; // first 16 hex chars of SHA-256(publicKey)
}

/**
 * Compute a deterministic agent ID from a hex-encoded public key.
 * SHA-256 hash, first 16 hex characters.
 */
export function computeAgentId(publicKeyHex: string): string {
	return createHash("sha256").update(publicKeyHex).digest("hex").slice(0, 16);
}

/**
 * Compute a fingerprint for display (SHA-256, colon-separated, first 16 bytes).
 */
export function publicKeyFingerprint(publicKeyHex: string): string {
	const hash = createHash("sha256").update(publicKeyHex).digest("hex");
	return (
		hash
			.slice(0, 32) // 16 bytes = 32 hex chars
			.match(/.{2}/g)
			?.join(":") ?? hash.slice(0, 32)
	);
}

/**
 * Generate a new Ed25519 keypair, encrypt the private key, and persist both.
 */
export function generateAgentKeys(): AgentKeyPair {
	if (!existsSync(KEYS_DIR)) {
		mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
	}

	const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
		publicKeyEncoding: { type: "spki", format: "der" },
		privateKeyEncoding: { type: "pkcs8", format: "der" },
	});

	const pubHex = publicKey.toString("hex");
	const agentId = computeAgentId(pubHex);

	// Write public key (plain hex)
	writeFileSync(PUBLIC_KEY_FILE, pubHex, { mode: 0o644 });

	// Write private key (AES-256-GCM encrypted)
	const encryptedHex = encryptPrivateKey(privateKey);
	writeFileSync(PRIVATE_KEY_FILE, encryptedHex, { mode: 0o600 });

	return { publicKey: pubHex, privateKey, agentId };
}

/**
 * Load an existing keypair from disk.
 * Returns null if keys don't exist.
 * Throws if decryption fails (wrong machine / corrupted).
 */
export function loadAgentKeys(): AgentKeyPair | null {
	if (!existsSync(PUBLIC_KEY_FILE) || !existsSync(PRIVATE_KEY_FILE)) {
		return null;
	}

	const pubHex = readFileSync(PUBLIC_KEY_FILE, "utf-8").trim();
	const encryptedHex = readFileSync(PRIVATE_KEY_FILE, "utf-8").trim();
	const privateKey = decryptPrivateKey(encryptedHex);
	const agentId = computeAgentId(pubHex);

	return { publicKey: pubHex, privateKey, agentId };
}

/**
 * Load existing keys or generate new ones.
 */
export function ensureAgentKeys(): AgentKeyPair {
	const existing = loadAgentKeys();
	if (existing) return existing;
	return generateAgentKeys();
}

/**
 * Check whether agent keys exist on disk.
 */
export function hasAgentKeys(): boolean {
	return existsSync(PUBLIC_KEY_FILE) && existsSync(PRIVATE_KEY_FILE);
}
