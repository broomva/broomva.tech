"use client";

import { FileViewer } from "./FileViewer";

interface Props {
  file: string;
}

/**
 * FilesLens — center-stage composition root. v1 ships just the viewer;
 * the right rail (Outline + Backlinks) is mounted by `RightRail` based
 * on the same `?file=` URL param, not by this component.
 */
export function FilesLens({ file }: Props) {
  return (
    <div className="flex h-full flex-col">
      <FileViewer path={file} />
    </div>
  );
}
