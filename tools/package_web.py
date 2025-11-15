import shutil
import subprocess
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEB_SRC = PROJECT_ROOT / "web"
DATA_DESIGN = PROJECT_ROOT / "design" / "data"
DIST_ROOT = PROJECT_ROOT / "dist"
WEB_DIST = DIST_ROOT / "web"
ZIP_NAME = DIST_ROOT / "idle-civilization-web.zip"


def generate_data():
    subprocess.run(
        ["python", "tools/generate_buildings.py"],
        cwd=PROJECT_ROOT,
        check=True,
    )


def refresh_dist():
    if WEB_DIST.exists():
        shutil.rmtree(WEB_DIST)
    shutil.copytree(WEB_SRC, WEB_DIST)


def copy_additional_data():
    data_dest = WEB_DIST / "data"
    data_dest.mkdir(parents=True, exist_ok=True)
    for json_file in DATA_DESIGN.glob("*.json"):
        shutil.copy(json_file, data_dest / json_file.name)


def create_zip():
    if ZIP_NAME.exists():
        ZIP_NAME.unlink()
    shutil.make_archive(
        ZIP_NAME.with_suffix(""),
        "zip",
        root_dir=WEB_DIST,
    )


def main():
    generate_data()
    refresh_dist()
    copy_additional_data()
    create_zip()
    print(f"Web build ready: {WEB_DIST}")
    print(f"Zip for itch.io: {ZIP_NAME}")


if __name__ == "__main__":
    main()



