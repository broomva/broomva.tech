"use client";

interface Props {
  file: string;
}

/**
 * Files lens center stage — placeholder; full implementation in Task 9.
 */
export function FilesLens({ file }: Props) {
  return (
    <div className="p-6 font-mono text-[12px] opacity-60">
      File viewer for <span className="opacity-90">{file}</span> (coming).
    </div>
  );
}
