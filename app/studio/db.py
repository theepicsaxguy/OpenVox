"""
SQLite database setup, migrations, and connection management.
"""

import sqlite3

from flask import g

from app.config import Config
from app.logging_config import get_logger

logger = get_logger('studio.db')

SCHEMA_VERSION = 1

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL,
    original_filename TEXT,
    original_url TEXT,
    raw_text TEXT NOT NULL,
    cleaned_text TEXT NOT NULL,
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    voice_id TEXT NOT NULL,
    output_format TEXT NOT NULL DEFAULT 'wav',
    chunk_strategy TEXT NOT NULL,
    chunk_max_length INTEGER,
    code_block_rule TEXT NOT NULL DEFAULT 'skip',
    status TEXT NOT NULL DEFAULT 'pending',
    total_duration_secs REAL,
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    audio_path TEXT,
    duration_secs REAL,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chunks_episode ON chunks(episode_id, chunk_index);

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS source_tags (
    source_id TEXT REFERENCES sources(id) ON DELETE CASCADE,
    tag_id TEXT REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (source_id, tag_id)
);

CREATE TABLE IF NOT EXISTS episode_tags (
    episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE,
    tag_id TEXT REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (episode_id, tag_id)
);

CREATE TABLE IF NOT EXISTS playback_state (
    episode_id TEXT PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
    current_chunk_index INTEGER NOT NULL DEFAULT 0,
    position_secs REAL NOT NULL DEFAULT 0.0,
    percent_listened REAL NOT NULL DEFAULT 0.0,
    last_played_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
);
"""


def get_db() -> sqlite3.Connection:
    """Get a database connection for the current request."""
    if 'studio_db' not in g:
        db_path = Config.STUDIO_DB_PATH
        g.studio_db = sqlite3.connect(db_path)
        g.studio_db.row_factory = sqlite3.Row
        g.studio_db.execute('PRAGMA journal_mode=WAL')
        g.studio_db.execute('PRAGMA foreign_keys=ON')
    return g.studio_db


def close_db():
    """Close the database connection for the current request."""
    db = g.pop('studio_db', None)
    if db is not None:
        db.close()


def init_db():
    """Initialize the database schema."""
    import os

    db_path = Config.STUDIO_DB_PATH
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    conn.executescript(SCHEMA_SQL)

    # Set schema version
    existing = conn.execute('SELECT version FROM schema_version').fetchone()
    if not existing:
        conn.execute('INSERT INTO schema_version (version) VALUES (?)', (SCHEMA_VERSION,))

    conn.commit()
    conn.close()
    logger.info(f'Studio database initialized at {db_path}')
