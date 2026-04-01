import type { AnalysisResult, QuestionOption, TranscriptResult } from "../types";

export interface TextQuestionInput {
  questionText: string;
  options: QuestionOption[];
  contextText: string;
  rawText: string;
}

export interface AnalysisProvider {
  analyzeTextQuestion(input: TextQuestionInput): Promise<AnalysisResult>;
  transcribeAudio(audioBlob: Blob): Promise<TranscriptResult>;
  analyzeTranscript(transcript: string): Promise<AnalysisResult>;
}
