from flask import Blueprint, render_template

menu_bp = Blueprint("menu", __name__)


@menu_bp.route("/")
def index():
    return render_template("index.html")
