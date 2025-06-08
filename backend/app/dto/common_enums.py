from enum import Enum


class UnitOfMeasure(str, Enum):
    KG = "kg"
    LITERS = "liters"
    METERS = "meters"
    PCS = "pcs"


class Currency(str, Enum):
    USD = "USD"
    SYP = "SYP"

