"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface EnergyBeamProps {
  projectId?: string;
  className?: string;
}

declare global {
  interface Window {
    UnicornStudio?: {
      init: () => void;
      destroy: () => void;
    };
  }
}

const EnergyBeam: React.FC<EnergyBeamProps> = ({
  projectId = "hRFfUymDGOHwtFe7evR2",
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    if (scriptLoadedRef.current) return;

    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.5.2/dist/unicornStudio.umd.js";
    script.async = true;

    script.onload = () => {
      scriptLoadedRef.current = true;
      if (window.UnicornStudio && containerRef.current) {
        window.UnicornStudio.init();
      }
    };

    document.head.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  return (
    <div
      className={cn("relative w-full overflow-hidden", className)}
    >
      <div
        ref={containerRef}
        data-us-project={projectId}
        className="h-full w-full"
      />
    </div>
  );
};

export default EnergyBeam;
