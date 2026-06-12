import httpx
import asyncio
from datetime import datetime

payload = {
    "DeviceID": 8244,
    "FunctionName": 53,
    "Datetime": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    "Name": "site_2143",
    "Password": "BERGER",
    "additionalInfo": {
        "Longitude": "000.000000",
        "Lattitude": "000.000000",
        "SoftwareNameVersion": "UltrON"
    },
    "Variables": [
        {
            "Variablename": "SO2",
            "Value": 10.81,
            "Unit": "ug/m3",
            "Flags": ""
        },
        {
            "Variablename": "NOX",
            "Value": 24.49,
            "Unit": "ug/m3",
            "Flags": ""
        },
        {
            "Variablename": "PM2.5",
            "Value": 17.01,
            "Unit": "ug/m3",
            "Flags": ""
        },
        {
            "Variablename": "PM10",
            "Value": 25.54,
            "Unit": "ug/m3",
            "Flags": ""
        }
    ]
}

async def run():
    url = "http://122.175.36.149:1991/APPCB/Api"
    print(f"Sending payload to {url}...")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(url, json=payload)
            print(f"Status Code: {res.status_code}")
            print(f"Response: {res.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(run())
