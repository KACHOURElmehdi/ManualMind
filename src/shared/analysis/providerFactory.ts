import { MockAnalysisProvider } from "./mockProvider";
import { OpenRouterAnalysisProvider } from "./openRouterProvider";
import type { AnalysisProvider } from "./types";
import type { AnalysisProviderMode } from "../types";

const providerCache = new Map<AnalysisProviderMode, AnalysisProvider>();

export function getAnalysisProvider(mode: AnalysisProviderMode): AnalysisProvider {
  const cached = providerCache.get(mode);
  if (cached) {
    return cached;
  }

  const provider = mode === "openrouter" ? new OpenRouterAnalysisProvider() : new MockAnalysisProvider();
  providerCache.set(mode, provider);
  return provider;
}
