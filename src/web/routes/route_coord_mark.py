from flask import Blueprint, render_template

coord_mark_bp = Blueprint("coord_mark", __name__, url_prefix="/coord-mark")


@coord_mark_bp.route("/")
def index():
    return render_template("coord_mark.html")
