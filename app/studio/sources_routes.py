"""
Studio API routes — Sources endpoints.
"""

import os
import shutil
import uuid
from typing import Any

from flask import Response, jsonify, request, send_from_directory

from app.config import Config
from app.logging_config import get_logger
from app.studio.db import get_db
from app.studio.git_ingestion import ingest_git_repository
from app.studio.ingestion import ingest_file, ingest_paste, ingest_url
from app.studio.normalizer import create_cleaning_options_from_request, normalize_text
from app.studio.repositories import EpisodeRepository, SettingsRepository, SourceRepository
from app.studio.schemas import (
    CreateSourceFileBody,
    CreateSourceJsonBody,
    MoveToFolderBody,
    ReCleanSourceBody,
    SourceCoverUploadBody,
    UpdateSourceBody,
    request_body,
)

logger = get_logger('studio.routes.sources')


def register_routes(bp) -> None:
    """Register source routes on the blueprint."""

    @bp.route('/sources', methods=['POST'])
    @request_body(CreateSourceFileBody, 'multipart/form-data')
    @request_body(CreateSourceJsonBody)
    def create_source() -> Response | tuple[Response, int]:
        """Upload file, submit URL, paste text, or import git repository."""

        db = get_db()

        settings = _get_cleaning_settings(db)

        try:
            if 'file' in request.files:
                f = request.files['file']
                if f.filename:
                    data = ingest_file(f)
                else:
                    return jsonify({'error': 'No file selected'}), 400
            elif request.is_json and request.json.get('git_url'):
                url = request.json['git_url']
                subpath = request.json.get('git_subpath')
                data = ingest_git_repository(url, subpath)
                req_settings = request.json.get('cleaning_settings', {})
                settings.update(req_settings)
            elif request.is_json and request.json.get('url'):
                url_settings = request.json.get('url_settings', {})
                data = ingest_url(
                    request.json['url'],
                    use_jina=url_settings.get('use_jina', True),
                    jina_fallback=url_settings.get('jina_fallback', True),
                )
                req_settings = request.json.get('cleaning_settings', {})
                settings.update(req_settings)
            elif request.is_json and request.json.get('text'):
                data = ingest_paste(
                    request.json['text'],
                    title=request.json.get('title'),
                )
                req_settings = request.json.get('cleaning_settings', {})
                settings.update(req_settings)
            else:
                return jsonify({'error': 'Provide a file, git_url, url, or text'}), 400

            options = create_cleaning_options_from_request(settings)

            cleaned = normalize_text(data['raw_text'], options)
            source_id = str(uuid.uuid4())

            SourceRepository.create(
                db,
                source_id,
                data['title'],
                data['source_type'],
                data.get('original_filename'),
                data.get('original_url'),
                data['raw_text'],
                cleaned,
            )
            db.commit()

            return jsonify(
                {
                    'id': source_id,
                    'title': data['title'],
                    'source_type': data['source_type'],
                    'cleaned_text_length': len(cleaned),
                }
            ), 201

        except ValueError as e:
            return jsonify({'error': str(e)}), 400
        except Exception as e:
            logger.exception('Source creation failed')
            return jsonify({'error': str(e)}), 500

    @bp.route('/sources', methods=['GET'])
    def list_sources() -> Response:
        """List all sources."""
        db = get_db()
        folder_id = request.args.get('folder_id')
        tag = request.args.get('tag')

        rows = SourceRepository.list(db, folder_id=folder_id, tag=tag)
        return jsonify([dict(r) for r in rows])

    @bp.route('/sources/<source_id>', methods=['GET'])
    def get_source(source_id: str) -> Response | tuple[Response, int]:
        """Get a source with cleaned text."""
        db = get_db()
        row = SourceRepository.get_by_id(db, source_id)
        if not row:
            return jsonify({'error': 'Source not found'}), 404
        return jsonify(dict(row))

    @bp.route('/sources/<source_id>/cover', methods=['GET'])
    def get_source_cover(source_id: str) -> Response | tuple[Response, int]:
        """Get cover art for a source."""
        db = get_db()
        cover_art = SourceRepository.get_cover(db, source_id)
        if not cover_art:
            row = SourceRepository.get_by_id(db, source_id)
            if not row:
                return jsonify({'error': 'Source not found'}), 404
            return jsonify({'error': 'No cover art'}), 404

        if os.path.isfile(cover_art):
            return send_from_directory(os.path.dirname(cover_art), os.path.basename(cover_art))

        return jsonify({'cover_art': cover_art})

    @bp.route('/sources/<source_id>/cover', methods=['POST'])
    @request_body(SourceCoverUploadBody, 'multipart/form-data')
    def upload_source_cover(source_id: str) -> Response | tuple[Response, int]:
        """Upload cover art for a source."""
        if 'cover' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['cover']
        if not file.filename:
            return jsonify({'error': 'No file selected'}), 400

        data_dir = os.path.join(os.path.dirname(Config.STUDIO_DB_PATH), 'covers')
        os.makedirs(data_dir, exist_ok=True)

        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
            return jsonify({'error': 'Invalid file type'}), 400

        filename = f'{uuid.uuid4()}{ext}'
        filepath = os.path.join(data_dir, filename)
        file.save(filepath)

        db = get_db()
        SourceRepository.update_cover(db, source_id, filepath)
        db.commit()

        return jsonify({'ok': True, 'cover_url': f'/api/studio/sources/{source_id}/cover'})

    @bp.route('/sources/<source_id>', methods=['PUT'])
    @request_body(UpdateSourceBody)
    def update_source(source_id: str) -> Response | tuple[Response, int]:
        """Update source title or cleaned_text."""
        db = get_db()
        data = request.json

        fields = {}
        if 'title' in data:
            fields['title'] = data['title']
        if 'cleaned_text' in data:
            fields['cleaned_text'] = data['cleaned_text']

        if not fields:
            return jsonify({'error': 'No fields to update'}), 400

        SourceRepository.update(db, source_id, **fields)
        db.commit()
        return jsonify({'ok': True})

    @bp.route('/sources/<source_id>', methods=['DELETE'])
    def delete_source(source_id: str) -> Response:
        """Delete source and associated episodes/audio."""
        db = get_db()

        episode_ids = EpisodeRepository.get_episode_ids_by_source(db, source_id)
        for ep_id in episode_ids:
            _delete_episode_audio(ep_id)

        SourceRepository.delete(db, source_id)
        db.commit()
        return jsonify({'ok': True})

    @bp.route('/sources/<source_id>/re-clean', methods=['POST'])
    @request_body(ReCleanSourceBody)
    def re_clean_source(source_id: str) -> Response | tuple[Response, int]:
        """Re-run normalizer on a source with different options."""
        db = get_db()
        raw_text = SourceRepository.get_raw_text(db, source_id)
        if raw_text is None:
            return jsonify({'error': 'Source not found'}), 404

        data = request.json or {}
        options = create_cleaning_options_from_request(data)
        cleaned = normalize_text(raw_text, options)

        SourceRepository.update_cleaned_text(db, source_id, cleaned)
        db.commit()
        return jsonify({'cleaned_text': cleaned})

    @bp.route('/sources/<source_id>/move', methods=['PUT'])
    @request_body(MoveToFolderBody)
    def move_source(source_id: str) -> Response:
        """Move a source to a folder."""
        data = request.json
        db = get_db()
        SourceRepository.update(db, source_id, folder_id=data.get('folder_id'))
        db.commit()
        return jsonify({'ok': True})


def _get_cleaning_settings(db) -> dict[str, Any]:
    """Get user's cleaning settings from database."""
    settings = SettingsRepository.get_all(db)
    return {
        k: v
        for k, v in settings.items()
        if k.startswith('clean_') or k in ('code_block_rule', 'url_extraction_method')
    }


def _delete_episode_audio(episode_id: str) -> None:
    """Delete all audio files for an episode."""
    audio_dir = os.path.join(Config.STUDIO_AUDIO_DIR, episode_id)
    if os.path.isdir(audio_dir):
        shutil.rmtree(audio_dir, ignore_errors=True)
