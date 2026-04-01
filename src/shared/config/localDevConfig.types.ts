export interface OpenRouterDevConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  appTitle?: string;
  httpReferer?: string;
  temperature: number;
  maxTokens: number;
}

export interface LocalDevConfig {
  openRouter: OpenRouterDevConfig;
}
