# -*- coding: utf-8 -*-
"""
UltrON — Configuration Encryption / Decryption Utilities
Uses cryptography Fernet (AES-128 in CBC mode with HMAC-SHA256).

WARNING: This encryption is obfuscation only; the derivation key is bundled.
Only the public anon key and non-sensitive settings may be stored here.
Never store the service_role key or other true secrets.
"""

import base64
import os
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.fernet import Fernet

def get_fernet_key() -> bytes:
    """
    Derives a secure, deterministic key for Fernet.
    Uses a fixed salt and password so that the compiled binary can
    always decrypt the encrypted configuration without external state.
    """
    password = b"UltrON.Security.Password.Key.2026.Sunshine"
    salt = b"UltrON_Fixed_Salt_2026_#SunshineTech"
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

