"""
UltrON — Modbus TCP Service
Connects to a device over TCP, reads registers, decodes values.
Supports all standard Modbus register types and data types.
"""

import asyncio
import struct
from typing import Optional
from pymodbus.client import AsyncModbusTcpClient
from pymodbus.exceptions import ModbusException
from app.core.logger import get_logger
from app.config import settings

log = get_logger("ultron.modbus_tcp")


def _decode_registers(registers: list[int], data_type: str, byte_order: str) -> Optional[float]:
    """
    Convert raw 16-bit Modbus register words to a Python float.

    Modbus word order options:
      - "big"          : Big-endian word order, big-endian bytes    (AB CD)
      - "big_swap"     : Little-endian word order, big-endian bytes (CD AB) (Swapped Float/Long/Double)
      - "little"       : Little-endian word order, big-endian bytes (CD AB)
      - "little_swap"  : Little-endian word order, bytes swapped    (DC BA)
    """
    try:
        if data_type in ("float32", "int32", "uint32"):
            if len(registers) < 2:
                return None

            # Apply word order: 'little', 'little_swap', or 'big_swap' reverses the register order
            if byte_order in ("little", "little_swap", "big_swap"):
                w0, w1 = registers[1], registers[0]   # swap word positions
            else:
                w0, w1 = registers[0], registers[1]   # big: first register is MSW

            # Pack as big-endian uint16 pair → 4 bytes
            raw = struct.pack(">HH", w0, w1)

            # Apply byte swap within each word if requested
            if byte_order in ("little_swap",):
                raw = bytes([raw[1], raw[0], raw[3], raw[2]])

            if data_type == "float32":
                return struct.unpack(">f", raw)[0]
            elif data_type == "int32":
                return float(struct.unpack(">i", raw)[0])
            else:  # uint32
                return float(struct.unpack(">I", raw)[0])

        elif data_type == "int16":
            raw = struct.pack(">H", registers[0])
            return float(struct.unpack(">h", raw)[0])

        elif data_type == "uint16":
            return float(registers[0])

        elif data_type == "int64":
            if len(registers) < 4:
                return None
            if byte_order in ("little", "little_swap", "big_swap"):
                regs = list(reversed(registers[:4]))
            else:
                regs = list(registers[:4])
            raw = struct.pack(">HHHH", *regs)
            if byte_order in ("little_swap",):
                raw = bytes([raw[1], raw[0], raw[3], raw[2], raw[5], raw[4], raw[7], raw[6]])
            return float(struct.unpack(">q", raw)[0])

        elif data_type == "bool":
            return float(bool(registers[0]))

        else:
            return float(registers[0])

    except Exception as e:
        log.warning(f"Decode error ({data_type}, {byte_order}): {e}")
        return None


class ModbusTCPReader:
    """
    Async Modbus TCP reader.
    One instance per device — keeps a persistent connection with auto-reconnect.
    """

    def __init__(self, host: str, port: int = 502, slave_id: int = 1, timeout: int = 5):
        self.host = host
        self.port = port
        self.slave_id = slave_id
        self.timeout = timeout
        self._client: Optional[AsyncModbusTcpClient] = None

    async def _ensure_connected(self) -> bool:
        """Return True if already connected or successfully connects."""
        if self._client is not None and self._client.connected:
            return True
        try:
            self._client = AsyncModbusTcpClient(
                host=self.host,
                port=self.port,
                timeout=self.timeout,
            )
            connected = await self._client.connect()
            if connected:
                log.info(f"Modbus TCP connected → {self.host}:{self.port} (slave={self.slave_id})")
            else:
                log.warning(f"Modbus TCP connect returned False → {self.host}:{self.port}")
            return bool(connected)
        except Exception as e:
            log.error(f"Modbus TCP connect failed ({self.host}:{self.port}): {e}")
            self._client = None
            return False

    async def close(self):
        if self._client:
            try:
                self._client.close()
            except Exception:
                pass
            self._client = None

    async def read_parameter(
        self,
        register_address: int,
        register_count: int = 2,
        register_type: str = "holding",
        data_type: str = "float32",
        byte_order: str = "big",
        scale_factor: float = 1.0,
        offset: float = 0.0,
        host: Optional[str] = None,
        port: Optional[int] = None,
        slave_id: Optional[int] = None,
    ) -> tuple[Optional[float], str]:
        """
        Read one parameter.
        Returns (value, quality) where quality is: 'U' | 'E'
        """
        target_host = host if host else self.host
        target_port = port if port else self.port
        target_slave = slave_id if slave_id is not None else self.slave_id
        if scale_factor is None or scale_factor == 0:
            scale_factor = 1.0
        if offset is None:
            offset = 0.0

        # ModScan address translation (e.g. 40005 -> 4 for holding registers)
        target_address = register_address
        if register_type == "holding" and target_address >= 40001:
            target_address -= 40001
        elif register_type == "input_reg" and target_address >= 30001:
            target_address -= 30001
        elif register_type == "discrete_input" and target_address >= 10001:
            target_address -= 10001

        has_override = (host is not None or port is not None)
        client = None
        cleanup_client = False

        if has_override:
            try:
                client = AsyncModbusTcpClient(
                    host=target_host,
                    port=target_port,
                    timeout=self.timeout,
                )
                connected = await client.connect()
                if not connected:
                    log.warning(f"Parameter-level Modbus TCP connect failed to {target_host}:{target_port}")
                    return None, "E"
                cleanup_client = True
            except Exception as e:
                log.error(f"Parameter-level Modbus TCP connect exception {target_host}:{target_port}: {e}")
                return None, "E"
        else:
            if not await self._ensure_connected():
                return None, "E"
            client = self._client

        try:
            if register_type == "holding":
                result = await client.read_holding_registers(
                    target_address, count=register_count, device_id=target_slave
                )
            elif register_type == "input_reg":
                result = await client.read_input_registers(
                    target_address, count=register_count, device_id=target_slave
                )
            elif register_type == "coil":
                result = await client.read_coils(
                    target_address, count=register_count, device_id=target_slave
                )
            elif register_type == "discrete_input":
                result = await client.read_discrete_inputs(
                    target_address, count=register_count, device_id=target_slave
                )
            else:
                log.warning(f"Unknown register_type '{register_type}'")
                if cleanup_client:
                    client.close()
                return None, "U"

            if result.isError():
                log.warning(f"Modbus error response at addr {register_address}: {result}")
                if cleanup_client:
                    client.close()
                return None, "E"

            # Coils/discrete inputs use result.bits; registers use result.registers
            if hasattr(result, "registers") and result.registers is not None:
                regs = list(result.registers)
            elif hasattr(result, "bits") and result.bits is not None:
                regs = [int(b) for b in result.bits]
            else:
                if cleanup_client:
                    client.close()
                return None, "E"

            raw_val = _decode_registers(regs, data_type, byte_order)

            if cleanup_client:
                client.close()

            if raw_val is None:
                return None, "E"

            if data_type == "bool":
                value = raw_val
            else:
                value = (raw_val * scale_factor) + offset
            return value, "U"

        except ModbusException as e:
            log.error(f"Modbus TCP read error (addr={register_address}): {e}")
            if cleanup_client:
                client.close()
            else:
                await self.close()   # force reconnect on next call
            return None, "E"
        except Exception as e:
            log.error(f"Unexpected error reading Modbus TCP (addr={register_address}): {e}")
            if cleanup_client:
                client.close()
            else:
                await self.close()
            return None, "E"

    async def read_all_parameters(self, parameters: list[dict]) -> list[dict]:
        """
        Poll all parameters for a device in one call.
        Uses the persistent connection to read parameters individually, avoiding connection exhaustion.
        """
        results = []
        for p in parameters:
            value, quality = await self.read_parameter(
                register_address=p["register_address"],
                register_count=p["register_count"],
                register_type=p["register_type"],
                data_type=p["data_type"],
                byte_order=p["byte_order"],
                scale_factor=p["scale_factor"],
                offset=p["offset"],
                host=p.get("host"),
                port=p.get("port"),
                slave_id=p.get("slave_id"),
            )
            sf = p.get("scale_factor", 1.0) or 1.0
            off = p.get("offset", 0.0) or 0.0
            dt = p.get("data_type", "float32")
            raw_value = None
            if value is not None and sf not in (0, 0.0):
                if dt == "bool":
                    raw_value = value
                else:
                    raw_value = (value - off) / sf

            results.append({
                "parameter_id": p["id"],
                "value": value,
                "raw_value": raw_value,
                "quality": quality,
            })
            # Small delay between register reads to avoid overwhelming slow devices
            await asyncio.sleep(0.05)

        return results

