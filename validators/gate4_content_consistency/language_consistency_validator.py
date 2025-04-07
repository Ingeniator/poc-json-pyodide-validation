"""
---
name: Language & Encoding Consistency Validator
description: Checks that request and response messages are in the same, valid language.
tags: [language, encoding, gate4]
---
"""

from validators.base_validator import BaseValidator
from langdetect import detect, DetectorFactory
import re

DetectorFactory.seed = 0

SUPPORTED_LANGUAGES = {
    "en", "zh-cn", "es", "hi", "ar", "bn", "pt", "ru", "ja", "de",
    "jv", "ko", "fr", "tr", "vi", "it", "pl", "uk", "fa"
}

class LanguageConsistencyValidator(BaseValidator):
    async def _validate(self, data: list[dict]) -> list[str]:
        errors = []

        # ✅ Check for a global override for expected language
        try:
            import builtins
            expected_lang = getattr(builtins, "global_expected_lang", None)
        except Exception:
            expected_lang = None

        for i, item in enumerate(data):
            messages = item.get("messages", [])
            if not messages:
                continue

            try:
                roles = [m.get("role", "") for m in messages]
                contents = [m.get("content", "") for m in messages]

                langs = [detect(text) if text.strip() else "unknown" for text in contents]

                unsupported = {l for l in langs if l not in SUPPORTED_LANGUAGES and l != "unknown"}
                if unsupported:
                    errors.append(f"Sample {i}: contains unsupported language(s): {unsupported}")

                user_langs = [langs[j] for j, r in enumerate(roles) if r == "user"]
                assistant_langs = [langs[j] for j, r in enumerate(roles) if r == "assistant"]

                if user_langs and assistant_langs and user_langs[0] != assistant_langs[0]:
                    errors.append(f"Sample {i}: user language '{user_langs[0]}' ≠ assistant language '{assistant_langs[0]}'")

                if expected_lang:
                    if any(l != expected_lang for l in langs if l != "unknown"):
                        errors.append(f"Sample {i}: language mismatch (expected '{expected_lang}', got {set(langs)})")

                for j, content in enumerate(contents):
                    if re.search(r"[�\uFFFD]", content):
                        errors.append(f"Sample {i} Message {j}: contains garbled/invalid characters")

            except Exception as e:
                errors.append(f"Sample {i}: Language detection error: {str(e)}")

        return errors
