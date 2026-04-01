export type RecorderErrorCode =
  | "UNSUPPORTED"
  | "PERMISSION_DENIED"
  | "PERMISSION_ERROR"
  | "NOT_RECORDING"
  | "STOP_ERROR";

export class RecorderError extends Error {
  code: RecorderErrorCode;

  constructor(code: RecorderErrorCode, message: string) {
    super(message);
    this.name = "RecorderError";
    this.code = code;
  }
}

let mediaRecorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
let audioChunks: BlobPart[] = [];

function chooseMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

function stopAndReleaseStream(): void {
  if (!mediaStream) {
    return;
  }

  for (const track of mediaStream.getTracks()) {
    track.stop();
  }
  mediaStream = null;
}

export function isRecordingActive(): boolean {
  return mediaRecorder?.state === "recording";
}

export async function startRecording(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new RecorderError(
      "UNSUPPORTED",
      "This browser does not support microphone recording with MediaRecorder."
    );
  }

  if (isRecordingActive()) {
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new RecorderError(
        "PERMISSION_DENIED",
        "Microphone access was denied. Allow microphone permissions and try again."
      );
    }

    throw new RecorderError(
      "PERMISSION_ERROR",
      error instanceof Error ? error.message : "Unable to start microphone capture."
    );
  }

  audioChunks = [];
  const mimeType = chooseMimeType();
  mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);

  mediaRecorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
    }
  };

  mediaRecorder.start(200);
}

export async function stopRecording(): Promise<Blob> {
  if (!mediaRecorder || mediaRecorder.state !== "recording") {
    throw new RecorderError("NOT_RECORDING", "No active recording is in progress.");
  }

  const recorder = mediaRecorder;

  const blob = await new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => {
      reject(new RecorderError("STOP_ERROR", "Recording failed while stopping MediaRecorder."));
    };

    recorder.onstop = () => {
      const output = new Blob(audioChunks, {
        type: recorder.mimeType || "audio/webm"
      });
      resolve(output);
    };

    recorder.stop();
  });

  mediaRecorder = null;
  stopAndReleaseStream();
  return blob;
}
