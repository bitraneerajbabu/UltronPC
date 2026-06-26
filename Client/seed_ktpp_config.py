import sqlite3
import os
import json

db_path = os.path.join(os.path.dirname(__file__), "backend", "ultron_backend", "ultron.db")

def seed():
    if not os.path.exists(db_path):
        print(f"Error: Database file not found at {db_path}")
        return

    print(f"Connecting to database at {db_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # 1. Update Default Station details to match KTPP Unit 2
        station_name = "KAKATIYA THERMAL POWER PROJECT_BHUPALAPALLY_5_KTPP Unit2 Cooling tower area"
        cursor.execute("""
            UPDATE stations 
            SET name = ?, description = ?, is_active = 1
            WHERE id = 1
        """, (station_name, "KTPP Unit 2 Cooling Tower Area"))
        print("Updated station settings.")

        # 2. Update SPCB Server Config (Sunshine server config)
        cursor.execute("""
            UPDATE server_config
            SET name = 'TSPCB Server',
                protocol = 'tspcb',
                live_url = 'https://tgpcb.rtms.telangana.gov.in/Realtime/liveData',
                delay_url = 'https://tgpcb.rtms.telangana.gov.in/Realtime/liveData',
                cpcb_file_path = 'D:\\KTPP.txt',
                is_active = 1,
                is_cpcb_active = 1
            WHERE id = 1
        """)
        print("Updated SPCB/CPCB server configuration.")

        # 3. Clean existing devices, parameters, and mappings to avoid duplicates
        cursor.execute("DELETE FROM server_parameter_mapping")
        cursor.execute("DELETE FROM parameters")
        cursor.execute("DELETE FROM devices WHERE id > 1") # Keep default if any, but let's clear it all or reset
        cursor.execute("DELETE FROM devices")
        print("Cleaned existing devices, parameters, and mappings.")

        # 4. Insert Devices
        devices = [
            (1, 1, "PM10 Analyzer", "ANALYZER", "tcp_custom", "172.21.36.203", 8001, "02 4D 31 30 34 30 34 37 43 03", "etx", 60, 5, 1, "offline"),
            (2, 1, "PM2.5 Analyzer", "ANALYZER", "tcp_custom", "172.21.36.204", 8001, "02 4D 31 30 34 30 34 37 43 03", "etx", 60, 5, 1, "offline"),
            (3, 1, "SO2 Analyzer", "ANALYZER", "tcp_custom", "172.21.36.206", 8003, "02 41 46 32 32 31 36 30 30 03", "newline", 60, 5, 1, "offline"),
            (4, 1, "NOx Analyzer", "ANALYZER", "tcp_custom", "172.21.36.205", 8002, "02 41 43 33 32 31 36 30 34 03", "newline", 60, 5, 1, "offline")
        ]

        for d in devices:
            cursor.execute("""
                INSERT INTO devices (id, station_id, name, device_type, protocol, host, port, request_hex, response_delimiter, poll_interval, timeout, is_active, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, d)
        print("Seeded KTPP Devices successfully.")

        # 5. Insert Parameters
        # Columns: id, device_id, name, tag_name, register_address, scale_factor, offset, min_valid, max_valid, parse_method, parse_config, unit, is_active
        parameters = [
            (1, 1, "PM10", "PM10", 0, 0.01, 0.0, 0.0, 1000.0, "regex", '{"pattern": "M000000(\\\\d{4})"}', "ug/m3", 1),
            (2, 2, "PM2.5", "PM2.5", 0, 0.01, 0.0, 0.0, 1000.0, "regex", '{"pattern": "M000000(\\\\d{4})"}', "ug/m3", 1),
            (3, 3, "SO2", "SO2", 0, 1.0, 0.0, 0.0, 500.0, "delimiter_split", '{"sep": " ", "index": 1}', "ug/m3", 1),
            (4, 4, "NO", "NO", 0, 1.0, 0.0, 0.0, 500.0, "delimiter_split", '{"sep": " ", "index": 1}', "ug/m3", 1),
            (5, 4, "NO2", "NO2", 0, 1.0, 0.0, 0.0, 500.0, "delimiter_split", '{"sep": " ", "index": 2}', "ug/m3", 1),
            (6, 4, "NOx", "NOx", 0, 1.0, 0.0, 0.0, 500.0, "delimiter_split", '{"sep": " ", "index": 3}', "ug/m3", 1)
        ]

        for p in parameters:
            cursor.execute("""
                INSERT INTO parameters (id, device_id, name, tag_name, register_address, scale_factor, offset, min_valid, max_valid, parse_method, parse_config, unit, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, p)
        print("Seeded parameters for devices successfully.")

        # 6. Seed Server Parameter Mappings for TSPCB / CPCB Upload
        # Columns: server_id, parameter_id, is_active, cpcb_station_name, cpcb_parameter, api_id, api_name, api_password, api_vname, api_unit
        mappings = [
            (1, 1, 1, station_name, "PM10", "316", "ktpps", "ktpps", "PM10", "ug/m3"),
            (1, 2, 1, station_name, "PM2.5", "332", "ktpps", "ktpps", "PM2.5", "ug/m3"),
            (1, 3, 1, station_name, "SO2", "318", "ktpps", "ktpps", "SO2", "ug/m3"),
            (1, 4, 1, station_name, "NO", "319", "ktpps", "ktpps", "NO", "ug/m3"),
            (1, 5, 1, station_name, "NO2", "319", "ktpps", "ktpps", "NO2", "ug/m3"),
            (1, 6, 1, station_name, "NOx", "319", "ktpps", "ktpps", "NOx", "ug/m3")
        ]

        for m in mappings:
            cursor.execute("""
                INSERT INTO server_parameter_mapping (server_id, parameter_id, is_active, cpcb_station_name, cpcb_parameter, api_id, api_name, api_password, api_vname, api_unit)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, m)
        print("Seeded server mappings successfully.")

        conn.commit()
        print("\nAll database configurations for KTPP have been seeded successfully! [OK]")
    except Exception as e:
        conn.rollback()
        print(f"Error during seeding: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    seed()
