# OpenVox

A self-hosted **developer podcast studio** powered by [Pocket-TTS](https://github.com/kyutai-labs/pocket-tts). Turn technical documentation, markdown files, and web pages into listenable podcast-like episodes — all running locally on CPU.

Built on top of an OpenAI-compatible TTS API server. Any OpenAI TTS client can still use this as a drop-in replacement while the studio UI provides a full workflow for long-form content.

Tested and working fully with [WingmanAI by Shipbit](https://www.wingman-ai.com/). Due to low resource use, can be used for real time local text to speech even while playing intensive video games (even in VR!) with WingmanAI.

## Features

**OpenVox (Web UI at `/`)**
- Import content from files (.md, .txt), URLs, or pasted text
- Automatic text cleaning and normalization for TTS
- Configurable chunking strategies (paragraph, sentence, heading, max chars)
- Background audio generation with progress tracking
- Chunk-based audio player with seek, skip, and auto-advance
- Persistent library with folders, tags, and playback position
- Drag-and-drop organization
- Dark theme, keyboard shortcuts, responsive layout

**OpenAI-Compatible API**
- `POST /v1/audio/speech` — generate speech (streaming + file)
- `GET /v1/voices` — list available voices
- `GET /health` — health check for containers
- Works with any OpenAI TTS client

**Infrastructure**
- CPU optimized — no GPU required
- Docker ready with persistent data volumes
- 150+ community voices included
- Voice cloning from short audio samples

## Quick Start

### Docker (Recommended)

```bash
git clone https://github.com/theepicsaxguy/OpenVox.git
cd OpenVox

docker compose up -d
```

Open `http://localhost:49112` — the OpenVox UI loads at `/`.

Data (library database, uploaded sources, generated audio) persists in `./data/`.

### Python (from source)

```bash
git clone https://github.com/theepicsaxguy/OpenVox.git
cd OpenVox

python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install -r requirements.txt
python server.py
```

## Studio Workflow

1. **Import** — upload a file, paste a URL, or type/paste text
2. **Preview** — see raw vs cleaned text side-by-side
3. **Chunk** — choose strategy and preview chunk boundaries
4. **Generate** — select voice and format, queue for background generation
5. **Listen** — play through chunks with a podcast-style player
6. **Organize** — folders, tags, playback progress in the library tree

## API Usage

The OpenAI-compatible API works exactly as before:

```bash
curl http://localhost:49112/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model": "tts-1", "input": "Hello world!", "voice": "alba"}' \
  --output speech.mp3
```

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:49112/v1", api_key="not-needed")

response = client.audio.speech.create(
    model="tts-1",
    voice="alba",
    input="Hello world!"
)
response.stream_to_file("output.mp3")
```

### API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | OpenVox web UI |
| `/health` | GET | Health check |
| `/v1/voices` | GET | List voices |
| `/v1/audio/speech` | POST | Generate speech (OpenAI-compatible) |
| `/api/studio/*` | Various | Studio API (sources, episodes, library, playback, settings) |

### Speech Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `model` | string | No | - | Ignored (for OpenAI compatibility) |
| `input` | string | Yes | - | Text to synthesize |
| `voice` | string | No | `alba` | Voice ID (see `/v1/voices`) |
| `response_format` | string | No | `mp3` | `mp3`, `wav`, `pcm`, `opus`, `flac` |
| `stream` | boolean | No | `false` | Enable streaming response |

## Custom Voices

1. Place audio files (`.wav`, `.mp3`, `.flac`) in a voices directory
2. Configure the server:

   ```bash
   # Docker
   POCKET_TTS_VOICES_DIR=/path/to/voices docker compose up -d

   # Python
   python server.py --voices-dir /path/to/voices
   ```

3. Use by filename: `{"voice": "my_voice.wav", "input": "Hello!"}`

**Built-in voices:** `alba`, `marius`, `javert`, `jean`, `fantine`, `cosette`, `eponine`, `azelma`

The `voices/` directory includes 150+ community-contributed voices.

### Voice File Guidelines

- **Duration:** 3-10 seconds of clear speech
- **Quality:** Clean audio without background noise
- **Format:** WAV, MP3, or FLAC

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POCKET_TTS_HOST` | `0.0.0.0` | Server bind address |
| `POCKET_TTS_PORT` | `49112` | Server port |
| `POCKET_TTS_VOICES_DIR` | `./voices` | Custom voices directory |
| `POCKET_TTS_DATA_DIR` | `./data` | Studio data directory (DB, sources, audio) |
| `POCKET_TTS_MODEL_PATH` | - | Custom model path |
| `POCKET_TTS_STREAM_DEFAULT` | `true` | Enable streaming by default |
| `POCKET_TTS_LOG_LEVEL` | `INFO` | Log level: DEBUG, INFO, WARNING, ERROR |
| `POCKET_TTS_LOG_DIR` | `./logs` | Log files directory |
| `HF_TOKEN` | - | Hugging Face token (for voice cloning) |

### Data Directory

The studio stores all persistent data in `POCKET_TTS_DATA_DIR` (default: `./data/`):

```
data/
  podcast_studio.db     # SQLite database (library, settings, playback state)
  sources/              # Uploaded source files
  audio/                # Generated audio (per-episode subdirectories)
```

Back up by copying this single directory.

## Project Structure

```
OpenVox/
├── app/
│   ├── __init__.py              # Flask app factory
│   ├── config.py                # Configuration from environment
│   ├── logging_config.py        # Logging with file rotation
│   ├── routes.py                # OpenAI-compatible API endpoints
│   ├── services/
│   │   ├── audio.py             # Audio format conversion, streaming
│   │   └── tts.py               # TTS model service, voice cache
│   └── studio/                  # Podcast Studio module
│       ├── __init__.py          # Blueprint registration
│       ├── db.py                # SQLite schema and connections
│       ├── repositories.py      # DB query abstraction layer
│       ├── schemas.py           # Marshmallow schemas for request bodies
│       ├── sources_routes.py    # Source CRUD endpoints
│       ├── episodes_routes.py   # Episode CRUD endpoints
│       ├── folders_routes.py    # Folder CRUD endpoints
│       ├── tags_routes.py       # Tag management endpoints
│       ├── playback_routes.py   # Playback state endpoints
│       ├── settings_routes.py   # Settings endpoints
│       ├── library_routes.py    # Library tree, generation status
│       ├── ingestion.py         # File/URL/text import
│       ├── git_ingestion.py     # Git repository import
│       ├── normalizer.py        # Text cleaning for TTS
│       ├── chunking.py          # Text chunking strategies
│       ├── breathing.py         # Natural pause insertion
│       ├── generation.py        # Background generation queue
│       └── audio_assembly.py    # Chunk merging for export
├── static/
│   ├── css/
│   │   ├── studio.css           # Studio styles (dark theme)
│   │   └── style.css            # Base styles
│   └── js/studio/               # Vanilla JS ES modules
│       ├── main.js              # Entry point, router, toast/confirm
│       ├── utils.js             # Shared helpers (escapeHtml, formatTime, etc.)
│       ├── dom.js               # Safe DOM manipulation helpers
│       ├── state.js             # Pub/sub state management
│       ├── library.js           # Library view, folder tree
│       ├── editor.js            # Import/source/episode views
│       ├── settings.js          # Settings panel
│       ├── player.js            # Player coordinator
│       ├── player-state.js      # Player state management
│       ├── player-controls.js   # Play/pause, seek, volume
│       ├── player-queue.js      # Queue management, shuffle, repeat
│       ├── player-waveform.js   # Waveform visualization
│       ├── player-render.js     # Mini/full player rendering
│       ├── player-chunk.js      # Chunk loading and playback
│       ├── api.ts               # API wrapper (import from here)
│       └── client.ts            # Generated TypeScript client (DO NOT EDIT)
├── scripts/
│   ├── generate_openapi.py      # Generates OpenAPI spec from Flask routes
│   └── validate_openapi.py      # Validates OpenAPI spec completeness
├── e2e/
│   └── studio.spec.js           # Playwright E2E tests
├── templates/studio.html        # Studio UI shell
├── data/                        # Persistent data (Docker volume)
├── voices/                      # Voice files (150+ included)
├── server.py                    # Entry point, CLI, Waitress server
├── Dockerfile
├── docker-compose.yml
├── docker-entrypoint.sh         # Container entrypoint
├── openapi.yaml                 # Generated OpenAPI spec
├── orval.config.mjs             # Orval client generation config
├── pyproject.toml               # Python project config, ruff settings
├── requirements.txt             # Python dependencies
└── package.json                 # Node.js dependencies and scripts
```

## Development

```bash
pip install -r requirements.txt
python server.py --log-level DEBUG
```

### API Client Generation

After modifying any backend route, regenerate the TypeScript API client:

```bash
pnpm install
pnpm run client:generate
```

This runs `scripts/generate_openapi.py` to produce `openapi.yaml`, then Orval generates `static/js/studio/client.ts`. CI validates that generated files are up to date.

### Linting

```bash
pip install ruff
ruff check .
ruff format .

# JavaScript
pnpm run lint
```

## Troubleshooting

### Model Loading Takes Long

First run downloads the model (~500MB). Subsequent runs use the cached model. Docker persists the cache in a named volume.

### Voice Cloning Requires HF Token

Get a token from https://huggingface.co/settings/tokens and set `HF_TOKEN`.

### Port Already in Use

```bash
python server.py --port 8080
# or
POCKET_TTS_PORT=8080 docker compose up -d
```

## Credits

- [Pocket-TTS](https://github.com/kyutai-labs/pocket-tts) by Kyutai Labs
- [pocket-tts-openai_streaming_server](https://github.com/teddybear082/pocket-tts-openai_streaming_server) by teddybear082 (original project this builds upon)
- Community voice contributors (see [voices/credits.txt](voices/credits.txt))

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

Pocket-TTS is subject to its own license terms.
