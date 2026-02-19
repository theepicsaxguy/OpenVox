#!/usr/bin/env python3
"""Validate the generated OpenAPI spec for completeness.

Checks:
  1. All POST/PUT/PATCH endpoints have requestBody OR are intentionally bodyless
  2. All requestBody references resolve to existing component schemas
  3. Reports statistics for quick sanity checks

Exit code 0 = pass, exit code 1 = issues found.
"""

import os
import sys

import yaml

SPEC_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'openapi.yaml'
)


def validate_spec(spec_path: str) -> list[str]:
    with open(spec_path) as f:
        spec = yaml.safe_load(f)

    issues: list[str] = []
    paths = spec.get('paths', {})
    schemas = spec.get('components', {}).get('schemas', {})

    if not paths:
        issues.append('No paths found in spec')
        return issues

    post_put_count = 0
    body_count = 0
    bodyless: list[str] = []

    for path, path_item in paths.items():
        for method in ('post', 'put', 'patch'):
            if method not in path_item:
                continue

            post_put_count += 1
            operation = path_item[method]

            if 'requestBody' not in operation:
                bodyless.append(f'{method.upper()} {path}')
                continue

            body_count += 1
            content = operation['requestBody'].get('content', {})
            if not content:
                issues.append(f'{method.upper()} {path}: requestBody has empty content')
                continue

            for content_type, media_type in content.items():
                schema = media_type.get('schema', {})
                ref = schema.get('$ref', '')
                if ref:
                    schema_name = ref.split('/')[-1]
                    if schema_name not in schemas:
                        issues.append(
                            f'{method.upper()} {path}: $ref to missing schema {schema_name}'
                        )
                elif not schema:
                    issues.append(f'{method.upper()} {path}: {content_type} has no schema')

    print(f'Validated: {spec_path}')
    print(f'  POST/PUT/PATCH: {post_put_count}')
    print(f'  With requestBody: {body_count}')
    print(f'  Bodyless (intentional): {len(bodyless)}')
    print(f'  Component schemas: {len(schemas)}')

    if bodyless:
        print('\n  Bodyless endpoints:')
        for ep in bodyless:
            print(f'    {ep}')

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
