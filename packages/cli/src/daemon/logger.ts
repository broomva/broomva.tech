import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { DAEMON_LOG_FILE } from "../lib/constants.js";
import type { DaemonLogEntry } from "../types/daemon.js";

export class DaemonLogger {
	private filePath: string;

	constructor(filePath: string = DAEMON_LOG_FILE) {
		this.filePath = filePath;
		const dir = dirname(this.filePath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true, mode: 0o700 });
		}
	}

	private write(
		level: DaemonLogEntry["level"],
		message: string,
		data?: Record<string, unknown>,
	): void {
		const entry: DaemonLogEntry = {
			timestamp: new Date().toISOString(),
			level,
			message,
			...(data ? { data } : {}),
		};
		appendFileSync(this.filePath, JSON.stringify(entry) + "\n");
	}

	debug(message: string, data?: Record<string, unknown>): void {
		this.write("debug", message, data);
	}

	info(message: string, data?: Record<string, unknown>): void {
		this.write("info", message, data);
	}

	warn(message: string, data?: Record<string, unknown>): void {
		this.write("warn", message, data);
	}

	error(message: string, data?: Record<string, unknown>): void {
		this.write("error", message, data);
	}

	readLines(opts?: {
		lines?: number;
		level?: string;
	}): DaemonLogEntry[] {
		if (!existsSync(this.filePath)) return [];
		const raw = readFileSync(this.filePath, "utf-8").trim();
		if (!raw) return [];

		let entries = raw
			.split("\n")
			.map((line) => {
				try {
					return JSON.parse(line) as DaemonLogEntry;
				} catch {
					return null;
				}
			})
			.filter((e): e is DaemonLogEntry => e !== null);

		if (opts?.level) {
			entries = entries.filter((e) => e.level === opts.level);
		}

		if (opts?.lines) {
			entries = entries.slice(-opts.lines);
		}

		return entries;
	}
}
