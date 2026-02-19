"""
Studio API routes — Playback state endpoints.
"""

from flask import Response, jsonify, request

from app.logging_config import get_logger
from app.studio.db import get_db
from app.studio.schemas import SavePlaybackBody, request_body

logger = get_logger('studio.routes.playback')


def register_routes(bp) -> None:
    """Register playback routes on the blueprint."""

    @bp.route('/playback/<episode_id>', methods=['GET'])
    def get_playback(episode_id: str) -> Response | tuple[Response, int]:
        """Get playback state for an episode."""
        db = get_db()

        episode = db.execute('SELECT id FROM episodes WHERE id = ?', (episode_id,)).fetchone()
        if not episode:
            return jsonify({'error': 'Episode not found'}), 404

        row = db.execute(
            'SELECT * FROM playback_state WHERE episode_id = ?', (episode_id,)
        ).fetchone()
        if not row:
            return jsonify(
                {
                    'episode_id': episode_id,
                    'current_chunk_index': 0,
                    'position_secs': 0,
                    'percent_listened': 0,
                }
            )
        return jsonify(dict(row))

    @bp.route('/playback/<episode_id>', methods=['POST'])
    @request_body(SavePlaybackBody)
    def save_playback(episode_id: str) -> Response | tuple[Response, int]:
        """Save playback position."""
        data = request.json
        db = get_db()

        episode = db.execute('SELECT id FROM episodes WHERE id = ?', (episode_id,)).fetchone()
        if not episode:
            return jsonify({'error': 'Episode not found'}), 404

        db.execute(
            'INSERT INTO playback_state (episode_id, current_chunk_index, position_secs, '
            "percent_listened, last_played_at) VALUES (?, ?, ?, ?, datetime('now')) "
            'ON CONFLICT(episode_id) DO UPDATE SET '
            'current_chunk_index = excluded.current_chunk_index, '
            'position_secs = excluded.position_secs, '
            'percent_listened = excluded.percent_listened, '
            'last_played_at = excluded.last_played_at',
            (
                episode_id,
                data.get('current_chunk_index', 0),
                data.get('position_secs', 0),
                data.get('percent_listened', 0),
            ),
        )
        db.commit()
        return jsonify({'ok': True})
