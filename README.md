# PocketTTS Podcast Studio

A self-hosted **developer podcast studio** powered by [Pocket-TTS](https://github.com/kyutai-labs/pocket-tts). Turn technical documentation, markdown files, and web pages into listenable podcast-like episodes — all running locally on CPU.

Built on top of an OpenAI-compatible TTS API server. Any OpenAI TTS client can still use this as a drop-in replacement while the studio UI provides a full workflow for long-form content.

Tested and working fully with [WingmanAI by Shipbit](https://www.wingman-ai.com/). Due to low resource use, can be used for real time local text to speech even while playing intensive video games (even in VR!) with WingmanAI.

## Features

**Podcast Studio (Web UI at `/`)**
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
git clone https://github.com/teddybear082/pocket-tts-openai_streaming_server.git
cd pocket-tts-openai_streaming_server

docker compose up -d
```

Open `http://localhost:49112` — the Podcast Studio UI loads at `/`.

Data (library database, uploaded sources, generated audio) persists in `./data/`.

### Python (from source)

```bash
git clone https://github.com/teddybear082/pocket-tts-openai_streaming_server.git
cd pocket-tts-openai_streaming_server

python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install -r requirements.txt
python server.py
```

### Windows Executable

1. Download the latest release from [Releases](https://github.com/teddybear082/pocket-tts-openai_streaming_server/releases)
2. Extract and run `PocketTTS-Server.exe`

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
| `/` | GET | Podcast Studio web UI |
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
pocket-tts-openai_streaming_server/
├── app/
│   ├── __init__.py           # Flask app factory
│   ├── config.py             # Configuration
│   ├── logging_config.py     # Logging setup
│   ├── routes.py             # OpenAI-compatible API endpoints
│   ├── services/
│   │   ├── audio.py          # Audio conversion
│   │   └── tts.py            # TTS model service
│   └── studio/               # Podcast Studio module
│       ├── __init__.py       # Blueprint registration
│       ├── db.py             # SQLite database
│       ├── routes.py         # Studio API endpoints
│       ├── ingestion.py      # File/URL content extraction
│       ├── normalizer.py     # Text cleaning for TTS
│       ├── chunking.py       # Text chunking strategies
│       ├── generation.py     # Background generation queue
│       └── audio_assembly.py # Chunk merging for export
├── static/
│   ├── css/studio.css        # Studio styles (dark theme)
│   └── js/studio/            # Vanilla JS ES modules
│       ├── main.js           # Entry point, router
│       ├── api.js            # Fetch wrapper
│       ├── state.js          # Pub/sub store
│       ├── library.js        # Tree view panel
│       ├── editor.js         # Import/source/episode views
│       ├── player.js         # Audio player
│       └── settings.js       # Settings panel
├── templates/studio.html     # Three-pane studio shell
├── data/                     # Persistent data (Docker volume)
├── voices/                   # Voice files
├── server.py                 # Entry point
├── Dockerfile
├── docker-compose.yml
└── requirements.txt
```

## Development

```bash
pip install -r requirements.txt
python server.py --log-level DEBUG
```

### Linting

```bash
pip install ruff
ruff check .
ruff format .
```

### Building Windows EXE

```bash
pip install pyinstaller
pyinstaller --onefile --name PocketTTS-Server \
  --add-data "static;static" \
  --add-data "templates;templates" \
  --add-data "voices;voices" \
  --add-data "app;app" \
  server.py
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
- Community voice contributors (see [voices/credits.txt](voices/credits.txt))

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

Pocket-TTS is subject to its own license terms.
