# YT StudyFlow

Chrome extension that turns YouTube lectures into an **AI study workspace** with transcript RAG, cited answers, notes, quizzes, flashcards (SM-2), and learning analytics.

> **Project path:** `second_aprt/yt-studyflow` — load unpacked from `dist/` after `npm run build`.

---

## 1) Goal of the extension

Make YouTube lectures usable as a *personal study system* by:

- turning transcripts into a searchable knowledge base
- letting you ask questions with **retrieval + citations** (timestamps)
- converting lecture content into **notes, quizzes, and flashcards**
- tracking how you study (confusion zones + progress heatmap)

---

## 2) Features (what it does)

### Playlist-level RAG (shared memory)

- Detects `?list=...` on YouTube watch URLs
- Indexes each opened video into a **shared playlist knowledge base** stored in **IndexedDB**
- Chat scope options:
  - **This video**
  - **Whole playlist**

**Example:** “What did the instructor say about Dynamic Programming earlier in the course?”

---

### Timestamp-cited answers

- Chat replies can include **clickable timestamps**
- Each timestamp can show an excerpt preview
- In playlist mode, citations can jump you to the exact lecture that contains the answer

**Format:** `03:24 · 14:11` (plus lecture/video title when relevant)

---

### Embedding-based retrieval (real RAG)

- Transcript **chunking** and semantic indexing
- Uses **Gemini `gemini-embedding-001`** embeddings
- Stores embeddings + retrieval metadata locally in **IndexedDB**
- Performs **hybrid retrieval**:
  - cosine similarity over embeddings
  - merged with keyword retrieval

This is used to ground AI answers in the actual lecture content.

---

### Hybrid AI tutor

- Generates study explanations using:
  - the **video transcript** (what the instructor said)
  - and **general knowledge** for missing context (definitions, DSA, interview prep, etc.)
- Tutor modes:
  - **Concise**
  - **Deep**
  - **Interview** (Q&A-style)

---

### Multi-video revision (SM-2 spaced repetition)

- Flashcards generated **per video** or **across an entire playlist**
- Uses **SM-2** spaced repetition scheduling inside the **Revision** tab
- Lets you generate course-scale decks after indexing multiple lectures

---

### Agentic study mode (“Study” tab)

Workflow (high-level):

1. Retrieves relevant sections across indexed playlist videos (**vector + keyword**)
2. Builds a **learning path** (watch → notes → quiz → flashcards → review)
3. Tracks **mastery %** as you complete steps
4. Connects steps back to lecture context (timestamps + other tabs)

---

### Learning analytics (confusion + progress heatmap)

- Monitors key player behaviors (rewind/seek/pause patterns)
- Detects **confusion zones** and shows them as a **progress/heatmap overlay**
- Provides actionable study signals (e.g., which parts you keep returning to)

---

<img width="2849" height="1442" alt="Screenshot 2026-06-01 134243" src="https://github.com/user-attachments/assets/6c29b29d-cb3f-4c8e-83d3-35a8499cfad3" />





## 3) Tech stack

### Frontend (extension UI)

- **TypeScript**
- **React 18**
- **Vite** + **CRXJS** (Manifest V3 build tooling)
- **Tailwind CSS** (plus CSS isolation)
- **Framer Motion** (UI animations)
- **Zustand** (client state)
- **Dexie** (IndexedDB wrapper)

### AI / retrieval

- **Google Gemini API** via `@google/generative-ai`
  - `generateContent` for chat/notes/quizzes
  - `gemini-embedding-001` for embeddings
- **Hybrid retrieval** combining embedding similarity + keyword matching

### YouTube integration

- Content-script + **Shadow DOM sidebar injection** on `youtube.com/watch`
- Captures transcript/caption network activity and transports it into the extension for processing

---

## 4) How to build and use

### Build (developer)

1. Prerequisite: **Node 18+**
2. Install and build:

```bash
cd second_aprt/yt-studyflow
npm install
npm run build
```

3. Chrome:
   - Go to `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select the extension’s `dist/` folder

### Configure the Gemini API key

1. Copy `.env.example` → `.env`
2. Set your key:

- `VITE_GEMINI_API_KEY=your_key`

3. Rebuild and reload the extension:

```bash
npm run build
```

### Use (day-to-day)

- Open a lecture on YouTube (ideally a video inside a playlist)
- Let the extension index transcripts as you watch

Common workflows:

| Goal | Steps |
|------|--------|
| Playlist RAG | Open videos from the same playlist so the shared IndexedDB knowledge base is built |
| Cross-lecture chat | Chat → **Whole playlist** |
| Vector-grounded answers | Requires API key; retrieval uses embedded transcript chunks |
| Study path | **Study** tab → enter topic → build the learning path |
| Course flashcards | **Revision** tab → generate flashcards after enough playlist content is indexed |

---

## Privacy

- Gemini API key is provided via `.env` at build-time (`VITE_GEMINI_API_KEY`).
- Transcripts and embeddings are stored **locally** in IndexedDB.
- Gemini requests are proxied through the extension background worker (so the key is not directly used in page JS).

---

## License

MIT — side project for learning; not affiliated with Google or YouTube.

