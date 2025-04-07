"""
---
name: Deduplication Validator
description: Detects duplicate chat samples by comparing full message arrays.
tags: [decontamination, deduplication, gate2]
---
"""

from validators.base_validator import BaseValidator
import json
import asyncio

class DeduplicationValidator(BaseValidator):
    async def _validate(self, data: list[dict]) -> list[str]:
        seen = set()
        errors = []

        for i, item in enumerate(data):
            # Convert the "messages" list into a JSON string for hashing
            messages = item.get("messages")
            key = json.dumps(messages, sort_keys=True)

            if key in seen:
                errors.append(f"Sample {i} is a duplicate of an earlier sample.")
            else:
                seen.add(key)

        return errors
