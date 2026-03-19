import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { DAEMON_PID_FILE } from "../lib/constants.js";

export function writePidFile(pid: number): void {
	const dir = dirname(DAEMON_PID_FILE);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	writeFileSync(DAEMON_PID_FILE, String(pid), { mode: 0o600 });
}

export function readPidFile(): number | null {
	if (!existsSync(DAEMON_PID_FILE)) return null;
	try {
		const raw = readFileSync(DAEMON_PID_FILE, "utf-8").trim();
		const pid = Number.parseInt(raw, 10);
		return Number.isNaN(pid) ? null : pid;
	} catch {
		return null;
	}
}

export function removePidFile(): void {
	if (existsSync(DAEMON_PID_FILE)) {
		unlinkSync(DAEMON_PID_FILE);
	}
}

export function isDaemonRunning(): { running: boolean; pid: number | null } {
	const pid = readPidFile();
	if (pid === null) return { running: false, pid: null };

	try {
		process.kill(pid, 0);
		return { running: true, pid };
	} catch {
		// Process doesn't exist — stale PID file
		removePidFile();
		return { running: false, pid: null };
	}
}

export function stopDaemon(): { stopped: boolean; pid: number | null } {
	const { running, pid } = isDaemonRunning();
	if (!running || pid === null) {
		return { stopped: false, pid: null };
	}

	try {
		process.kill(pid, "SIGTERM");
		removePidFile();
		return { stopped: true, pid };
	} catch {
		removePidFile();
		return { stopped: false, pid };
	}
}
