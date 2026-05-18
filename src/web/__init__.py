from pathlib import Path

from flask import Flask

from src.web.routes.menu import menu_bp
from src.web.routes.route_coord_mark import coord_mark_bp
from src.web.routes.route_perspective_clip import perspective_clip_bp


def create_app() -> Flask:
    template_dir = Path(__file__).resolve().parent / "templates"
    app = Flask(__name__, template_folder=str(template_dir))
    app.register_blueprint(menu_bp)
    app.register_blueprint(coord_mark_bp)
    app.register_blueprint(perspective_clip_bp)
    return app
