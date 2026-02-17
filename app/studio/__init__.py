"""
Podcast Studio — Blueprint registration and initialization.
"""

from flask import Blueprint

studio_bp = Blueprint('studio', __name__, url_prefix='/api/studio')


def init_studio(app):
    """Register studio blueprint and initialize database."""
    from app.studio.db import close_db, init_db

    with app.app_context():
        init_db()

    app.teardown_appcontext(lambda exc: close_db())

    from app.studio.routes import register_routes

    register_routes(studio_bp)
    app.register_blueprint(studio_bp)

    from app.studio.generation import get_generation_queue

    get_generation_queue().start(app)
