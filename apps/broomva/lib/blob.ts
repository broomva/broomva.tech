import {
  del,
  type ListBlobResult,
  list,
  type PutBlobResult,
} from "@vercel/blob";
import { BLOB_FILE_PREFIX } from "./constants";

/**
 * Upload a file to blob storage with consistent prefixing and access settings
 */
export async function uploadFile(
  filename: string,
  _buffer: unknown,
): Promise<PutBlobResult> {
  throw new Error(
    `File creation is disabled until private signed storage is implemented (${filename})`,
  );
}

/**
 * List all files in our blob storage with the correct prefix
 */
export async function listFiles(): Promise<ListBlobResult> {
  try {
    return await list({
      prefix: BLOB_FILE_PREFIX,
    });
  } catch (error) {
    throw new Error(
      `Failed to list files: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Delete multiple files by their URLs at once
 */
export async function deleteFilesByUrls(urls: string[]): Promise<void> {
  try {
    await del(urls);
  } catch (error) {
    throw new Error(
      `Failed to delete ${urls.length} files: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Extract filename from a blob URL
 */
export function extractFilenameFromUrl(url: string): string | null {
  try {
    const parts = url.split("/");
    const lastPart = parts.at(-1);

    // Remove query parameters if any
    const filename = lastPart?.split("?")[0] ?? "";

    // Remove the prefix if it exists in the URL
    if (filename.startsWith(BLOB_FILE_PREFIX)) {
      return filename.substring(BLOB_FILE_PREFIX.length);
    }

    return filename;
  } catch {
    return null;
  }
}
