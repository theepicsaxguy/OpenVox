"""
Git repository ingestion using codefetch.
"""

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from app.config import Config
from app.logging_config import get_logger

logger = get_logger('studio.git_ingestion')

MAX_REPO_CHARS = 512 * 1024
ALLOWED_EXTENSIONS = {'.md', '.txt', '.markdown', '.mdx'}


@dataclass
class GitFile:
    path: str
    content: str


def is_git_url(url: str) -> bool:
    """Check if URL is a git repository."""
    return any(host in url.lower() for host in ['github.com', 'gitlab.com', 'bitbucket.org'])


def extract_subpath_from_url(url: str) -> str | None:
    """Extract subdirectory path from URL if present."""
    # Match: github.com/user/repo/tree/branch/docs/concepts
    match = re.search(r'(?:github|gitlab|bitbucket)\.org/[^/]+/[^/]+/tree/[^/]+/(.+)', url)
    if match:
        return match.group(1)
    return None


def run_codefetch(url: str, subpath: str | None = None) -> str:
    """Execute codefetch to extract text files from git repo."""
    cmd = [
        'npx',
        'codefetch',
        '--url',
        url,
        '-e',
        '.md,.txt,.markdown,.mdx',
        '--exclude-dir',
        'node_modules,venv,.git,dist,build,coverage,__pycache__,.venv,target,Debug,Release',
        '-d',
        '--no-cache',
    ]

    if subpath:
        cmd.extend(['--include-dir', subpath])

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=120, cwd=Config.STUDIO_SOURCES_DIR
        )

        if result.returncode != 0:
            error_msg = result.stderr.strip() or 'Unknown error'
            raise RuntimeError(f'codefetch failed: {error_msg}')

        return result.stdout

    except subprocess.TimeoutExpired:
        raise RuntimeError('Repository extraction timed out after 2 minutes')
    except FileNotFoundError:
        raise RuntimeError('Node.js not found. Install Node.js to use git repository import.')


def parse_codefetch_output(output: str) -> list[GitFile]:
    """Parse codefetch output into GitFile objects."""
    files = []

    match = re.search(r'<source_code>(.*?)</source_code>', output, re.DOTALL)
    if not match:
        return files

    content = match.group(1).strip()

    file_pattern = r'^([^\n]+?)\n```(\w+)?\n(.*?)^```'

    for match in re.finditer(file_pattern, content, re.MULTILINE | re.DOTALL):
        filepath = match.group(1).strip()
        file_content = match.group(3)

        ext = Path(filepath).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            continue

        files.append(GitFile(path=filepath, content=file_content))

    return files


def extract_repo_title(url: str, files: list[GitFile]) -> str:
    """Extract meaningful title from repo."""
    # Try README.md first
    for file in files:
        if file.path.lower().endswith('readme.md'):
            match = re.search(r'^#\s+(.+)$', file.content, re.MULTILINE)
            if match:
                title = match.group(1).strip()
                title = re.sub(r'!\[.*?\]\(.*?\)', '', title)
                return re.sub(r'\s+', ' ', title).strip()[:100]

    # Fall back to repo name
    parts = url.rstrip('/').split('/')
    if len(parts) >= 2:
        repo_name = parts[-1]
        if repo_name in ['tree', 'blob']:
            repo_name = parts[-2]
        return repo_name.replace('-', ' ').replace('_', ' ').title()[:100]

    return 'Git Repository'


def ingest_git_repository(url: str, subpath: str | None = None) -> dict:
    """Ingest git repository and return source data."""
    if not is_git_url(url):
        raise ValueError('Invalid git repository URL. Must be GitHub, GitLab, or Bitbucket')

    output = run_codefetch(url, subpath)
    files = parse_codefetch_output(output)

    if not files:
        raise ValueError('No text files found in repository')

    total_chars = sum(len(f.content) for f in files)
    if total_chars > MAX_REPO_CHARS:
        raise ValueError(
            f'Repository content too large ({total_chars} chars). '
            f'Maximum: {MAX_REPO_CHARS} chars. Try a specific subdirectory.'
        )

    # Concatenate with file headers
    parts = []
    for file in files:
        parts.append(f'\n\n---\n\n## File: {file.path}\n\n')
        parts.append(file.content)

    return {
        'title': extract_repo_title(url, files),
        'raw_text': ''.join(parts),
        'original_url': url,
        'source_type': 'git_repository',
        'files': [f.path for f in files],
    }


def preview_git_repository(url: str, subpath: str | None = None) -> dict:
    """Preview git repository without importing."""
    if not is_git_url(url):
        raise ValueError('Invalid git repository URL')

    output = run_codefetch(url, subpath)
    files = parse_codefetch_output(output)

    total_chars = sum(len(f.content) for f in files)
    title = extract_repo_title(url, files) if files else 'Git Repository'

    preview_text = ''
    if files:
        preview_text = files[0].content[:2000]
        if len(files) > 1:
            preview_text += f'\n\n... and {len(files) - 1} more files'

    return {
        'files': [{'path': f.path, 'chars': len(f.content)} for f in files],
        'total_files': len(files),
        'total_chars': total_chars,
        'suggested_title': title,
        'preview_text': preview_text,
    }
