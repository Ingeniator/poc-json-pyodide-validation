"""
---
name: Base Abstract Validator
description: Set validation logic and make pyodide integration
tags: [abstract]
---
"""

from abc import ABC, abstractmethod
from typing import Any
from pydantic import BaseModel

try:
    from pyodide.ffi import JsProxy
except ImportError:
    JsProxy = None  # We're not in Pyodide

class ValidationErrorDetail(BaseModel):
    error: str
    index: int | None = None  # None for general errors not tied to an item
    field: str |  None = None  # Optional: which field caused the error
    code: str | None = None   # Optional: machine-readable error code

class BaseValidator(ABC):

    def __init__(self, options: dict[str, Any] = None):
        self.options = options or {}

    async def validate(self, js_data: "JsProxy | list[dict[str, Any]]") -> dict[str, Any]:
        """
        Entry point for Pyodide: receives JsProxy or Python list
        """
        if hasattr(js_data, "to_py"):
            data = js_data.to_py()
        else:
            data = js_data
        try:
            errors = await self._validate(data)
            if errors:
                return {
                    "status": "fail",
                    "errors": [e.dict() for e in errors],
                    "validator": self.__class__.__name__
                }
            return {
                "status": "pass",
                "validator": self.__class__.__name__
            }
        except Exception as e:
            return {
                    "status": "fail",
                    "errors": str(e),
                    "validator": self.__class__.__name__
                }

    @abstractmethod
    async def _validate(self, data: list[dict[str, Any]]) -> list[ValidationErrorDetail]:
        """
        Implement this in subclasses. Must return a error array if any
        """
        pass
