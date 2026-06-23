# UltrON Monorepo

Unified repository for the UltrON IoT Industrial Telemetry Platform.

## Monorepo Layout
- `client/`: FastAPI backend, React operator UI (packaged as EXE), and build/installer configs.
- `server/`: RajAPI central server (FastAPI backend + React frontend for Raspberry Pi).
- `common/`: Common TypeScript models and constants shared between components.
- `docs/`: Product planning, design papers, and prompts history.
- `rajapi_server/`: MQTT broker (Mosquitto) Docker config for the Pi.\n