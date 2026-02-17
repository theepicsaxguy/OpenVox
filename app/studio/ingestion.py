"""
Content ingestion — file upload, URL import, paste.
"""

import os
from pathlib import Path

from app.config import Config
from app.logging_config import get_logger

logger = get_logger('studio.ingestion')

MAX_FILE_SIZE = 512 * 1024  # 500KB
ALLOWED_EXTENSIONS = {'.md', '.txt'}


def ingest_file(file_storage) -> dict:
    """
    Ingest an uploaded file.

    Args:
        file_storage: Werkzeug FileStorage object

    Returns:
        dict with title, raw_text, original_filename, source_type
    """
    filename = file_storage.filename or 'untitled.txt'
    ext = Path(filename).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f'Unsupported file type: {ext}. Allowed: {", ".join(ALLOWED_EXTENSIONS)}')

    content = file_storage.read()
    if len(content) > MAX_FILE_SIZE:
        raise ValueError(f'File too large ({len(content)} bytes). Maximum: {MAX_FILE_SIZE} bytes.')

    raw_text = content.decode('utf-8', errors='replace')
    title = _extract_title(raw_text, filename)

    # Save source file
    source_path = os.path.join(Config.STUDIO_SOURCES_DIR, filename)
    os.makedirs(Config.STUDIO_SOURCES_DIR, exist_ok=True)
    with open(source_path, 'w', encoding='utf-8') as f:
        f.write(raw_text)

    return {
        'title': title,
        'raw_text': raw_text,
        'original_filename': filename,
        'source_type': 'file_upload',
    }


def ingest_url(url: str) -> dict:
    """
    Ingest content from a URL using trafilatura.

    Args:
        url: The URL to fetch and extract content from

    Returns:
        dict with title, raw_text, original_url, source_type
    """
    if not url.startswith('https://'):
        raise ValueError('Only HTTPS URLs are allowed for security.')

    if len(url) > 2048:
        raise ValueError('URL too long.')

    logger.info(f'Fetching URL: {url}')

    # First, try to fetch with requests to check content type
    import requests

    try:
        response = requests.get(url, timeout=30, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status()
    except requests.RequestException as e:
        raise ValueError(f'Could not fetch URL: {e}')

    content_type = response.headers.get('Content-Type', '').lower()
    raw_text = None

    # Handle plain text and markdown files directly
    if (
        'text/plain' in content_type
        or 'text/markdown' in content_type
        or url.endswith(('.md', '.txt'))
    ):
        raw_text = response.text
        logger.info(f'Fetched raw text content ({len(raw_text)} chars)')
    else:
        # Use trafilatura for HTML content
        try:
            import trafilatura
        except ImportError as exc:
            raise ImportError(
                'trafilatura is required for URL import. pip install trafilatura'
            ) from exc

        downloaded = trafilatura.fetch_url(url)
        if not downloaded:
            raise ValueError(f'Could not fetch URL: {url}')

        raw_text = trafilatura.extract(
            downloaded,
            include_comments=False,
            include_tables=True,
            output_format='txt',
        )
        logger.info('Extracted text from HTML using trafilatura')

    if not raw_text:
        raise ValueError('Could not extract readable text from URL.')

    if len(raw_text) > MAX_FILE_SIZE:
        raise ValueError(
            f'Extracted text too large ({len(raw_text)} bytes). Maximum: {MAX_FILE_SIZE} bytes.'
        )

    title = _extract_title_from_url(url, raw_text)

    return {
        'title': title,
        'raw_text': raw_text,
        'original_url': url,
        'source_type': 'url_import',
    }


def ingest_paste(text: str, title: str = None) -> dict:
    """
    Ingest pasted text.

    Args:
        text: Raw pasted text
        title: Optional title

    Returns:
        dict with title, raw_text, source_type
    """
    if not text or not text.strip():
        raise ValueError('Empty text provided.')

    if len(text) > MAX_FILE_SIZE:
        raise ValueError(f'Text too large ({len(text)} bytes). Maximum: {MAX_FILE_SIZE} bytes.')

    if not title:
        title = _extract_title(text, 'Pasted Text')

    return {
        'title': title,
        'raw_text': text,
        'source_type': 'paste',
    }


def _extract_title(text: str, fallback: str) -> str:
    """Extract title from first heading or first line."""
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        if line.startswith('#'):
            return _clean_title(line.lstrip('#').strip())
        return _clean_title(line[:80])
    return Path(fallback).stem if fallback else 'Untitled'


def _clean_title(title: str) -> str:
    """Remove non-text characters from title."""
    import re

    # Skip lines that are just markdown horizontal rules
    if re.match(r'^[\-\*_]{3,}$', title.strip()):
        return ''

    # Keep only alphanumeric, spaces, and basic punctuation
    title = re.sub(r'[^\w\s\-.,!?\'"]+', ' ', title)
    # Collapse multiple spaces
    title = re.sub(r'\s+', ' ', title)
    # Remove leading/trailing hyphens
    title = title.strip('-. ')
    return title.strip()


def _extract_title_from_url(url: str, text: str) -> str:
    """Extract a title from URL content."""
    title = _extract_title(text, '')
    if title:
        return title
    # Fallback to URL path
    from urllib.parse import urlparse

    parsed = urlparse(url)
    path = parsed.path.strip('/')
    if path:
        return _clean_title(path.split('/')[-1].replace('-', ' ').replace('_', ' ').title()[:80])
    return parsed.netloc
