"use client";

import { usePathname } from "next/navigation";
import { FlickeringFooter } from "@/components/ui/flickering-footer";

const FOOTER_HIDDEN_PATHS = ["/graph"];

export function ConditionalFooter() {
  const pathname = usePathname();
  if (FOOTER_HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }
  return <FlickeringFooter />;
}
