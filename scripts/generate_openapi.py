#!/usr/bin/env python3
"""Generate OpenAPI spec - mocks ML deps before app import."""

import os
import sys
import types


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


# Install top-level and common submodules
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


import re  # noqa: E402


def convert_flask_path(path):
    """Convert Flask path with converters to OpenAPI format."""

    def strip_converter(match):
        param = match.group(1)
        if ':' in param:
            param = param.split(':', 1)[1]
        return '{' + param + '}'

    return re.sub(r'<([^>]+)>', strip_converter, path)


def extract_path_params(path):
    """Extract path parameter names from OpenAPI-style path."""
    return re.findall(r'\{(\w+)\}', path)


def generate_spec():
    from app.config import Config
    from app.logging_config import setup_logging

    setup_logging()

    app = Flask(
        __name__,
        template_folder=Config.get_template_folder(),
        static_folder=Config.get_static_folder(),
    )
    app.config['STREAM_DEFAULT'] = Config.STREAM_DEFAULT

    # Register core API
    from app.routes import api

    app.register_blueprint(api)

    # Register Studio blueprint (without starting generation queue)
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

    spec = APISpec(
        title='OpenVox API',
        version='1.0.0',
        openapi_version='3.0.3',
        plugins=[MarshmallowPlugin()],
    )

    for rule in app.url_map.iter_rules():
        if rule.endpoint == 'static':
            continue

        path = convert_flask_path(rule.rule)
        param_names = extract_path_params(path)
        methods = [m for m in rule.methods if m not in ('HEAD', 'OPTIONS')]

        if not methods:
            continue

        operations = {}
        for method in methods:
            view_func = app.view_functions.get(rule.endpoint)
            doc = (view_func.__doc__ or '').strip()
            summary = doc.split('\n')[0][:50] if doc else ''

            operation = {
                'summary': summary,
                'description': doc,
                'responses': {'200': {'description': 'Success'}},
            }

            if param_names:
                operation['parameters'] = [
                    {'name': name, 'in': 'path', 'required': True, 'schema': {'type': 'string'}}
                    for name in param_names
                ]

            operations[method.lower()] = operation

        if operations:
            spec.path(path=path, operations=operations)

    return spec.to_dict()


def main():
    output_path = sys.argv[1] if len(sys.argv) > 1 else 'openapi.yaml'
    spec = generate_spec()

    with open(output_path, 'w') as f:
        yaml.dump(spec, f, default_flow_style=False, sort_keys=False)

    print(f'Generated: {output_path}')
    print(f'  - Paths: {len(spec.get("paths", {}))}')


if __name__ == '__main__':
    main()
