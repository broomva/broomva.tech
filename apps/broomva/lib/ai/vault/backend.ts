/**
 * VaultBackend — pluggable storage backend for vault operations.
 *
 * Abstracts over local filesystem (server vault) and remote Lago
 * (user vault) so VaultReader and tools can work with both.
 */
export interface VaultBackend {
  /** List all file paths in the vault (relative paths). */
  listFiles(): Promise<string[]>;

  /** Read a file by relative path. Returns null if not found. */
  readFile(relativePath: string): Promise<string | null>;

  /** Write a file by relative path. */
  writeFile(relativePath: string, content: string): Promise<void>;

  /** Delete a file by relative path. */
  deleteFile(relativePath: string): Promise<void>;

  /** Unique cache key for this backend instance (for index caching). */
  readonly cacheKey: string;
}
