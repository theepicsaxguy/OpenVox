"""
Text normalizer — converts markdown/HTML to TTS-friendly plain text.
Enhanced version with configurable cleaning rules.
"""

import re

from app.logging_config import get_logger

logger = get_logger('studio.normalizer')


class CleaningOptions:
    """Configuration for text cleaning."""

    def __init__(
        self,
        remove_non_text: bool = False,
        handle_tables: bool = True,
        speak_urls: bool = True,
        expand_abbreviations: bool = True,
        code_block_rule: str = 'skip',
        preserve_parentheses: bool = True,
    ):
        self.remove_non_text = remove_non_text
        self.handle_tables = handle_tables
        self.speak_urls = speak_urls
        self.expand_abbreviations = expand_abbreviations
        self.code_block_rule = code_block_rule
        self.preserve_parentheses = preserve_parentheses


# Common abbreviations to expand
ABBREVIATIONS = {
    'dr.': 'doctor',
    'mr.': 'mister',
    'mrs.': 'misses',
    'ms.': 'miss',
    'st.': 'saint',
    'ave.': 'avenue',
    'blvd.': 'boulevard',
    'rd.': 'road',
    'no.': 'number',
    'vol.': 'volume',
    'etc.': 'et cetera',
    'i.e.': 'that is',
    'e.g.': 'for example',
    'vs.': 'versus',
    'fig.': 'figure',
    'et al.': 'and others',
    'pp.': 'pages',
    'ch.': 'chapter',
    'sec.': 'section',
    'approx.': 'approximately',
    'dept.': 'department',
}


def _strip_html_tags(text: str) -> str:
    """Strip all HTML/markdown tags from text while preserving content."""
    # Remove HTML comments
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)

    # Remove DOCTYPE declarations
    text = re.sub(r'<!DOCTYPE[^>]*>', '', text, flags=re.IGNORECASE)

    # Remove script and style blocks entirely
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.IGNORECASE | re.DOTALL)

    # Replace block elements with newlines
    text = re.sub(r'<(br|hr|p|div|li|tr|td|th)[^>]*>', '\n', text, flags=re.IGNORECASE)

    # Remove all remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)

    # Remove markdown image syntax: ![alt](url)
    text = re.sub(r'!\[([^\]]*)\]\([^\)]+\)', r'\1', text)

    # Remove markdown link syntax: [text](url) - keep text only
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)

    # Remove markdown headers: # ## ### etc
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)

    # Remove markdown emphasis: **bold** *italic* __underline__ etc
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
    text = re.sub(r'\*([^*]+)\*', r'\1', text)
    text = re.sub(r'__([^_]+)__', r'\1', text)
    text = re.sub(r'_([^_]+)_', r'\1', text)

    # Remove markdown code blocks: ```code```
    text = re.sub(r'```.*?```', '', text, flags=re.DOTALL)

    # Remove inline code: `code`
    text = re.sub(r'`([^`]+)`', r'\1', text)

    # Remove markdown list markers: - * 1. etc at start of line
    text = re.sub(r'^[\-\*\+]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\d+\.\s+', '', text, flags=re.MULTILINE)

    # Remove horizontal rules: --- *** ___
    text = re.sub(r'^[\-\*_]{3,}\s*$', '', text, flags=re.MULTILINE)

    # Decode common HTML entities
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&quot;', '"', text)
    text = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))), text)

    # Clean up excessive newlines (preserve paragraph breaks)
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()


def normalize_text(text: str, options: CleaningOptions | None = None) -> str:
    """
    Normalize text for TTS consumption with configurable rules.

    Args:
        text: Raw markdown or plain text
        options: CleaningOptions instance (uses defaults if None)

    Returns:
        Cleaned text suitable for speech synthesis
    """
    if options is None:
        options = CleaningOptions()

    # Pre-process: strip any HTML tags that might have slipped through
    text = _strip_html_tags(text)

    try:
        from markdown_it import MarkdownIt
    except ImportError:
        logger.warning('markdown-it-py not available, falling back to basic normalization')
        return _basic_normalize(text, options)

    # Pre-process: handle tables if enabled
    if options.handle_tables:
        text = _process_tables(text)

    md = MarkdownIt()
    tokens = md.parse(text)
    result = []
    skip_until_close = None

    for token in tokens:
        if skip_until_close:
            if token.type == skip_until_close:
                skip_until_close = None
            continue

        # Handle code blocks
        if token.type == 'fence' or token.type == 'code_block':
            if options.code_block_rule == 'skip':
                continue
            elif options.code_block_rule == 'placeholder':
                result.append('(Code block.)')
            elif options.code_block_rule == 'read':
                content = token.content.strip()
                if content:
                    cleaned_code = _clean_code_content(content, options)
                    result.append(f'Code: {cleaned_code}')
            continue

        # Skip heading markers but keep content
        if token.type == 'heading_open':
            continue
        if token.type == 'heading_close':
            continue

        # Process inline content
        if token.type == 'inline':
            line = _process_inline(token, options)
            if line:
                # Check if previous token was a heading
                parent_type = _get_parent_type(tokens, token)
                if parent_type and parent_type.startswith('heading'):
                    result.append(f'Section: {line}.')
                else:
                    result.append(line)
            continue

        # Skip list markers
        if token.type in (
            'bullet_list_open',
            'ordered_list_open',
            'bullet_list_close',
            'ordered_list_close',
            'list_item_open',
            'list_item_close',
        ):
            continue

        # Skip paragraph markers
        if token.type in ('paragraph_open', 'paragraph_close'):
            continue

        # Skip horizontal rules
        if token.type == 'hr':
            continue

        # Skip HTML blocks
        if token.type == 'html_block':
            continue

    output = '\n\n'.join(line for line in result if line.strip())
    return _final_clean(output, options)


def _process_inline(token, options: CleaningOptions) -> str:
    """Process inline token children into plain text."""
    if not token.children:
        content = token.content or ''
        return _clean_text(content, options)

    parts = []
    for child in token.children:
        if child.type == 'text':
            parts.append(_clean_text(child.content, options))
        elif child.type == 'code_inline':
            if options.code_block_rule == 'read':
                parts.append(_clean_code_content(child.content, options))
            # Skip inline code for other rules
        elif child.type == 'softbreak':
            parts.append(' ')
        elif child.type == 'hardbreak':
            parts.append('. ')
        elif child.type == 'link_open':
            continue
        elif child.type == 'link_close':
            continue
        elif child.type == 'image':
            alt = child.content or 'image'
            parts.append(f'(Image: {alt})')
        elif child.type in ('em_open', 'em_close', 'strong_open', 'strong_close'):
            continue
        elif child.type in ('s_open', 's_close'):
            continue
        else:
            if child.content:
                parts.append(_clean_text(child.content, options))

    return ''.join(parts).strip()


def _clean_text(text: str, options: CleaningOptions) -> str:
    """Apply text cleaning rules."""
    if not text:
        return text

    # Handle URLs
    if options.speak_urls:
        text = _process_urls(text)

    # Expand abbreviations
    if options.expand_abbreviations:
        text = _expand_abbreviations(text)

    # Remove non-text characters if enabled
    if options.remove_non_text:
        text = _remove_non_text_chars(text, options.preserve_parentheses)
    else:
        # Even if not aggressively removing, clean up common problematic chars
        text = _light_clean(text, options.preserve_parentheses)

    return text


def _process_urls(text: str) -> str:
    """Convert URLs to speakable format (remove scheme, keep domain)."""

    # Pattern to match URLs
    url_pattern = r'https?://([^\s\])})]+)'

    def replace_url(match):
        url = match.group(1)
        # Remove www. prefix for cleaner speech
        url = re.sub(r'^www\.', '', url)
        # Remove trailing punctuation
        url = url.rstrip('.,;:!?')
        return url

    return re.sub(url_pattern, replace_url, text)


def _expand_abbreviations(text: str) -> str:
    """Expand common abbreviations."""

    # Sort by length (longest first) to avoid partial replacements
    sorted_abbrs = sorted(ABBREVIATIONS.items(), key=lambda x: len(x[0]), reverse=True)

    for abbr, expansion in sorted_abbrs:
        # Case-insensitive replacement, preserve case of first letter
        pattern = re.compile(re.escape(abbr), re.IGNORECASE)

        def replace_match(match, exp=expansion):
            matched = match.group(0)
            if matched[0].isupper():
                return exp.capitalize()
            return exp

        text = pattern.sub(replace_match, text)

    return text


def _remove_non_text_chars(text: str, preserve_parentheses: bool = True) -> str:
    """Aggressively remove non-speech characters."""

    if preserve_parentheses:
        # Characters to remove completely (excluding parentheses)
        remove_chars = r'[\-\—\•\*\|\#\_\~\`\[\]\{\}\<\>\^\&\%\$\@\=\+\']'
    else:
        # Remove everything including parentheses
        remove_chars = r'[\-\—\•\*\|\#\_\~\`\[\]\{\}\(\)\<\>\^\&\%\$\@\=\+\']'

    text = re.sub(remove_chars, ' ', text)

    # Normalize multiple spaces
    text = re.sub(r'\s+', ' ', text)

    return text.strip()


def _light_clean(text: str, preserve_parentheses: bool = True) -> str:
    """Light cleaning - remove problematic but keep most punctuation."""

    if not preserve_parentheses:
        # If not preserving, remove more characters
        text = re.sub(r'[\^\|\(\)]', ' ', text)
    else:
        # Remove characters that break TTS flow (except parentheses)
        text = re.sub(r'[\^\|]', ' ', text)

    # Normalize dashes (but keep them)
    text = re.sub(r'[\-\—]', '-', text)

    # Normalize multiple spaces
    text = re.sub(r'\s+', ' ', text)

    return text.strip()


def _process_tables(text: str) -> str:
    """
    Process markdown tables into speakable format.
    Converts tables to descriptive sentences.
    """

    # Pattern to match markdown tables
    table_pattern = r'(\|[^\n]+\|\n\|[-:\s|]+\|\n(?:\|[^\n]+\|\n?)+)'

    def convert_table(match):
        table_text = match.group(1)
        lines = [line.strip() for line in table_text.strip().split('\n') if line.strip()]

        if len(lines) < 2:
            return table_text

        # Parse header
        header_line = lines[0]
        headers = [h.strip() for h in header_line.split('|') if h.strip()]

        # Skip separator line
        data_lines = lines[2:] if len(lines) > 2 else []

        if not data_lines:
            return f'Table with columns: {", ".join(headers)}. '

        # Convert to sentences
        sentences = []
        sentences.append(f'Table with {len(data_lines)} rows and {len(headers)} columns. ')
        sentences.append(f'Columns are: {", ".join(headers)}. ')

        # Read first few rows as examples (max 3)
        for i, line in enumerate(data_lines[:3]):
            cells = [c.strip() for c in line.split('|') if c.strip()]
            if cells:
                zipped = list(zip(headers[: len(cells)], cells, strict=True))
                row_desc = ', '.join(f'{h}: {c}' for h, c in zipped)
                sentences.append(f'Row {i + 1}: {row_desc}. ')

        if len(data_lines) > 3:
            sentences.append(f'And {len(data_lines) - 3} more rows. ')

        return ''.join(sentences)

    return re.sub(table_pattern, convert_table, text, flags=re.MULTILINE)


def _clean_code_content(code: str, options: CleaningOptions) -> str:
    """Clean code content for speaking."""
    if options.remove_non_text:
        return _remove_non_text_chars(code, options.preserve_parentheses)
    return _light_clean(code, options.preserve_parentheses)


def _get_parent_type(tokens, target_token) -> str | None:
    """Find the opening token type for an inline token."""
    for i, t in enumerate(tokens):
        if t is target_token and i > 0:
            prev = tokens[i - 1]
            if prev.type.endswith('_open'):
                return prev.type.replace('_open', '')
    return None


def _final_clean(text: str, options: CleaningOptions) -> str:
    """Final whitespace normalization - preserve structure."""

    # Only normalize excessive newlines (preserve paragraph breaks)
    text = re.sub(r'\n{3,}', '\n\n', text)

    # Clean up spacing around punctuation (but not within words)
    text = re.sub(r'\s+([.,;:!?])', r'\1', text)

    return text.strip()


def _basic_normalize(text: str, options: CleaningOptions) -> str:
    """Basic normalization without markdown-it-py."""

    # Pre-process tables
    if options.handle_tables:
        text = _process_tables(text)

    lines = text.split('\n')
    result = []
    in_code_block = False

    for line in lines:
        stripped = line.strip()

        # Code block fences
        if stripped.startswith('```'):
            if in_code_block:
                in_code_block = False
                if options.code_block_rule == 'placeholder':
                    result.append('(Code block.)')
            else:
                in_code_block = True
            continue

        if in_code_block:
            if options.code_block_rule == 'read':
                cleaned = _clean_code_content(stripped, options)
                if cleaned:
                    result.append(cleaned)
            continue

        # Skip table separator lines
        if re.match(r'^[\|\-\:\s]+$', stripped):
            continue

        # Process table rows (basic)
        if stripped.startswith('|') and stripped.endswith('|'):
            # Already processed by _process_tables if enabled
            if not options.handle_tables:
                cells = [c.strip() for c in stripped.split('|') if c.strip()]
                if cells:
                    result.append('. '.join(cells))
            continue

        # Headings
        if stripped.startswith('#'):
            heading_text = stripped.lstrip('#').strip()
            cleaned = _clean_text(heading_text, options)
            if cleaned:
                result.append(f'Section: {cleaned}.')
            continue

        # Process inline elements
        line = _clean_text(stripped, options)

        # Links: [text](url) -> text (URL handled in _clean_text)
        line = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', line)

        # Images: ![alt](url) -> (Image: alt)
        line = re.sub(r'!\[([^\]]*)\]\([^)]+\)', r'(Image: \1)', line)

        # Bold/italic markers
        line = re.sub(r'\*{1,3}([^*]+)\*{1,3}', r'\1', line)
        line = re.sub(r'_{1,3}([^_]+)_{1,3}', r'\1', line)

        # Inline code
        line = re.sub(
            r'`([^`]+)`',
            lambda m: (
                _clean_code_content(m.group(1), options)
                if options.code_block_rule == 'read'
                else ''
            ),
            line,
        )

        # Horizontal rules
        if re.match(r'^[-*_]{3,}$', stripped):
            continue

        if line:
            result.append(line)

    return _final_clean('\n\n'.join(result), options)


# Backward compatibility function
def normalize_text_compat(text: str, code_block_rule: str = 'skip') -> str:
    """Backward compatible normalize_text function."""
    options = CleaningOptions(code_block_rule=code_block_rule)
    return normalize_text(text, options)
