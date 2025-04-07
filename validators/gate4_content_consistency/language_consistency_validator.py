"""
---
name: Language & Encoding Consistency Validator
description: Checks that request and response messages are in the same, valid language.
tags: [language, encoding, gate4]
options:
  expected_lang: en
  length_threshold: 20
---
"""

from validators.base_validator import BaseValidator
from langdetect import detect, DetectorFactory
import re

DetectorFactory.seed = 0

# Supported languages (top 10 most-used languages globally)
SUPPORTED_LANGUAGES = {
    "en", "zh-cn", "es", "hi", "ar", "bn", "pt", "ru", "ja", "de"
}

class LanguageConsistencyValidator(BaseValidator):
    def detect_lang(text: str) -> str:
    """Return detected language for text, but if text is very short, return 'unknown'."""
    t = text.strip()
    if len(t) < self.options.get("length_threshold", 20):  # if too short, detection is unreliable
        return "unknown"
    try:
        return detect(t)
    except Exception:
        return "unknown"

    async def _validate(self, data: list[dict]) -> list[str]:
        errors = []

        # Optionally, use a global expected language (if set)
        try:
            import builtins
            expected_lang = self.options.get("expected_lang", None)
        except Exception:
            expected_lang = None

        for i, item in enumerate(data):
            messages = item.get("messages", [])
            if not messages:
                continue

            try:
                # Normalize roles and get content
                roles = [m.get("role", "").strip().lower() for m in messages]
                contents = [m.get("content", "") for m in messages]

                # Detect languages and store a snippet for verbose output
                detected = []
                for text in contents:
                    lang = detect_lang(text) if text.strip() else "unknown"
                    snippet = text.strip()[:30] + ("..." if len(text.strip()) > 30 else "")
                    detected.append((lang, snippet))
                langs = [lang for lang, _ in detected]

                # Report unsupported languages (only if detected language is not 'unknown')
                for lang, snippet in detected:
                    if lang not in SUPPORTED_LANGUAGES and lang != "unknown":
                        errors.append(f"Sample {i}: unsupported language '{lang}' detected in text: \"{snippet}\"")

                # Compare first user and first assistant message languages with verbose examples
                user_examples = [(lang, snippet) for (r, (lang, snippet)) in zip(roles, detected) if r == "user"]
                assistant_examples = [(lang, snippet) for (r, (lang, snippet)) in zip(roles, detected) if r == "assistant"]

                if user_examples and assistant_examples and user_examples[0][0] != assistant_examples[0][0]:
                    errors.append(
                        f"Sample {i}: mismatch - first user message detected as '{user_examples[0][0]}' "
                        f"(e.g., \"{user_examples[0][1]}\") vs. first assistant message detected as '{assistant_examples[0][0]}' "
                        f"(e.g., \"{assistant_examples[0][1]}\")"
                    )

                # If expected language is defined, check each detected language (ignoring 'unknown')
                if expected_lang:
                    for lang, snippet in detected:
                        if lang != expected_lang and lang != "unknown":
                            errors.append(
                                f"Sample {i}: language mismatch - expected '{expected_lang}', but detected '{lang}' in text: \"{snippet}\""
                            )

                # Check for garbled characters (e.g., Unicode replacement character)
                for j, content in enumerate(contents):
                    if re.search(r"[�\uFFFD]", content):
                        errors.append(f"Sample {i} Message {j}: contains garbled/invalid characters")

            except Exception as e:
                errors.append(f"Sample {i}: Language detection error: {str(e)}")

        return errors
