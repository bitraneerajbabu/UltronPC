import bcrypt
import sqlite3

hash = bcrypt.hashpw('Ultronpoiu'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

conn = sqlite3.connect('ultron.db')
conn.execute('UPDATE users SET hashed_password=? WHERE username="Master"', (hash,))
conn.commit()
print("Master password updated successfully.")
