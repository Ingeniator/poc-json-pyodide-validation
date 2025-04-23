from fastapi import FastAPI
import yaml
import gitlab
from pathlib import Path

app = FastAPI()

# Load config on startup
CONFIG = {}
CONFIG_PATH = Path("config.yaml")

def load_config():
    global CONFIG
    with open(CONFIG_PATH, "r") as f:
        CONFIG = yaml.safe_load(f)["gitlab"]

load_config()

@app.get("/list-files")
def list_files():
    try:
        gl = gitlab.Gitlab(CONFIG["url"], private_token=CONFIG["private_token"])
        project = gl.projects.get(CONFIG["project_id"])

        items = project.repository_tree(
            path=CONFIG.get("path", ""),
            ref=CONFIG.get("ref", "main"),
            all=True
        )

        return {"files": items}
    except Exception as e:
        return {"error": str(e)}
