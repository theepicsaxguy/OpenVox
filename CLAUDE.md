I’m building a long-term, self-hosted “developer podcast studio” on top of the existing **PocketTTS OpenAI-compatible server**. The repo already gives me reliable local TTS + streaming; what it *doesn’t* give me is a real product workflow for turning real-world technical content (docs, markdown, web pages) into something I can **listen to like a podcast**, organize, and resume over time.

This is not an MVP. This is intended to be my primary way of consuming professional knowledge for the next **10+ years**, so it must be **reliable, maintainable, configurable from the UI, and pleasant to use every day**.

---

## Why are we making this? (problem + goal)

### The problem I’m solving
- Technical documentation is long and dense, and I can’t always read it (walking, commuting, chores, eyes tired, etc.).
- Current UI is basically a “small text box → generate speech”, with a character limit and no workflow.
- There’s no concept of:
  - importing documents/URLs cleanly,
  - chunking long content safely,
  - saving outputs in a library,
  - resuming where I left off,
  - organizing content like a knowledge collection.

### The goal
Turn technical text into **high-quality, controllable audio sessions** that behave like podcast episodes:
- Import content (files or URLs)
- Clean it (markdown normalization / HTML readability extraction)
- Chunk it (sentence/paragraph/etc. — configurable, not hardcoded)
- Generate audio (streaming + downloadable)
- Play it back with a real player (seek, skip, speed if possible)
- Save it in a **library with history and progress tracking**
- Organize it in a **tree view** (folders/tags/rename/move/reorder)

---

## What we’re building (feature list, clear and explicit)

### 1) Inputs (content sources)
- Upload: `.md`, `.txt` (initially), extensible later (PDF/epub optional later).
- URL import: paste any link to text content:
  - extract readable article/documentation text
  - strip HTML/menus/nav/ads/code chrome where appropriate
- Preview the cleaned text before generating audio.

### 2) Text cleaning / normalization
- For Markdown: normalize headings, lists, code blocks (decide how code is spoken).
- For HTML: “readability” extraction + sanitize.
- Always show the final “what will be spoken” text in the UI.

### 3) Chunking (required because TTS input is limited)
- Chunking strategy selectable in the frontend (no hardcoded rules):
  - by paragraph
  - by sentence / punctuation
  - by heading sections (nice for docs)
  - max characters per chunk (configurable)
- Chunk preview in UI: see boundaries before generating.
- Ability to regenerate only a chunk (for fixes/edits later).

### 4) Audio generation + playback
- Generate per-chunk audio and present it as one “episode”.
- Player controls:
  - play/pause
  - seek scrubber
  - skip forward/back (configurable seconds)
  - next/previous chunk
  - download episode audio (and/or per-chunk)
- Remember listening position (per episode; ideally per chunk timestamp).

### 5) Library + history (tree view)
A persistent library that acts like a file explorer + podcast manager:
- tree view folders
- rename, move, reorder, create folders
- tags (e.g., kubernetes, networking, incident-reviews)
- history of generated episodes
- show progress (e.g., 63% listened, last played date)

### 6) Everything tweakable from the frontend
- No hardcoded chunking settings, voice choice, output format, etc.
- A settings panel where I can tune:
  - chunk strategy + max length
  - voice
  - output format
  - streaming vs batch
  - cleanup rules (e.g., ignore code blocks, read code blocks, summarize code blocks later)

### 7) Deployment + reliability (Docker/Kubernetes mindset)
- Keep Docker-first.
- Run as non-root, minimal privileges.
- Stable storage volumes for:
  - library database
  - uploaded sources
  - generated audio
  - caches
- Simple backup story (copy one data directory).
- Resource control: aim to run well on **one CPU** by default (and avoid unnecessary background work).

---

## Architecture direction (so it lasts 10 years, without overcomplicating)

**Reuse what exists**: keep the current server/API and extend around it rather than rewriting everything.

Add a few clean “black box” modules (each replaceable later):
1. **Ingestion module**  
   Input: file or URL  
   Output: canonical cleaned text + metadata (title, source url, timestamps)

2. **Chunking module**  
   Input: cleaned text + chunking settings  
   Output: ordered chunks with ids + boundaries

3. **Library module (persistence)**  
   Stores: sources, episodes, chunks, audio files, tags, folder structure, playback position

4. **Playback/Export module**  
   Serves audio, merges or playlists chunks, supports downloads

Each module should have a tiny documented interface so you can swap implementations later (e.g., change the DB, change the frontend, change the extraction library) without rewriting the whole system.

---

## UI/UX direction (what “amazing” means here)
- Dark mode first.
- Three-pane layout is ideal:
  1) Library tree (left)  
  2) Document/episode view + chunk preview (center)  
  3) Settings + voice/chunk controls (right)
- Clear “import → preview → chunk → generate → listen → saved” flow.
- Feels like a podcast player, but optimized for docs.
