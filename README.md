# Study Assistant Chrome Extension (MV3)

Manual-assist Chrome extension scaffold for study/practice use on websites you own or have permission to use.

The extension only extracts visible content and provides suggestions in the side panel for manual review.
It does **not** auto-select answers, auto-fill forms, submit forms, or simulate answering behavior.

## Features
- Text question mode
  - Extract visible question text, options, and context from DOM
  - Strategy-based parser (`quiz`, `form-like`, `generic`)
  - Analyze extracted text via mock provider
- Audio question mode
  - Record microphone audio with `MediaRecorder`
  - Deterministic mock transcription from audio blob metadata
  - Analyze transcript and show suggestion + explanation + confidence
- Side panel UI
  - Sections for question, options, transcript, answer, explanation, raw text, debug logs
- Settings via `chrome.storage`
  - Enabled sites
  - Debug mode
  - Preferred parser mode

## Safety Constraints
- No auto-answering implementation
- No auto-clicking, auto-filling, or form submission
- No keyboard/mouse simulation for answering actions
- No bypass logic for site protections, timers, or locks

## Tech Stack
- Manifest V3
- TypeScript (strict)
- React (side panel)
- Vite + `@crxjs/vite-plugin`
- Chrome extension message passing + storage APIs

## Project Tree
```text
.
├── manifest.json
├── package.json
├── README.md
├── sidepanel.html
├── tsconfig.json
├── vite.config.ts
├── .eslintrc.cjs
├── public/
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon32.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   └── mock/
│       └── sample-quiz.html
└── src/
    ├── background/
    │   └── index.ts
    ├── content/
    │   ├── index.ts
    │   └── extraction/
    │       ├── parser.ts
    │       ├── strategies.ts
    │       └── visibility.ts
    ├── sidepanel/
    │   ├── App.tsx
    │   ├── main.tsx
    │   ├── styles.css
    │   └── audio/
    │       └── recorder.ts
    └── shared/
        ├── messaging.ts
        ├── messages.ts
        ├── types.ts
        ├── analysis/
        │   ├── mockProvider.ts
        │   ├── providerFactory.ts
        │   └── types.ts
        ├── mock/
        │   └── mockData.ts
        └── storage/
            └── settingsStorage.ts
```

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start development:
   ```bash
   npm run dev
   ```
3. Build production output:
   ```bash
   npm run build
   ```
4. Optional checks:
   ```bash
   npm run typecheck
   npm run lint
   ```

## Load Unpacked Extension in Chrome
1. Build first (`npm run build`).
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `dist` folder created by Vite.
6. Open the extension side panel and use the controls.

## Important Host Permission Note
Current `manifest.json` host scope is conservative by default:

```json
"host_permissions": ["https://example.com/*"]
```

Update both:
- `host_permissions`
- `content_scripts.matches`

to domains you own or are explicitly authorized to use.

## Text Flow (Manual)
1. Open a permitted page with visible question content.
2. In side panel, click **Analyze page question**.
3. Extension extracts question/options/context and runs mock analysis.
4. Review suggested answer, confidence, explanation, and raw extracted text.

## Audio Flow (Manual)
1. Click **Start recording**.
2. Ask/read the question aloud.
3. Click **Stop recording**.
4. Extension performs deterministic mock transcription + transcript analysis.
5. Review transcript and suggestion manually.

## Example Parser Logic for Sample Quiz DOM
Use [`public/mock/sample-quiz.html`](public/mock/sample-quiz.html) as a local fixture.

The `quizStrategy` parser detects:
- question container via selectors like `[data-question]`, `.quiz-question`, `.question`
- question text from `.question-text` or heading/paragraph fallbacks
- options from `li`, `label`, `.option`, `.choice`, role-based option elements
- context from `.instructions`, `.context`, `.hint`

## Mock Providers
- Text/audio mock data: `src/shared/mock/mockData.ts`
- Provider contract: `src/shared/analysis/types.ts`
- Current implementation: `src/shared/analysis/mockProvider.ts`

No paid API is needed for this version.

## Plug In Your Own Backend Later
1. Create a new provider implementing:
   - `analyzeTextQuestion(input)`
   - `transcribeAudio(audioBlob)`
   - `analyzeTranscript(transcript)`
2. Swap provider returned by `getAnalysisProvider()` in:
   - `src/shared/analysis/providerFactory.ts`
3. Keep API keys out of source and extension bundle.
   Use your backend as a secure proxy.
