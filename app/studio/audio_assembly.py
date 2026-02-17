"""
Audio assembly — merge chunk audio files into a single episode file.
"""

import os

import torch
import torchaudio

from app.config import Config
from app.logging_config import get_logger

logger = get_logger('studio.audio_assembly')

SILENCE_DURATION_SECS = 0.5


def merge_chunks_to_episode(episode_id: str, chunk_paths: list[str], sample_rate: int) -> str:
    """
    Merge individual chunk audio files into a single episode file.

    Args:
        episode_id: Episode ID
        chunk_paths: List of relative audio paths (from chunks table)
        sample_rate: Audio sample rate

    Returns:
        Path to the merged audio file (relative to STUDIO_AUDIO_DIR)
    """
    audio_dir = Config.STUDIO_AUDIO_DIR
    tensors = []

    # Create silence gap between chunks
    silence_samples = int(SILENCE_DURATION_SECS * sample_rate)
    silence = torch.zeros(1, silence_samples)

    for i, rel_path in enumerate(chunk_paths):
        full_path = os.path.join(audio_dir, rel_path)
        if not os.path.exists(full_path):
            logger.warning(f'Chunk audio file not found: {full_path}')
            continue

        waveform, sr = torchaudio.load(full_path)

        # Resample if needed
        if sr != sample_rate:
            resampler = torchaudio.transforms.Resample(sr, sample_rate)
            waveform = resampler(waveform)

        # Ensure mono
        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)

        tensors.append(waveform)
        if i < len(chunk_paths) - 1:
            tensors.append(silence)

    if not tensors:
        raise ValueError('No audio chunks to merge')

    merged = torch.cat(tensors, dim=1)

    # Determine format from first chunk path
    ext = os.path.splitext(chunk_paths[0])[1] if chunk_paths else '.wav'
    output_filename = f'full{ext}'
    output_rel_path = f'{episode_id}/{output_filename}'
    output_full_path = os.path.join(audio_dir, output_rel_path)

    fmt = ext.lstrip('.')
    torchaudio.save(output_full_path, merged, sample_rate, format=fmt)

    logger.info(
        f'Merged {len(chunk_paths)} chunks into {output_rel_path} '
        f'({merged.shape[1] / sample_rate:.1f}s)'
    )
    return output_rel_path
