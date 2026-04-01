import type { AnalysisResult, QuestionOption, TranscriptResult } from "../types";

export interface TextQuestionInput {
  questionText: string;
  options: QuestionOption[];
  contextText: string;
  rawText: string;
}

export interface TranscriptAnalysisInput {
  transcript: string;
  questionText?: string;
  options?: QuestionOption[];
  contextText?: string;
}

export interface AnalysisProvider {
  analyzeTextQuestion(input: TextQuestionInput): Promise<AnalysisResult>;
  transcribeAudio(audioBlob: Blob): Promise<TranscriptResult>;
  analyzeTranscript(input: TranscriptAnalysisInput): Promise<AnalysisResult>;
}
