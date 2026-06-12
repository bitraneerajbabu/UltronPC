# -*- coding: utf-8 -*-
"""
UltrON Client Unified Launcher
"""
import sys
import uvicorn

def main():
    print("Starting client backend service skeleton...")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8765, reload=True)

if __name__ == "__main__":
    main()\n