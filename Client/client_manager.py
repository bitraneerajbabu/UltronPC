"""
UltrON Client Manager
======================
One GUI to register new clients on RajAPI and build their installer exe.

Just run:  python client_manager.py
"""

import os
import re
import sys
import json
import shutil
import threading
import subprocess
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
from pathlib import Path
import urllib.request
import urllib.error

# ── Config ───────────────────────────────────────────────────────────────────
RAJAPI_BASE        = "https://rajapi.com/api/v1"
ADMIN_KEY          = "UltrON@RajAPI_Admin_2026!"   # Must match ADMIN_KEY on the Pi server
GITHUB_REPO        = "bitraneerajbabu/UltronPC"
GITHUB_API_LATEST  = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"

SCRIPT_DIR         = Path(__file__).parent.resolve()
BACKEND_DIR        = SCRIPT_DIR / "backend" / "ultron_backend"
PUBLISH_SCRIPT     = SCRIPT_DIR / "publish_release.py"
ENV_BAK            = BACKEND_DIR / ".env.bak"
ENV_FILE           = BACKEND_DIR / ".env"
ENV_ENC_FILE       = BACKEND_DIR / ".env.enc"
DIST_DIR           = BACKEND_DIR / "dist"
OUTPUT_DIR         = DIST_DIR / "clients"
PYTHON             = BACKEND_DIR / "venv" / "Scripts" / "python.exe"
BUILD_BAT          = SCRIPT_DIR / "build_exe.bat"
CLIENTS_FILE       = SCRIPT_DIR / "clients.json"     # Persistent list of all clients

# ── Helpers ───────────────────────────────────────────────────────────────────

def _version_tuple(v: str):
    """Convert 'v1.2.3' or '1.2.3' to (1, 2, 3) for comparison."""
    v = v.lstrip("v").strip()
    try:
        return tuple(int(x) for x in v.split("."))
    except Exception:
        return (0,)


def _get_current_version() -> str:
    """Read the TAG constant from publish_release.py."""
    try:
        text = PUBLISH_SCRIPT.read_text(encoding="utf-8")
        m = re.search(r'^TAG\s*=\s*["\']([^"\']+)["\']', text, re.MULTILINE)
        return m.group(1) if m else "unknown"
    except Exception:
        return "unknown"


def _get_latest_github_version() -> str:
    """Fetch the latest release tag from GitHub (returns tag string or raises)."""
    req = urllib.request.Request(
        GITHUB_API_LATEST,
        headers={"User-Agent": "UltrON-Manager/1.0",
                 "Accept": "application/vnd.github.v3+json"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data.get("tag_name", "unknown")


def _bump_patch(tag: str) -> str:
    """Increment the patch segment: 'v1.0.3' → 'v1.0.4'."""
    m = re.match(r'^(v?)(\d+)\.(\d+)\.(\d+)$', tag.strip())
    if not m:
        return tag  # unrecognised format — leave unchanged
    prefix, major, minor, patch = m.group(1), m.group(2), m.group(3), m.group(4)
    return f"{prefix}{major}.{minor}.{int(patch)+1}"


def _set_publish_tag(new_tag: str):
    """Rewrite the TAG line in publish_release.py."""
    text = PUBLISH_SCRIPT.read_text(encoding="utf-8")
    updated = re.sub(
        r'^(TAG\s*=\s*)["\']([^"\']+)["\']',
        lambda m2: f'{m2.group(1)}"{new_tag}"',
        text,
        flags=re.MULTILINE,
    )
    PUBLISH_SCRIPT.write_text(updated, encoding="utf-8")


# ── Update Dialog ─────────────────────────────────────────────────────────────

class UpdateDialog(tk.Toplevel):
    """Version-check + publish dialog shown when the admin clicks 'Update'."""

    def __init__(self, parent):
        super().__init__(parent)
        self.title("UltrON — Check for Updates")
        self.configure(bg="#0f172a")
        self.resizable(False, False)
        self.grab_set()  # modal
        self._build_ui()
        self.after(100, self._fetch_versions)  # fetch asynchronously after draw

    def _build_ui(self):
        hdr = tk.Frame(self, bg="#0f3460", pady=12)
        hdr.pack(fill="x")
        tk.Label(hdr, text="⬆  UltrON Update Manager",
                 font=("Segoe UI", 14, "bold"), fg="#2dd4bf", bg="#0f3460").pack(padx=20)

        info = tk.Frame(self, bg="#0f172a", pady=14, padx=24)
        info.pack(fill="x")

        def row(label, col=0):
            tk.Label(info, text=label, fg="#94a3b8", bg="#0f172a",
                     font=("Segoe UI", 9)).grid(row=col, column=0, sticky="w", pady=3)

        row("Current version (publish_release.py TAG):", 0)
        row("Latest release on GitHub:", 1)

        self._lbl_current = tk.Label(info, text="…", fg="#e2e8f0", bg="#0f172a",
                                      font=("Segoe UI", 9, "bold"))
        self._lbl_current.grid(row=0, column=1, sticky="w", padx=12)

        self._lbl_latest = tk.Label(info, text="checking…", fg="#e2e8f0", bg="#0f172a",
                                     font=("Segoe UI", 9, "bold"))
        self._lbl_latest.grid(row=1, column=1, sticky="w", padx=12)

        self._lbl_status = tk.Label(self, text="", fg="#fbbf24", bg="#0f172a",
                                     font=("Segoe UI", 9), pady=4)
        self._lbl_status.pack()

        # Log output
        log_frm = tk.Frame(self, bg="#0f172a", padx=16, pady=0)
        log_frm.pack(fill="both", expand=True, pady=(0, 8))
        self._log = scrolledtext.ScrolledText(
            log_frm, width=72, height=10,
            bg="#020617", fg="#86efac",
            font=("Consolas", 8), relief="flat", state="disabled")
        self._log.pack(fill="both", expand=True)

        # Buttons
        btn_frm = tk.Frame(self, bg="#0f172a", pady=10)
        btn_frm.pack()
        self._btn_publish = tk.Button(
            btn_frm, text="🚀  Publish New Release",
            command=self._on_publish,
            bg="#065f46", fg="white", font=("Segoe UI", 9, "bold"),
            relief="flat", activebackground="#047857", padx=14, pady=6,
            cursor="hand2", state="disabled")
        self._btn_publish.pack(side="left", padx=8)
        tk.Button(btn_frm, text="Close",
                  command=self.destroy,
                  bg="#1e293b", fg="#94a3b8", font=("Segoe UI", 9),
                  relief="flat", padx=14, pady=6, cursor="hand2").pack(side="left", padx=8)

        # geometry after widget creation
        self.update_idletasks()
        w, h = 620, 440
        sw = self.winfo_screenwidth()
        sh = self.winfo_screenheight()
        self.geometry(f"{w}x{h}+{(sw-w)//2}+{(sh-h)//2}")

    def _log_write(self, msg: str):
        self._log.configure(state="normal")
        self._log.insert("end", msg + "\n")
        self._log.see("end")
        self._log.configure(state="disabled")

    def _fetch_versions(self):
        """Fetch current + latest version in a thread and update labels."""
        current = _get_current_version()
        self._lbl_current.configure(text=current)

        def _fetch():
            try:
                latest = _get_latest_github_version()
                self.after(0, lambda: self._on_versions_fetched(current, latest))
            except Exception as e:
                self.after(0, lambda: self._on_fetch_error(str(e)))

        threading.Thread(target=_fetch, daemon=True).start()

    def _on_versions_fetched(self, current: str, latest: str):
        self._lbl_latest.configure(text=latest)
        if _version_tuple(latest) > _version_tuple(current):
            self._lbl_status.configure(
                text=f"⚠  A newer release ({latest}) exists on GitHub. "
                     f"Current publish tag is {current}.",
                fg="#fbbf24")
            self._btn_publish.configure(state="normal")
        elif _version_tuple(current) > _version_tuple(latest):
            new_tag = current
            self._lbl_status.configure(
                text=f"Current tag ({current}) is newer than GitHub. "
                     f"Ready to publish.",
                fg="#86efac")
            self._btn_publish.configure(state="normal")
        else:
            self._lbl_status.configure(
                text="✓  Already up-to-date. Bump the version and publish to release a new build.",
                fg="#86efac")
            self._btn_publish.configure(state="normal")  # allow force-publish

    def _on_fetch_error(self, err: str):
        self._lbl_latest.configure(text="Error", fg="#f87171")
        self._lbl_status.configure(text=f"✗ Could not reach GitHub: {err}", fg="#f87171")

    def _on_publish(self):
        """Bump patch version, update TAG in publish_release.py, run publish."""
        current = _get_current_version()
        new_tag = _bump_patch(current)
        if not messagebox.askyesno(
            "Confirm Publish",
            f"This will:\n"
            f"  1. Update TAG in publish_release.py: {current} → {new_tag}\n"
            f"  2. Run publish_release.py to upload dist/UltrON.exe to GitHub\n\n"
            f"Make sure you have built the EXE first!\n\nProceed?",
            parent=self
        ):
            return
        self._btn_publish.configure(state="disabled", text="Publishing…")
        try:
            _set_publish_tag(new_tag)
            self._lbl_current.configure(text=new_tag)
            self._log_write(f"[Publish] TAG updated to {new_tag}")
        except Exception as e:
            messagebox.showerror("Error", f"Could not update TAG: {e}", parent=self)
            self._btn_publish.configure(state="normal", text="🚀  Publish New Release")
            return

        threading.Thread(target=self._run_publish, daemon=True).start()

    def _run_publish(self):
        """Run publish_release.py and stream output to the log widget."""
        py = str(PYTHON) if PYTHON.exists() else sys.executable
        self._log_write(f"[Publish] Running: {py} {PUBLISH_SCRIPT.name}\n")
        try:
            proc = subprocess.Popen(
                [py, str(PUBLISH_SCRIPT)],
                cwd=str(SCRIPT_DIR),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            for line in proc.stdout:
                stripped = line.rstrip()
                if stripped:
                    self.after(0, lambda l=stripped: self._log_write(l))
            proc.wait()
            if proc.returncode == 0:
                self.after(0, lambda: self._log_write("\n✓ Publish complete!"))
                self.after(0, lambda: self._lbl_status.configure(
                    text="✓ Published successfully!", fg="#86efac"))
            else:
                self.after(0, lambda: self._log_write(f"\n✗ Publish failed (exit {proc.returncode})"))
                self.after(0, lambda: self._lbl_status.configure(
                    text="✗ Publish failed — see log above.", fg="#f87171"))
        except Exception as e:
            self.after(0, lambda: self._log_write(f"\n✗ Error: {e}"))
        finally:
            self.after(0, lambda: self._btn_publish.configure(
                state="normal", text="🚀  Publish New Release"))


def _api(method: str, path: str, body: dict = None) -> dict:
    """Simple HTTP call to rajapi.com with admin key."""
    url  = f"{RAJAPI_BASE}{path}"
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("X-Admin-Key", ADMIN_KEY)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode()}")


def load_clients() -> list:
    if CLIENTS_FILE.exists():
        return json.loads(CLIENTS_FILE.read_text())
    return []


def save_clients(clients: list):
    CLIENTS_FILE.write_text(json.dumps(clients, indent=2))


def register_site(name: str, location: str, amc_expiry: str) -> dict:
    """Create a new site on rajapi.com and return the site dict with api_key."""
    body = {"name": name, "location": location}
    if amc_expiry:
        body["amc_expiry"] = amc_expiry + "T00:00:00"
    return _api("POST", "/sites/", body)


def delete_site_api(site_id: int):
    """Delete a site from rajapi.com."""
    return _api("DELETE", f"/sites/{site_id}")


def fetch_sites() -> list:
    return _api("GET", "/sites/")



def build_client(client: dict, log_fn):
    """Build the installer exe for a single client."""
    name       = client["name"]
    api_key    = client["api_key"]
    station_id = client.get("station_id", name.lower().replace(" ", "_"))

    log_fn(f"\n▶ Building: {name}")

    # Write .env
    template = ENV_BAK.read_text(encoding="utf-8") if ENV_BAK.exists() else ""
    lines = []
    api_set = station_set = False
    for line in template.splitlines():
        if line.startswith("RAJAPI_API_KEY="):
            lines.append(f"RAJAPI_API_KEY={api_key}"); api_set = True
        elif line.startswith("RAJAPI_STATION_ID="):
            lines.append(f"RAJAPI_STATION_ID={station_id}"); station_set = True
        else:
            lines.append(line)
    if not api_set:   lines.append(f"RAJAPI_API_KEY={api_key}")
    if not station_set: lines.append(f"RAJAPI_STATION_ID={station_id}")
    ENV_FILE.write_text("\n".join(lines), encoding="utf-8")

    # Remove old .env.enc so it re-encrypts
    if ENV_ENC_FILE.exists():
        ENV_ENC_FILE.unlink()

    # Run build
    log_fn(f"  Running build_exe.bat (this takes ~2 minutes)...")
    proc = subprocess.Popen(
        ["cmd", "/c", str(BUILD_BAT)],
        cwd=str(SCRIPT_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )
    for line in proc.stdout:
        stripped = line.strip()
        if stripped:
            log_fn(f"  {stripped}")
    proc.wait()

    # Clean .env
    if ENV_FILE.exists():
        ENV_FILE.unlink()

    if proc.returncode != 0:
        log_fn(f"  ✗ Build FAILED for {name}")
        return False

    # Copy output
    src = DIST_DIR / "UltrON_Installer.exe"
    if not src.exists():
        log_fn(f"  ✗ UltrON_Installer.exe not found")
        return False

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
    dst = OUTPUT_DIR / f"UltrON_Installer_{safe_name}.exe"
    shutil.copy2(src, dst)
    log_fn(f"  ✓ Saved: {dst.name}  ({dst.stat().st_size // 1024} KB)")
    return True


# ── GUI ───────────────────────────────────────────────────────────────────────

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("UltrON Client Manager")
        self.geometry("900x640")
        self.configure(bg="#0f172a")
        self.resizable(True, True)
        self._build_ui()
        self._refresh_table()

    def _build_ui(self):
        # ── Header ─────────────────────────────────────────────────────
        hdr = tk.Frame(self, bg="#0f3460", pady=10)
        hdr.pack(fill="x")
        tk.Label(hdr, text="⚡ UltrON Client Manager",
                 font=("Segoe UI", 18, "bold"), fg="#2dd4bf", bg="#0f3460").pack(side="left", padx=20)
        tk.Label(hdr, text="Register clients & build installers",
                 font=("Segoe UI", 10), fg="#94a3b8", bg="#0f3460").pack(side="left")
        # Update button — right-aligned in the header
        tk.Button(hdr, text="⬆  Update",
                  command=self._open_update_dialog,
                  bg="#1d4ed8", fg="white", font=("Segoe UI", 9, "bold"),
                  relief="flat", activebackground="#2563eb",
                  padx=12, pady=5, cursor="hand2").pack(side="right", padx=20)

        # ── Sync from rajapi ────────────────────────────────────────────
        top = tk.Frame(self, bg="#0f172a", pady=8, padx=16)
        top.pack(fill="x")
        tk.Button(top, text="⟳  Sync from rajapi.com", command=self._sync_from_server,
                  bg="#1e293b", fg="#2dd4bf", font=("Segoe UI", 9), relief="flat",
                  activebackground="#334155", activeforeground="white", padx=12, pady=5,
                  cursor="hand2").pack(side="left", padx=4)
        tk.Button(top, text="🔨  Build ALL clients", command=self._build_all,
                  bg="#065f46", fg="white", font=("Segoe UI", 9, "bold"), relief="flat",
                  activebackground="#047857", padx=12, pady=5, cursor="hand2").pack(side="left", padx=4)
        self._status_lbl = tk.Label(top, text="", fg="#94a3b8", bg="#0f172a", font=("Segoe UI", 9))
        self._status_lbl.pack(side="left", padx=12)

        # ── Client table ────────────────────────────────────────────────
        tbl_frame = tk.Frame(self, bg="#1e293b", padx=2, pady=2)
        tbl_frame.pack(fill="both", expand=True, padx=16, pady=(0,8))

        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("Treeview",
                        background="#1e293b", foreground="#e2e8f0",
                        fieldbackground="#1e293b", rowheight=28,
                        font=("Segoe UI", 9))
        style.configure("Treeview.Heading",
                        background="#0f3460", foreground="#2dd4bf",
                        font=("Segoe UI", 9, "bold"), relief="flat")
        style.map("Treeview", background=[("selected", "#0f3460")])

        cols = ("name", "location", "api_key", "amc", "last_sync", "action")
        self._tree = ttk.Treeview(tbl_frame, columns=cols, show="headings", selectmode="browse")
        self._tree.heading("name",      text="Site Name")
        self._tree.heading("location",  text="Location")
        self._tree.heading("api_key",   text="API Key")
        self._tree.heading("amc",       text="AMC Expiry")
        self._tree.heading("last_sync", text="Last Sync")
        self._tree.heading("action",    text="")
        self._tree.column("name",      width=180, anchor="w")
        self._tree.column("location",  width=130, anchor="w")
        self._tree.column("api_key",   width=220, anchor="w")
        self._tree.column("amc",       width=100, anchor="center")
        self._tree.column("last_sync", width=140, anchor="center")
        self._tree.column("action",    width=90,  anchor="center")
        self._tree.pack(fill="both", expand=True)
        self._tree.bind("<Double-1>", self._on_double_click)
        self._tree.bind("<Delete>",   self._on_delete_key)

        # Right-click context menu
        self._ctx = tk.Menu(self, tearoff=0, bg="#1e293b", fg="white",
                            activebackground="#0f3460", font=("Segoe UI", 9))
        self._ctx.add_command(label="🔨  Build Installer", command=self._ctx_build)
        self._ctx.add_separator()
        self._ctx.add_command(label="🗑  Delete Site", command=self._ctx_delete)
        self._tree.bind("<Button-3>", self._show_ctx)

        sb = ttk.Scrollbar(tbl_frame, orient="vertical", command=self._tree.yview)
        self._tree.configure(yscroll=sb.set)
        sb.pack(side="right", fill="y")

        # ── Register new client ─────────────────────────────────────────
        form = tk.LabelFrame(self, text="  + Register New Client  ", bg="#0f172a",
                             fg="#2dd4bf", font=("Segoe UI", 9, "bold"), padx=12, pady=10)
        form.pack(fill="x", padx=16, pady=(0,6))

        fields = tk.Frame(form, bg="#0f172a")
        fields.pack(fill="x")

        def lbl(text, col):
            tk.Label(fields, text=text, fg="#94a3b8", bg="#0f172a",
                     font=("Segoe UI", 8)).grid(row=0, column=col, sticky="w", padx=(0,2))

        def entry(col, width=22):
            e = tk.Entry(fields, width=width, bg="#1e293b", fg="white",
                         insertbackground="white", relief="flat",
                         font=("Segoe UI", 10), bd=5)
            e.grid(row=1, column=col, padx=(0,10), sticky="w")
            return e

        lbl("Industry / Site Name *", 0)
        lbl("Location *", 1)
        lbl("AMC Expiry (YYYY-MM-DD)", 2)
        lbl("Station ID (optional)", 3)
        self._e_name     = entry(0, 28)
        self._e_location = entry(1, 22)
        self._e_amc      = entry(2, 16)
        self._e_station  = entry(3, 16)

        btn_frame = tk.Frame(form, bg="#0f172a")
        btn_frame.pack(fill="x", pady=(8,0))
        tk.Button(btn_frame, text="📋  Register on RajAPI",
                  command=self._register_only,
                  bg="#1d4ed8", fg="white", font=("Segoe UI", 9), relief="flat",
                  activebackground="#2563eb", padx=12, pady=5, cursor="hand2").pack(side="left", padx=4)
        tk.Button(btn_frame, text="🚀  Register + Build Installer",
                  command=self._register_and_build,
                  bg="#047857", fg="white", font=("Segoe UI", 9, "bold"), relief="flat",
                  activebackground="#059669", padx=12, pady=5, cursor="hand2").pack(side="left", padx=4)

        # ── Log ─────────────────────────────────────────────────────────
        log_frame = tk.Frame(self, bg="#0f172a")
        log_frame.pack(fill="x", padx=16, pady=(0,10))
        self._log = scrolledtext.ScrolledText(
            log_frame, height=6, bg="#020617", fg="#86efac",
            font=("Consolas", 8), relief="flat", state="disabled")
        self._log.pack(fill="x")

    def _log_write(self, msg: str):
        self._log.configure(state="normal")
        self._log.insert("end", msg + "\n")
        self._log.see("end")
        self._log.configure(state="disabled")
        self.update_idletasks()

    def _set_status(self, msg: str):
        self._status_lbl.configure(text=msg)

    def _refresh_table(self):
        for row in self._tree.get_children():
            self._tree.delete(row)
        clients = load_clients()
        for c in clients:
            amc   = (c.get("amc_expiry") or "-")[:10]
            sync  = (c.get("last_sync")  or "Never")[:16].replace("T", " ")
            key   = c.get("api_key", "")
            short = key[:28] + "..." if len(key) > 28 else key
            self._tree.insert("", "end", iid=str(c["id"]), values=(
                c["name"], c.get("location",""), short, amc, sync, "▶ Build"
            ))

    def _sync_from_server(self):
        self._set_status("Syncing from rajapi.com...")
        try:
            sites = fetch_sites()
            save_clients(sites)
            self._refresh_table()
            self._set_status(f"✓ Synced {len(sites)} sites from rajapi.com")
            self._log_write(f"[Sync] Loaded {len(sites)} sites from rajapi.com")
        except Exception as e:
            self._set_status(f"✗ Sync failed: {e}")
            messagebox.showerror("Sync Failed", str(e))

    def _show_ctx(self, event):
        """Right-click → show context menu."""
        row = self._tree.identify_row(event.y)
        if row:
            self._tree.selection_set(row)
            self._ctx.post(event.x_root, event.y_root)

    def _ctx_build(self):
        item = self._tree.selection()
        if not item:
            return
        site_id = int(item[0])
        client  = next((c for c in load_clients() if c["id"] == site_id), None)
        if client:
            self._run_in_thread(lambda: self._do_build([client]))

    def _ctx_delete(self):
        item = self._tree.selection()
        if not item:
            return
        site_id = int(item[0])
        client  = next((c for c in load_clients() if c["id"] == site_id), None)
        if client and messagebox.askyesno(
            "Delete Site",
            f"Permanently delete '{client['name']}' from RajAPI?\n\nThis cannot be undone!",
            icon="warning"
        ):
            self._run_in_thread(lambda: self._do_delete(site_id, client["name"]))

    def _on_delete_key(self, event):
        """Delete keyboard key → delete selected site."""
        self._ctx_delete()

    def _do_delete(self, site_id: int, name: str):
        self._log_write(f"[Delete] Removing '{name}' from rajapi.com...")
        try:
            delete_site_api(site_id)
            clients = [c for c in load_clients() if c["id"] != site_id]
            save_clients(clients)
            self.after(0, self._refresh_table)
            self._log_write(f"  ✓ Deleted: {name}")
            self.after(0, lambda: self._set_status(f"Deleted: {name}"))
        except Exception as e:
            self._log_write(f"  ✗ Delete failed: {e}")
            self.after(0, lambda: messagebox.showerror("Delete Failed", str(e)))

    def _on_double_click(self, event):
        """Double-click a row → build just that client."""
        item = self._tree.selection()
        if not item:
            return
        site_id = int(item[0])
        clients = load_clients()
        client  = next((c for c in clients if c["id"] == site_id), None)
        if client:
            if messagebox.askyesno("Build", f"Build installer for:\n\n{client['name']}?"):
                self._run_in_thread(lambda: self._do_build([client]))

    def _build_all(self):
        clients = load_clients()
        if not clients:
            messagebox.showinfo("No clients", "First sync from rajapi.com to load clients.")
            return
        if messagebox.askyesno("Build All", f"Build installers for ALL {len(clients)} clients?\nThis may take ~{len(clients)*2} minutes."):
            self._run_in_thread(lambda: self._do_build(clients))

    def _register_only(self):
        name, location, amc, station = self._get_form()
        if not name or not location:
            messagebox.showwarning("Missing fields", "Name and Location are required.")
            return
        self._run_in_thread(lambda: self._do_register(name, location, amc, station, build=False))

    def _register_and_build(self):
        name, location, amc, station = self._get_form()
        if not name or not location:
            messagebox.showwarning("Missing fields", "Name and Location are required.")
            return
        self._run_in_thread(lambda: self._do_register(name, location, amc, station, build=True))

    def _get_form(self):
        return (
            self._e_name.get().strip(),
            self._e_location.get().strip(),
            self._e_amc.get().strip(),
            self._e_station.get().strip(),
        )

    def _do_register(self, name, location, amc, station, build):
        self._log_write(f"\n[Register] Creating '{name}' on rajapi.com...")
        try:
            site = register_site(name, location, amc)
            self._log_write(f"  ✓ Registered! API Key: {site['api_key']}")
            # Save locally
            clients = load_clients()
            clients.append(site)
            save_clients(clients)
            self.after(0, self._refresh_table)
            # Optionally build
            if build:
                if station:
                    site["station_id"] = station
                self._do_build([site])
            else:
                self._set_status(f"✓ Registered: {name}")
        except Exception as e:
            self._log_write(f"  ✗ Registration failed: {e}")
            self.after(0, lambda: messagebox.showerror("Registration Failed", str(e)))

    def _do_build(self, clients):
        self._set_status(f"Building {len(clients)} installer(s)...")
        results = []
        for client in clients:
            ok = build_client(client, self._log_write)
            results.append((client["name"], ok))
        # Summary
        ok_count  = sum(1 for _, ok in results if ok)
        self._log_write(f"\n── Build Complete: {ok_count}/{len(results)} succeeded ──")
        self._log_write(f"   Output folder: {OUTPUT_DIR}")
        self.after(0, lambda: self._set_status(f"✓ Built {ok_count}/{len(results)} installers → dist/clients/"))

    def _run_in_thread(self, fn):
        threading.Thread(target=fn, daemon=True).start()

    def _open_update_dialog(self):
        UpdateDialog(self)


if __name__ == "__main__":
    app = App()
    app.mainloop()
