"""
Studio API routes — all endpoints under /api/studio/.
"""

import os
import uuid

from flask import jsonify, request, send_file

from app.config import Config
from app.logging_config import get_logger
from app.studio.db import get_db

logger = get_logger('studio.routes')


def register_routes(bp):
    """Register all studio API routes on the blueprint."""

    # ── Sources ──────────────────────────────────────────────────────────

    @bp.route('/sources', methods=['POST'])
    def create_source():
        """Upload file, submit URL, or paste text."""
        from app.studio.ingestion import ingest_file, ingest_paste, ingest_url
        from app.studio.normalizer import CleaningOptions, normalize_text

        db = get_db()

        # Load cleaning settings from user preferences
        settings = _get_cleaning_settings(db)

        try:
            # File upload
            if 'file' in request.files:
                f = request.files['file']
                if f.filename:
                    data = ingest_file(f)
                else:
                    return jsonify({'error': 'No file selected'}), 400
            # URL import
            elif request.is_json and request.json.get('url'):
                data = ingest_url(request.json['url'])
                req_settings = request.json.get('cleaning_settings', {})
                settings.update(req_settings)
            # Paste
            elif request.is_json and request.json.get('text'):
                data = ingest_paste(
                    request.json['text'],
                    title=request.json.get('title'),
                )
                req_settings = request.json.get('cleaning_settings', {})
                settings.update(req_settings)
            else:
                return jsonify({'error': 'Provide a file, url, or text'}), 400

            # Create cleaning options from settings
            options = CleaningOptions(
                remove_non_text=settings.get('clean_remove_non_text', False),
                handle_tables=settings.get('clean_handle_tables', True),
                speak_urls=settings.get('clean_speak_urls', True),
                expand_abbreviations=settings.get('clean_expand_abbreviations', True),
                code_block_rule=settings.get('code_block_rule', 'skip'),
                preserve_parentheses=settings.get('clean_preserve_parentheses', True),
            )

            cleaned = normalize_text(data['raw_text'], options)
            source_id = str(uuid.uuid4())

            db.execute(
                'INSERT INTO sources (id, title, source_type, original_filename, '
                'original_url, raw_text, cleaned_text) '
                'VALUES (?, ?, ?, ?, ?, ?, ?)',
                (
                    source_id,
                    data['title'],
                    data['source_type'],
                    data.get('original_filename'),
                    data.get('original_url'),
                    data['raw_text'],
                    cleaned,
                ),
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
    def list_sources():
        """List all sources."""
        db = get_db()
        folder_id = request.args.get('folder_id')
        tag = request.args.get('tag')

        query = (
            'SELECT s.id, s.title, s.source_type, s.original_url, '
            's.folder_id, s.created_at, s.updated_at, '
            'LENGTH(s.cleaned_text) as text_length '
            'FROM sources s'
        )
        params = []

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
        rows = db.execute(query, params).fetchall()
        return jsonify([dict(r) for r in rows])

    @bp.route('/sources/<source_id>', methods=['GET'])
    def get_source(source_id):
        """Get a source with cleaned text."""
        db = get_db()
        row = db.execute('SELECT * FROM sources WHERE id = ?', (source_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Source not found'}), 404
        return jsonify(dict(row))

    @bp.route('/sources/<source_id>', methods=['PUT'])
    def update_source(source_id):
        """Update source title or cleaned_text."""
        db = get_db()
        data = request.json

        fields = []
        params = []
        if 'title' in data:
            fields.append('title = ?')
            params.append(data['title'])
        if 'cleaned_text' in data:
            fields.append('cleaned_text = ?')
            params.append(data['cleaned_text'])

        if not fields:
            return jsonify({'error': 'No fields to update'}), 400

        fields.append("updated_at = datetime('now')")
        params.append(source_id)

        db.execute(
            f'UPDATE sources SET {", ".join(fields)} WHERE id = ?',
            params,
        )
        db.commit()
        return jsonify({'ok': True})

    @bp.route('/sources/<source_id>', methods=['DELETE'])
    def delete_source(source_id):
        """Delete source and associated episodes/audio."""
        db = get_db()

        # Get episodes to delete audio files
        episodes = db.execute(
            'SELECT id FROM episodes WHERE source_id = ?', (source_id,)
        ).fetchall()
        for ep in episodes:
            _delete_episode_audio(ep['id'])

        db.execute('DELETE FROM sources WHERE id = ?', (source_id,))
        db.commit()
        return jsonify({'ok': True})

    @bp.route('/sources/<source_id>/re-clean', methods=['POST'])
    def re_clean_source(source_id):
        """Re-run normalizer on a source with different options."""
        from app.studio.normalizer import CleaningOptions, normalize_text

        db = get_db()
        source = db.execute('SELECT raw_text FROM sources WHERE id = ?', (source_id,)).fetchone()
        if not source:
            return jsonify({'error': 'Source not found'}), 404

        data = request.json or {}
        options = CleaningOptions(
            remove_non_text=data.get('remove_non_text', False),
            handle_tables=data.get('handle_tables', True),
            speak_urls=data.get('speak_urls', True),
            expand_abbreviations=data.get('expand_abbreviations', True),
            code_block_rule=data.get('code_block_rule', 'skip'),
            preserve_parentheses=data.get('preserve_parentheses', True),
        )
        cleaned = normalize_text(source['raw_text'], options)

        db.execute(
            "UPDATE sources SET cleaned_text = ?, updated_at = datetime('now') WHERE id = ?",
            (cleaned, source_id),
        )
        db.commit()
        return jsonify({'cleaned_text': cleaned})

    @bp.route('/preview-clean', methods=['POST'])
    def preview_clean():
        """Preview normalization without saving."""
        from app.studio.normalizer import CleaningOptions, normalize_text

        data = request.json
        if not data or not data.get('text'):
            return jsonify({'error': 'Provide text'}), 400

        # Build cleaning options from request or defaults
        options = CleaningOptions(
            remove_non_text=data.get('remove_non_text', False),
            handle_tables=data.get('handle_tables', True),
            speak_urls=data.get('speak_urls', True),
            expand_abbreviations=data.get('expand_abbreviations', True),
            code_block_rule=data.get('code_block_rule', 'skip'),
            preserve_parentheses=data.get('preserve_parentheses', True),
        )

        cleaned = normalize_text(data['text'], options)
        return jsonify({'cleaned_text': cleaned})

    # ── Chunking & Episodes ──────────────────────────────────────────────

    @bp.route('/preview-chunks', methods=['POST'])
    def preview_chunks():
        """Preview chunking without creating an episode."""
        from app.studio.chunking import chunk_text

        data = request.json
        if not data or not data.get('text'):
            return jsonify({'error': 'Provide text'}), 400

        chunks = chunk_text(
            data['text'],
            strategy=data.get('strategy', 'paragraph'),
            max_chars=data.get('max_chars', 2000),
        )
        return jsonify({'chunks': chunks, 'count': len(chunks)})

    @bp.route('/episodes', methods=['POST'])
    def create_episode():
        """Create an episode — chunk text and enqueue generation."""
        from app.studio.chunking import chunk_text
        from app.studio.generation import get_generation_queue

        data = request.json
        if not data:
            return jsonify({'error': 'Missing JSON body'}), 400

        source_id = data.get('source_id')
        if not source_id:
            return jsonify({'error': 'source_id is required'}), 400

        db = get_db()
        source = db.execute(
            'SELECT title, cleaned_text FROM sources WHERE id = ?', (source_id,)
        ).fetchone()
        if not source:
            return jsonify({'error': 'Source not found'}), 404

        voice_id = data.get('voice_id', 'alba')
        output_format = data.get('output_format', 'wav')
        chunk_strategy = data.get('chunk_strategy', 'paragraph')
        chunk_max_length = data.get('chunk_max_length', 2000)
        code_block_rule = data.get('code_block_rule', 'skip')
        breathing_intensity = data.get('breathing_intensity', 'normal')
        title = data.get('title', source['title'])

        # Chunk the text
        chunks = chunk_text(
            source['cleaned_text'],
            strategy=chunk_strategy,
            max_chars=chunk_max_length,
        )

        if not chunks:
            return jsonify({'error': 'Text produced no chunks'}), 400

        # Create episode
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

        # Create chunks
        for chunk in chunks:
            chunk_id = str(uuid.uuid4())
            db.execute(
                'INSERT INTO chunks (id, episode_id, chunk_index, text, status) '
                'VALUES (?, ?, ?, ?, ?)',
                (chunk_id, episode_id, chunk['index'], chunk['text'], 'pending'),
            )

        # Initialize playback state
        db.execute(
            'INSERT INTO playback_state (episode_id) VALUES (?)',
            (episode_id,),
        )

        db.commit()

        # Enqueue for generation
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
    def list_episodes():
        """List all episodes."""
        db = get_db()
        folder_id = request.args.get('folder_id')
        source_id = request.args.get('source_id')

        query = (
            'SELECT e.*, p.percent_listened, p.last_played_at '
            'FROM episodes e '
            'LEFT JOIN playback_state p ON e.id = p.episode_id'
        )
        params = []

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
    def get_episode(episode_id):
        """Get episode with its chunks."""
        db = get_db()
        episode = db.execute(
            'SELECT e.*, p.current_chunk_index, p.position_secs, '
            'p.percent_listened, p.last_played_at '
            'FROM episodes e '
            'LEFT JOIN playback_state p ON e.id = p.episode_id '
            'WHERE e.id = ?',
            (episode_id,),
        ).fetchone()
        if not episode:
            return jsonify({'error': 'Episode not found'}), 404

        chunks = db.execute(
            'SELECT id, chunk_index, text, audio_path, duration_secs, status, error_message '
            'FROM chunks WHERE episode_id = ? ORDER BY chunk_index',
            (episode_id,),
        ).fetchall()

        result = dict(episode)
        result['chunks'] = [dict(c) for c in chunks]
        return jsonify(result)

    @bp.route('/episodes/<episode_id>', methods=['PUT'])
    def update_episode(episode_id):
        """Update episode metadata."""
        db = get_db()
        data = request.json or {}

        # Build update dynamically
        allowed_fields = ['title']
        updates = []
        params = []

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
    def delete_episode(episode_id):
        """Delete episode and audio files."""
        db = get_db()
        _delete_episode_audio(episode_id)
        db.execute('DELETE FROM episodes WHERE id = ?', (episode_id,))
        db.commit()
        return jsonify({'ok': True})

    @bp.route('/episodes/<episode_id>/regenerate', methods=['POST'])
    def regenerate_episode(episode_id):
        """Re-generate all chunks for an episode."""
        from app.studio.generation import get_generation_queue

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
    def regenerate_with_settings(episode_id):
        """Re-generate episode with new settings, with undo support."""
        import shutil
        import uuid

        from app.studio.chunking import chunk_text
        from app.studio.generation import get_generation_queue

        db = get_db()
        data = request.json or {}

        # Get episode and source
        episode = db.execute(
            'SELECT e.*, s.cleaned_text FROM episodes e '
            'JOIN sources s ON e.source_id = s.id WHERE e.id = ?',
            (episode_id,),
        ).fetchone()

        if not episode:
            return jsonify({'error': 'Episode not found'}), 404

        # Create backup before deleting
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

        # Delete current audio
        _delete_episode_audio(episode_id)

        # Get new settings
        voice_id = data.get('voice_id', episode['voice_id'])
        output_format = data.get('output_format', episode['output_format'])
        chunk_strategy = data.get('chunk_strategy', episode['chunk_strategy'])
        chunk_max_length = data.get('chunk_max_length', episode['chunk_max_length'])
        code_block_rule = data.get('code_block_rule', episode['code_block_rule'])
        breathing_intensity = data.get('breathing_intensity', episode['breathing_intensity'])

        # Re-chunk with new settings
        chunks = chunk_text(
            episode['cleaned_text'],
            strategy=chunk_strategy,
            max_chars=chunk_max_length,
        )

        if not chunks:
            return jsonify({'error': 'Text produced no chunks'}), 400

        # Delete old chunks
        db.execute('DELETE FROM chunks WHERE episode_id = ?', (episode_id,))

        # Create new chunks
        for chunk in chunks:
            chunk_id = str(uuid.uuid4())
            db.execute(
                'INSERT INTO chunks (id, episode_id, chunk_index, text, status) '
                'VALUES (?, ?, ?, ?, ?)',
                (chunk_id, episode_id, chunk['index'], chunk['text'], 'pending'),
            )

        # Update episode settings
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

        # Enqueue for generation
        get_generation_queue().enqueue(episode_id)

        return jsonify(
            {'ok': True, 'status': 'pending', 'chunk_count': len(chunks), 'undo_id': backup_id}
        )

    @bp.route('/undo/<undo_id>', methods=['POST'])
    def undo_regeneration(undo_id):
        """Undo an episode regeneration within the grace period."""
        import shutil

        db = get_db()

        # Get undo record
        undo = db.execute(
            'SELECT * FROM undo_buffer WHERE id = ? AND expires_at > datetime("now")', (undo_id,)
        ).fetchone()

        if not undo:
            return jsonify({'error': 'Undo expired or not found'}), 404

        episode_id = undo['episode_id']
        backup_dir = undo['backup_audio_dir']
        audio_dir = os.path.join(Config.STUDIO_AUDIO_DIR, episode_id)

        # Restore backup
        if os.path.exists(audio_dir):
            shutil.rmtree(audio_dir)
        if os.path.exists(backup_dir):
            shutil.move(backup_dir, audio_dir)

        # Delete undo record
        db.execute('DELETE FROM undo_buffer WHERE id = ?', (undo_id,))
        db.commit()

        return jsonify({'ok': True})

    @bp.route('/episodes/bulk-move', methods=['POST'])
    def bulk_move_episodes():
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
    def bulk_delete_episodes():
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
    def regenerate_chunk(episode_id, chunk_index):
        """Regenerate a single chunk."""
        from app.studio.generation import get_generation_queue

        db = get_db()
        chunk = db.execute(
            'SELECT id, audio_path FROM chunks WHERE episode_id = ? AND chunk_index = ?',
            (episode_id, chunk_index),
        ).fetchone()

        if not chunk:
            return jsonify({'error': 'Chunk not found'}), 404

        # Delete existing audio
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

    @bp.route('/episodes/<episode_id>/audio/<int:chunk_index>', methods=['GET'])
    def serve_chunk_audio(episode_id, chunk_index):
        """Serve a chunk's audio file."""
        db = get_db()
        chunk = db.execute(
            'SELECT audio_path FROM chunks WHERE episode_id = ? AND chunk_index = ?',
            (episode_id, chunk_index),
        ).fetchone()

        if not chunk or not chunk['audio_path']:
            return jsonify({'error': 'Audio not available'}), 404

        path = os.path.join(Config.STUDIO_AUDIO_DIR, chunk['audio_path'])
        if not os.path.exists(path):
            return jsonify({'error': 'Audio file missing'}), 404

        return send_file(path)

    @bp.route('/episodes/<episode_id>/audio/full', methods=['GET'])
    def serve_full_episode(episode_id):
        """Serve merged full episode audio."""
        from app.services.tts import get_tts_service
        from app.studio.audio_assembly import merge_chunks_to_episode

        db = get_db()
        chunks = db.execute(
            'SELECT audio_path FROM chunks '
            'WHERE episode_id = ? AND status = ? ORDER BY chunk_index',
            (episode_id, 'ready'),
        ).fetchall()

        if not chunks:
            return jsonify({'error': 'No ready chunks'}), 404

        chunk_paths = [c['audio_path'] for c in chunks if c['audio_path']]
        if not chunk_paths:
            return jsonify({'error': 'No audio files'}), 404

        # Check if merged file already exists
        ext = os.path.splitext(chunk_paths[0])[1]
        merged_path = os.path.join(Config.STUDIO_AUDIO_DIR, episode_id, f'full{ext}')

        if not os.path.exists(merged_path):
            tts = get_tts_service()
            merge_chunks_to_episode(episode_id, chunk_paths, tts.sample_rate)

        return send_file(merged_path)

    @bp.route('/generation/status', methods=['GET'])
    def generation_status():
        """Get generation queue status."""
        from app.studio.generation import get_generation_queue

        gq = get_generation_queue()

        # Also get database state for more accurate status
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

    # ── Library Organization ─────────────────────────────────────────────

    @bp.route('/library/tree', methods=['GET'])
    def library_tree():
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

    @bp.route('/folders', methods=['POST'])
    def create_folder():
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
    def update_folder(folder_id):
        """Rename or move a folder."""
        data = request.json
        db = get_db()

        fields = []
        params = []
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
    def delete_folder(folder_id):
        """Delete a folder and all its contents (episodes audio files are deleted)."""
        import shutil

        db = get_db()

        # Get all episodes in the folder to delete their audio files
        episodes = db.execute(
            'SELECT id FROM episodes WHERE folder_id = ?',
            (folder_id,),
        ).fetchall()

        # Delete audio files for each episode
        for ep in episodes:
            audio_dir = os.path.join(Config.STUDIO_AUDIO_DIR, ep['id'])
            if os.path.isdir(audio_dir):
                shutil.rmtree(audio_dir, ignore_errors=True)

        # Delete episodes from database
        db.execute('DELETE FROM episodes WHERE folder_id = ?', (folder_id,))

        # Delete sources in the folder
        db.execute('DELETE FROM sources WHERE folder_id = ?', (folder_id,))

        # Unparent subfolders (set their parent to NULL, don't delete them)
        db.execute('UPDATE folders SET parent_id = NULL WHERE parent_id = ?', (folder_id,))

        # Delete the folder
        db.execute('DELETE FROM folders WHERE id = ?', (folder_id,))
        db.commit()
        return jsonify({'ok': True})

    @bp.route('/folders/<folder_id>/playlist', methods=['POST'])
    def start_folder_playlist(folder_id):
        """Start playing all episodes in a folder as a playlist."""
        db = get_db()

        # Get all ready episodes in folder, ordered by creation date
        episodes = db.execute(
            'SELECT e.id, e.title, e.total_duration_secs, e.voice_id '
            'FROM episodes e '
            'WHERE e.folder_id = ? AND e.status = ? '
            'ORDER BY e.created_at ASC',
            (folder_id, 'ready'),
        ).fetchall()

        if not episodes:
            return jsonify({'error': 'No ready episodes in folder'}), 404

        # Build playlist queue with chunks
        queue = []
        for ep in episodes:
            chunks = db.execute(
                'SELECT chunk_index, text, duration_secs '
                'FROM chunks WHERE episode_id = ? AND status = ? ORDER BY chunk_index',
                (ep['id'], 'ready'),
            ).fetchall()

            for chunk in chunks:
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
    def get_folder_episodes(folder_id):
        """Get all episodes in a folder for playlist building."""
        db = get_db()

        episodes = db.execute(
            'SELECT e.id, e.title, e.status, e.total_duration_secs, e.voice_id, '
            'p.percent_listened, p.current_chunk_index '
            'FROM episodes e '
            'LEFT JOIN playback_state p ON e.id = p.episode_id '
            'WHERE e.folder_id = ? '
            'ORDER BY e.created_at ASC',
            (folder_id,),
        ).fetchall()

        return jsonify([dict(ep) for ep in episodes])

    @bp.route('/sources/<source_id>/move', methods=['PUT'])
    def move_source(source_id):
        """Move a source to a folder."""
        data = request.json
        db = get_db()
        db.execute(
            'UPDATE sources SET folder_id = ? WHERE id = ?',
            (data.get('folder_id'), source_id),
        )
        db.commit()
        return jsonify({'ok': True})

    @bp.route('/episodes/<episode_id>/move', methods=['PUT'])
    def move_episode(episode_id):
        """Move an episode to a folder."""
        data = request.json
        db = get_db()
        db.execute(
            'UPDATE episodes SET folder_id = ? WHERE id = ?',
            (data.get('folder_id'), episode_id),
        )
        db.commit()
        return jsonify({'ok': True})

    @bp.route('/reorder', methods=['POST'])
    def reorder():
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

    # ── Tags ─────────────────────────────────────────────────────────────

    @bp.route('/tags', methods=['GET'])
    def list_tags():
        """List all tags."""
        db = get_db()
        rows = db.execute('SELECT * FROM tags ORDER BY name').fetchall()
        return jsonify([dict(r) for r in rows])

    @bp.route('/tags', methods=['POST'])
    def create_tag():
        """Create a tag."""
        data = request.json
        db = get_db()
        tag_id = str(uuid.uuid4())
        name = data.get('name', '').strip()
        if not name:
            return jsonify({'error': 'Tag name required'}), 400

        try:
            db.execute('INSERT INTO tags (id, name) VALUES (?, ?)', (tag_id, name))
            db.commit()
        except Exception:
            return jsonify({'error': f'Tag "{name}" already exists'}), 409

        return jsonify({'id': tag_id, 'name': name}), 201

    @bp.route('/tags/<tag_id>', methods=['DELETE'])
    def delete_tag(tag_id):
        """Delete a tag."""
        db = get_db()
        db.execute('DELETE FROM tags WHERE id = ?', (tag_id,))
        db.commit()
        return jsonify({'ok': True})

    @bp.route('/sources/<source_id>/tags', methods=['POST'])
    def set_source_tags(source_id):
        """Set tags for a source (replaces all existing)."""
        data = request.json
        db = get_db()
        tag_ids = data.get('tag_ids', [])

        db.execute('DELETE FROM source_tags WHERE source_id = ?', (source_id,))
        for tag_id in tag_ids:
            db.execute(
                'INSERT INTO source_tags (source_id, tag_id) VALUES (?, ?)',
                (source_id, tag_id),
            )
        db.commit()
        return jsonify({'ok': True})

    @bp.route('/episodes/<episode_id>/tags', methods=['POST'])
    def set_episode_tags(episode_id):
        """Set tags for an episode (replaces all existing)."""
        data = request.json
        db = get_db()
        tag_ids = data.get('tag_ids', [])

        db.execute('DELETE FROM episode_tags WHERE episode_id = ?', (episode_id,))
        for tag_id in tag_ids:
            db.execute(
                'INSERT INTO episode_tags (episode_id, tag_id) VALUES (?, ?)',
                (episode_id, tag_id),
            )
        db.commit()
        return jsonify({'ok': True})

    # ── Playback State ───────────────────────────────────────────────────

    @bp.route('/playback/<episode_id>', methods=['GET'])
    def get_playback(episode_id):
        """Get playback state for an episode."""
        db = get_db()

        # Validate episode exists first
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
    def save_playback(episode_id):
        """Save playback position."""
        data = request.json
        db = get_db()

        # Validate episode exists first
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

    # ── Settings ─────────────────────────────────────────────────────────

    @bp.route('/settings', methods=['GET'])
    def get_settings():
        """Get all settings."""
        db = get_db()
        rows = db.execute('SELECT key, value FROM settings').fetchall()
        return jsonify({r['key']: r['value'] for r in rows})

    @bp.route('/settings', methods=['PUT'])
    def update_settings():
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

    # ── Helpers ──────────────────────────────────────────────────────────

    def _get_cleaning_settings(db):
        """Get user's cleaning settings from database."""
        rows = db.execute(
            "SELECT key, value FROM settings WHERE key LIKE 'clean_%' OR key = 'code_block_rule'"
        ).fetchall()
        return {r['key']: r['value'] for r in rows}

    def _delete_episode_audio(episode_id):
        """Delete all audio files for an episode."""
        import shutil

        audio_dir = os.path.join(Config.STUDIO_AUDIO_DIR, episode_id)
        if os.path.isdir(audio_dir):
            shutil.rmtree(audio_dir, ignore_errors=True)
