"""
Text normalizer — converts markdown/HTML to TTS-friendly plain text.
"""

from app.logging_config import get_logger

logger = get_logger('studio.normalizer')


def normalize_text(text: str, code_block_rule: str = 'skip') -> str:
    """
    Normalize text for TTS consumption.

    Args:
        text: Raw markdown or plain text
        code_block_rule: How to handle code blocks — 'skip', 'read', 'placeholder'

    Returns:
        Cleaned text suitable for speech synthesis
    """
    try:
        from markdown_it import MarkdownIt
    except ImportError:
        logger.warning('markdown-it-py not available, falling back to basic normalization')
        return _basic_normalize(text, code_block_rule)

    md = MarkdownIt()
    tokens = md.parse(text)
    result = []
    skip_until_close = None

    for token in tokens:
        if skip_until_close:
            if token.type == skip_until_close:
                skip_until_close = None
            continue

        if token.type == 'fence' or token.type == 'code_block':
            if code_block_rule == 'skip':
                continue
            elif code_block_rule == 'placeholder':
                result.append('(Code block omitted.)')
            elif code_block_rule == 'read':
                content = token.content.strip()
                if content:
                    result.append(f'Code: {content}')
            continue

        if token.type == 'heading_open':
            continue

        if token.type == 'heading_close':
            continue

        if token.type == 'inline':
            line = _process_inline(token)
            if line:
                # Check if previous token was a heading
                parent_type = _get_parent_type(tokens, token)
                if parent_type and parent_type.startswith('heading'):
                    result.append(f'Section: {line}.')
                else:
                    result.append(line)
            continue

        if token.type == 'bullet_list_open':
            continue

        if token.type == 'ordered_list_open':
            continue

        if token.type in ('bullet_list_close', 'ordered_list_close'):
            continue

        if token.type == 'list_item_open':
            continue

        if token.type == 'list_item_close':
            continue

        if token.type == 'paragraph_open':
            continue

        if token.type == 'paragraph_close':
            continue

        if token.type == 'hr':
            continue

        if token.type == 'html_block':
            # Strip HTML
            continue

    output = '\n\n'.join(line for line in result if line.strip())
    return _clean_whitespace(output)


def _process_inline(token) -> str:
    """Process inline token children into plain text."""
    if not token.children:
        return token.content or ''

    parts = []
    for child in token.children:
        if child.type == 'text':
            parts.append(child.content)
        elif child.type == 'code_inline':
            parts.append(child.content)
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
        elif child.type == 's_open' or child.type == 's_close':
            continue
        else:
            if child.content:
                parts.append(child.content)

    return ''.join(parts).strip()


def _get_parent_type(tokens, target_token) -> str | None:
    """Find the opening token type for an inline token."""
    for i, t in enumerate(tokens):
        if t is target_token and i > 0:
            prev = tokens[i - 1]
            if prev.type.endswith('_open'):
                return prev.type.replace('_open', '')
    return None


def _clean_whitespace(text: str) -> str:
    """Normalize whitespace in text."""
    import re

    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _basic_normalize(text: str, code_block_rule: str = 'skip') -> str:
    """Basic normalization without markdown-it-py."""
    import re

    lines = text.split('\n')
    result = []
    in_code_block = False

    for line in lines:
        stripped = line.strip()

        # Code block fences
        if stripped.startswith('```'):
            if in_code_block:
                in_code_block = False
                if code_block_rule == 'placeholder':
                    result.append('(Code block omitted.)')
            else:
                in_code_block = True
            continue

        if in_code_block:
            if code_block_rule == 'read':
                result.append(stripped)
            continue

        # Headings
        if stripped.startswith('#'):
            heading_text = stripped.lstrip('#').strip()
            result.append(f'Section: {heading_text}.')
            continue

        # Links: [text](url) -> text
        stripped = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', stripped)

        # Images: ![alt](url) -> (Image: alt)
        stripped = re.sub(r'!\[([^\]]*)\]\([^)]+\)', r'(Image: \1)', stripped)

        # Bold/italic markers
        stripped = re.sub(r'\*{1,3}([^*]+)\*{1,3}', r'\1', stripped)
        stripped = re.sub(r'_{1,3}([^_]+)_{1,3}', r'\1', stripped)

        # Inline code
        stripped = re.sub(r'`([^`]+)`', r'\1', stripped)

        # Horizontal rules
        if re.match(r'^[-*_]{3,}$', stripped):
            continue

        if stripped:
            result.append(stripped)

    return _clean_whitespace('\n\n'.join(result))
