# -*- coding: utf-8 -*-
"""
UltrON — Configuration Encryption / Decryption Utilities
Uses cryptography Fernet (AES-128 in CBC mode with HMAC-SHA256).
"""

import base64
import os
from pathlib import Path
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.fernet import Fernet

def _get_app_dir() -> Path:
    """Persistent app dir: next to the exe (frozen) or package root (dev)."""
    import sys
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent.resolve()
    return Path(__file__).parent.parent.parent.resolve()


def _get_secret_key_from_file() -> str:
    """Read SECRET_KEY directly from secret.key file, or generate a new one if missing."""
    key_file = _get_app_dir() / "secret.key"
    try:
        if key_file.is_file():
            key = key_file.read_text(encoding="utf-8").strip()
            if key:
                return key
        # Generate and save a new secure unique secret.key file
        key = secrets.token_urlsafe(64)
        key_file.write_text(key, encoding="utf-8")
        return key
    except Exception:
        pass
    return ""


def get_fernet_key() -> bytes:
    """
    Derives a Fernet key from the machine-local secret.key file.
    Each installation gets a unique encryption key, so the bundled
    .env.enc cannot be decrypted with the public source alone.
    Raises if no secret.key exists — never falls back to a hardcoded key.
    """
    file_key = _get_secret_key_from_file()
    if not file_key:
        raise RuntimeError(
            "No secret.key found. Generate one with: "
            "python -c \"import secrets; "
            "open('secret.key','w').write(secrets.token_urlsafe(64))\""
        )
    password = file_key.encode("utf-8")
    salt_path = _get_app_dir() / "secret.salt"
    if salt_path.is_file():
        salt = base64.urlsafe_b64decode(salt_path.read_text(encoding="utf-8").strip())
    else:
        salt = os.urandom(16)
        salt_path.write_text(base64.urlsafe_b64encode(salt).decode("utf-8"), encoding="utf-8")
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    return base64.urlsafe_b64encode(kdf.derive(password))


def encrypt_file(plain_file_path: str, cipher_file_path: str) -> None:
    """
    Reads a plaintext file (like .env), encrypts its content,
    and writes it to the cipher_file_path (like .env.enc).
    """
    if not os.path.exists(plain_file_path):
        raise FileNotFoundError(f"Plaintext file not found: {plain_file_path}")

    key = get_fernet_key()
    fernet = Fernet(key)
    
    with open(plain_file_path, "r", encoding="utf-8") as f:
        data = f.read()
        
    encrypted = fernet.encrypt(data.encode("utf-8"))
    
    with open(cipher_file_path, "wb") as f:
        f.write(encrypted)


def decrypt_file_to_string(cipher_file_path: str) -> str:
    """
    Reads an encrypted configuration file, decrypts it,
    and returns the decrypted content as a string.
    """
    if not os.path.exists(cipher_file_path):
        raise FileNotFoundError(f"Encrypted file not found: {cipher_file_path}")

    key = get_fernet_key()
    fernet = Fernet(key)
    
    with open(cipher_file_path, "rb") as f:
        encrypted = f.read()
        
    decrypted = fernet.decrypt(encrypted)
    return decrypted.decode("utf-8")


def secure_delete_file(file_path: str) -> None:
    """
    Overwrites the file contents with zero bytes before deleting it
    to prevent file recovery via standard recovery tools.
    """
    if os.path.exists(file_path):
        try:
            # Overwrite content with zeros
            file_size = os.path.getsize(file_path)
            with open(file_path, "wb") as f:
                f.write(b"\x00" * file_size)
            # Delete file
            os.remove(file_path)
        except Exception:
            # Fallback to simple delete if overwrite fails
            try:
                os.remove(file_path)
            except Exception:
                pass


def write_env_enc_from_dict(data: dict, cipher_file_path: str) -> None:
    """
    Takes a dictionary of configuration variables, formats them into a .env string,
    and directly encrypts it to the cipher_file_path (.env.enc).
    """
    import io
    key = get_fernet_key()
    fernet = Fernet(key)
    
    # Format the dictionary into a standard .env format
    lines = []
    for k, v in data.items():
        if v is not None:
            # Simple escaping: if v contains spaces or quotes, we wrap it in double quotes
            # (In production we should be careful, but here we control the input)
            v_str = str(v).replace('"', '\\"')
            if " " in v_str or '"' in v_str:
                lines.append(f'{k}="{v_str}"')
            else:
                lines.append(f"{k}={v_str}")
    
    env_content = "\n".join(lines) + "\n"
    encrypted = fernet.encrypt(env_content.encode("utf-8"))
    
    with open(cipher_file_path, "wb") as f:
        f.write(encrypted)


