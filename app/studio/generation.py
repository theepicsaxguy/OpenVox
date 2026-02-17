"""
Background audio generation queue — single-worker thread processing episodes sequentially.
"""

import os
import queue
import sqlite3
import threading
import time

from app.config import Config
from app.logging_config import get_logger

logger = get_logger('studio.generation')

_generation_queue = None


class GenerationQueue:
    """Single-worker queue for processing episode audio generation."""

    def __init__(self):
        self._queue = queue.Queue()
        self._worker = None
        self._running = False
        self._app = None
        self._current_episode_id = None
        self._cancel_flag = threading.Event()

    def start(self, app):
        """Start the generation worker thread."""
        self._app = app
        self._running = True
        self._worker = threading.Thread(target=self._worker_loop, daemon=True)
        self._worker.start()
        logger.info('Generation queue worker started')

    def stop(self):
        """Stop the generation worker."""
        self._running = False
        self._queue.put(None)  # Sentinel to unblock
        if self._worker:
            self._worker.join(timeout=5)

    def enqueue(self, episode_id: str):
        """Add an episode to the generation queue."""
        self._queue.put(episode_id)
        logger.info(f'Episode {episode_id} enqueued for generation')

    def cancel_current(self):
        """Request cancellation of current generation."""
        self._cancel_flag.set()

    @property
    def current_episode_id(self):
        return self._current_episode_id

    @property
    def queue_size(self):
        return self._queue.qsize()

    def _worker_loop(self):
        """Main worker loop — process episodes one at a time."""
        while self._running:
            try:
                episode_id = self._queue.get(timeout=1)
            except queue.Empty:
                continue

            if episode_id is None:
                break

            self._cancel_flag.clear()
            self._current_episode_id = episode_id

            try:
                self._process_episode(episode_id)
            except Exception:
                logger.exception(f'Failed to process episode {episode_id}')
                self._update_episode_status(episode_id, 'error')
            finally:
                self._current_episode_id = None
                self._queue.task_done()

    def _process_episode(self, episode_id: str):
        """Generate audio for all chunks in an episode."""
        with self._app.app_context():
            db = self._get_db()

            # Update episode status
            db.execute(
                "UPDATE episodes SET status = 'generating', updated_at = datetime('now') "
                'WHERE id = ?',
                (episode_id,),
            )
            db.commit()

            # Get chunks
            chunks = db.execute(
                'SELECT id, chunk_index, text FROM chunks '
                'WHERE episode_id = ? ORDER BY chunk_index',
                (episode_id,),
            ).fetchall()

            if not chunks:
                logger.warning(f'No chunks found for episode {episode_id}')
                self._update_episode_status(episode_id, 'error')
                return

            # Get episode config
            episode = db.execute(
                'SELECT voice_id, output_format FROM episodes WHERE id = ?',
                (episode_id,),
            ).fetchone()

            if not episode:
                return

            voice_id = episode['voice_id']
            output_format = episode['output_format']

            # Prepare audio directory
            audio_dir = os.path.join(Config.STUDIO_AUDIO_DIR, episode_id)
            os.makedirs(audio_dir, exist_ok=True)

            # Get TTS service
            from app.services.tts import get_tts_service

            tts = get_tts_service()
            voice_state = tts.get_voice_state(voice_id)

            total_duration = 0.0

            for chunk_row in chunks:
                if self._cancel_flag.is_set():
                    logger.info(f'Generation cancelled for episode {episode_id}')
                    self._update_episode_status(episode_id, 'error')
                    return

                chunk_id = chunk_row['id']
                chunk_index = chunk_row['chunk_index']
                chunk_text = chunk_row['text']

                try:
                    # Update chunk status
                    db.execute(
                        "UPDATE chunks SET status = 'generating' WHERE id = ?",
                        (chunk_id,),
                    )
                    db.commit()

                    # Generate audio
                    t0 = time.time()
                    audio_tensor = tts.generate_audio(voice_state, chunk_text)
                    gen_time = time.time() - t0

                    # Convert and save
                    from app.services.audio import convert_audio

                    audio_buffer = convert_audio(audio_tensor, tts.sample_rate, output_format)
                    audio_filename = f'{chunk_index}.{output_format}'
                    audio_path = os.path.join(audio_dir, audio_filename)

                    with open(audio_path, 'wb') as f:
                        f.write(audio_buffer.read())

                    # Calculate duration
                    num_samples = audio_tensor.shape[-1]
                    duration = num_samples / tts.sample_rate
                    total_duration += duration

                    # Update chunk
                    relative_path = f'{episode_id}/{audio_filename}'
                    db.execute(
                        'UPDATE chunks SET status = ?, audio_path = ?, duration_secs = ? '
                        'WHERE id = ?',
                        ('ready', relative_path, duration, chunk_id),
                    )
                    db.commit()

                    logger.info(
                        f'Chunk {chunk_index} of episode {episode_id}: '
                        f'{len(chunk_text)} chars in {gen_time:.1f}s ({duration:.1f}s audio)'
                    )

                except Exception as e:
                    logger.exception(f'Chunk {chunk_index} generation failed')
                    db.execute(
                        'UPDATE chunks SET status = ?, error_message = ? WHERE id = ?',
                        ('error', str(e), chunk_id),
                    )
                    db.commit()

            # Update episode
            db.execute(
                'UPDATE episodes SET status = ?, total_duration_secs = ?, '
                "updated_at = datetime('now') WHERE id = ?",
                ('ready', total_duration, episode_id),
            )
            db.commit()
            logger.info(f'Episode {episode_id} complete: {total_duration:.1f}s total audio')

    def _update_episode_status(self, episode_id: str, status: str):
        """Update episode status in DB."""
        try:
            with self._app.app_context():
                db = self._get_db()
                db.execute(
                    "UPDATE episodes SET status = ?, updated_at = datetime('now') WHERE id = ?",
                    (status, episode_id),
                )
                db.commit()
        except Exception:
            logger.exception(f'Failed to update episode {episode_id} status to {status}')

    def _get_db(self) -> sqlite3.Connection:
        """Get a database connection for the worker thread."""
        db = sqlite3.connect(Config.STUDIO_DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('PRAGMA foreign_keys=ON')
        return db


def get_generation_queue() -> GenerationQueue:
    """Get the global generation queue singleton."""
    global _generation_queue
    if _generation_queue is None:
        _generation_queue = GenerationQueue()
    return _generation_queue
