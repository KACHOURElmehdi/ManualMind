import { useEffect, useMemo, useState } from "react";
import type { AnalysisResult, ExtractedQuestion, ExtensionSettings, TranscriptResult } from "../shared/types";
import type { MessageResponse } from "../shared/messages";
import { sendRuntimeRequest } from "../shared/messaging";
import { DEFAULT_SETTINGS } from "../shared/storage/settingsStorage";
import { isRecordingActive, startRecording, stopRecording } from "./audio/recorder";

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function getErrorMessage<T>(response: MessageResponse<T>): string {
  if (response.ok) {
    return "";
  }

  const details = response.error.details ? ` (${response.error.details})` : "";
  return `${response.error.code}: ${response.error.message}${details}`;
}

function timestamped(message: string): string {
  return `[${new Date().toLocaleTimeString()}] ${message}`;
}

interface AnalyzeAndSelectResponse {
  extracted: ExtractedQuestion;
  analysis: AnalysisResult;
  selection: { ok: boolean; data?: { selected: boolean; answerId: string } };
}

export function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [enabledSitesInput, setEnabledSitesInput] = useState(DEFAULT_SETTINGS.enabledSites.join(", "));
  const [isBusy, setIsBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [extractedQuestion, setExtractedQuestion] = useState<ExtractedQuestion | null>(null);
  const [textAnalysis, setTextAnalysis] = useState<AnalysisResult | null>(null);
  const [transcriptResult, setTranscriptResult] = useState<TranscriptResult | null>(null);
  const [transcriptAnalysis, setTranscriptAnalysis] = useState<AnalysisResult | null>(null);
  const [autoValidate, setAutoValidate] = useState(false);

  const latestAnalysis = useMemo(() => transcriptAnalysis ?? textAnalysis, [textAnalysis, transcriptAnalysis]);

  const addLog = (message: string): void => {
    setLogs((prev) => [timestamped(message), ...prev].slice(0, 120));
  };

  useEffect(() => {
    let mounted = true;

    const loadSettings = async (): Promise<void> => {
      const response = await sendRuntimeRequest<ExtensionSettings>({
        type: "GET_SETTINGS"
      });

      if (!mounted) {
        return;
      }

      if (!response.ok) {
        setError(getErrorMessage(response));
        addLog("Failed to load settings from storage.");
        return;
      }

      setSettings(response.data);
      setEnabledSitesInput(response.data.enabledSites.join(", "));
      addLog("Settings loaded.");
    };

    void loadSettings();
    return () => {
      mounted = false;
    };
  }, []);

  const persistSettings = async (nextSettings: Partial<ExtensionSettings>): Promise<void> => {
    const response = await sendRuntimeRequest<ExtensionSettings>({
      type: "SET_SETTINGS",
      payload: {
        settings: nextSettings
      }
    });

    if (!response.ok) {
      throw new Error(getErrorMessage(response));
    }

    setSettings(response.data);
  };

  const handleAnalyzeQuestion = async (): Promise<void> => {
    setIsBusy(true);
    setError(null);
    addLog("Starting page extraction request.");

    try {
      const extractResponse = await sendRuntimeRequest<ExtractedQuestion>({
        type: "EXTRACT_VISIBLE_QUESTION",
        payload: {
          parserMode: settings.preferredParserMode,
          debugMode: settings.debugMode
        }
      });

      if (!extractResponse.ok) {
        throw new Error(getErrorMessage(extractResponse));
      }

      setExtractedQuestion(extractResponse.data);
      setTranscriptResult(null);
      setTranscriptAnalysis(null);
      addLog(`Extraction complete using ${extractResponse.data.strategy}.`);
      addLog(`Text analysis request started (provider=${settings.analysisProvider}).`);

      const analysisResponse = await sendRuntimeRequest<AnalysisResult>({
        type: "ANALYZE_TEXT_QUESTION",
        payload: {
          input: extractResponse.data
        }
      });

      if (!analysisResponse.ok) {
        throw new Error(getErrorMessage(analysisResponse));
      }

      setTextAnalysis(analysisResponse.data);
      addLog(`Text analysis completed (source=${analysisResponse.data.source}).`);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to analyze page question.";
      setError(message);
      addLog(`Analyze flow error: ${message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleStartRecording = async (): Promise<void> => {
    setError(null);
    try {
      await startRecording();
      setIsRecording(isRecordingActive());
      addLog("Recording started.");
    } catch (recordingError) {
      const message =
        recordingError instanceof Error ? recordingError.message : "Unable to start recording.";
      setError(message);
      addLog(`Start recording error: ${message}`);
    }
  };

  const handleStopRecording = async (): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      const audioBlob = await stopRecording();
      setIsRecording(false);
      addLog(`Recording stopped. Captured ${(audioBlob.size / 1024).toFixed(1)} KB.`);

      const transcriptResponse = await sendRuntimeRequest<TranscriptResult>({
        type: "TRANSCRIBE_AUDIO_BLOB",
        payload: {
          audioBlob
        }
      });

      if (!transcriptResponse.ok) {
        throw new Error(getErrorMessage(transcriptResponse));
      }

      setTranscriptResult(transcriptResponse.data);
      setTextAnalysis(null);
      addLog("Mock transcription complete.");
      addLog(`Transcript analysis request started (provider=${settings.analysisProvider}).`);

      const analysisResponse = await sendRuntimeRequest<AnalysisResult>({
        type: "ANALYZE_TRANSCRIPT",
        payload: {
          transcript: transcriptResponse.data.transcript,
          ...(extractedQuestion?.questionText
            ? {
                questionText: extractedQuestion.questionText
              }
            : {}),
          ...(extractedQuestion?.options
            ? {
                options: extractedQuestion.options
              }
            : {}),
          ...(extractedQuestion?.contextText
            ? {
                contextText: extractedQuestion.contextText
              }
            : {})
        }
      });

      if (!analysisResponse.ok) {
        throw new Error(getErrorMessage(analysisResponse));
      }

      setTranscriptAnalysis(analysisResponse.data);
      addLog(`Transcript analysis completed (source=${analysisResponse.data.source}).`);
    } catch (recordingError) {
      const message =
        recordingError instanceof Error ? recordingError.message : "Failed to process recording.";
      setError(message);
      setIsRecording(false);
      addLog(`Stop recording error: ${message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleClear = (): void => {
    setExtractedQuestion(null);
    setTextAnalysis(null);
    setTranscriptResult(null);
    setTranscriptAnalysis(null);
    setError(null);
    setLogs([]);
  };

  const handleAutoAnswer = async (): Promise<void> => {
    setIsBusy(true);
    setError(null);
    addLog("Starting auto-answer flow: Extract → Analyze → Select");

    try {
      const response = await sendRuntimeRequest<AnalyzeAndSelectResponse>({
        type: "ANALYZE_AND_SELECT",
        payload: {
          parserMode: settings.preferredParserMode,
          debugMode: settings.debugMode,
          autoValidate
        }
      });

      if (!response.ok) {
        throw new Error(getErrorMessage(response));
      }

      const { extracted, analysis, selection } = response.data;

      setExtractedQuestion(extracted);
      setTextAnalysis(analysis);
      setTranscriptResult(null);
      setTranscriptAnalysis(null);

      addLog(`Question: "${extracted.questionText.substring(0, 50)}..."`);
      addLog(`AI suggested: ${analysis.suggestedAnswer} (${formatConfidence(analysis.confidence)})`);
      
      if (selection.ok) {
        addLog(`✅ Answer "${analysis.suggestedAnswer}" selected on page!`);
        if (autoValidate) {
          addLog("✅ Auto-validation triggered!");
        }
      } else {
        addLog("⚠️ Selection may have failed - check the page.");
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to auto-answer.";
      setError(message);
      addLog(`Auto-answer error: ${message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSelectAnswer = async (answerId: string): Promise<void> => {
    setIsBusy(true);
    setError(null);
    addLog(`Selecting answer: ${answerId}`);

    try {
      const response = await sendRuntimeRequest<{ selected: boolean; answerId: string }>({
        type: "SELECT_ANSWER",
        payload: { answerId, autoValidate }
      });

      if (!response.ok) {
        throw new Error(getErrorMessage(response));
      }

      addLog(`✅ Answer "${answerId}" selected!`);
      if (autoValidate) {
        addLog("✅ Auto-validation triggered!");
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to select answer.";
      setError(message);
      addLog(`Selection error: ${message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleValidate = async (): Promise<void> => {
    setIsBusy(true);
    setError(null);
    addLog("Clicking validate button...");

    try {
      const response = await sendRuntimeRequest<{ validated: boolean }>({
        type: "CLICK_VALIDATE"
      });

      if (!response.ok) {
        throw new Error(getErrorMessage(response));
      }

      addLog("✅ Validate button clicked!");
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to validate.";
      setError(message);
      addLog(`Validation error: ${message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleParserModeChange = async (value: ExtensionSettings["preferredParserMode"]): Promise<void> => {
    setError(null);
    try {
      await persistSettings({ preferredParserMode: value });
      addLog(`Parser mode set to ${value}.`);
    } catch (settingsError) {
      const message = settingsError instanceof Error ? settingsError.message : "Unable to save parser mode.";
      setError(message);
      addLog(`Parser mode update failed: ${message}`);
    }
  };

  const handleDebugModeToggle = async (checked: boolean): Promise<void> => {
    setError(null);
    try {
      await persistSettings({ debugMode: checked });
      addLog(`Debug mode ${checked ? "enabled" : "disabled"}.`);
    } catch (settingsError) {
      const message = settingsError instanceof Error ? settingsError.message : "Unable to save debug mode.";
      setError(message);
      addLog(`Debug mode update failed: ${message}`);
    }
  };

  const handleAnalysisProviderChange = async (
    value: ExtensionSettings["analysisProvider"]
  ): Promise<void> => {
    setError(null);
    try {
      await persistSettings({ analysisProvider: value });
      addLog(`Analysis provider set to ${value}.`);
    } catch (settingsError) {
      const message = settingsError instanceof Error ? settingsError.message : "Unable to save analysis provider.";
      setError(message);
      addLog(`Analysis provider update failed: ${message}`);
    }
  };

  const handleFallbackToggle = async (checked: boolean): Promise<void> => {
    setError(null);
    try {
      await persistSettings({ fallbackToMockOnProviderError: checked });
      addLog(`Fallback-to-mock ${checked ? "enabled" : "disabled"}.`);
    } catch (settingsError) {
      const message =
        settingsError instanceof Error ? settingsError.message : "Unable to save fallback setting.";
      setError(message);
      addLog(`Fallback setting update failed: ${message}`);
    }
  };

  const handleSaveEnabledSites = async (): Promise<void> => {
    const parsedSites = enabledSitesInput
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    setError(null);
    try {
      await persistSettings({ enabledSites: parsedSites });
      addLog("Enabled sites list updated.");
    } catch (settingsError) {
      const message =
        settingsError instanceof Error ? settingsError.message : "Unable to save enabled sites.";
      setError(message);
      addLog(`Enabled sites update failed: ${message}`);
    }
  };

  return (
    <main className="panel-root">
      <header className="panel-header">
        <div>
          <h1>Study Assistant</h1>
          <p>7speaking.com quiz helper with AI-powered answer suggestions.</p>
        </div>
      </header>

      <section className="controls-card auto-answer-section">
        <h2>🎯 Auto-Answer (7speaking)</h2>
        <p className="description">Extract question, analyze with AI, and auto-select the best answer.</p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={autoValidate}
            onChange={(event) => setAutoValidate(event.target.checked)}
          />
          <span>Auto-validate after selection</span>
        </label>
        <button 
          className="primary-button" 
          onClick={handleAutoAnswer} 
          disabled={isBusy || isRecording}
        >
          🚀 Auto-Answer Question
        </button>
      </section>

      <section className="controls-card">
        <h2>Manual Controls</h2>
        <div className="button-grid">
          <button onClick={handleAnalyzeQuestion} disabled={isBusy || isRecording}>
            Analyze page question
          </button>
          <button onClick={handleStartRecording} disabled={isBusy || isRecording}>
            Start recording
          </button>
          <button onClick={handleStopRecording} disabled={isBusy || !isRecording}>
            Stop recording
          </button>
          <button onClick={handleClear} disabled={isBusy}>
            Clear result
          </button>
        </div>
      </section>

      <section className="controls-card">
        <h2>Settings</h2>
        <label className="field">
          <span>Preferred parser mode</span>
          <select
            value={settings.preferredParserMode}
            onChange={(event) => void handleParserModeChange(event.target.value as ExtensionSettings["preferredParserMode"])}
          >
            <option value="auto">auto</option>
            <option value="quiz">quiz</option>
            <option value="aggressive">aggressive</option>
          </select>
        </label>

        <label className="field">
          <span>Analysis provider</span>
          <select
            value={settings.analysisProvider}
            onChange={(event) =>
              void handleAnalysisProviderChange(event.target.value as ExtensionSettings["analysisProvider"])
            }
          >
            <option value="mock">mock</option>
            <option value="openrouter">openrouter</option>
          </select>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.debugMode}
            onChange={(event) => void handleDebugModeToggle(event.target.checked)}
          />
          <span>Debug mode (show parser annotations and extra logs)</span>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.fallbackToMockOnProviderError}
            onChange={(event) => void handleFallbackToggle(event.target.checked)}
          />
          <span>Fallback to mock when provider request fails</span>
        </label>

        <label className="field">
          <span>Enabled sites (comma-separated match patterns)</span>
          <input
            type="text"
            value={enabledSitesInput}
            onChange={(event) => setEnabledSitesInput(event.target.value)}
            placeholder="https://example.com/*"
          />
        </label>
        <button className="secondary-button" onClick={() => void handleSaveEnabledSites()} disabled={isBusy}>
          Save enabled sites
        </button>
      </section>

      {error ? <section className="error-card">{error}</section> : null}

      <section className="result-card">
        <h2>Detected question</h2>
        <p>{extractedQuestion?.questionText ?? "No question extracted yet."}</p>
      </section>

      <section className="result-card">
        <h2>Extracted options</h2>
        {extractedQuestion?.options.length ? (
          <>
            <ul className="options-list">
              {extractedQuestion.options.map((option) => (
                <li key={option.id} className="option-item">
                  <button 
                    className={`option-button ${latestAnalysis?.suggestedAnswer === option.id ? 'suggested' : ''}`}
                    onClick={() => handleSelectAnswer(option.id)}
                    disabled={isBusy}
                  >
                    <strong>{option.id.toUpperCase()}.</strong> {option.text}
                    {latestAnalysis?.suggestedAnswer === option.id && <span className="badge">AI Pick</span>}
                  </button>
                </li>
              ))}
            </ul>
            <button className="validate-button" onClick={handleValidate} disabled={isBusy}>
              ✓ Validate Answer
            </button>
          </>
        ) : (
          <p>No options extracted.</p>
        )}
      </section>

      <section className="result-card">
        <h2>Transcript</h2>
        <p>{transcriptResult?.transcript || "No transcript yet."}</p>
        {transcriptResult ? (
          <p className="muted">
            Confidence: {formatConfidence(transcriptResult.confidence)} | Language:{" "}
            {transcriptResult.language}
          </p>
        ) : null}
      </section>

      <section className="result-card">
        <h2>Suggested answer</h2>
        <p>{latestAnalysis?.suggestedAnswer ?? "No answer suggestion yet."}</p>
        {latestAnalysis ? <p className="muted">Confidence: {formatConfidence(latestAnalysis.confidence)}</p> : null}
        {latestAnalysis ? <p className="muted">Source: {latestAnalysis.source}</p> : null}
      </section>

      <section className="result-card">
        <h2>Explanation</h2>
        <p>{latestAnalysis?.explanation ?? "No explanation yet."}</p>
        {latestAnalysis ? <p className="muted">{latestAnalysis.safetyNotice}</p> : null}
      </section>

      <section className="result-card">
        <h2>Likely problem</h2>
        <p>{latestAnalysis?.likelyProblem ?? "No likely problem provided."}</p>
      </section>

      <section className="result-card">
        <h2>Recommended next step</h2>
        <p>{latestAnalysis?.recommendedNextStep ?? "No recommended next step provided."}</p>
      </section>

      <section className="result-card">
        <h2>Raw extracted text (debug)</h2>
        <pre>{extractedQuestion?.rawText ?? "No raw text available."}</pre>
      </section>

      <section className="result-card">
        <h2>Logs / debug</h2>
        <ul className="logs-list">
          {logs.length > 0 ? logs.map((entry) => <li key={entry}>{entry}</li>) : <li>No logs yet.</li>}
        </ul>
        {extractedQuestion?.debugLog.length ? (
          <>
            <h3>Parser debug</h3>
            <ul className="logs-list">
              {extractedQuestion.debugLog.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </>
        ) : null}
        {transcriptResult?.debugNotes ? (
          <p className="muted">Transcription debug: {transcriptResult.debugNotes}</p>
        ) : null}
      </section>
    </main>
  );
}
