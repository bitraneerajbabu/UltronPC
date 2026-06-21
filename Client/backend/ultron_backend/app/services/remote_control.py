"""
UltrON — MQTT Remote Control Service

Connects to the RajAPI central MQTT broker to receive remote commands.
Commands are expected as JSON on the topic: ultron/command/{station_id}

Supported commands:
- {"action": "reboot_system"}
- {"action": "restart_polling"}
- {"action": "factory_reset"}
"""

import asyncio
import json
from gmqtt import Client as MQTTClient
from app.config import settings
from app.core.logger import get_logger

log = get_logger("ultron.remote_control")

# Keep track of the active connection
_mqtt_client = None

def on_connect(client, flags, rc, properties):
    log.info(f"[MQTT] Connected to RajAPI broker at {settings.RAJAPI_MQTT_HOST}")
    topic = f"ultron/command/{settings.RAJAPI_STATION_ID}"
    client.subscribe(topic, qos=1)
    log.info(f"[MQTT] Subscribed to command topic: {topic}")

def on_message(client, topic, payload, qos, properties):
    try:
        msg = payload.decode('utf-8')
        log.info(f"[MQTT] Received message on {topic}: {msg}")
        
        data = json.loads(msg)
        action = data.get("action")
        
        if action == "restart_polling":
            log.info("[MQTT] Remote command received: Restarting polling engine...")
            from app.services.polling_engine import restart_polling
            asyncio.create_task(restart_polling())
            
        elif action == "reboot_system":
            log.info("[MQTT] Remote command received: Rebooting local PC...")
            import os
            if os.name == 'nt':
                os.system("shutdown /r /t 5")
            else:
                os.system("sudo reboot")
                
        elif action == "factory_reset":
            log.warning("[MQTT] Remote command received: Factory Reset requested.")
            # Trigger database reset (requires careful handling)
            from app.database import init_db
            from app.database import engine
            from app.models.server_config import Base
            async def _reset():
                async with engine.begin() as conn:
                    await conn.run_sync(Base.metadata.drop_all)
                await init_db()
                log.info("[MQTT] Factory reset complete.")
            asyncio.create_task(_reset())
            
        else:
            log.warning(f"[MQTT] Unknown command action received: {action}")
            
    except json.JSONDecodeError:
        log.error(f"[MQTT] Failed to parse command payload as JSON: {payload}")
    except Exception as e:
        log.error(f"[MQTT] Error handling incoming command: {e}")

def on_disconnect(client, packet, exc=None):
    log.warning("[MQTT] Disconnected from RajAPI broker.")

async def start_mqtt_client():
    if not settings.RAJAPI_MQTT_ENABLED:
        log.info("[MQTT] Remote control is disabled in settings.")
        return

    global _mqtt_client
    _mqtt_client = MQTTClient(settings.RAJAPI_STATION_ID)
    
    _mqtt_client.on_connect = on_connect
    _mqtt_client.on_message = on_message
    _mqtt_client.on_disconnect = on_disconnect
    
    if settings.RAJAPI_MQTT_USER and settings.RAJAPI_MQTT_PASSWORD:
        _mqtt_client.set_auth_credentials(settings.RAJAPI_MQTT_USER, settings.RAJAPI_MQTT_PASSWORD)
        
    try:
        log.info(f"[MQTT] Connecting to {settings.RAJAPI_MQTT_HOST}:{settings.RAJAPI_MQTT_PORT}...")
        await _mqtt_client.connect(
            settings.RAJAPI_MQTT_HOST, 
            settings.RAJAPI_MQTT_PORT, 
            keepalive=60, 
            version=5
        )
        # Background task runs forever
    except Exception as e:
        log.error(f"[MQTT] Connection failed: {e}. Will retry later if managed by external loop.")

async def publish_telemetry(payload_dict: dict):
    """
    Called by server_push.py to push live telemetry up the MQTT socket instead of HTTP POST.
    """
    if _mqtt_client and _mqtt_client.is_connected:
        topic = f"ultron/telemetry/{settings.RAJAPI_STATION_ID}"
        try:
            _mqtt_client.publish(topic, json.dumps(payload_dict), qos=1)
        except Exception as e:
            log.error(f"[MQTT] Failed to publish telemetry: {e}")
