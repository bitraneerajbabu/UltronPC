# -*- coding: utf-8 -*-
"""
FastAPI Platform Entry Point
"""
from fastapi import FastAPI

app = FastAPI(title="UltrON Client Node API")

@app.get("/health")
def health():
    return {"status": "ok", "mode": "local"}\n