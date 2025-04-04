"""
---
name: Base Abstract Validator
description: Set validation logic and make pyodide integration
tags: [abstract]
---
"""

from abc import ABC, abstractmethod
from typing import Any
from pyodide.ffi import JsProxy

class BaseValidator(ABC):

    def __init__(self, options: dict[str, Any] = None):
        self.options = options or {}

    @classmethod
    def validate(self, js_data: JsProxy | list[dict[str, Any]]) -> dict[str, Any]:
        """
        Entry point for Pyodide: receives JsProxy or Python list
        """
        if isinstance(js_data, JsProxy):
            data = js_data.to_py()
        else:
            data = js_data
        return self._validate(data)

    @abstractmethod
    def _validate(self, data: list[dict[str, Any]]) -> dict[str, Any]:
        """
        Implement this in subclasses. Must return a dict like:
        {"status": "pass"} or {"status": "fail", "errors": [...]}
        """
        pass
