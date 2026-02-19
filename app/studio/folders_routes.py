"""
Studio API routes — Folders endpoints.
"""

import os
import shutil
import uuid
from typing import Any

from flask import Response, jsonify, request

from app.config import Config
from app.logging_config import get_logger
from app.studio.db import get_db
from app.studio.repositories import ChunkRepository, EpisodeRepository
from app.studio.schemas import CreateFolderBody, ReorderBody, UpdateFolderBody, request_body

logger = get_logger('studio.routes.folders')


def register_routes(bp) -> None:
    """Register folder routes on the blueprint."""

    @bp.route('/folders', methods=['POST'])
    @request_body(CreateFolderBody)
    def create_folder() -> Response | tuple[Response, int]:
        """Create a new folder."""
        data = request.json
        db = get_db()
        folder_id = str(uuid.uuid4())

        db.execute(
            'INSERT INTO folders (id, name, parent_id, sort_order) VALUES (?, ?, ?, ?)',
            (
                folder_id,
                data.get('name', 'New Folder'),
                data.get('parent_id'),
                data.get('sort_order', 0),
            ),
        )
        db.commit()
        return jsonify({'id': folder_id}), 201

    @bp.route('/folders/<folder_id>', methods=['PUT'])
    @request_body(UpdateFolderBody)
    def update_folder(folder_id: str) -> Response | tuple[Response, int]:
        """Rename or move a folder."""
        data = request.json
        db = get_db()

        fields = []
        params: list[Any] = []
        if 'name' in data:
            fields.append('name = ?')
            params.append(data['name'])
        if 'parent_id' in data:
            fields.append('parent_id = ?')
            params.append(data['parent_id'])
        if 'sort_order' in data:
            fields.append('sort_order = ?')
            params.append(data['sort_order'])

        if not fields:
            return jsonify({'error': 'No fields to update'}), 400

        params.append(folder_id)
        db.execute(f'UPDATE folders SET {", ".join(fields)} WHERE id = ?', params)
        db.commit()
        return jsonify({'ok': True})

    @bp.route('/folders/<folder_id>', methods=['DELETE'])
    def delete_folder(folder_id: str) -> Response:
        """Delete a folder and all its contents (episodes audio files are deleted)."""
        db = get_db()

        episode_ids = EpisodeRepository.get_episode_ids_by_folder(db, folder_id)

        for ep_id in episode_ids:
            audio_dir = os.path.join(Config.STUDIO_AUDIO_DIR, ep_id)
            if os.path.isdir(audio_dir):
                shutil.rmtree(audio_dir, ignore_errors=True)

        db.execute('DELETE FROM episodes WHERE folder_id = ?', (folder_id,))
        db.execute('DELETE FROM sources WHERE folder_id = ?', (folder_id,))
        db.execute('UPDATE folders SET parent_id = NULL WHERE parent_id = ?', (folder_id,))
        db.execute('DELETE FROM folders WHERE id = ?', (folder_id,))
        db.commit()
        return jsonify({'ok': True})

    @bp.route('/folders/<folder_id>/playlist', methods=['POST'])
    def start_folder_playlist(folder_id: str) -> Response | tuple[Response, int]:
        """Start playing all episodes in a folder as a playlist."""
        db = get_db()

        episodes = EpisodeRepository.get_folder_playlist_episodes(db, folder_id)

        if not episodes:
            return jsonify({'error': 'No ready episodes in folder'}), 404

        queue = []
        for ep in episodes:
            chunks = ChunkRepository.get_by_episode(db, ep['id'])
            ready_chunks = [c for c in chunks if c['status'] == 'ready']

            for chunk in ready_chunks:
                queue.append(
                    {
                        'episode_id': ep['id'],
                        'episode_title': ep['title'],
                        'chunk_index': chunk['chunk_index'],
                        'text': chunk['text'][:200] + '...'
                        if len(chunk['text']) > 200
                        else chunk['text'],
                        'duration_secs': chunk['duration_secs'],
                        'voice_id': ep['voice_id'],
                    }
                )

        return jsonify(
            {
                'folder_id': folder_id,
                'queue': [dict(q) for q in queue],
                'total_items': len(queue),
                'total_episodes': len(episodes),
            }
        )

    @bp.route('/folders/<folder_id>/episodes', methods=['GET'])
    def get_folder_episodes(folder_id: str) -> Response:
        """Get all episodes in a folder for playlist building."""
        db = get_db()

        episodes = EpisodeRepository.get_by_folder_with_playback(db, folder_id)

        return jsonify([dict(ep) for ep in episodes])

    @bp.route('/reorder', methods=['POST'])
    @request_body(ReorderBody)
    def reorder() -> Response:
        """Batch update sort orders."""
        data = request.json
        db = get_db()
        for item in data.get('items', []):
            table = item.get('type', 'folders')
            if table not in ('folders',):
                continue
            db.execute(
                'UPDATE folders SET sort_order = ? WHERE id = ?',
                (item['sort_order'], item['id']),
            )
        db.commit()
        return jsonify({'ok': True})
