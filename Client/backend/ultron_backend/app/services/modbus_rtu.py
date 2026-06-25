"""
UltrON — Modbus RTU / RS485 Service
Reads from serial-connected devices (COM port / /dev/ttyUSBx).
One ModbusRTUReader per serial port — shared across all slave devices on that bus.
"""

import asyncio
from typing import Optional
from pymodbus.client import AsyncModbusSerialClient
from pymodbus.exceptions import ModbusException
from app.core.logger import get_logger
from app.services.modbus_tcp import _decode_registers   # reuse the corrected decoder

log = get_logger("ultron.modbus_rtu")


class ModbusRTUReader:
    """
    Async Modbus RTU reader over serial (RS485 / RS232).
    One instance per serial port — shared across multiple devices on same bus.
    Uses an async lock to serialize access (RS485 is half-duplex).
    """

    def __init__(
        self,
        port: str,
        baudrate: int = 9600,
        data_bits: int = 8,
        parity: str = "N",
        stop_bits: int = 1,
        timeout: int = 3,
    ):
        self.port = port
        self.baudrate = baudrate
        self.data_bits = data_bits
        self.parity = parity
        self.stop_bits = stop_bits
        self.timeout = timeout
        self._client: Optional[AsyncModbusSerialClient] = None
        self._lock = asyncio.Lock()   # RS485 bus is shared — serialize access

    async def _ensure_connected(self) -> bool:
        if self._client is not None and self._client.connected:
            return True
        try:
            self._client = AsyncModbusSerialClient(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=self.data_bits,
                parity=self.parity,
                stopbits=self.stop_bits,
                timeout=self.timeout,
            )
            connected = await self._client.connect()
            if connected:
                log.info(f"Modbus RTU connected → {self.port} @ {self.baudrate}bps")
            else:
                log.warning(f"Modbus RTU connect returned False → {self.port}")
            return bool(connected)
        except Exception as e:
            log.error(f"Modbus RTU connect failed ({self.port}): {e}")
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
        slave_id: int,
        register_address: int,
        register_count: int = 2,
        register_type: str = "holding",
        data_type: str = "float32",
        byte_order: str = "big",
        scale_factor: float = 1.0,
        offset: float = 0.0,
        serial_port: Optional[str] = None,
        baud_rate: Optional[int] = None,
        data_bits: Optional[int] = None,
        parity: Optional[str] = None,
        stop_bits: Optional[int] = None,
    ) -> tuple[Optional[float], str]:
        """Thread-safe read (via async lock) for RS485 shared bus."""
        if scale_factor is None or scale_factor == 0:
            scale_factor = 1.0
        if offset is None:
            offset = 0.0
        target_port = serial_port if serial_port else self.port
        target_baud = baud_rate if baud_rate else self.baudrate
        target_dbits = data_bits if data_bits else self.data_bits
        target_parity = parity if parity else self.parity
        target_sbits = stop_bits if stop_bits else self.stop_bits

        has_override = (
            serial_port is not None
            or baud_rate is not None
            or data_bits is not None
            or parity is not None
            or stop_bits is not None
        )

        if has_override:
            client = None
            try:
                client = AsyncModbusSerialClient(
                    port=target_port,
                    baudrate=target_baud,
                    bytesize=target_dbits,
                    parity=target_parity,
                    stopbits=target_sbits,
                    timeout=self.timeout,
                )
                connected = await client.connect()
                if not connected:
                    log.warning(f"Parameter-level Modbus RTU connect failed to {target_port}")
                    return None, "E"
                
                if register_type == "holding":
                    result = await client.read_holding_registers(
                        register_address, count=register_count, device_id=slave_id
                    )
                elif register_type == "input_reg":
                    result = await client.read_input_registers(
                        register_address, count=register_count, device_id=slave_id
                    )
                elif register_type == "coil":
                    result = await client.read_coils(
                        register_address, count=register_count, device_id=slave_id
                    )
                elif register_type == "discrete_input":
                    result = await client.read_discrete_inputs(
                        register_address, count=register_count, device_id=slave_id
                    )
                else:
                    client.close()
                    return None, "U"

                client.close()

                if result.isError():
                    return None, "E"

                if hasattr(result, "registers") and result.registers is not None:
                    regs = list(result.registers)
                elif hasattr(result, "bits") and result.bits is not None:
                    regs = [int(b) for b in result.bits]
                else:
                    return None, "E"

                raw_val = _decode_registers(regs, data_type, byte_order)
                if raw_val is None:
                    return None, "E"

                value = (raw_val * scale_factor) + offset
                return value, "U"

            except Exception as e:
                log.error(f"Parameter-level RTU error on port {target_port}: {e}")
                if client:
                    client.close()
                return None, "E"
        else:
            async with self._lock:
                if not await self._ensure_connected():
                    return None, "E"

                try:
                    if register_type == "holding":
                        result = await self._client.read_holding_registers(
                            register_address, count=register_count, device_id=slave_id
                        )
                    elif register_type == "input_reg":
                        result = await self._client.read_input_registers(
                            register_address, count=register_count, device_id=slave_id
                        )
                    elif register_type == "coil":
                        result = await self._client.read_coils(
                            register_address, count=register_count, device_id=slave_id
                        )
                    elif register_type == "discrete_input":
                        result = await self._client.read_discrete_inputs(
                            register_address, count=register_count, device_id=slave_id
                        )
                    else:
                        log.warning(f"Unknown register_type '{register_type}'")
                        return None, "U"

                    if result.isError():
                        return None, "E"

                    if hasattr(result, "registers") and result.registers is not None:
                        regs = list(result.registers)
                    elif hasattr(result, "bits") and result.bits is not None:
                        regs = [int(b) for b in result.bits]
                    else:
                        return None, "E"

                    raw_val = _decode_registers(regs, data_type, byte_order)
                    if raw_val is None:
                        return None, "E"

                    value = (raw_val * scale_factor) + offset
                    return value, "U"

                except ModbusException as e:
                    log.error(f"Modbus RTU read error (slave={slave_id}, addr={register_address}): {e}")
                    await self.close()
                    return None, "E"
                except Exception as e:
                    log.error(f"Unexpected RTU error (slave={slave_id}, addr={register_address}): {e}")
                    await self.close()
                    return None, "E"
                finally:
                    # Give the RS485 bus a small inter-frame gap (3.5 character times minimum)
                    await asyncio.sleep(0.1)

    async def read_all_parameters(self, slave_id: int, parameters: list[dict]) -> list[dict]:
        results = []
        for p in parameters:
            target_slave = p.get("slave_id") if p.get("slave_id") is not None else slave_id
            value, quality = await self.read_parameter(
                slave_id=target_slave,
                register_address=p["register_address"],
                register_count=p["register_count"],
                register_type=p["register_type"],
                data_type=p["data_type"],
                byte_order=p["byte_order"],
                scale_factor=p["scale_factor"],
                offset=p["offset"],
                serial_port=p.get("serial_port"),
                baud_rate=p.get("baud_rate"),
                data_bits=p.get("data_bits"),
                parity=p.get("parity"),
                stop_bits=p.get("stop_bits"),
            )
            sf = p.get("scale_factor", 1.0) or 1.0
            off = p.get("offset", 0.0) or 0.0
            raw_value = None
            if value is not None and sf not in (0, 0.0):
                raw_value = (value - off) / sf

            results.append({
                "parameter_id": p["id"],
                "value": value,
                "raw_value": raw_value,
                "quality": quality,
            })
        return results
