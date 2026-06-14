import urllib.request
import urllib.parse
import json
import os
import sys

TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
if not TOKEN:
    token_file = os.path.join(os.path.dirname(__file__), "github_token.txt")
    if os.path.exists(token_file):
        with open(token_file, "r") as tf:
            TOKEN = tf.read().strip()

if not TOKEN:
    print("Error: GITHUB_TOKEN/GH_TOKEN env variable not set and github_token.txt not found.", file=sys.stderr)
    sys.exit(1)

REPO = "bitraneerajbabu/UltronPC"
TAG = "v1.0.3"
FILE_PATH = "backend/ultron_backend/dist/UltrON.exe"

def make_request(url, method="GET", headers=None, data=None):
    if headers is None:
        headers = {}
    headers.update({
        "Authorization": f"Bearer {TOKEN}",
        "User-Agent": "ReleasePublisher/1.0",
        "Accept": "application/vnd.github.v3+json"
    })
    req = urllib.request.Request(url, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.reason}", file=sys.stderr)
        print(e.read().decode("utf-8"), file=sys.stderr)
        raise e

def main():
    if not os.path.exists(FILE_PATH):
        print(f"Error: {FILE_PATH} not found. Run build_exe.bat first.", file=sys.stderr)
        sys.exit(1)

    print(f"Fetching release {TAG}...")
    try:
        release = make_request(f"https://api.github.com/repos/{REPO}/releases/tags/{TAG}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"Release {TAG} not found. Creating it...")
            create_data = json.dumps({
                "tag_name": TAG,
                "name": f"UltrON {TAG}",
                "draft": False,
                "prerelease": False
            }).encode('utf-8')
            release = make_request(f"https://api.github.com/repos/{REPO}/releases", method="POST", data=create_data)
        else:
            sys.exit(1)

    release_id = release["id"]
    
    # Check if UltrON.exe asset already exists
    for asset in release.get("assets", []):
        if asset["name"] == "UltrON.exe":
            asset_id = asset["id"]
            print(f"Deleting old UltrON.exe asset (ID: {asset_id})...")
            req = urllib.request.Request(
                f"https://api.github.com/repos/{REPO}/releases/assets/{asset_id}",
                method="DELETE",
                headers={
                    "Authorization": f"Bearer {TOKEN}",
                    "User-Agent": "ReleasePublisher/1.0"
                }
            )
            try:
                with urllib.request.urlopen(req) as resp:
                    print("Old asset deleted successfully.")
            except Exception as e:
                print(f"Failed to delete old asset: {e}", file=sys.stderr)
                sys.exit(1)
            break
            
    print(f"Uploading new asset {FILE_PATH}...")
    file_size = os.path.getsize(FILE_PATH)
    headers = {
        "Content-Type": "application/octet-stream",
        "Content-Length": str(file_size)
    }
    
    upload_url = f"https://uploads.github.com/repos/{REPO}/releases/{release_id}/assets?name=UltrON.exe"
    
    with open(FILE_PATH, "rb") as f:
        data = f.read()
        
    try:
        result = make_request(upload_url, method="POST", headers=headers, data=data)
        print("Upload completed successfully!")
        print(f"New asset download URL: {result['browser_download_url']}")
    except Exception as e:
        print(f"Upload failed: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
