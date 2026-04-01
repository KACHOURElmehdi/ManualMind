import type { LocalDevConfig } from "./localDevConfig.types";

export const localDevConfig: LocalDevConfig = {
  openRouter: {
    apiKey: "",
    model: "qwen/qwen3.6-plus-preview:free",
    baseUrl: "https://openrouter.ai/api/v1",
    appTitle: "Study Assistant Extension (Local)",
    httpReferer: "",
    temperature: 0.2,
    maxTokens: 700
  }
};
