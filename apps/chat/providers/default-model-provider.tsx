"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { usePostHog } from "posthog-js/react";
import type { AppModelId } from "@/lib/ai/app-models";
import { EVENT_MODEL_SELECTED } from "@/lib/analytics/events";

type DefaultModelContextType = {
  defaultModel: AppModelId;
  changeModel: (modelId: AppModelId) => Promise<void>;
};

const DefaultModelContext = createContext<DefaultModelContextType | undefined>(
  undefined
);

type DefaultModelClientProviderProps = {
  children: ReactNode;
  defaultModel: AppModelId;
};

export function DefaultModelProvider({
  children,
  defaultModel: initialModel,
}: DefaultModelClientProviderProps) {
  const [currentModel, setCurrentModel] = useState<AppModelId>(initialModel);
  const posthog = usePostHog();

  const changeModel = useCallback(
    async (modelId: AppModelId) => {
      // Update local state immediately
      setCurrentModel(modelId);
      posthog?.capture(EVENT_MODEL_SELECTED, { model: modelId });

      try {
        // Update cookies for persistence
        await fetch("/api/chat-model", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: modelId }),
        });
      } catch (error) {
        console.error("Failed to save chat model:", error);
        toast.error("Failed to save model preference");
        // Revert on error
        setCurrentModel(initialModel);
      }
    },
    [initialModel, posthog]
  );

  const value = useMemo(
    () => ({
      defaultModel: currentModel,
      changeModel,
    }),
    [currentModel, changeModel]
  );

  return (
    <DefaultModelContext.Provider value={value}>
      {children}
    </DefaultModelContext.Provider>
  );
}

export function useDefaultModel() {
  const context = useContext(DefaultModelContext);
  if (context === undefined) {
    throw new Error(
      "useDefaultModel must be used within a DefaultModelProvider"
    );
  }
  return context.defaultModel;
}

export function useModelChange() {
  const context = useContext(DefaultModelContext);
  if (context === undefined) {
    throw new Error(
      "useModelChange must be used within a DefaultModelProvider"
    );
  }
  return context.changeModel;
}
