import { MockAnalysisProvider } from "./mockProvider";
import type { AnalysisProvider } from "./types";

let provider: AnalysisProvider | undefined;

export function getAnalysisProvider(): AnalysisProvider {
  if (!provider) {
    provider = new MockAnalysisProvider();
  }

  return provider;
}
