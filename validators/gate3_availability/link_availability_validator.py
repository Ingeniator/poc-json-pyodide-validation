"""
---
name: Link Availability Validator
description: Checks if any links in message contents are reachable (status 200).
tags: [availability, links, gate3]
---
"""

from validators.base_validator import BaseValidator
import re
import js

URL_PATTERN = re.compile(r"https?://[^\s]+")

class LinkAvailabilityValidator(BaseValidator):
    async def _validate(self, data: list[dict]) -> list[str]:
        errors = []

        for i, sample in enumerate(data):
            for j, msg in enumerate(sample.get("messages", [])):
                content = msg.get("content", "")
                urls = URL_PATTERN.findall(content)

                for url in urls:
                    try:
                        resp = await js.fetch(url)
                        if not resp.ok:
                            errors.append(f"Sample {i} Message {j}: URL {url} returned status {resp.status}")
                    except Exception as e:
                        errors.append(f"Sample {i} Message {j}: URL {url} fetch failed: {e}")

        return errors
