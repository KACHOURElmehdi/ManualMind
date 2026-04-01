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
      addLog("Text analysis completed.");
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
      setExtractedQuestion(null);
      setTextAnalysis(null);
      addLog("Mock transcription complete.");

      const analysisResponse = await sendRuntimeRequest<AnalysisResult>({
        type: "ANALYZE_TRANSCRIPT",
        payload: {
          transcript: transcriptResponse.data.transcript
        }
      });

      if (!analysisResponse.ok) {
        throw new Error(getErrorMessage(analysisResponse));
      }

      setTranscriptAnalysis(analysisResponse.data);
      addLog("Transcript analysis completed.");
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
          <p>Manual review only. No auto-answering behavior is implemented.</p>
        </div>
      </header>

      <section className="controls-card">
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

        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.debugMode}
            onChange={(event) => void handleDebugModeToggle(event.target.checked)}
          />
          <span>Debug mode (show parser annotations and extra logs)</span>
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
          <ul>
            {extractedQuestion.options.map((option) => (
              <li key={option.id}>
                <strong>{option.id.toUpperCase()}.</strong> {option.text}
              </li>
            ))}
          </ul>
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
      </section>

      <section className="result-card">
        <h2>Explanation</h2>
        <p>{latestAnalysis?.explanation ?? "No explanation yet."}</p>
        {latestAnalysis ? <p className="muted">{latestAnalysis.safetyNotice}</p> : null}
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
