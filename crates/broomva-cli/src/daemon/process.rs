use std::fs;
use std::process;

use crate::config::constants;
use crate::error::BroomvaResult;

/// Write the current process PID to the PID file.
pub fn write_pid() -> BroomvaResult<()> {
    let dir = constants::config_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    fs::write(constants::pid_path(), process::id().to_string())?;
    Ok(())
}

/// Remove the PID file.
pub fn remove_pid() {
    let _ = fs::remove_file(constants::pid_path());
}

/// Read the stored PID, or None if no PID file exists.
pub fn read_pid() -> Option<u32> {
    let path = constants::pid_path();
    fs::read_to_string(path).ok()?.trim().parse().ok()
}

/// Check if the daemon process is currently running.
pub fn is_running() -> bool {
    if let Some(pid) = read_pid() {
        // Send signal 0 to check if process exists (Unix-only).
        #[cfg(unix)]
        {
            // SAFETY: kill(pid, 0) is a standard POSIX call that checks process existence.
            unsafe { libc::kill(pid as libc::pid_t, 0) == 0 }
        }
        #[cfg(not(unix))]
        {
            let _ = pid;
            false
        }
    } else {
        false
    }
}

/// Stop the running daemon by sending SIGTERM.
pub fn stop_daemon() -> BroomvaResult<bool> {
    if let Some(pid) = read_pid() {
        #[cfg(unix)]
        {
            // SAFETY: kill(pid, SIGTERM) is a standard POSIX call for graceful shutdown.
            let result = unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM) };
            if result == 0 {
                remove_pid();
                return Ok(true);
            }
        }
        #[cfg(not(unix))]
        {
            let _ = pid;
        }
        // PID file exists but process not found — clean up stale PID.
        remove_pid();
        Ok(false)
    } else {
        Ok(false)
    }
}
