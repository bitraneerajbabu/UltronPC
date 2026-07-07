"""UltrON — CPCB Unit Conversion Engine

Centralized conversion service for CPCB parameter unit conversions.
All formulas follow CPCB IT Division Protocol (30-Apr-2015).

Conversion reference:
  CO:      1 ppm  = 1.145 mg/m³
  SO2:     1 ppb  = 2.62  µg/m³
  NO:      1 ppb  = 1.23  µg/m³
  NO2:     1 ppb  = 1.88  µg/m³
  NOx:     1 ppb  = 1.88  µg/m³
  Ozone:   1 ppb  = 1.96  µg/m³
  PM10:    µg/m³  (no conversion)
  PM2.5:   µg/m³  (no conversion)
  Benzene: 1 ppb  = 3.19  µg/m³
  Toluene: 1 ppb  = 3.77  µg/m³
  Xylene:  1 ppb  = 4.34  µg/m³
  CH4:     1 ppb  = 0.65  µg/m³
  NH3:     1 ppb  = 0.70  µg/m³
  HCHO:    1 ppb  = 1.23  µg/m³
  Hg:      1 ppb  = 8.20  µg/m³
"""

from dataclasses import dataclass


@dataclass
class ConversionFormula:
    source_unit: str
    target_unit: str
    factor: float
    description: str


PARAMETER_FORMULAS: dict[str, ConversionFormula] = {
    "CO":       ConversionFormula("ppm",  "mg/m3",  1.145,    "1 ppm = 1.145 mg/m³"),
    "SO2":      ConversionFormula("ppb",  "ug/m3",  2.62,     "1 ppb = 2.62 µg/m³"),
    "NO":       ConversionFormula("ppb",  "ug/m3",  1.23,     "1 ppb = 1.23 µg/m³"),
    "NO2":      ConversionFormula("ppb",  "ug/m3",  1.88,     "1 ppb = 1.88 µg/m³"),
    "NOx":      ConversionFormula("ppb",  "ug/m3",  1.88,     "1 ppb = 1.88 µg/m³"),
    "Ozone":    ConversionFormula("ppb",  "ug/m3",  1.96,     "1 ppb = 1.96 µg/m³"),
    "PM10":     ConversionFormula("ug/m3", "ug/m3", 1.0,      "µg/m³ (no conversion)"),
    "PM2.5":    ConversionFormula("ug/m3", "ug/m3", 1.0,      "µg/m³ (no conversion)"),
    "Benzene":  ConversionFormula("ppb",  "ug/m3",  3.19,     "1 ppb = 3.19 µg/m³"),
    "Toluene":  ConversionFormula("ppb",  "ug/m3",  3.77,     "1 ppb = 3.77 µg/m³"),
    "Xylene":   ConversionFormula("ppb",  "ug/m3",  4.34,     "1 ppb = 4.34 µg/m³"),
    "Eth-Benzene": ConversionFormula("ppb", "ug/m3", 1.0,     "1 ppb = 1.0 µg/m³ (est.)"),
    "MP-Xylene":   ConversionFormula("ppb", "ug/m3", 1.0,     "1 ppb = 1.0 µg/m³ (est.)"),
    "CH4":      ConversionFormula("ppb",  "ug/m3",  0.65,     "1 ppb = 0.65 µg/m³"),
    "NH3":      ConversionFormula("ppb",  "ug/m3",  0.70,     "1 ppb = 0.70 µg/m³"),
    "HCHO":     ConversionFormula("ppb",  "ug/m3",  1.23,     "1 ppb = 1.23 µg/m³"),
    "Hg":       ConversionFormula("ppb",  "ug/m3",  8.20,     "1 ppb = 8.20 µg/m³"),
    "WS":       ConversionFormula("m/s",  "m/s",    1.0,      "m/s (no conversion)"),
    "WD":       ConversionFormula("degree", "degree", 1.0,    "degree (no conversion)"),
    "AT":       ConversionFormula("degC", "degC",   1.0,      "degC (no conversion)"),
    "RH":       ConversionFormula("%",    "%",      1.0,      "% (no conversion)"),
    "BP":       ConversionFormula("hPa",  "hPa",    1.0,      "hPa (no conversion)"),
    "SR":       ConversionFormula("W/m2", "W/m2",  1.0,      "W/m² (no conversion)"),
    "RF":       ConversionFormula("mm",   "mm",     1.0,      "mm (no conversion)"),
    "VWS":      ConversionFormula("m/s",  "m/s",    1.0,      "m/s (no conversion)"),
}


def get_conversion_factor(cpcb_parameter: str) -> float:
    formula = PARAMETER_FORMULAS.get(cpcb_parameter)
    if formula is None:
        return 1.0
    return formula.factor


def get_conversion_info(cpcb_parameter: str) -> ConversionFormula | None:
    return PARAMETER_FORMULAS.get(cpcb_parameter)


def convert_value(value: float, cpcb_parameter: str) -> float:
    factor = get_conversion_factor(cpcb_parameter)
    return round(value * factor, 4)
