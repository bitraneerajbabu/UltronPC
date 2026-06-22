import json
import logging
import asyncio
from gmqtt import Client as MQTTClient
from app.core.config import settings

logger = logging.getLogger("rajapi.mqtt")

_mqtt_client = None
_ready = asyncio.Event()

SUPPORTED_COMMANDS = {"restart_polling", "reboot_system", "factory_reset"}

def on_connect(client, flags, rc, properties):
    logger.info(f"[MQTT] Publisher connected to broker at {settings.MQTT_HOST}:{settings.MQTT_PORT}")
    _ready.set()

def on_disconnect(client, packet, exc=None):
    logger.warning("[MQTT] Publisher disconnected from broker")
    _ready.clear()

async def start_mqtt_client():
    global _mqtt_client
    if not settings.MQTT_ENABLED:
        logger.info("[MQTT] Publisher disabled in settings")
        return
    _mqtt_client = MQTTClient("rajapi_publisher")
    _mqtt_client.on_connect = on_connect
    _mqtt_client.on_disconnect = on_disconnect
    if settings.MQTT_USER:
        _mqtt_client.set_auth_credentials(settings.MQTT_USER, settings.MQTT_PASSWORD)
    try:
        await _mqtt_client.connect(settings.MQTT_HOST, settings.MQTT_PORT, keepalive=60, version=5)
        logger.info(f"[MQTT] Publisher connecting to {settings.MQTT_HOST}:{settings.MQTT_PORT}...")
    except Exception as e:
        logger.error(f"[MQTT] Publisher connection failed: {e}")

async def publish_command(station_id: str, action: str) -> bool:
    if action not in SUPPORTED_COMMANDS:
        logger.warning(f"[MQTT] Unknown command: {action}")
        return False
    if _mqtt_client is None or not _mqtt_client.is_connected:
        logger.warning(f"[MQTT] Not connected, cannot publish command '{action}' to {station_id}")
        return False
    topic = f"ultron/command/{station_id}"
    payload = json.dumps({"action": action})
    try:
        _mqtt_client.publish(topic, payload, qos=1)
        logger.info(f"[MQTT] Published command '{action}' to {topic}")
        return True
    except Exception as e:
        logger.error(f"[MQTT] Publish failed: {e}")
        return False
