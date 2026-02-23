"""
Database repository layer - abstracts direct SQL queries from route handlers.
"""

import builtins
import sqlite3
from typing import Any


class SourceRepository:
    @staticmethod
    def get_by_id(db: sqlite3.Connection, source_id: str) -> sqlite3.Row | None:
        return db.execute('SELECT * FROM sources WHERE id = ?', (source_id,)).fetchone()

    @staticmethod
    def get_cover(db: sqlite3.Connection, source_id: str) -> str | None:
        row = db.execute('SELECT cover_art FROM sources WHERE id = ?', (source_id,)).fetchone()
        return row['cover_art'] if row else None

    @staticmethod
    def list(
        db: sqlite3.Connection, folder_id: str | None = None, tag: str | None = None
    ) -> list[sqlite3.Row]:
        query = (
            'SELECT s.id, s.title, s.source_type, s.original_url, '
            's.folder_id, s.created_at, s.updated_at, '
            'LENGTH(s.cleaned_text) as text_length '
            'FROM sources s'
        )
        params: list[Any] = []

        if tag:
            query += (
                ' JOIN source_tags st ON s.id = st.source_id '
                'JOIN tags t ON st.tag_id = t.id WHERE t.name = ?'
            )
            params.append(tag)
        elif folder_id:
            query += ' WHERE s.folder_id = ?'
            params.append(folder_id)

        query += ' ORDER BY s.created_at DESC'
        return db.execute(query, params).fetchall()

    @staticmethod
    def create(
        db: sqlite3.Connection,
        id: str,
        title: str,
        source_type: str,
        original_filename: str | None,
        original_url: str | None,
        raw_text: str,
        cleaned_text: str,
    ) -> None:
        db.execute(
            'INSERT INTO sources (id, title, source_type, original_filename, '
            'original_url, raw_text, cleaned_text) '
            'VALUES (?, ?, ?, ?, ?, ?, ?)',
            (id, title, source_type, original_filename, original_url, raw_text, cleaned_text),
        )

    @staticmethod
    def update(db: sqlite3.Connection, source_id: str, **fields: Any) -> None:
        if not fields:
            return
        updates = []
        params: list[Any] = []
        for key, value in fields.items():
            updates.append(f'{key} = ?')
            params.append(value)
        updates.append("updated_at = datetime('now')")
        params.append(source_id)
        db.execute(f'UPDATE sources SET {", ".join(updates)} WHERE id = ?', params)

    @staticmethod
    def update_cover(db: sqlite3.Connection, source_id: str, cover_path: str) -> None:
        db.execute('UPDATE sources SET cover_art = ? WHERE id = ?', (cover_path, source_id))

    @staticmethod
    def update_cleaned_text(db: sqlite3.Connection, source_id: str, cleaned_text: str) -> None:
        db.execute(
            "UPDATE sources SET cleaned_text = ?, updated_at = datetime('now') WHERE id = ?",
            (cleaned_text, source_id),
        )

    @staticmethod
    def delete(db: sqlite3.Connection, source_id: str) -> None:
        db.execute('DELETE FROM sources WHERE id = ?', (source_id,))

    @staticmethod
    def get_raw_text(db: sqlite3.Connection, source_id: str) -> str | None:
        row = db.execute('SELECT raw_text FROM sources WHERE id = ?', (source_id,)).fetchone()
        return row['raw_text'] if row else None


class EpisodeRepository:
    @staticmethod
    def get_by_id(db: sqlite3.Connection, episode_id: str) -> sqlite3.Row | None:
        return db.execute('SELECT * FROM episodes WHERE id = ?', (episode_id,)).fetchone()

    @staticmethod
    def get_with_playback(db: sqlite3.Connection, episode_id: str) -> sqlite3.Row | None:
        return db.execute(
            'SELECT e.*, p.current_chunk_index, p.position_secs, '
            'p.percent_listened, p.last_played_at '
            'FROM episodes e '
            'LEFT JOIN playback_state p ON e.id = p.episode_id '
            'WHERE e.id = ?',
            (episode_id,),
        ).fetchone()

    @staticmethod
    def get_with_source_text(db: sqlite3.Connection, episode_id: str) -> sqlite3.Row | None:
        return db.execute(
            'SELECT e.*, s.cleaned_text FROM episodes e '
            'JOIN sources s ON e.source_id = s.id WHERE e.id = ?',
            (episode_id,),
        ).fetchone()

    @staticmethod
    def get_status(db: sqlite3.Connection, episode_id: str) -> str | None:
        row = db.execute('SELECT status FROM episodes WHERE id = ?', (episode_id,)).fetchone()
        return row['status'] if row else None

    @staticmethod
    def get_ready_chunk_audio_paths(db: sqlite3.Connection, episode_id: str) -> list[str]:
        rows = db.execute(
            'SELECT audio_path FROM chunks '
            'WHERE episode_id = ? AND status = ? ORDER BY chunk_index',
            (episode_id, 'ready'),
        ).fetchall()
        return [r['audio_path'] for r in rows if r['audio_path']]

    @staticmethod
    def get_episode_ids_by_folder(db: sqlite3.Connection, folder_id: str) -> list[str]:
        rows = db.execute('SELECT id FROM episodes WHERE folder_id = ?', (folder_id,)).fetchall()
        return [r['id'] for r in rows]

    @staticmethod
    def get_episode_ids_by_source(db: sqlite3.Connection, source_id: str) -> list[str]:
        rows = db.execute('SELECT id FROM episodes WHERE source_id = ?', (source_id,)).fetchall()
        return [r['id'] for r in rows]

    @staticmethod
    def get_by_folder_with_playback(db: sqlite3.Connection, folder_id: str) -> list[sqlite3.Row]:
        return db.execute(
            'SELECT e.id, e.title, e.status, e.total_duration_secs, e.voice_id, '
            'p.percent_listened, p.current_chunk_index '
            'FROM episodes e '
            'LEFT JOIN playback_state p ON e.id = p.episode_id '
            'WHERE e.folder_id = ? '
            'ORDER BY e.created_at ASC',
            (folder_id,),
        ).fetchall()

    @staticmethod
    def get_folder_playlist_episodes(db: sqlite3.Connection, folder_id: str) -> list[sqlite3.Row]:
        return db.execute(
            'SELECT e.id, e.title, e.total_duration_secs, e.voice_id '
            'FROM episodes e '
            'WHERE e.folder_id = ? AND e.status = ? '
            'ORDER BY e.created_at ASC',
            (folder_id, 'ready'),
        ).fetchall()

    @staticmethod
    def list(
        db: sqlite3.Connection, source_id: str | None = None, folder_id: str | None = None
    ) -> list[sqlite3.Row]:
        query = (
            'SELECT e.*, p.percent_listened, p.last_played_at '
            'FROM episodes e '
            'LEFT JOIN playback_state p ON e.id = p.episode_id'
        )
        params: list[Any] = []

        if source_id:
            query += ' WHERE e.source_id = ?'
            params.append(source_id)
        elif folder_id:
            query += ' WHERE e.folder_id = ?'
            params.append(folder_id)

        query += ' ORDER BY e.created_at DESC'
        return db.execute(query, params).fetchall()

    @staticmethod
    def create(
        db: sqlite3.Connection,
        id: str,
        source_id: str,
        title: str,
        voice_id: str,
        output_format: str,
        chunk_strategy: str,
        chunk_max_length: int,
        code_block_rule: str,
        breathing_intensity: str,
    ) -> None:
        db.execute(
            'INSERT INTO episodes (id, source_id, title, voice_id, output_format, '
            'chunk_strategy, chunk_max_length, code_block_rule, breathing_intensity, status) '
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (
                id,
                source_id,
                title,
                voice_id,
                output_format,
                chunk_strategy,
                chunk_max_length,
                code_block_rule,
                breathing_intensity,
                'pending',
            ),
        )

    @staticmethod
    def update(db: sqlite3.Connection, episode_id: str, **fields: Any) -> None:
        if not fields:
            return
        updates = []
        params: list[Any] = []
        for key, value in fields.items():
            updates.append(f'{key} = ?')
            params.append(value)
        updates.append("updated_at = datetime('now')")
        params.append(episode_id)
        db.execute(f'UPDATE episodes SET {", ".join(updates)} WHERE id = ?', params)

    @staticmethod
    def delete(db: sqlite3.Connection, episode_id: str) -> None:
        db.execute('DELETE FROM episodes WHERE id = ?', (episode_id,))

    @staticmethod
    def set_status(db: sqlite3.Connection, episode_id: str, status: str) -> None:
        db.execute(
            "UPDATE episodes SET status = ?, updated_at = datetime('now') WHERE id = ?",
            (status, episode_id),
        )

    @staticmethod
    def update_folder(db: sqlite3.Connection, episode_id: str, folder_id: str | None) -> None:
        db.execute('UPDATE episodes SET folder_id = ? WHERE id = ?', (folder_id, episode_id))

    @staticmethod
    def get_by_folder(db: sqlite3.Connection, folder_id: str) -> builtins.list[sqlite3.Row]:
        return db.execute(
            'SELECT * FROM episodes WHERE folder_id = ? ORDER BY created_at DESC',
            (folder_id,),
        ).fetchall()


class ChunkRepository:
    @staticmethod
    def get_by_episode(db: sqlite3.Connection, episode_id: str) -> list[sqlite3.Row]:
        return db.execute(
            'SELECT id, chunk_index, text, audio_path, duration_secs, status, error_message, word_timings '
            'FROM chunks WHERE episode_id = ? ORDER BY chunk_index',
            (episode_id,),
        ).fetchall()

    @staticmethod
    def get_by_index(
        db: sqlite3.Connection, episode_id: str, chunk_index: int
    ) -> sqlite3.Row | None:
        return db.execute(
            'SELECT * FROM chunks WHERE episode_id = ? AND chunk_index = ?',
            (episode_id, chunk_index),
        ).fetchone()

    @staticmethod
    def create(
        db: sqlite3.Connection, id: str, episode_id: str, chunk_index: int, text: str
    ) -> None:
        db.execute(
            'INSERT INTO chunks (id, episode_id, chunk_index, text, status) VALUES (?, ?, ?, ?, ?)',
            (id, episode_id, chunk_index, text, 'pending'),
        )

    @staticmethod
    def update_audio(
        db: sqlite3.Connection, chunk_id: str, audio_path: str, duration_secs: float
    ) -> None:
        db.execute(
            'UPDATE chunks SET audio_path = ?, duration_secs = ? WHERE id = ?',
            (audio_path, duration_secs, chunk_id),
        )

    @staticmethod
    def set_status(
        db: sqlite3.Connection, chunk_id: str, status: str, error_message: str | None = None
    ) -> None:
        if error_message:
            db.execute(
                'UPDATE chunks SET status = ?, error_message = ? WHERE id = ?',
                (status, error_message, chunk_id),
            )
        else:
            db.execute(
                'UPDATE chunks SET status = ?, error_message = NULL WHERE id = ?',
                (status, chunk_id),
            )

    @staticmethod
    def delete_by_episode(db: sqlite3.Connection, episode_id: str) -> None:
        db.execute('DELETE FROM chunks WHERE episode_id = ?', (episode_id,))

    @staticmethod
    def get_error_chunks(db: sqlite3.Connection, episode_id: str) -> list[sqlite3.Row]:
        return db.execute(
            "SELECT id, audio_path FROM chunks WHERE episode_id = ? AND status = 'error'",
            (episode_id,),
        ).fetchall()


class FolderRepository:
    @staticmethod
    def get_all(db: sqlite3.Connection) -> list[sqlite3.Row]:
        return db.execute('SELECT * FROM folders ORDER BY sort_order, name').fetchall()

    @staticmethod
    def get_by_id(db: sqlite3.Connection, folder_id: str) -> sqlite3.Row | None:
        return db.execute('SELECT * FROM folders WHERE id = ?', (folder_id,)).fetchone()

    @staticmethod
    def create(
        db: sqlite3.Connection,
        id: str,
        name: str,
        parent_id: str | None = None,
        sort_order: int = 0,
    ) -> None:
        db.execute(
            'INSERT INTO folders (id, name, parent_id, sort_order) VALUES (?, ?, ?, ?)',
            (id, name, parent_id, sort_order),
        )

    @staticmethod
    def update(db: sqlite3.Connection, folder_id: str, **fields: Any) -> None:
        if not fields:
            return
        updates = []
        params: list[Any] = []
        for key, value in fields.items():
            updates.append(f'{key} = ?')
            params.append(value)
        params.append(folder_id)
        db.execute(f'UPDATE folders SET {", ".join(updates)} WHERE id = ?', params)

    @staticmethod
    def delete(db: sqlite3.Connection, folder_id: str) -> None:
        db.execute('DELETE FROM folders WHERE id = ?', (folder_id,))

    @staticmethod
    def get_children(db: sqlite3.Connection, parent_id: str | None = None) -> list[sqlite3.Row]:
        if parent_id is None:
            return db.execute(
                'SELECT * FROM folders WHERE parent_id IS NULL ORDER BY sort_order, name'
            ).fetchall()
        return db.execute(
            'SELECT * FROM folders WHERE parent_id = ? ORDER BY sort_order, name', (parent_id,)
        ).fetchall()


class TagRepository:
    @staticmethod
    def get_all(db: sqlite3.Connection) -> list[sqlite3.Row]:
        return db.execute('SELECT * FROM tags ORDER BY name').fetchall()

    @staticmethod
    def create(db: sqlite3.Connection, id: str, name: str) -> None:
        db.execute('INSERT INTO tags (id, name) VALUES (?, ?)', (id, name))

    @staticmethod
    def delete(db: sqlite3.Connection, tag_id: str) -> None:
        db.execute('DELETE FROM tags WHERE id = ?', (tag_id,))

    @staticmethod
    def set_source_tags(db: sqlite3.Connection, source_id: str, tag_ids: list[str]) -> None:
        db.execute('DELETE FROM source_tags WHERE source_id = ?', (source_id,))
        for tag_id in tag_ids:
            db.execute(
                'INSERT INTO source_tags (source_id, tag_id) VALUES (?, ?)',
                (source_id, tag_id),
            )

    @staticmethod
    def set_episode_tags(db: sqlite3.Connection, episode_id: str, tag_ids: list[str]) -> None:
        db.execute('DELETE FROM episode_tags WHERE episode_id = ?', (episode_id,))
        for tag_id in tag_ids:
            db.execute(
                'INSERT INTO episode_tags (episode_id, tag_id) VALUES (?, ?)',
                (episode_id, tag_id),
            )

    @staticmethod
    def tag_source(db: sqlite3.Connection, source_id: str, tag_id: str) -> None:
        db.execute(
            'INSERT INTO source_tags (source_id, tag_id) VALUES (?, ?)',
            (source_id, tag_id),
        )

    @staticmethod
    def untag_source(db: sqlite3.Connection, source_id: str) -> None:
        db.execute('DELETE FROM source_tags WHERE source_id = ?', (source_id,))

    @staticmethod
    def tag_episode(db: sqlite3.Connection, episode_id: str, tag_id: str) -> None:
        db.execute(
            'INSERT INTO episode_tags (episode_id, tag_id) VALUES (?, ?)',
            (episode_id, tag_id),
        )

    @staticmethod
    def untag_episode(db: sqlite3.Connection, episode_id: str) -> None:
        db.execute('DELETE FROM episode_tags WHERE episode_id = ?', (episode_id,))


class PlaybackRepository:
    @staticmethod
    def get(db: sqlite3.Connection, episode_id: str) -> sqlite3.Row | None:
        return db.execute(
            'SELECT * FROM playback_state WHERE episode_id = ?', (episode_id,)
        ).fetchone()

    @staticmethod
    def save(
        db: sqlite3.Connection,
        episode_id: str,
        current_chunk_index: int,
        position_secs: float,
        percent_listened: float,
    ) -> None:
        db.execute(
            'INSERT INTO playback_state (episode_id, current_chunk_index, position_secs, '
            "percent_listened, last_played_at) VALUES (?, ?, ?, ?, datetime('now')) "
            'ON CONFLICT(episode_id) DO UPDATE SET '
            'current_chunk_index = excluded.current_chunk_index, '
            'position_secs = excluded.position_secs, '
            'percent_listened = excluded.percent_listened, '
            'last_played_at = excluded.last_played_at',
            (episode_id, current_chunk_index, position_secs, percent_listened),
        )

    @staticmethod
    def update_position(
        db: sqlite3.Connection, episode_id: str, position_secs: float, percent_listened: float
    ) -> None:
        db.execute(
            'UPDATE playback_state SET position_secs = ?, percent_listened = ?, '
            "last_played_at = datetime('now') WHERE episode_id = ?",
            (position_secs, percent_listened, episode_id),
        )

    @staticmethod
    def update_chunk(db: sqlite3.Connection, episode_id: str, current_chunk_index: int) -> None:
        db.execute(
            'UPDATE playback_state SET current_chunk_index = ?, '
            "last_played_at = datetime('now') WHERE episode_id = ?",
            (current_chunk_index, episode_id),
        )


class SettingsRepository:
    @staticmethod
    def get_all(db: sqlite3.Connection) -> dict[str, str]:
        rows = db.execute('SELECT key, value FROM settings').fetchall()
        return {r['key']: r['value'] for r in rows}

    @staticmethod
    def get(db: sqlite3.Connection, key: str) -> str | None:
        row = db.execute('SELECT value FROM settings WHERE key = ?', (key,)).fetchone()
        return row['value'] if row else None

    @staticmethod
    def set(db: sqlite3.Connection, key: str, value: str) -> None:
        db.execute(
            'INSERT INTO settings (key, value) VALUES (?, ?) '
            'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            (key, str(value)),
        )
