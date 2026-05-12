"use client";

import { Pencil, PinIcon, Trash2 } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ShareMenuItem } from "@/components/upgrade-cta/share-menu-item";

type ChatMenuItemsProps = {
  isPinned: boolean;
  onRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onShare?: () => void;
  showShare?: boolean;
};

export function ChatMenuItems({
  isPinned,
  onRename,
  onTogglePin,
  onDelete,
  onShare,
  showShare = true,
}: ChatMenuItemsProps) {
  return (
    <>
      <DropdownMenuItem className="cursor-pointer" onClick={onRename}>
        <Pencil size={16} />
        <span>Rename</span>
      </DropdownMenuItem>

      <DropdownMenuItem className="cursor-pointer" onClick={onTogglePin}>
        <PinIcon className={`size-4 ${isPinned ? "fill-current" : ""}`} />
        <span>{isPinned ? "Unpin" : "Pin"}</span>
      </DropdownMenuItem>

      {showShare && onShare && <ShareMenuItem onShare={onShare} />}

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
