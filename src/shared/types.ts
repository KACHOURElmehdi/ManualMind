export type ParserMode = "auto" | "quiz" | "aggressive";

export interface QuestionOption {
  id: string;
  text: string;
}

export interface ExtractedQuestion {
  questionText: string;
  options: QuestionOption[];
  contextText: string;
  rawText: string;
  strategy: string;
  extractedAt: string;
  debugLog: string[];
}

export interface AnalysisResult {
  suggestedAnswer: string;
  confidence: number;
  explanation: string;
  safetyNotice: string;
  source: string;
}

export interface TranscriptResult {
  transcript: string;
  confidence: number;
  language: string;
  debugNotes: string;
}

export interface ExtensionSettings {
  enabledSites: string[];
  debugMode: boolean;
  preferredParserMode: ParserMode;
}
