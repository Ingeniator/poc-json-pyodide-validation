"""
---
name: Quantity / Size Check Validator
description: Checks that the dataset has enough dialogs for meaningful training.
tags: [quantity, size, gate6]
options:
  min_samples: 50
  min_turns: 2
---
"""

from validators.base_validator import BaseValidator

class QuantitySizeValidator(BaseValidator):
    await def _validate(self, data: list[dict]) -> list[str]:
        errors = []
        # Minimum number of dialogs required for training; default is 50.
        min_samples = self.options.get("min_samples", 50)
        if len(data) < min_samples:
            errors.append(f"Dataset has only {len(data)} dialogs, but at least {min_samples} are required.")

        # Optional: Check that each dialog has at least a minimum number of turns.
        min_turns = self.options.get("min_turns", 2)
        for i, item in enumerate(data):
            # Assuming each dialog is stored under the key "dialog"
            dialog = item.get("dialog", [])
            if len(dialog) < min_turns:
                errors.append(f"Dialog {i} has only {len(dialog)} turn(s); at least {min_turns} turns are recommended.")

        return errors
