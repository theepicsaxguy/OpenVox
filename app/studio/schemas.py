"""
Marshmallow schemas — single source of truth for request body definitions.

These schemas drive:
  1. OpenAPI spec generation (via apispec MarshmallowPlugin)
  2. Orval TypeScript client generation (via the generated spec)

To add a new endpoint with a request body:
  1. Define a Schema class here
  2. Decorate the route handler with @request_body(YourSchema)
  3. Run `pnpm run client:generate`
"""

from marshmallow import Schema, fields


def request_body(schema_class, content_type='application/json'):
    """Associate a Marshmallow schema with a Flask route for OpenAPI generation.

    Supports multiple content types on a single route by stacking decorators::

        @bp.route('/sources', methods=['POST'])
        @request_body(CreateSourceFileBody, 'multipart/form-data')
        @request_body(CreateSourceJsonBody)
        def create_source():
            ...
    """

    def decorator(f):
        if not hasattr(f, '_request_schemas'):
            f._request_schemas = {}
        f._request_schemas[content_type] = schema_class
        return f

    return decorator


# ── Shared schemas ───────────────────────────────────────────────────


class MoveToFolderBody(Schema):
    folder_id = fields.String(
        allow_none=True, metadata={'description': 'Target folder ID, or null for root'}
    )


class SetTagsBody(Schema):
    tag_ids = fields.List(
        fields.String(),
        load_default=[],
        metadata={'description': 'Tag IDs to assign (replaces existing)'},
    )


class CleaningSettings(Schema):
    code_block_rule = fields.String(
        metadata={'description': 'How to handle code blocks: skip, read, summarize'}
    )
    remove_non_text = fields.Boolean()
    handle_tables = fields.Boolean()
    speak_urls = fields.Boolean()
    expand_abbreviations = fields.Boolean()
    preserve_parentheses = fields.Boolean()
    preserve_structure = fields.Boolean()
    paragraph_spacing = fields.Integer()
    section_spacing = fields.Integer()
    list_item_spacing = fields.Integer()


class UrlSettings(Schema):
    use_jina = fields.Boolean(metadata={'description': 'Use Jina Reader for URL extraction'})
    jina_fallback = fields.Boolean(
        metadata={'description': 'Fall back to Jina if other methods fail'}
    )


# ── Source schemas ───────────────────────────────────────────────────


class CreateSourceJsonBody(Schema):
    text = fields.String(metadata={'description': 'Raw text to import'})
    title = fields.String(metadata={'description': 'Source title'})
    url = fields.String(metadata={'description': 'URL to import content from'})
    git_url = fields.String(metadata={'description': 'Git repository URL to import'})
    git_subpath = fields.String(metadata={'description': 'Subdirectory path within the git repo'})
    cleaning_settings = fields.Nested(
        CleaningSettings, metadata={'description': 'Override cleaning options'}
    )
    url_settings = fields.Nested(UrlSettings, metadata={'description': 'URL extraction settings'})


class CreateSourceFileBody(Schema):
    file = fields.String(metadata={'format': 'binary', 'description': 'File to upload (.md, .txt)'})


class UpdateSourceBody(Schema):
    title = fields.String()
    cleaned_text = fields.String()


class SourceCoverUploadBody(Schema):
    cover = fields.String(metadata={'format': 'binary', 'description': 'Cover art image file'})


class ReCleanSourceBody(Schema):
    code_block_rule = fields.String()
    remove_non_text = fields.Boolean()
    handle_tables = fields.Boolean()
    speak_urls = fields.Boolean()
    expand_abbreviations = fields.Boolean()
    preserve_parentheses = fields.Boolean()


# ── Episode schemas ──────────────────────────────────────────────────


class CreateEpisodeBody(Schema):
    source_id = fields.String(required=True)
    voice_id = fields.String()
    output_format = fields.String()
    chunk_strategy = fields.String(
        metadata={'description': 'paragraph, sentence, heading, or fixed'}
    )
    chunk_max_length = fields.Integer()
    code_block_rule = fields.String()
    breathing_intensity = fields.String(metadata={'description': 'none, light, normal, heavy'})
    title = fields.String()


class UpdateEpisodeBody(Schema):
    title = fields.String()


class RegenerateWithSettingsBody(Schema):
    voice_id = fields.String()
    output_format = fields.String()
    chunk_strategy = fields.String()
    chunk_max_length = fields.Integer()
    code_block_rule = fields.String()
    breathing_intensity = fields.String()


class BulkMoveEpisodesBody(Schema):
    episode_ids = fields.List(fields.String(), required=True)
    folder_id = fields.String(allow_none=True)


class BulkDeleteEpisodesBody(Schema):
    episode_ids = fields.List(fields.String(), required=True)


# ── Folder schemas ───────────────────────────────────────────────────


class CreateFolderBody(Schema):
    name = fields.String(load_default='New Folder')
    parent_id = fields.String(allow_none=True)
    sort_order = fields.Integer(load_default=0)


class UpdateFolderBody(Schema):
    name = fields.String()
    parent_id = fields.String(allow_none=True)
    sort_order = fields.Integer()


class ReorderItem(Schema):
    type = fields.String()
    id = fields.String(required=True)
    sort_order = fields.Integer(required=True)


class ReorderBody(Schema):
    items = fields.List(fields.Nested(ReorderItem), load_default=[])


# ── Tag schemas ──────────────────────────────────────────────────────


class CreateTagBody(Schema):
    name = fields.String(required=True)


# ── Playback schemas ────────────────────────────────────────────────


class SavePlaybackBody(Schema):
    current_chunk_index = fields.Integer(load_default=0)
    position_secs = fields.Float(load_default=0.0)
    percent_listened = fields.Float(load_default=0.0)


# ── Settings schemas ────────────────────────────────────────────────


class UpdateSettingsBody(Schema):
    """Accepts arbitrary key-value pairs for settings storage."""


# ── Preview schemas ─────────────────────────────────────────────────


class PreviewCleanBody(Schema):
    text = fields.String(required=True)
    code_block_rule = fields.String()


class PreviewContentBody(Schema):
    type = fields.String(required=True, metadata={'description': 'Content type: url or git'})
    url = fields.String()
    subpath = fields.String()


class PreviewChunksBody(Schema):
    text = fields.String(required=True)
    strategy = fields.String()
    max_chars = fields.Integer()


# ── Speech schemas (core API) ───────────────────────────────────────


class SpeechGenerationBody(Schema):
    input = fields.String(required=True, metadata={'description': 'Text to synthesize'})
    voice = fields.String(metadata={'description': 'Voice ID or path'})
    model = fields.String(
        metadata={'description': 'Model name (ignored, for OpenAI compatibility)'}
    )
    response_format = fields.String(metadata={'description': 'Audio format: mp3, wav, pcm, opus'})
    stream = fields.Boolean(metadata={'description': 'Enable streaming response'})
