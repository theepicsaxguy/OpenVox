#!/usr/bin/env python3
"""Generate OpenAPI spec from Flask routes and Marshmallow schemas.

Mocks ML dependencies (torch, numpy, etc.) so the script runs without
a GPU or heavy packages installed — only Flask, apispec, marshmallow,
and pyyaml are needed.

The spec is built by:
  1. Creating the Flask app and registering all blueprints
  2. Iterating over url_map rules
  3. Reading `_request_schemas` set by @request_body decorators
  4. Letting apispec's MarshmallowPlugin resolve schemas to JSON Schema
"""

import os
import re
import sys
import types

# ── Mock heavy ML dependencies before any app imports ────────────────


class DummyModule(types.ModuleType):
    def __init__(self, name):
        super().__init__(name)
        self._submodules = {}

    def __getattr__(self, name):
        if name.startswith('_'):
            raise AttributeError(name)
        if name not in self._submodules:
            self._submodules[name] = DummyModule(f'{self.__name__}.{name}')
        return self._submodules[name]

    def __call__(self, *a, **k):
        return lambda *a, **k: None

    def __iter__(self):
        return iter([])


for name in ['torch', 'torchaudio', 'scipy', 'soundfile', 'numpy']:
    sys.modules[name] = DummyModule(name)

for mod in ['scipy.signal', 'scipy.io', 'numpy.core', 'torch.nn', 'torch.Tensor']:
    parts = mod.split('.')
    parent = DummyModule(parts[0])
    sys.modules[mod] = parent
    for i in range(1, len(parts)):
        parent = getattr(parent, parts[i])
        full = '.'.join(parts[: i + 1])
        sys.modules[full] = parent


import yaml  # noqa: E402
from apispec import APISpec  # noqa: E402
from apispec.ext.marshmallow import MarshmallowPlugin  # noqa: E402
from flask import Flask  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ── Flask path converter → OpenAPI type mapping ─────────────────────

CONVERTER_TYPE_MAP = {
    'int': {'type': 'integer'},
    'float': {'type': 'number'},
    'uuid': {'type': 'string', 'format': 'uuid'},
    'path': {'type': 'string'},
    'string': {'type': 'string'},
}


def convert_flask_path(path: str) -> tuple[str, dict[str, dict]]:
    """Convert ``/items/<int:id>`` to ``/items/{id}`` and extract param types."""
    param_types: dict[str, dict] = {}

    def replace_param(match):
        raw = match.group(1)
        converter = 'string'
        name = raw
        if ':' in raw:
            converter, name = raw.split(':', 1)
        param_types[name] = CONVERTER_TYPE_MAP.get(converter, {'type': 'string'})
        return '{' + name + '}'

    openapi_path = re.sub(r'<([^>]+)>', replace_param, path)
    return openapi_path, param_types


def build_path_params(path: str, param_types: dict[str, dict]) -> list[dict]:
    """Build OpenAPI parameter objects for each ``{name}`` in *path*."""
    return [
        {
            'name': n,
            'in': 'path',
            'required': True,
            'schema': param_types.get(n, {'type': 'string'}),
        }
        for n in re.findall(r'\{(\w+)\}', path)
    ]


# ── Spec generation ─────────────────────────────────────────────────


def create_app() -> Flask:
    """Build the Flask app with all blueprints (no server start)."""
    from app.config import Config
    from app.logging_config import setup_logging

    setup_logging()

    app = Flask(
        __name__,
        template_folder=Config.get_template_folder(),
        static_folder=Config.get_static_folder(),
    )
    app.config['STREAM_DEFAULT'] = Config.STREAM_DEFAULT

    from app.routes import api

    app.register_blueprint(api)

    from app.studio import (
        episodes_routes,
        folders_routes,
        library_routes,
        playback_routes,
        settings_routes,
        sources_routes,
        studio_bp,
        tags_routes,
    )

    sources_routes.register_routes(studio_bp)
    episodes_routes.register_routes(studio_bp)
    folders_routes.register_routes(studio_bp)
    tags_routes.register_routes(studio_bp)
    playback_routes.register_routes(studio_bp)
    settings_routes.register_routes(studio_bp)
    library_routes.register_routes(studio_bp)
    app.register_blueprint(studio_bp)

    return app


def generate_spec() -> dict:
    app = create_app()

    spec = APISpec(
        title='OpenVox API',
        version='1.0.0',
        openapi_version='3.0.3',
        plugins=[MarshmallowPlugin()],
    )

    warnings: list[str] = []
    stats = {'post_put': 0, 'with_body': 0}

    for rule in app.url_map.iter_rules():
        if rule.endpoint == 'static':
            continue

        path, param_types = convert_flask_path(rule.rule)
        methods = [m for m in rule.methods if m not in ('HEAD', 'OPTIONS')]
        if not methods:
            continue

        view_func = app.view_functions.get(rule.endpoint)
        schemas = getattr(view_func, '_request_schemas', {})

        operations: dict = {}
        for method in methods:
            doc = (view_func.__doc__ or '').strip() if view_func else ''
            summary = doc.split('\n')[0][:50] if doc else ''

            operation: dict = {
                'summary': summary,
                'description': doc,
                'responses': {'200': {'description': 'Success'}},
            }

            params = build_path_params(path, param_types)
            if params:
                operation['parameters'] = params

            if method in ('POST', 'PUT', 'PATCH'):
                stats['post_put'] += 1
                if schemas:
                    stats['with_body'] += 1
                    content: dict = {}
                    for content_type, schema_class in schemas.items():
                        content[content_type] = {'schema': schema_class}
                    operation['requestBody'] = {'content': content}
                else:
                    warnings.append(f'  {method} {path} — no @request_body schema')

            operations[method.lower()] = operation

        if operations:
            spec.path(path=path, operations=operations)

    return spec.to_dict(), warnings, stats


def main():
    output_path = sys.argv[1] if len(sys.argv) > 1 else 'openapi.yaml'
    spec, warnings, stats = generate_spec()

    with open(output_path, 'w') as f:
        yaml.dump(spec, f, default_flow_style=False, sort_keys=False)

    print(f'Generated: {output_path}')
    print(f'  Paths: {len(spec.get("paths", {}))}')
    print(f'  Schemas: {len(spec.get("components", {}).get("schemas", {}))}')
    print(f'  POST/PUT/PATCH: {stats["post_put"]}')
    print(f'  With requestBody: {stats["with_body"]}')

    if warnings:
        print(f'\n  Bodyless POST/PUT/PATCH endpoints ({len(warnings)}):')
        for w in warnings:
            print(w)


if __name__ == '__main__':
    main()
