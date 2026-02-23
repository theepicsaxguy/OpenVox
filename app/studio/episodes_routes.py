"""
Studio API routes — Episodes endpoints.
"""

import os
import shutil
import uuid
from typing import Any

from flask import Response, jsonify, request, send_file

from app.config import Config
from app.logging_config import get_logger
from app.services.tts import get_tts_service
from app.studio.audio_assembly import merge_chunks_to_episode
from app.studio.chunking import DEFAULT_MAX_CHARS, chunk_text
from app.studio.db import get_db
from app.studio.generation import get_generation_queue
from app.studio.repositories import (
    ChunkRepository,
    EpisodeRepository,
    SourceRepository,
)
from app.studio.schemas import (
    BulkDeleteEpisodesBody,
    BulkMoveEpisodesBody,
    CreateEpisodeBody,
    MoveToFolderBody,
    RegenerateWithSettingsBody,
    UpdateEpisodeBody,
    request_body,
)

logger = get_logger('studio.routes.episodes')


def register_routes(bp) -> None:
    """Register episode routes on the blueprint."""

    @bp.route('/episodes', methods=['POST'])
    @request_body(CreateEpisodeBody)
    def create_episode() -> Response | tuple[Response, int]:
        """Create an episode — chunk text and enqueue generation."""
        data = request.json
        if not data:
            return jsonify({'error': 'Missing JSON body'}), 400

        source_id = data.get('source_id')
        if not source_id:
            return jsonify({'error': 'source_id is required'}), 400

        db = get_db()
        source = SourceRepository.get_by_id(db, source_id)
        if not source:
            return jsonify({'error': 'Source not found'}), 404

        voice_id = data.get('voice_id', 'alba')
        output_format = data.get('output_format', 'wav')
        chunk_strategy = data.get('chunk_strategy', 'paragraph')
        chunk_max_length = data.get('chunk_max_length', DEFAULT_MAX_CHARS)
        code_block_rule = data.get('code_block_rule', 'skip')
        breathing_intensity = data.get('breathing_intensity', 'normal')
        title = data.get('title', source['title'])

        chunks = chunk_text(
            source['cleaned_text'],
            strategy=chunk_strategy,
            max_chars=chunk_max_length,
        )

        if not chunks:
            return jsonify({'error': 'Text produced no chunks'}), 400

        episode_id = str(uuid.uuid4())
        db.execute(
            'INSERT INTO episodes (id, source_id, title, voice_id, output_format, '
            'chunk_strategy, chunk_max_length, code_block_rule, breathing_intensity, status) '
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (
                episode_id,
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

        for chunk in chunks:
            chunk_id = str(uuid.uuid4())
            db.execute(
                'INSERT INTO chunks (id, episode_id, chunk_index, text, status) '
                'VALUES (?, ?, ?, ?, ?)',
                (chunk_id, episode_id, chunk['index'], chunk['text'], 'pending'),
            )

        db.execute(
            'INSERT INTO playback_state (episode_id) VALUES (?)',
            (episode_id,),
        )

        db.commit()

        get_generation_queue().enqueue(episode_id)

        return jsonify(
            {
                'id': episode_id,
                'title': title,
                'chunk_count': len(chunks),
                'status': 'pending',
            }
        ), 201

    @bp.route('/episodes', methods=['GET'])
    def list_episodes() -> Response:
        """List all episodes."""
        db = get_db()
        folder_id = request.args.get('folder_id')
        source_id = request.args.get('source_id')

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
        rows = db.execute(query, params).fetchall()
        return jsonify([dict(r) for r in rows])

    @bp.route('/episodes/<episode_id>', methods=['GET'])
    def get_episode(episode_id: str) -> Response | tuple[Response, int]:
        """Get episode with its chunks."""
        import json

        db = get_db()
        episode = EpisodeRepository.get_with_playback(db, episode_id)
        if not episode:
            return jsonify({'error': 'Episode not found'}), 404

        chunks = ChunkRepository.get_by_episode(db, episode_id)

        result = dict(episode)
        chunks_list = []
        for c in chunks:
            chunk_dict = dict(c)
            if chunk_dict.get('word_timings'):
                try:
                    chunk_dict['word_timings'] = json.loads(chunk_dict['word_timings'])
                except json.JSONDecodeError:
                    chunk_dict['word_timings'] = []
            chunks_list.append(chunk_dict)
        result['chunks'] = chunks_list
        return jsonify(result)

    @bp.route('/episodes/<episode_id>', methods=['PUT'])
    @request_body(UpdateEpisodeBody)
    def update_episode(episode_id: str) -> Response | tuple[Response, int]:
        """Update episode metadata."""
        db = get_db()
        data = request.json or {}

        allowed_fields = ['title']
        updates = []
        params: list[Any] = []

        for field in allowed_fields:
            if field in data:
                updates.append(f'{field} = ?')
                params.append(data[field])

        if not updates:
            return jsonify({'error': 'No fields to update'}), 400

        params.append(episode_id)
        query = (
            f"UPDATE episodes SET {', '.join(updates)}, updated_at = datetime('now') WHERE id = ?"
        )
        db.execute(query, params)
        db.commit()

        return jsonify({'ok': True})

    @bp.route('/episodes/<episode_id>', methods=['DELETE'])
    def delete_episode(episode_id: str) -> Response:
        """Delete episode and audio files."""
        db = get_db()
        _delete_episode_audio(episode_id)
        db.execute('DELETE FROM episodes WHERE id = ?', (episode_id,))
        db.commit()
        return jsonify({'ok': True})

    @bp.route('/episodes/<episode_id>/regenerate', methods=['POST'])
    def regenerate_episode(episode_id: str) -> Response:
        """Re-generate all chunks for an episode."""
        db = get_db()
        _delete_episode_audio(episode_id)

        db.execute(
            "UPDATE chunks SET status = 'pending', audio_path = NULL, "
            'duration_secs = NULL, error_message = NULL WHERE episode_id = ?',
            (episode_id,),
        )
        db.execute(
            "UPDATE episodes SET status = 'pending', total_duration_secs = NULL, "
            "updated_at = datetime('now') WHERE id = ?",
            (episode_id,),
        )
        db.commit()

        get_generation_queue().enqueue(episode_id)
        return jsonify({'ok': True, 'status': 'pending'})

    @bp.route('/episodes/<episode_id>/regenerate-with-settings', methods=['POST'])
    @request_body(RegenerateWithSettingsBody)
    def regenerate_with_settings(episode_id: str) -> Response | tuple[Response, int]:
        """Re-generate episode with new settings, with undo support."""
        db = get_db()
        data = request.json or {}

        episode = EpisodeRepository.get_with_source_text(db, episode_id)

        if not episode:
            return jsonify({'error': 'Episode not found'}), 404

        backup_id = str(uuid.uuid4())
        backup_dir = os.path.join(Config.STUDIO_AUDIO_DIR, f'.backup_{backup_id}')
        audio_dir = os.path.join(Config.STUDIO_AUDIO_DIR, episode_id)

        if os.path.exists(audio_dir):
            shutil.copytree(audio_dir, backup_dir)
            db.execute(
                'INSERT INTO undo_buffer (id, episode_id, backup_audio_dir, expires_at) '
                "VALUES (?, ?, ?, datetime('now', '+2 minutes'))",
                (backup_id, episode_id, backup_dir),
            )

        _delete_episode_audio(episode_id)

        voice_id = data.get('voice_id', episode['voice_id'])
        output_format = data.get('output_format', episode['output_format'])
        chunk_strategy = data.get('chunk_strategy', episode['chunk_strategy'])
        chunk_max_length = data.get('chunk_max_length', episode['chunk_max_length'])
        code_block_rule = data.get('code_block_rule', episode['code_block_rule'])
        breathing_intensity = data.get('breathing_intensity', episode['breathing_intensity'])

        chunks = chunk_text(
            episode['cleaned_text'],
            strategy=chunk_strategy,
            max_chars=chunk_max_length,
        )

        if not chunks:
            return jsonify({'error': 'Text produced no chunks'}), 400

        db.execute('DELETE FROM chunks WHERE episode_id = ?', (episode_id,))

        for chunk in chunks:
            chunk_id = str(uuid.uuid4())
            db.execute(
                'INSERT INTO chunks (id, episode_id, chunk_index, text, status) '
                'VALUES (?, ?, ?, ?, ?)',
                (chunk_id, episode_id, chunk['index'], chunk['text'], 'pending'),
            )

        db.execute(
            'UPDATE episodes SET voice_id = ?, output_format = ?, chunk_strategy = ?, '
            'chunk_max_length = ?, code_block_rule = ?, breathing_intensity = ?, '
            "status = 'pending', total_duration_secs = NULL, updated_at = datetime('now') "
            'WHERE id = ?',
            (
                voice_id,
                output_format,
                chunk_strategy,
                chunk_max_length,
                code_block_rule,
                breathing_intensity,
                episode_id,
            ),
        )
        db.commit()

        get_generation_queue().enqueue(episode_id)

        return jsonify(
            {'ok': True, 'status': 'pending', 'chunk_count': len(chunks), 'undo_id': backup_id}
        )

    @bp.route('/undo/<undo_id>', methods=['POST'])
    def undo_regeneration(undo_id: str) -> Response | tuple[Response, int]:
        """Undo an episode regeneration within the grace period."""
        db = get_db()

        undo = db.execute(
            'SELECT * FROM undo_buffer WHERE id = ? AND expires_at > datetime("now")', (undo_id,)
        ).fetchone()

        if not undo:
            return jsonify({'error': 'Undo expired or not found'}), 404

        episode_id = undo['episode_id']
        backup_dir = undo['backup_audio_dir']
        audio_dir = os.path.join(Config.STUDIO_AUDIO_DIR, episode_id)

        if os.path.exists(audio_dir):
            shutil.rmtree(audio_dir)
        if os.path.exists(backup_dir):
            shutil.move(backup_dir, audio_dir)

        db.execute('DELETE FROM undo_buffer WHERE id = ?', (undo_id,))
        db.commit()

        return jsonify({'ok': True})

    @bp.route('/episodes/bulk-move', methods=['POST'])
    @request_body(BulkMoveEpisodesBody)
    def bulk_move_episodes() -> Response | tuple[Response, int]:
        """Move multiple episodes to a folder."""
        data = request.json or {}
        episode_ids = data.get('episode_ids', [])
        folder_id = data.get('folder_id')

        if not episode_ids:
            return jsonify({'error': 'No episodes specified'}), 400

        db = get_db()
        for episode_id in episode_ids:
            db.execute('UPDATE episodes SET folder_id = ? WHERE id = ?', (folder_id, episode_id))
        db.commit()

        return jsonify({'ok': True, 'moved': len(episode_ids)})

    @bp.route('/episodes/bulk-delete', methods=['POST'])
    @request_body(BulkDeleteEpisodesBody)
    def bulk_delete_episodes() -> Response | tuple[Response, int]:
        """Delete multiple episodes."""
        data = request.json or {}
        episode_ids = data.get('episode_ids', [])

        if not episode_ids:
            return jsonify({'error': 'No episodes specified'}), 400

        db = get_db()
        for episode_id in episode_ids:
            _delete_episode_audio(episode_id)
            db.execute('DELETE FROM episodes WHERE id = ?', (episode_id,))
        db.commit()

        return jsonify({'ok': True, 'deleted': len(episode_ids)})

    @bp.route('/episodes/<episode_id>/chunks/<int:chunk_index>/regenerate', methods=['POST'])
    def regenerate_chunk(episode_id: str, chunk_index: int) -> Response | tuple[Response, int]:
        """Regenerate a single chunk."""
        db = get_db()
        chunk = db.execute(
            'SELECT id, audio_path FROM chunks WHERE episode_id = ? AND chunk_index = ?',
            (episode_id, chunk_index),
        ).fetchone()

        if not chunk:
            return jsonify({'error': 'Chunk not found'}), 404

        if chunk['audio_path']:
            path = os.path.join(Config.STUDIO_AUDIO_DIR, chunk['audio_path'])
            if os.path.exists(path):
                os.remove(path)

        db.execute(
            "UPDATE chunks SET status = 'pending', audio_path = NULL, "
            'duration_secs = NULL, error_message = NULL WHERE id = ?',
            (chunk['id'],),
        )
        db.execute(
            "UPDATE episodes SET status = 'pending', updated_at = datetime('now') WHERE id = ?",
            (episode_id,),
        )
        db.commit()

        get_generation_queue().enqueue(episode_id)
        return jsonify({'ok': True})

    @bp.route('/episodes/<episode_id>/cancel', methods=['POST'])
    def cancel_episode(episode_id: str) -> Response | tuple[Response, int]:
        """Cancel a generating episode and reset error chunks to pending."""
        db = get_db()
        status = EpisodeRepository.get_status(db, episode_id)

        if status is None:
            return jsonify({'error': 'Episode not found'}), 404

        gq = get_generation_queue()

        if gq.current_episode_id == episode_id:
            gq.cancel_current()

        error_chunks = db.execute(
            "SELECT id, audio_path FROM chunks WHERE episode_id = ? AND status = 'error'",
            (episode_id,),
        ).fetchall()

        for chunk in error_chunks:
            if chunk['audio_path']:
                path = os.path.join(Config.STUDIO_AUDIO_DIR, chunk['audio_path'])
                if os.path.exists(path):
                    os.remove(path)
            db.execute(
                "UPDATE chunks SET status = 'pending', audio_path = NULL, "
                'duration_secs = NULL, error_message = NULL WHERE id = ?',
                (chunk['id'],),
            )

        db.execute(
            "UPDATE episodes SET status = 'pending', updated_at = datetime('now') WHERE id = ?",
            (episode_id,),
        )
        db.commit()

        return jsonify({'ok': True, 'reset_chunks': len(error_chunks)})

    @bp.route('/episodes/<episode_id>/retry-errors', methods=['POST'])
    def retry_errors(episode_id: str) -> Response | tuple[Response, int]:
        """Retry all error chunks for an episode."""
        db = get_db()
        status = EpisodeRepository.get_status(db, episode_id)

        if status is None:
            return jsonify({'error': 'Episode not found'}), 404

        error_chunks = db.execute(
            "SELECT id, audio_path FROM chunks WHERE episode_id = ? AND status = 'error'",
            (episode_id,),
        ).fetchall()

        if not error_chunks:
            return jsonify({'ok': True, 'message': 'No error chunks to retry'})

        for chunk in error_chunks:
            if chunk['audio_path']:
                path = os.path.join(Config.STUDIO_AUDIO_DIR, chunk['audio_path'])
                if os.path.exists(path):
                    os.remove(path)
            db.execute(
                "UPDATE chunks SET status = 'pending', audio_path = NULL, "
                'duration_secs = NULL, error_message = NULL WHERE id = ?',
                (chunk['id'],),
            )

        db.execute(
            "UPDATE episodes SET status = 'pending', updated_at = datetime('now') WHERE id = ?",
            (episode_id,),
        )
        db.commit()

        get_generation_queue().enqueue(episode_id)
        return jsonify({'ok': True, 'retried': len(error_chunks)})

    @bp.route('/episodes/<episode_id>/audio/<int:chunk_index>', methods=['GET'])
    def serve_chunk_audio(episode_id: str, chunk_index: int) -> Response | tuple[Response, int]:
        """Serve a chunk's audio file."""
        db = get_db()
        chunk = ChunkRepository.get_by_index(db, episode_id, chunk_index)

        if not chunk or not chunk['audio_path']:
            return jsonify({'error': 'Audio not available'}), 404

        path = os.path.join(Config.STUDIO_AUDIO_DIR, chunk['audio_path'])
        if not os.path.exists(path):
            return jsonify({'error': 'Audio file missing'}), 404

        return send_file(path)

    @bp.route('/episodes/<episode_id>/audio/full', methods=['GET'])
    def serve_full_episode(episode_id: str) -> Response | tuple[Response, int]:
        """Serve merged full episode audio."""
        db = get_db()
        chunk_paths = EpisodeRepository.get_ready_chunk_audio_paths(db, episode_id)

        if not chunk_paths:
            return jsonify({'error': 'No ready chunks'}), 404

        ext = os.path.splitext(chunk_paths[0])[1]
        merged_path = os.path.join(Config.STUDIO_AUDIO_DIR, episode_id, f'full{ext}')

        if not os.path.exists(merged_path):
            tts = get_tts_service()
            merge_chunks_to_episode(episode_id, chunk_paths, tts.sample_rate)

        return send_file(merged_path)

    @bp.route('/episodes/<episode_id>/move', methods=['PUT'])
    @request_body(MoveToFolderBody)
    def move_episode(episode_id: str) -> Response:
        """Move an episode to a folder."""
        data = request.json
        db = get_db()
        db.execute(
            'UPDATE episodes SET folder_id = ? WHERE id = ?',
            (data.get('folder_id'), episode_id),
        )
        db.commit()
        return jsonify({'ok': True})


def _delete_episode_audio(episode_id: str) -> None:
    """Delete all audio files for an episode."""
    audio_dir = os.path.join(Config.STUDIO_AUDIO_DIR, episode_id)
    if os.path.isdir(audio_dir):
        shutil.rmtree(audio_dir, ignore_errors=True)
