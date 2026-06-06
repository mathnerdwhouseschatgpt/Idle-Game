import argparse
import shutil
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEB_SRC = PROJECT_ROOT / "web"
DIST_ROOT = PROJECT_ROOT / "dist"
WEB_DIST = DIST_ROOT / "web"
ZIP_NAME = DIST_ROOT / "idle-civilization-web.zip"


def generate_data():
    subprocess.run(
        [sys.executable, "tools/generate_buildings.py"],
        cwd=PROJECT_ROOT,
        check=True,
    )


def compile_web():
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    if not npm:
        raise RuntimeError("npm is required to compile the TypeScript web runtime.")
    subprocess.run(
        [npm, "run", "compile"],
        cwd=PROJECT_ROOT,
        check=True,
    )


def refresh_dist():
    if WEB_DIST.exists():
        shutil.rmtree(WEB_DIST)
    shutil.copytree(WEB_SRC, WEB_DIST, ignore=shutil.ignore_patterns("src"))


def add_pages_files():
    (WEB_DIST / ".nojekyll").write_text("", encoding="utf-8")


def create_zip():
    if ZIP_NAME.exists():
        ZIP_NAME.unlink()
    shutil.make_archive(
        ZIP_NAME.with_suffix(""),
        "zip",
        root_dir=WEB_DIST,
    )


def parse_args():
    parser = argparse.ArgumentParser(description="Package the web client for static hosting.")
    parser.add_argument(
        "--pages",
        action="store_true",
        help="Add GitHub Pages compatibility files and skip the itch.io zip.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    generate_data()
    compile_web()
    refresh_dist()
    if args.pages:
        add_pages_files()
    else:
        create_zip()
    print(f"Web build ready: {WEB_DIST}")
    if args.pages:
        print("GitHub Pages artifact ready.")
    else:
        print(f"Zip for itch.io: {ZIP_NAME}")


if __name__ == "__main__":
    main()



