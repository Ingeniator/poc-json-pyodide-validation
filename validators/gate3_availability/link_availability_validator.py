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
try:
    from pyodide.ffi import JsException
    PYODIDE_AVAILABLE = True
except ImportError:
    class JsException(Exception):
        pass
    PYODIDE_AVAILABLE = False

URL_PATTERN = re.compile(r"https?://[^\s]+")

class LinkAvailabilityValidator(BaseValidator):
    def __init__(self, options=None, progress_callback=None, fetch_func=None):
        super().__init__(options, progress_callback)
        self.fetch = fetch_func or (js.fetch if PYODIDE_AVAILABLE else None)

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
                        response_promise = self.fetch(url)
                        response = await response_promise
                        if hasattr(response, "to_py"):
                            resp = response.to_py()
                        else:
                            resp = response
                        
                        if not resp.get("ok", False):
                            errors.append(ValidationErrorDetail(
                                index=i,
                                field=f"messages[{j}].content",
                                error=f"URL {url} returned status {resp.get('status')}",
                                code="unavailable_url"
                            ))
                    except JsException as e:
                        errors.append(ValidationErrorDetail(
                            index=i,
                            field=f"messages[{j}].content",
                            error=f"Fetch failed for {url}: {str(e)}",
                            code="fetch_error"
                        ))
                    except Exception as e:
                        errors.append(ValidationErrorDetail(
                            index=i,
                            field=f"messages[{j}].content",
                            error=f"URL {url} fetch failed: {str(e)}",
                            code="fetch_error"
                        ))
                current += 1
                self.report_progress(current, total)
        return errors
