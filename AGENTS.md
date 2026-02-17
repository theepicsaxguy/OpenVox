# Project Overview

A self-hosted "Podcast Studio" built on top of PocketTTS OpenAI-compatible server. This tool turns technical documentation into listenable podcast episodes with a complete library management system.

## Architecture

```
server.py                    # Entry point, CLI, starts Waitress
    └── app/__init__.py      # Flask app factory
        ├── app/routes.py    # API endpoints (OpenAI-compatible)
        ├── app/config.py    # Environment config
        └── app/services/
            ├── tts.py       # TTSService: model, voice cache
            └── audio.py     # Format conversion, streaming
        └── app/studio/      # Podcast Studio feature set
            ├── __init__.py  # Blueprint registration
            ├── db.py        # SQLite persistence (no ORM)
            ├── routes.py    # Studio API endpoints
            ├── ingestion.py # File/URL/text import
            ├── normalizer.py # Text cleaning/normalization
            ├── chunking.py  # Text chunking strategies
            ├── generation.py # Single-worker audio generation queue
            └── audio_assembly.py # Merge chunks to full episode
```

## Key Files

| File | Purpose |
|------|---------|
| `server.py` | Entry point, CLI args, Waitress server |
| `app/routes.py` | HTTP endpoints: `/`, `/health`, `/v1/voices`, `/v1/audio/speech` |
| `app/services/tts.py` | Model loading, voice caching, generation |
| `app/services/audio.py` | Audio format conversion, streaming |
| `app/studio/routes.py` | Studio API: sources, episodes, library, playback |
| `app/studio/db.py` | SQLite schema and connection management |
| `app/studio/generation.py` | Background audio generation queue |
| `templates/studio.html` | Three-pane Studio UI |
| `static/js/studio/` | Frontend JavaScript modules |
| `static/css/studio.css` | Dark mode UI styles |

## API Endpoints

### OpenAI-Compatible (unchanged)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Web UI (Studio) |
| `/health` | GET | Health check |
| `/v1/voices` | GET | List voices |
| `/v1/audio/speech` | POST | Generate speech |

### Studio API (`/api/studio`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/sources` | GET/POST | List/create sources |
| `/sources/{id}` | GET/PUT/DELETE | Source operations |
| `/sources/{id}/re-clean` | POST | Re-normalize text |
| `/preview-clean` | POST | Preview text normalization |
| `/preview-chunks` | POST | Preview chunking |
| `/episodes` | GET/POST | List/create episodes |
| `/episodes/{id}` | GET/DELETE | Episode operations |
| `/episodes/{id}/regenerate` | POST | Regenerate all chunks |
| `/episodes/{id}/chunks/{idx}/regenerate` | POST | Regenerate single chunk |
| `/episodes/{id}/audio/{idx}` | GET | Serve chunk audio |
| `/episodes/{id}/audio/full` | GET | Download full episode |
| `/generation/status` | GET | Queue status |
| `/library/tree` | GET | Full library structure |
| `/folders` | POST | Create folder |
| `/folders/{id}` | PUT/DELETE | Folder operations |
| `/playback/{id}` | GET/POST | Playback state |
| `/settings` | GET/PUT | User settings |
| `/tags` | GET/POST | Tag management |

## Configuration (Environment Variables)

| Variable | Default | Purpose |
|----------|---------|---------|
| `POCKET_TTS_HOST` | `0.0.0.0` | Bind address |
| `POCKET_TTS_PORT` | `49112` | Port |
| `POCKET_TTS_VOICES_DIR` | None | Custom voices path |
| `POCKET_TTS_DATA_DIR` | `./data` | Studio data directory |
| `POCKET_TTS_STREAM_DEFAULT` | `true` | Default streaming |
| `POCKET_TTS_LOG_LEVEL` | `INFO` | Log verbosity |
| `HF_TOKEN` | None | HuggingFace token |

## Workflow

1. **Import** (`#import`) - Upload file, paste URL, or enter text
2. **Review** (`#review/{id}`) - View cleaned text, configure voice/chunk settings, generate
3. **Episode** (`#episode/{id}`) - Track generation progress, play audio, download
4. **Library** (left panel) - Organize sources/episodes in folders

## Development

```bash
# Run locally
pip install -r requirements.txt
python server.py --log-level DEBUG

# Run with Docker
docker compose up --build

# Test OpenAI endpoint
curl http://localhost:49112/health
curl -X POST http://localhost:49112/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input": "Hello", "voice": "alba"}' -o test.mp3
```

## Code Style

- Linter/formatter: `ruff` (config in `pyproject.toml`)
- Line length: 100
- Single quotes
- Type hints optional but encouraged

## Deployment

- Docker-first with non-root user
- CPU-only PyTorch (smaller image)
- Single-worker generation queue (good for 1 CPU)
- Data persistence via volume mounts:
  - `./data` - SQLite DB, sources, audio files
  - `./logs` - Application logs

## Data Storage

All data stored in `POCKET_TTS_DATA_DIR` (default `/app/data`):

```
data/
├── podcast_studio.db    # SQLite database
├── sources/             # Original imported files
└── audio/               # Generated audio chunks
    └── {episode_id}/
        ├── 0.wav
        ├── 1.wav
        └── ...
```

## Generation Queue

- Single background thread processes episodes sequentially
- Good for CPU-constrained environments
- No GPU code paths (CPU-only)
- Status tracking: `pending` → `generating` → `ready`/`error`

## Frontend Architecture

Three-pane layout:
- **Left**: Library tree (folders, sources, episodes)
- **Center**: Dynamic content (import, review, episode views)
- **Right**: Settings panel
- **Bottom**: Audio player bar

Hash routing:
- `#import` - Import new content
- `#review/{source_id}` - Review and generate episode
- `#episode/{episode_id}` - View episode, play audio
- `#source/{source_id}` - View source details

JavaScript modules:
- `main.js` - Entry point, routing, utilities
- `editor.js` - Import, review, episode views
- `library.js` - Tree rendering, drag/drop, context menus
- `player.js` - Audio player, playback state
- `settings.js` - Settings persistence, voice loading
- `api.js` - API client
- `state.js` - Simple pub/sub state management

## Design Principles

### SOLID Principles (Python)

- **S**ingle Responsibility: Each module/class should do one thing well
  - `routes.py` handles HTTP, `db.py` handles persistence, `generation.py` handles queue
- **O**pen/Closed: Open for extension, closed for modification
  - Add new chunking strategies without modifying existing code
  - Add new cleaning options via options object, not if/else chains
- **L**iskov Substitution: Subtypes should be substitutable for base types
- **I**nterface Segregation: Prefer small, focused interfaces
- **D**ependency Inversion: Depend on abstractions, not concretions
  - Use service functions (`get_tts_service()`) rather than direct imports where appropriate

### Code Reuse Guidelines

Before writing new code, check if existing solutions exist:

1. **Frontend utilities**: Check `main.js` for `escapeHtml`, `formatTime`, `toast`, `confirm`, etc.
2. **State management**: Use `state.js` pub/sub - don't create new event systems
3. **API calls**: Use `api.js` functions, add new endpoints there
4. **CSS utilities**: Check existing classes in `studio.css` before adding new styles
5. **Python utilities**: Check `app/studio/` for existing helpers before adding new modules

Avoid:
- Reinventing common patterns (modals, toasts, dropdowns already exist)
- Duplicating similar logic in multiple places
- Adding new state management when `state.js` suffices
- Creating custom CSS when existing classes work
