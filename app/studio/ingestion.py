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


def ingest_url(url: str, use_jina: bool = True, jina_fallback: bool = True) -> dict:
    """
    Ingest content from a URL using jina.ai or trafilatura.

    Args:
        url: The URL to fetch and extract content from
        use_jina: Whether to try jina.ai extraction first (returns markdown)
        jina_fallback: Whether to fallback to trafilatura if jina.ai fails

    Returns:
        dict with title, raw_text, original_url, source_type
    """
    if not url.startswith(('https://', 'http://')):
        raise ValueError('Only HTTP/HTTPS URLs are allowed for security.')

    if len(url) > 2048:
        raise ValueError('URL too long.')

    logger.info(f'Fetching URL: {url}')

    # Try jina.ai first if enabled
    if use_jina:
        raw_text, page_title = _fetch_with_jina_with_title(url)
        if raw_text:
            logger.info(f'Extracted content using jina.ai ({len(raw_text)} chars)')
            if len(raw_text) > MAX_FILE_SIZE:
                raise ValueError(
                    f'Extracted text too large ({len(raw_text)} bytes). Maximum: {MAX_FILE_SIZE} bytes.'
                )
            title = _extract_title_from_url(url, raw_text, page_title)
            return {
                'title': title,
                'raw_text': raw_text,
                'original_url': url,
                'source_type': 'url_import',
            }
        elif not jina_fallback:
            raise ValueError('Could not extract content using jina.ai and fallback is disabled.')
        logger.info('jina.ai extraction failed, falling back to trafilatura')

    # Fallback to trafilatura or direct fetch
    raw_text, page_title = _fetch_with_trafilatura(url)

    if not raw_text:
        raise ValueError('Could not extract readable text from URL.')

    if len(raw_text) > MAX_FILE_SIZE:
        raise ValueError(
            f'Extracted text too large ({len(raw_text)} bytes). Maximum: {MAX_FILE_SIZE} bytes.'
        )

    title = _extract_title_from_url(url, raw_text, page_title)

    return {
        'title': title,
        'raw_text': raw_text,
        'original_url': url,
        'source_type': 'url_import',
    }


def _fetch_with_jina(url: str) -> str | None:
    """Fetch content using r.jina.ai/http://URL service."""
    import requests

    # Ensure URL has scheme for jina.ai
    if url.startswith('https://'):
        jina_url = f'https://r.jina.ai/{url[8:]}'
    elif url.startswith('http://'):
        jina_url = f'https://r.jina.ai/{url[7:]}'
    else:
        jina_url = f'https://r.jina.ai/{url}'

    try:
        response = requests.get(jina_url, timeout=30, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status()
        content = response.text

        # Check if jina.ai returned an error or empty content
        if not content or content.strip() in ['', 'Error']:
            return None

        # Extract only content below "Markdown Content:" if present
        # jina.ai sometimes returns metadata before the markdown content
        content = _extract_markdown_content(content)

        # jina.ai returns markdown, which is what we want
        return content
    except requests.RequestException as e:
        logger.warning(f'jina.ai request failed: {e}')
        return None


def _extract_markdown_content(text: str) -> str:
    """Extract content below 'Markdown Content:' header if present."""
    marker = 'Markdown Content:'
    idx = text.find(marker)
    if idx != -1:
        return text[idx + len(marker) :].lstrip('\n\r')
    return text


def _fetch_with_jina_with_title(url: str) -> tuple[str | None, str | None]:
    """Fetch content using jina.ai. Returns (content, page_title)."""
    content = _fetch_with_jina(url)
    # jina.ai doesn't provide title metadata, so return None for title
    return content, None


def _fetch_with_trafilatura(url: str) -> tuple[str | None, str | None]:
    """Fetch content using trafilatura or direct request. Returns (content, page_title)."""
    import requests

    try:
        response = requests.get(url, timeout=30, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status()
    except requests.RequestException as e:
        raise ValueError(f'Could not fetch URL: {e}')

    content_type = response.headers.get('Content-Type', '').lower()
    raw_text = None
    page_title = None

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

        # Extract with metadata to get title
        extracted = trafilatura.extract(
            downloaded,
            include_comments=False,
            include_tables=True,
            output_format='txt',
            with_metadata=True,
        )

        if extracted is None:
            raise ValueError(f'Could not extract content from URL: {url}')

        # trafilatura returns dict when with_metadata=True
        if isinstance(extracted, dict):
            raw_text = extracted.get('text', '')
            metadata = extracted.get('metadata') or {}
            page_title = metadata.get('title') or metadata.get('og:title') if metadata else None
        else:
            raw_text = extracted

        logger.info('Extracted text from HTML using trafilatura')

    return raw_text, page_title


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


def _extract_title_from_url(url: str, text: str, page_title: str | None = None) -> str:
    """Extract a title from URL content with metadata priority."""
    # Priority 1: Page title from metadata
    if page_title:
        # Clean up common suffixes
        title = page_title
        suffixes = [
            ' - GitHub',
            ' | GitHub',
            ' - Documentation',
            ' | Documentation',
            ' - Mozilla Developer Network',
            ' - MDN Web Docs',
            ' - npm',
            ' - PyPI',
            ' - Read the Docs',
            ' - DevDocs',
        ]
        for suffix in suffixes:
            if title.endswith(suffix):
                title = title[: -len(suffix)]
        return _clean_title(title[:100])

    # Priority 2: First heading in content
    title = _extract_title(text, '')
    if title:
        return title

    # Priority 3: URL path
    from urllib.parse import unquote, urlparse

    parsed = urlparse(url)
    path = unquote(parsed.path).strip('/')
    if path:
        # Get last meaningful segment
        segments = path.split('/')
        last = segments[-1]
        # Remove file extensions
        if '.' in last:
            last = last.rsplit('.', 1)[0]
        return _clean_title(last.replace('-', ' ').replace('_', ' ').title()[:80])

    # Fallback to domain
    return parsed.netloc
