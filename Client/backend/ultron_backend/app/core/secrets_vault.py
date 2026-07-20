"""
UltrON — Enterprise Secrets Vault

Centralized secrets management with:
  - Multi-source loading (encrypted config → .env → env vars → defaults)
  - In-memory caching with access audit
  - Rotation support (hot-reload per key)
  - Startup validation (fail-fast on missing required secrets)
  - Never logs or exposes secret values
  - Masked debug output
"""

import os
import sys
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Any
from functools import lru_cache

from app.config import APP_DIR
from app.core.logger import get_logger

log = get_logger("ultron.secrets_vault")

SECRET_ACCESS_LOG = []  # bounded audit trail: [(key, caller, timestamp)]


class SecretsVault:
    """Singleton vault for all application secrets."""

    _instance: Optional["SecretsVault"] = None
    _secrets: dict[str, str] = {}
    _metadata: dict[str, dict] = {}  # key -> {source, loaded_at, rotated_at}

    REQUIRED_SECRETS = {
        "ADMIN_PASSWORD": "Admin login password",
        "SECRET_KEY": "JWT signing key",
        "GATEWAY_ID": "RajAPI gateway identifier",
        "DEVICE_SECRET": "RajAPI device authentication",
    }

    OPTIONAL_SECRETS = {
        "RAJAPI_API_KEY": "Legacy RajAPI API key",
        "LED_AUTH_TOKEN": "LED board static auth token",
        "SMTP_USER": "SMTP username",
        "SMTP_PASSWORD": "SMTP password",
        "ALERT_RECIPIENTS": "Alert email recipients",
        "DB_PASSWORD": "Database password",
    }

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._secrets = {}
        self._metadata = {}
        self._load_all()

    # ─── Loading ────────────────────────────────────────────────────────────────

    def _load_all(self):
        """Load from all sources in priority order."""
        self._load_from_env_file()
        self._load_from_env_enc()
        self._load_from_os_environ()
        self._load_from_settings_fallback()

    def _load_from_env_file(self):
        env_file = APP_DIR / ".env"
        if env_file.is_file():
            try:
                import dotenv
                config = dotenv.dotenv_values(str(env_file))
                for k, v in config.items():
                    if v is not None and k not in self._secrets:
                        self._secrets[k] = v
                        self._metadata[k] = {"source": ".env", "loaded_at": datetime.utcnow().isoformat()}
            except Exception:
                pass

    def _load_from_env_enc(self):
        env_enc = APP_DIR / ".env.enc"
        if env_enc.is_file():
            try:
                import dotenv, io
                decrypted = decrypt_file_to_string(str(env_enc))
                config = dotenv.dotenv_values(stream=io.StringIO(decrypted))
                for k, v in config.items():
                    if v is not None and k not in self._secrets:
                        self._secrets[k] = v
                        self._metadata[k] = {"source": ".env.enc", "loaded_at": datetime.utcnow().isoformat()}
            except Exception:
                pass

    def _load_from_os_environ(self):
        for key in list(self.REQUIRED_SECRETS) + list(self.OPTIONAL_SECRETS):
            val = os.environ.get(key)
            if val and key not in self._secrets:
                self._secrets[key] = val
                self._metadata[key] = {"source": "os.environ", "loaded_at": datetime.utcnow().isoformat()}

    def _load_from_settings_fallback(self):
        """Load key from secret.key file for JWT."""
        key_file = APP_DIR / "secret.key"
        if key_file.is_file() and "SECRET_KEY" not in self._secrets:
            try:
                key = key_file.read_text(encoding="utf-8").strip()
                if key:
                    self._secrets["SECRET_KEY"] = key
                    self._metadata["SECRET_KEY"] = {"source": "secret.key", "loaded_at": datetime.utcnow().isoformat()}
            except Exception:
                pass

    # ─── Public API ─────────────────────────────────────────────────────────────

    def get(self, key: str, default: Optional[str] = None, caller: str = "") -> Optional[str]:
        """Retrieve a secret. Never logs the value."""
        val = self._secrets.get(key)
        if val is None:
            return default
        # Bounded audit trail
        if len(SECRET_ACCESS_LOG) > 1000:
            SECRET_ACCESS_LOG[:500] = []
        SECRET_ACCESS_LOG.append((key, caller or "unknown", datetime.utcnow().isoformat()))
        return val

    def get_or_fail(self, key: str, caller: str = "") -> str:
        """Retrieve a required secret or raise."""
        val = self.get(key, caller=caller)
        if val is None:
            raise RuntimeError(f"Required secret '{key}' is not configured")
        return val

    def validate(self) -> list[str]:
        """Check all required secrets exist. Returns list of missing keys."""
        missing = []
        for key, description in self.REQUIRED_SECRETS.items():
            if key not in self._secrets or not self._secrets[key]:
                missing.append(f"{key} ({description})")
        return missing

    def rotate(self, key: str, value: str, persist: bool = False) -> bool:
        """Rotate a secret at runtime. Optionally persist to .env."""
        if not value:
            return False
        self._secrets[key] = value
        self._metadata[key] = {
            "source": "runtime_rotation",
            "loaded_at": datetime.utcnow().isoformat(),
            "rotated_at": datetime.utcnow().isoformat(),
        }
        if persist:
            self._persist_to_env(key, value)
        log.info(f"Secret '{key}' rotated {'and persisted ' if persist else ''}at runtime")
        return True

    def _persist_to_env(self, key: str, value: str):
        """Append or update a key in .env (plaintext fallback)."""
        env_file = APP_DIR / ".env"
        try:
            lines = []
            updated = False
            if env_file.is_file():
                lines = env_file.read_text(encoding="utf-8").splitlines()
            new_lines = []
            for line in lines:
                if line.strip().startswith(f"{key}="):
                    new_lines.append(f"{key}={value}")
                    updated = True
                else:
                    new_lines.append(line)
            if not updated:
                new_lines.append(f"{key}={value}")
            env_file.write_text("\n".join(new_lines), encoding="utf-8")
        except Exception as e:
            log.warning(f"Could not persist '{key}' to .env: {e}")

    def reload(self):
        """Reload all secrets from sources. Drops current cache and re-reads."""
        old = dict(self._secrets)
        self._secrets = {}
        self._metadata = {}
        self._load_all()
        for k in old:
            if k not in self._secrets:
                self._secrets[k] = old[k]
                self._metadata[k] = {"source": "cache", "loaded_at": datetime.utcnow().isoformat()}
        log.info("Secrets vault reloaded")

    def mask(self, key: str) -> str:
        """Return a masked version of a secret for debug output."""
        val = self._secrets.get(key)
        if not val:
            return "<not set>"
        if len(val) <= 8:
            return val[:2] + "***"
        return val[:4] + "****" + val[-4:]

    def status(self) -> dict:
        """Return vault status (secrets are masked, metadata only)."""
        return {
            "total_secrets": len(self._secrets),
            "required_configured": len(self.REQUIRED_SECRETS) - len(self.validate()),
            "required_total": len(self.REQUIRED_SECRETS),
            "optional_configured": sum(1 for k in self.OPTIONAL_SECRETS if k in self._secrets and self._secrets[k]),
            "optional_total": len(self.OPTIONAL_SECRETS),
            "missing": self.validate(),
            "secrets": {k: self.mask(k) for k in sorted(self._secrets)},
        }


# Module-level singleton
vault = SecretsVault()


def validate_secrets_on_startup():
    """Fail-fast validation of required secrets at startup."""
    missing = vault.validate()
    if missing:
        for m in missing:
            log.critical(f"Required secret not configured: {m}")
        print(
            f"[UltrON] FATAL: {len(missing)} required secret(s) not configured. "
            "Set them in .env or environment variables.",
            file=sys.stderr,
        )
        sys.exit(1)
    log.info(f"Secrets vault initialized: {len(vault._secrets)} secret(s) loaded")


# ─── File Encryption Utilities ──────────────────────────────────────────────

def _get_secret_key_from_file() -> str:
    import sys, secrets
    IS_FROZEN = getattr(sys, "frozen", False)
    app_dir = Path(sys.executable).parent.resolve() if IS_FROZEN else Path(__file__).parent.parent.parent.resolve()
    key_file = app_dir / "secret.key"
    try:
        if key_file.is_file() and (k := key_file.read_text(encoding="utf-8").strip()): return k
        k = secrets.token_urlsafe(64); key_file.write_text(k, encoding="utf-8"); return k
    except Exception: return ""

def get_fernet_key() -> bytes:
    import base64
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    file_key = _get_secret_key_from_file()
    if not file_key: raise RuntimeError("No secret.key found.")
    salt_path = Path(__file__).parent.parent.parent / "secret.salt"
    if salt_path.is_file(): salt = base64.urlsafe_b64decode(salt_path.read_text(encoding="utf-8").strip())
    else: salt = os.urandom(16); salt_path.write_text(base64.urlsafe_b64encode(salt).decode("utf-8"), encoding="utf-8")
    return base64.urlsafe_b64encode(PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100000).derive(file_key.encode("utf-8")))

def decrypt_file_to_string(cipher_file_path: str) -> str:
    from cryptography.fernet import Fernet
    if not os.path.exists(cipher_file_path): raise FileNotFoundError(f"Encrypted file not found: {cipher_file_path}")
    with open(cipher_file_path, "rb") as f: return Fernet(get_fernet_key()).decrypt(f.read()).decode("utf-8")
