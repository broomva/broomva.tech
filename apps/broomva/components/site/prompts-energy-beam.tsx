"use client";

import dynamic from "next/dynamic";

const EnergyBeam = dynamic(() => import("@/components/ui/energy-beam"), {
  ssr: false,
  loading: () => (
    <div className="h-48 w-full animate-pulse bg-bg-deep/50 sm:h-64" />
  ),
});

export function PromptsEnergyBeam() {
  return (
    <section className="relative mt-16 w-full sm:mt-24" aria-hidden="true">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[var(--ag-bg-deep)] to-transparent" />

      <EnergyBeam className="h-48 sm:h-64" />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-[var(--ag-bg-deep)] to-transparent" />
    </section>
  );
}
