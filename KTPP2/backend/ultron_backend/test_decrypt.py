import sys
from pathlib import Path
import os

# Add parent dir to path
sys.path.insert(0, str(Path(__file__).parent.resolve()))

try:
    from app.core.config_crypt import decrypt_file_to_string
    enc_file = "C:\\Users\\sunsh\\OneDrive\\Music\\UltrON\\client\\backend\\ultron_backend\\.env.enc"
    decrypted = decrypt_file_to_string(enc_file)
    print("Decrypted contents:")
    for line in decrypted.splitlines():
        if "KEY" in line or "SECRET" in line:
            print(line)
except Exception as e:
    import traceback
    traceback.print_exc()
