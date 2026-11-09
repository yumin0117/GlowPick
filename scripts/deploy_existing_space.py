"""Update only the existing approved Space. Never creates a Space or stores tokens."""
import argparse
import getpass
import hashlib
import json
import re
import sys
import time
import urllib.request
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

from huggingface_hub import CommitOperationAdd, HfApi, get_token, hf_hub_download
from huggingface_hub.errors import HfHubHTTPError

SPACE = "yumin0601/GlowPick"
PREVIOUS = "fc90bf5cebc7fd0f44bdcc83910e9f9fe4625a28"
HOST = "https://yumin0601-glowpick.static.hf.space"
FILES = {"README.md", "index.html", "style.css", "script.js", "api-client.js",
         "gemini-client.js", "ai-core.js", "ai-assets.js", "report-model.js"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--check", action="store_true", help="Read-only inspection; never commits")
    parser.add_argument("--prompt-token", action="store_true", help="Hidden HF token entry; never saved")
    args = parser.parse_args()
    with ZipFile(args.archive) as archive:
        if set(archive.namelist()) != FILES or len(archive.namelist()) != 9:
            raise ValueError("Archive must contain exactly the nine approved root files")
        payload = {name: archive.read(name) for name in FILES}
    metadata = payload["README.md"].decode("utf-8").split("---")[1]
    for line in ("title: GlowPick", "emoji: 🧴", "colorFrom: pink", "colorTo: gray",
                 "sdk: static", "app_file: index.html"):
        if line not in metadata.splitlines():
            raise ValueError("Incorrect Static README metadata")
    for raw in payload.values():
        if re.search(rb"AIza[\w-]{20,}|AQ\.[\w.-]{20,}|hf_[A-Za-z0-9]{20,}", raw):
            raise ValueError("Archive credential scan failed")
    token = get_token()
    if args.prompt_token and not args.check:
        token = getpass.getpass("HF write token (hidden; never saved): ").strip()
    api = HfApi(token=token or False)
    info = api.space_info(SPACE, revision="main")
    if info.id != SPACE or info.sdk != "static":
        raise ValueError("Existing Space identity/SDK does not match")
    remote = {item.rfilename for item in info.siblings}
    unexpected = remote - FILES - {".gitattributes"}
    if unexpected:
        raise ValueError("Unexpected remote files; review references before deployment")
    print(f"Target: {SPACE}; current commit: {info.sha}; upload: 9 files")
    if args.check:
        print("Read-only check passed. No remote changes made.")
        return
    if not token:
        print("HF authentication missing. Rerun with --prompt-token; do not send tokens in chat.")
        sys.exit(2)
    api.auth_check(repo_id=SPACE, repo_type="space", write=True)
    if info.sha != PREVIOUS:
        raise ValueError("Space changed since integration review; inspect new commit before retrying")
    folder = args.archive.resolve().parent
    backup = folder / "GlowPick_HF_Before_Update.zip"
    with ZipFile(backup, "w", ZIP_DEFLATED) as archive:
        for name in sorted(remote):
            path = hf_hub_download(SPACE, name, repo_type="space", revision=info.sha, token=token)
            archive.writestr(name, Path(path).read_bytes())
    record = {"space": SPACE, "previousCommit": info.sha, "backup": backup.name,
              "archiveSha256": hashlib.sha256(args.archive.read_bytes()).hexdigest(),
              "deploymentCommit": None, "publicAssetVerification": False,
              "liveGeminiTest": "not_run"}
    result_path = folder / "GlowPick_HF_Deployment_Result.json"
    result_path.write_text(json.dumps(record, indent=2), encoding="utf-8")
    result = api.create_commit(repo_id=SPACE, repo_type="space", revision="main",
        parent_commit=info.sha, commit_message="Deploy GlowPick final integrated Static assets",
        operations=[CommitOperationAdd(path_in_repo=name, path_or_fileobj=raw)
                    for name, raw in sorted(payload.items())])
    record["deploymentCommit"] = result.oid
    result_path.write_text(json.dumps(record, indent=2), encoding="utf-8")
    for attempt in range(12):
        try:
            matches = []
            for name, raw in payload.items():
                if name == "README.md":
                    continue
                request = urllib.request.Request(f"{HOST}/{name}?revision={result.oid}",
                    headers={"Cache-Control": "no-cache"})
                with urllib.request.urlopen(request, timeout=15) as response:
                    matches.append(response.read() == raw)
            if all(matches):
                record["publicAssetVerification"] = True
                break
        except OSError:
            pass
        if attempt < 11:
            time.sleep(3)
    result_path.write_text(json.dumps(record, indent=2), encoding="utf-8")
    print(f"Deployment commit: {result.oid}")
    print(f"Public assets match: {record['publicAssetVerification']}")
    print("Live Gemini test still required in the app with the user's free-project key.")


if __name__ == "__main__":
    try:
        main()
    except HfHubHTTPError as error:
        print(f"Hugging Face request failed (HTTP {error.response.status_code}); no credential details logged.")
        sys.exit(1)
    except Exception as error:
        # Do not serialize network exceptions, headers, or credential values.
        print(f"Deployment stopped ({type(error).__name__}). Check target, archive, permissions, and previous commit.")
        sys.exit(1)
