"""
---
name: Link Availability Validator
description: Checks if any links in message contents are reachable (status 200).
tags: [availability, links, gate3]
---
"""

from validators.base_validator import BaseValidator, ValidationErrorDetail
import re
import js

URL_PATTERN = re.compile(r"https?://[^\s]+")

class LinkAvailabilityValidator(BaseValidator):
    async def _validate(self, data: list[dict]) -> list[ValidationErrorDetail]:
        errors: list[ValidationErrorDetail] = []
        total = sum(len(item.get("messages", [])) for item in data)
        current = 0
        for i, sample in enumerate(data):
            messages = sample.get("messages", [])
            for j, msg in enumerate(messages):
                content = msg.get("content", "")
                urls = URL_PATTERN.findall(content)

                for url in urls:
                    try:
                        resp = await js.fetch(url)
                        if not resp.ok:
                            errors.append(ValidationErrorDetail(
                                index=i,
                                field=f"messages[{j}].content",
                                error=f"URL {url} returned status {resp.status}",
                                code="unavailable_url"
                            ))
                    except BaseException as e:
                        errors.append(ValidationErrorDetail(
                            index=i,
                            field=f"messages[{j}].content",
                            error=f"URL {url} fetch failed: {str(e)}",
                            code="fetch_error"
                        ))
                current += 1
                self.report_progress(current, total)
        return errors
