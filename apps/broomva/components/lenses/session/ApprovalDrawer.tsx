"use client";

/**
 * B-4a: approval cards render inline (see ApprovalRequiredIntent). This
 * file exists as the layout slot for B-4b's multi-approval tray; rendering
 * as null keeps the JSX tree stable across the B-4b extension so adding
 * the tray later does not reflow the SessionLensClient skeleton.
 */
export function ApprovalDrawer() {
  return null;
}
