"""
Text chunking strategies for splitting content into TTS-sized pieces.
"""

import re

from app.logging_config import get_logger

logger = get_logger('studio.chunking')

DEFAULT_MAX_CHARS = 2000


def chunk_text(
    text: str,
    strategy: str = 'paragraph',
    max_chars: int = DEFAULT_MAX_CHARS,
) -> list[dict]:
    """
    Split text into chunks using the specified strategy.

    Args:
        text: The text to chunk
        strategy: One of 'paragraph', 'sentence', 'heading', 'max_chars'
        max_chars: Maximum characters per chunk

    Returns:
        List of dicts with 'index', 'text', 'label'
    """
    if not text or not text.strip():
        return []

    if strategy == 'paragraph':
        raw_chunks = _chunk_by_paragraph(text, max_chars)
    elif strategy == 'sentence':
        raw_chunks = _chunk_by_sentence(text, max_chars)
    elif strategy == 'heading':
        raw_chunks = _chunk_by_heading(text, max_chars)
    elif strategy == 'max_chars':
        raw_chunks = _chunk_by_max_chars(text, max_chars)
    else:
        raise ValueError(f'Unknown chunk strategy: {strategy}')

    chunks = []
    for i, (chunk_text_str, label) in enumerate(raw_chunks):
        stripped = chunk_text_str.strip()
        if stripped:
            chunks.append(
                {
                    'index': i,
                    'text': stripped,
                    'label': label or f'Chunk {i + 1}',
                }
            )

    # Re-index after filtering empties
    for i, chunk in enumerate(chunks):
        chunk['index'] = i

    return chunks


def _chunk_by_paragraph(text: str, max_chars: int) -> list[tuple[str, str]]:
    """Split on double newlines, merge short paragraphs."""
    paragraphs = re.split(r'\n\s*\n', text)
    chunks = []
    current = ''
    chunk_num = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        if current and len(current) + len(para) + 2 > max_chars:
            chunk_num += 1
            chunks.append((current, f'Part {chunk_num}'))
            current = para
        elif not current:
            current = para
        else:
            current += '\n\n' + para

    if current.strip():
        chunk_num += 1
        chunks.append((current, f'Part {chunk_num}'))

    return chunks


def _chunk_by_sentence(text: str, max_chars: int) -> list[tuple[str, str]]:
    """Split on sentence boundaries, merge to max_chars."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks = []
    current = ''
    chunk_num = 0

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        if current and len(current) + len(sentence) + 1 > max_chars:
            chunk_num += 1
            chunks.append((current, f'Part {chunk_num}'))
            current = sentence
        elif not current:
            current = sentence
        else:
            current += ' ' + sentence

    if current.strip():
        chunk_num += 1
        chunks.append((current, f'Part {chunk_num}'))

    return chunks


def _chunk_by_heading(text: str, max_chars: int) -> list[tuple[str, str]]:
    """Split on markdown-style headings (Section: ...)."""
    # Split on lines that look like section markers from normalizer
    pattern = r'(?=^Section: .+$)'
    sections = re.split(pattern, text, flags=re.MULTILINE)

    chunks = []
    for section in sections:
        section = section.strip()
        if not section:
            continue

        # Extract heading for label
        heading_match = re.match(r'^Section: (.+?)\.?\s*$', section, re.MULTILINE)
        label = heading_match.group(1) if heading_match else None

        # If section is too long, sub-chunk by paragraph
        if len(section) > max_chars:
            sub_chunks = _chunk_by_paragraph(section, max_chars)
            for i, (sub_text, _) in enumerate(sub_chunks):
                sub_label = f'{label} ({i + 1})' if label else None
                chunks.append((sub_text, sub_label))
        else:
            chunks.append((section, label))

    return chunks


def _chunk_by_max_chars(text: str, max_chars: int) -> list[tuple[str, str]]:
    """Split at word boundaries to stay under max_chars."""
    words = text.split()
    chunks = []
    current = ''
    chunk_num = 0

    for word in words:
        if current and len(current) + len(word) + 1 > max_chars:
            chunk_num += 1
            chunks.append((current, f'Part {chunk_num}'))
            current = word
        elif not current:
            current = word
        else:
            current += ' ' + word

    if current.strip():
        chunk_num += 1
        chunks.append((current, f'Part {chunk_num}'))

    return chunks
