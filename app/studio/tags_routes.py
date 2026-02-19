"""
Studio API routes — Tags endpoints.
"""

import uuid

from flask import Response, jsonify, request

from app.logging_config import get_logger
from app.studio.db import get_db
from app.studio.repositories import TagRepository
from app.studio.schemas import CreateTagBody, SetTagsBody, request_body

logger = get_logger('studio.routes.tags')


def register_routes(bp) -> None:
    """Register tag routes on the blueprint."""

    @bp.route('/tags', methods=['GET'])
    def list_tags() -> Response:
        """List all tags."""
        db = get_db()
        rows = TagRepository.get_all(db)
        return jsonify([dict(r) for r in rows])

    @bp.route('/tags', methods=['POST'])
    @request_body(CreateTagBody)
    def create_tag() -> Response | tuple[Response, int]:
        """Create a tag."""
        data = request.json
        db = get_db()
        tag_id = str(uuid.uuid4())
        name = data.get('name', '').strip()
        if not name:
            return jsonify({'error': 'Tag name required'}), 400

        try:
            TagRepository.create(db, tag_id, name)
            db.commit()
        except Exception:
            return jsonify({'error': f'Tag "{name}" already exists'}), 409

        return jsonify({'id': tag_id, 'name': name}), 201

    @bp.route('/tags/<tag_id>', methods=['DELETE'])
    def delete_tag(tag_id: str) -> Response:
        """Delete a tag."""
        db = get_db()
        TagRepository.delete(db, tag_id)
        db.commit()
        return jsonify({'ok': True})

    @bp.route('/sources/<source_id>/tags', methods=['POST'])
    @request_body(SetTagsBody)
    def set_source_tags(source_id: str) -> Response:
        """Set tags for a source (replaces all existing)."""
        data = request.json
        db = get_db()
        tag_ids = data.get('tag_ids', [])

        TagRepository.set_source_tags(db, source_id, tag_ids)
        db.commit()
        return jsonify({'ok': True})

    @bp.route('/episodes/<episode_id>/tags', methods=['POST'])
    @request_body(SetTagsBody)
    def set_episode_tags(episode_id: str) -> Response:
        """Set tags for an episode (replaces all existing)."""
        data = request.json
        db = get_db()
        tag_ids = data.get('tag_ids', [])

        TagRepository.set_episode_tags(db, episode_id, tag_ids)
        db.commit()
        return jsonify({'ok': True})
