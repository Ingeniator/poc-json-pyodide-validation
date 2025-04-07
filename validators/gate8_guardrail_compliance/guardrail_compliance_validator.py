"""
---
name: Guardrail Compliance Validator
description: Checks dialogs for toxic/offensive content and potential PII using better-profanity and scrubadub.
tags: [guardrails, toxicity, pii, safety, gate8]
---
"""

from validators.base_validator import BaseValidator
import re

# Attempt to import better_profanity and scrubadub
try:
    from better_profanity import profanity
except ImportError:
    profanity = None

try:
    import scrubadub
except ImportError:
    scrubadub = None

class GuardrailComplianceValidator(BaseValidator):
    async def _validate(self, data: list[dict]) -> list[str]:
        errors = []
        for i, item in enumerate(data):
            messages = item.get("messages", [])
            for j, msg in enumerate(messages):
                content = msg.get("content", "")
                
                # Toxicity check using better-profanity
                if profanity:
                    if profanity.contains_profanity(content):
                        errors.append(
                            f"Sample {i} Message {j}: Toxic content detected in text: \"{content[:30]}...\""
                        )
                else:
                    errors.append(
                        f"Sample {i} Message {j}: better_profanity not installed."
                    )
                
                # PII detection using scrubadub
                if scrubadub:
                    # scrubadub.clean() returns a cleaned version of the text.
                    cleaned = scrubadub.clean(content)
                    if cleaned != content:
                        errors.append(
                            f"Sample {i} Message {j}: Potential PII detected. Cleaned version: \"{cleaned[:30]}...\""
                        )
                else:
                    errors.append(
                        f"Sample {i} Message {j}: scrubadub not installed."
                    )
                
                # Example check: basic formatting issue (e.g., excessive markdown)
                if re.search(r"([*_]{3,})", content):
                    errors.append(
                        f"Sample {i} Message {j}: Formatting issue detected (excessive markdown)."
                    )
        return errors
