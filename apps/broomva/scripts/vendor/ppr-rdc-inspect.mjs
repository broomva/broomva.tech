#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";

const DEFAULT_SCAN_PATH = ".next";
const MAX_INFLATED_RDC_SIZE = 500 * 1024 * 1024;

function printUsage() {
  console.log(`Usage: ppr-rdc-inspect [options] [path]

Recursively scans .next by default, or the provided directory or .meta file,
and writes decoded postponed-state contents to stdout.

Options:
  -h, --help  Show this help.

Decoded output can contain arbitrary application data. Keep it local unless it
has been reviewed. Search for an application-specific value or pattern:

  ppr-rdc-inspect | rg 'account|locale|feature'

The output can also be piped into another stdin-based analysis tool:

  ppr-rdc-inspect | your-analysis-command

The script can also be run directly without installing it:

  node /path/to/ppr-rdc-inspect.mjs
`);
}

function parseArguments(args) {
  let scanPath;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];

    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }

    if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    }

    if (scanPath !== undefined) {
      throw new Error("Only one scan path may be provided");
    }
    scanPath = argument;
  }

  return { help: false, scanPath };
}

async function findMetaFiles(inputPath) {
  const inputStat = await stat(inputPath);

  if (inputStat.isFile()) {
    return [inputPath];
  }

  if (!inputStat.isDirectory()) {
    throw new Error(`Expected a file or directory: ${inputPath}`);
  }

  const files = [];
  const entries = await readdir(inputPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = resolve(inputPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await findMetaFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".meta")) {
      files.push(entryPath);
    }
  }

  return files;
}

function splitPostponedState(state, filePath) {
  const lengthMatch = /^(\d+):/.exec(state);
  if (!lengthMatch) {
    throw new Error(`${filePath}: postponed state has no length prefix`);
  }

  const postponedLength = Number(lengthMatch[1]);
  if (!Number.isSafeInteger(postponedLength)) {
    throw new Error(
      `${filePath}: postponed-state length is not a safe integer`,
    );
  }

  const postponedStart = lengthMatch[0].length;
  const postponedEnd = postponedStart + postponedLength;
  if (postponedEnd > state.length) {
    throw new Error(
      `${filePath}: postponed-state length exceeds the available data`,
    );
  }

  return {
    reactPostponedState: state.slice(postponedStart, postponedEnd),
    encodedResumeDataCache: state.slice(postponedEnd),
  };
}

function decodeResumeDataCache(encoded, filePath) {
  if (encoded === "null") {
    return null;
  }

  if (encoded.length === 0) {
    throw new Error(`${filePath}: postponed state has no resume data cache`);
  }

  const inflated = inflateSync(Buffer.from(encoded, "base64"), {
    maxOutputLength: MAX_INFLATED_RDC_SIZE,
  }).toString("utf8");

  try {
    return JSON.parse(inflated);
  } catch (error) {
    throw new Error(`${filePath}: inflated resume data cache is not JSON`, {
      cause: error,
    });
  }
}

function getUseCacheValue(cacheEntry) {
  if (typeof cacheEntry?.entry?.value === "string") {
    return cacheEntry.entry.value;
  }

  // Older Cache Components builds serialized the cache entry without the
  // metadata wrapper used by the current format.
  if (typeof cacheEntry?.value === "string") {
    return cacheEntry.value;
  }

  return null;
}

function makeSearchableResumeDataCache(resumeDataCache) {
  const searchable = structuredClone(resumeDataCache);
  const decodedUseCacheEntries = [];
  const decodedFetchEntries = [];

  for (const [key, cacheEntry] of Object.entries(
    resumeDataCache?.store?.cache ?? {},
  )) {
    const value = getUseCacheValue(cacheEntry);
    if (value === null) continue;

    decodedUseCacheEntries.push({
      key,
      value: Buffer.from(value, "base64").toString("utf8"),
    });

    const searchableEntry = searchable.store.cache[key];
    if (typeof searchableEntry?.entry?.value === "string") {
      searchableEntry.entry.value = "<decoded below>";
    } else if (typeof searchableEntry?.value === "string") {
      searchableEntry.value = "<decoded below>";
    }
  }

  for (const [key, fetchEntry] of Object.entries(
    resumeDataCache?.store?.fetch ?? {},
  )) {
    const body = fetchEntry?.data?.body;
    if (typeof body !== "string") continue;

    decodedFetchEntries.push({
      key,
      value: Buffer.from(body, "base64").toString("utf8"),
    });
    searchable.store.fetch[key].data.body = "<decoded below>";
  }

  return { searchable, decodedUseCacheEntries, decodedFetchEntries };
}

function writeSection(title, value) {
  process.stdout.write(`\n----- ${title} -----\n`);
  process.stdout.write(value);
  if (!value.endsWith("\n")) process.stdout.write("\n");
}

function decodeMetaFile(filePath, meta) {
  if (typeof meta.postponed !== "string") {
    return null;
  }

  const { reactPostponedState, encodedResumeDataCache } = splitPostponedState(
    meta.postponed,
    filePath,
  );
  const resumeDataCache = decodeResumeDataCache(
    encodedResumeDataCache,
    filePath,
  );

  const sections = [
    {
      title: "REACT POSTPONED STATE",
      category: "REACT POSTPONED STATE",
      value: reactPostponedState,
    },
  ];

  if (resumeDataCache === null) {
    sections.push({
      title: "RENDER RESUME DATA CACHE",
      category: "RENDER RESUME DATA CACHE",
      value: "null",
    });
    return { sections, useCacheEntries: 0, fetchEntries: 0 };
  }

  const { searchable, decodedUseCacheEntries, decodedFetchEntries } =
    makeSearchableResumeDataCache(resumeDataCache);

  sections.push({
    title: "RENDER RESUME DATA CACHE (INFLATED)",
    category: "RENDER RESUME DATA CACHE",
    value: JSON.stringify(searchable, null, 2),
  });

  for (const { key, value } of decodedUseCacheEntries) {
    sections.push({
      title: `USE CACHE VALUE ${JSON.stringify(key)}`,
      category: "USE CACHE VALUE",
      value,
    });
  }

  for (const { key, value } of decodedFetchEntries) {
    sections.push({
      title: `FETCH CACHE BODY ${JSON.stringify(key)}`,
      category: "FETCH CACHE BODY",
      value,
    });
  }

  return {
    sections,
    useCacheEntries: decodedUseCacheEntries.length,
    fetchEntries: decodedFetchEntries.length,
  };
}

function writeInspection(filePath, inspection) {
  process.stdout.write(`\n===== ${filePath} =====\n`);
  for (const section of inspection.sections) {
    writeSection(section.title, section.value);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const scanPath = resolve(options.scanPath ?? DEFAULT_SCAN_PATH);
  let scanPathStat;
  try {
    scanPathStat = await stat(scanPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `Could not find ${scanPath}. Run this command from a built Next.js application or pass a path to its .next directory.`,
      );
    }
    throw error;
  }

  const isExplicitFile = scanPathStat.isFile();
  console.error(
    `Notice: decoded output may contain application data. Scanning ${scanPath}`,
  );

  const metaFiles = (await findMetaFiles(scanPath)).sort();
  let postponedFiles = 0;
  let useCacheEntries = 0;
  let fetchEntries = 0;
  let nonJsonMetaFiles = 0;
  let failures = 0;

  for (const filePath of metaFiles) {
    try {
      let meta;
      try {
        meta = JSON.parse(await readFile(filePath, "utf8"));
      } catch (error) {
        if (isExplicitFile) throw error;
        nonJsonMetaFiles++;
        continue;
      }

      const result = decodeMetaFile(filePath, meta);
      if (result === null) continue;

      writeInspection(filePath, result);

      postponedFiles++;
      useCacheEntries += result.useCacheEntries;
      fetchEntries += result.fetchEntries;
    } catch (error) {
      failures++;
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

  console.error(
    `Scanned ${metaFiles.length} .meta files; decoded ${postponedFiles} postponed states, ${useCacheEntries} use-cache values, and ${fetchEntries} fetch-cache bodies; skipped ${nonJsonMetaFiles} non-JSON .meta files.`,
  );

  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
