"use client";

import { Pencil, Trash2 } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

type ProjectMenuItemsProps = {
  onRename: () => void;
  onDelete: () => void;
};

export function ProjectMenuItems({
  onRename,
  onDelete,
}: ProjectMenuItemsProps) {
  return (
    <>
      <DropdownMenuItem className="cursor-pointer" onClick={onRename}>
        <Pencil size={16} />
        <span>Rename</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        className="cursor-pointer text-destructive focus:bg-destructive/15 focus:text-destructive dark:text-red-500"
        onSelect={onDelete}
      >
        <Trash2 size={16} />
        <span>Delete</span>
      </DropdownMenuItem>
    </>
  );
}
