#!/usr/bin/env python3
"""Bundle src/ into one self-contained index.html.

Order: src/css/*.css, then src/kernel/*.js, then src/apps/*.js, then src/start.js.
The build fails on: a missing source folder, a syntax error (node --check),
a duplicate app id, an app file that is not wrapped in an IIFE, or a
top-level declaration that shadows a browser global.
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BUILD = ROOT / "build"
GLOBALS = {"top", "name", "status", "length", "screen", "parent", "self", "history",
           "location", "frames", "origin", "closed", "event", "external", "open", "close"}


def fail(msg):
    print(f"BUILD FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="index.html", help="output HTML, relative to the repo root")
    ap.add_argument("--apps", default="", help="comma-separated app file names to include (default: all)")
    a = ap.parse_args()
    shell = (SRC / "shell.html").read_text()
    css_files = sorted((SRC / "css").glob("*.css"))
    kernel_files = sorted((SRC / "kernel").glob("*.js"))
    app_files = sorted((SRC / "apps").glob("*.js"))
    if a.apps:
        wanted = {n.strip() for n in a.apps.split(",") if n.strip()}
        missing = wanted - {f.name for f in app_files}
        if missing:
            fail(f"no such app file(s): {', '.join(sorted(missing))}")
        app_files = [f for f in app_files if f.name in wanted]
    if not css_files or not kernel_files:
        fail("src/css or src/kernel is empty")

    ids = {}
    for f in app_files:
        text = f.read_text()
        head = text.lstrip()
        while head.startswith("//"):
            head = head.split("\n", 1)[1].lstrip() if "\n" in head else ""
        if not (head.startswith("(() =>") or head.startswith("(function") or head.startswith(";(() =>")):
            fail(f"{f.relative_to(ROOT)} is not wrapped in an IIFE")
        for m in re.finditer(r"registerApp\(\{\s*id:\s*['\"]([\w-]+)['\"]", text):
            if m.group(1) in ids:
                fail(f"app id '{m.group(1)}' is registered in {ids[m.group(1)]} and {f.name}")
            ids[m.group(1)] = f.name

    for f in kernel_files + [SRC / "start.js"]:
        for m in re.finditer(r"^(?:let|const|var|function)\s+([A-Za-z_$][\w$]*)", f.read_text(), re.M):
            if m.group(1) in GLOBALS:
                fail(f"{f.relative_to(ROOT)} declares top-level '{m.group(1)}', which shadows a browser global")

    css = "\n".join(f"/* {f.name} */\n" + f.read_text() for f in css_files)
    js_parts = [f"// ---- {f.relative_to(SRC)}\n" + f.read_text() for f in kernel_files + app_files]
    js_parts.append("// ---- start.js\n" + (SRC / "start.js").read_text())
    js = "\n;\n".join(js_parts)
    if "</script" in js.lower():
        fail("a source file contains '</script', which would end the inline script early")

    BUILD.mkdir(exist_ok=True)
    out = ROOT / a.out
    bundle = BUILD / ("bundle-" + out.stem + ".js")
    bundle.write_text(js)
    check = subprocess.run(["node", "--check", str(bundle)], capture_output=True, text=True)
    if check.returncode != 0:
        fail("syntax error\n" + check.stderr)

    html = shell.replace("/*@CSS@*/", css).replace("/*@JS@*/", js)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)
    size = out.stat().st_size
    print(f"{out.relative_to(ROOT)}: {size:,} bytes · {len(css_files)} css · {len(kernel_files)} kernel · "
          f"{len(app_files)} app files · {len(ids)} apps: {', '.join(sorted(ids))}")


if __name__ == "__main__":
    main()
