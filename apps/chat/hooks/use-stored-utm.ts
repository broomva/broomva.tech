"use client";

import { useEffect, useState } from "react";

export interface UtmData {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  landing_page: string;
  timestamp: number;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function useStoredUtm(): UtmData | null {
  const [utm, setUtm] = useState<UtmData | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("broomva_utm");
      if (!raw) return;
      const data: UtmData = JSON.parse(raw);
      if (Date.now() - data.timestamp > MAX_AGE_MS) {
        localStorage.removeItem("broomva_utm");
        return;
      }
      setUtm(data);
    } catch {
      // ignore parse errors
    }
  }, []);

  return utm;
}
