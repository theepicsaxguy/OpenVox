#!/usr/bin/env python3
"""Validate the generated OpenAPI spec for common issues.

Checks that POST/PUT endpoints have requestBody definitions when their
Flask route handlers use request.json or request.files.

Exit code 0 = all checks pass, exit code 1 = issues found.
"""

import os
import sys

import yaml

SPEC_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'openapi.yaml'
)

BODYLESS_ENDPOINTS = {
    'post /api/studio/episodes/{episode_id}/regenerate',
    'post /api/studio/episodes/{episode_id}/cancel',
    'post /api/studio/episodes/{episode_id}/retry-errors',
    'post /api/studio/episodes/{episode_id}/chunks/{chunk_index}/regenerate',
    'post /api/studio/undo/{undo_id}',
    'post /api/studio/folders/{folder_id}/playlist',
}


def validate_spec(spec_path: str) -> list[str]:
    """Validate the OpenAPI spec and return a list of issues."""
    with open(spec_path) as f:
        spec = yaml.safe_load(f)

    issues: list[str] = []
    paths = spec.get('paths', {})

    for path, path_item in paths.items():
        for method in ('post', 'put', 'patch'):
            if method not in path_item:
                continue

            operation = path_item[method]
            endpoint_key = f'{method} {path}'

            if endpoint_key in BODYLESS_ENDPOINTS:
                continue

            if 'requestBody' not in operation:
                issues.append(
                    f'{method.upper()} {path}: missing requestBody '
                    f'(add to BODYLESS_ENDPOINTS in validate_openapi.py if intentional)'
                )
                continue

            content = operation['requestBody'].get('content', {})
            if not content:
                issues.append(f'{method.upper()} {path}: requestBody has no content types')
                continue

            for content_type, media_type in content.items():
                schema = media_type.get('schema', {})
                if not schema:
                    issues.append(f'{method.upper()} {path}: {content_type} has no schema')

    if not paths:
        issues.append('No paths found in spec')

    post_put_count = sum(1 for ops in paths.values() for m in ('post', 'put', 'patch') if m in ops)
    body_count = sum(
        1
        for ops in paths.values()
        for m in ('post', 'put', 'patch')
        if m in ops and 'requestBody' in ops[m]
    )

    print(f'Validated: {spec_path}')
    print(f'  POST/PUT/PATCH operations: {post_put_count}')
    print(f'  With requestBody: {body_count}')
    print(f'  Without requestBody: {post_put_count - body_count}')
    print(f'  Exempt (bodyless): {len(BODYLESS_ENDPOINTS)}')

    return issues


def main() -> int:
    spec_path = sys.argv[1] if len(sys.argv) > 1 else SPEC_PATH

    if not os.path.exists(spec_path):
        print(f'ERROR: {spec_path} not found. Run pnpm run openapi:generate first.')
        return 1

    issues = validate_spec(spec_path)

    if issues:
        print(f'\n{len(issues)} issue(s) found:')
        for issue in issues:
            print(f'  - {issue}')
        return 1

    print('\nAll checks passed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
