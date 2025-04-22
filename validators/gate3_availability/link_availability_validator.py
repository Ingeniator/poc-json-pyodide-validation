"""
---
name: Link Availability Validator
description: Checks if any links in message contents are reachable (status 200).
tags: [availability, links, gate3]
---
"""

import re
from validators.base_validator import BaseValidator, ValidationErrorDetail

try:
    import js
except ImportError:
    js = None  # for environments like pytest

try:
    from pyodide.ffi import JsException, eval_js
    PYODIDE_AVAILABLE = True
except ImportError:
    class JsException(Exception):
        pass
    PYODIDE_AVAILABLE = False

URL_PATTERN = re.compile(r"https?://[^\s]+")


class LinkAvailabilityValidator(BaseValidator):
    async def _validate(self, data: list[dict]) -> list[ValidationErrorDetail]:
        errors: list[ValidationErrorDetail] = []

        if PYODIDE_AVAILABLE and not hasattr(js, "safeFetch"):
            eval_js("""
                globalThis.safeFetch = async function(url) {
                    try {
                        const res = await fetch(url);
                        return { ok: res.ok, status: res.status };
                    } catch (err) {
                        return {
                            ok: false,
                            status: 0,
                            error: err?.message || "network error"
                        };
                    }
                };
            """)

        total = sum(len(item.get("messages", [])) for item in data)
        current = 0

        for i, sample in enumerate(data):
            messages = sample.get("messages", [])
            for j, msg in enumerate(messages):
                content = msg.get("content", "")
                urls = URL_PATTERN.findall(content)

                for url in urls:
                    try:
                        if PYODIDE_AVAILABLE:
                            response = await js.safeFetch(url)
                        else:
                            response = await js.fetch(url)
                        result = response.to_py() if hasattr(response, "to_py") else response

                        if not result.get("ok", False):
                            errors.append(ValidationErrorDetail(
                                index=i,
                                field=f"messages[{j}].content",
                                error=f"URL {url} returned status {result.get('status')} or error: {result.get('error', '')}",
                                code="unavailable_url"
                            ))
                    except JsException as e:
                        errors.append(ValidationErrorDetail(
                            index=i,
                            field=f"messages[{j}].content",
                            error=f"JS fetch failed for {url}: {str(e)}",
                            code="fetch_error"
                        ))
                    except Exception as e:
                        errors.append(ValidationErrorDetail(
                            index=i,
                            field=f"messages[{j}].content",
                            error=f"Python exception while fetching {url}: {str(e)}",
                            code="fetch_error"
                        ))
            current += 1
            self.report_progress(current, total)
        return errors
