import bcrypt
import sqlite3

conn = sqlite3.connect('ultron.db')
user = conn.execute('SELECT username, hashed_password FROM users WHERE username="Master"').fetchone()
if user:
    username, hash = user
    print(f"User: {username}")
    print(f"Hash in DB: {hash}")
    
    # Check 'Ultronpoiu'
    try:
        match = bcrypt.checkpw('Ultronpoiu'.encode('utf-8'), hash.encode('utf-8'))
        print(f"Matches 'Ultronpoiu': {match}")
    except Exception as e:
        print(f"Error checking 'Ultronpoiu': {e}")
        
    # Check 'admin'
    try:
        match = bcrypt.checkpw('admin'.encode('utf-8'), hash.encode('utf-8'))
        print(f"Matches 'admin': {match}")
    except Exception as e:
        print(f"Error checking 'admin': {e}")
else:
    print("User not found")
