import sqlite3
conn = sqlite3.connect('ultron.db')
conn.execute('UPDATE users SET failed_login_attempts=0, locked_until=NULL WHERE username="Master"')
conn.commit()
print("Master user unlocked.")
