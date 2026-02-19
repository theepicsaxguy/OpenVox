"""
Studio API routes — Settings endpoints.
"""

from flask import Response, jsonify, request

from app.logging_config import get_logger
from app.studio.db import get_db
from app.studio.schemas import UpdateSettingsBody, request_body

logger = get_logger('studio.routes.settings')


def register_routes(bp) -> None:
    """Register settings routes on the blueprint."""

    @bp.route('/settings', methods=['GET'])
    def get_settings() -> Response:
        """Get all settings."""
        db = get_db()
        rows = db.execute('SELECT key, value FROM settings').fetchall()
        return jsonify({r['key']: r['value'] for r in rows})

    @bp.route('/settings', methods=['PUT'])
    @request_body(UpdateSettingsBody)
    def update_settings() -> Response:
        """Update settings (key-value pairs)."""
        data = request.json
        db = get_db()

        for key, value in data.items():
            db.execute(
                'INSERT INTO settings (key, value) VALUES (?, ?) '
                'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
                (key, str(value)),
            )
        db.commit()
        return jsonify({'ok': True})
