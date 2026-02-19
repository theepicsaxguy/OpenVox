"""
Studio API routes — Library, generation status, and preview endpoints.
"""

from typing import Any

from flask import Response, jsonify, request

from app.logging_config import get_logger
from app.studio.chunking import DEFAULT_MAX_CHARS, chunk_text
from app.studio.db import get_db
from app.studio.generation import get_generation_queue
from app.studio.git_ingestion import preview_git_repository
from app.studio.ingestion import ingest_url
from app.studio.normalizer import create_cleaning_options_from_request, normalize_text
from app.studio.schemas import PreviewChunksBody, PreviewCleanBody, PreviewContentBody, request_body

logger = get_logger('studio.routes.library')


def register_routes(bp) -> None:
    """Register library and misc routes on the blueprint."""

    @bp.route('/generation/status', methods=['GET'])
    def generation_status() -> Response:
        """Get generation queue status."""
        gq = get_generation_queue()

        db = get_db()
        pending_count = db.execute(
            "SELECT COUNT(*) as cnt FROM episodes WHERE status = 'pending'"
        ).fetchone()['cnt']
        generating_count = db.execute(
            "SELECT COUNT(*) as cnt FROM episodes WHERE status = 'generating'"
        ).fetchone()['cnt']
        ready_count = db.execute(
            "SELECT COUNT(*) as cnt FROM episodes WHERE status = 'ready'"
        ).fetchone()['cnt']
        error_count = db.execute(
            "SELECT COUNT(*) as cnt FROM episodes WHERE status = 'error'"
        ).fetchone()['cnt']

        return jsonify(
            {
                'current_episode_id': gq.current_episode_id,
                'queue_size': gq.queue_size,
                'db_status': {
                    'pending': pending_count,
                    'generating': generating_count,
                    'ready': ready_count,
                    'error': error_count,
                },
            }
        )

    @bp.route('/library/tree', methods=['GET'])
    def library_tree() -> Response:
        """Get the full library tree structure."""
        db = get_db()

        folders = db.execute('SELECT * FROM folders ORDER BY sort_order, name').fetchall()

        sources = db.execute(
            'SELECT id, title, source_type, original_url, folder_id, '
            'created_at, updated_at FROM sources ORDER BY created_at DESC'
        ).fetchall()

        episodes = db.execute(
            'SELECT e.id, e.source_id, e.title, e.status, e.voice_id, '
            'e.total_duration_secs, e.folder_id, e.created_at, '
            'p.percent_listened, p.last_played_at '
            'FROM episodes e '
            'LEFT JOIN playback_state p ON e.id = p.episode_id '
            'ORDER BY e.created_at DESC'
        ).fetchall()

        return jsonify(
            {
                'folders': [dict(f) for f in folders],
                'sources': [dict(s) for s in sources],
                'episodes': [dict(e) for e in episodes],
            }
        )

    @bp.route('/preview-clean', methods=['POST'])
    @request_body(PreviewCleanBody)
    def preview_clean() -> Response | tuple[Response, int]:
        """Preview normalization without saving."""
        data = request.json
        if not data or not data.get('text'):
            return jsonify({'error': 'Provide text'}), 400

        options = create_cleaning_options_from_request(data)

        cleaned = normalize_text(data['text'], options)
        return jsonify({'cleaned_text': cleaned})

    @bp.route('/preview-content', methods=['POST'])
    @request_body(PreviewContentBody)
    def preview_content() -> Response:
        """Preview content without importing - for URL and git repos."""
        data = request.json
        if not data:
            return jsonify({'error': 'Provide content type'}), 400

        content_type = data.get('type')
        db = get_db()
        settings = _get_cleaning_settings(db)

        options = create_cleaning_options_from_request(settings)

        try:
            if content_type == 'url':
                url = data.get('url')
                if not url:
                    return jsonify({'error': 'URL is required'}), 400

                url_extraction = settings.get('url_extraction_method', 'jina')
                use_jina = url_extraction == 'jina'

                result = ingest_url(url, use_jina=use_jina, jina_fallback=False)
                cleaned = normalize_text(result['raw_text'], options)

                return jsonify(
                    {
                        'title': result['title'],
                        'raw_text': result['raw_text'][:10000],
                        'cleaned_text': cleaned[:10000],
                        'total_chars': len(result['raw_text']),
                        'source_type': 'url_import',
                    }
                )

            elif content_type == 'git':
                url = data.get('url')
                subpath = data.get('subpath')
                if not url:
                    return jsonify({'error': 'Git URL is required'}), 400

                preview = preview_git_repository(url, subpath)
                return jsonify(
                    {
                        'title': preview['suggested_title'],
                        'files': preview['files'],
                        'total_files': preview['total_files'],
                        'total_chars': preview['total_chars'],
                        'preview_text': preview['preview_text'],
                        'source_type': 'git_repository',
                    }
                )

            else:
                return jsonify({'error': 'Invalid content type'}), 400

        except ValueError as e:
            return jsonify({'error': str(e)}), 400
        except Exception as e:
            logger.exception('Preview content failed')
            return jsonify({'error': str(e)}), 500

    @bp.route('/preview-chunks', methods=['POST'])
    @request_body(PreviewChunksBody)
    def preview_chunks() -> Response | tuple[Response, int]:
        """Preview chunking without creating an episode."""
        data = request.json
        if not data or not data.get('text'):
            return jsonify({'error': 'Provide text'}), 400

        chunks = chunk_text(
            data['text'],
            strategy=data.get('strategy', 'paragraph'),
            max_chars=data.get('max_chars', DEFAULT_MAX_CHARS),
        )
        return jsonify({'chunks': chunks, 'count': len(chunks)})


def _get_cleaning_settings(db) -> dict[str, Any]:
    """Get user's cleaning settings from database."""
    rows = db.execute(
        "SELECT key, value FROM settings WHERE key LIKE 'clean_%' OR key = 'code_block_rule' OR key = 'url_extraction_method'"
    ).fetchall()
    return {r['key']: r['value'] for r in rows}
