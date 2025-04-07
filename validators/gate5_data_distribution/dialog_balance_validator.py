"""
---
name: Data Balance & Distribution Validator (Dialogs)
description: Checks if the dialogs dataset is balanced by analyzing dialog length and role distribution.
tags: [data, balance, distribution, gate5]
---
"""

from validators.base_validator import BaseValidator
import pandas as pd
import matplotlib.pyplot as plt
import io
import base64

class DialogBalanceValidator(BaseValidator):
    async def _validate(self, data: list[dict]) -> list[str]:
        errors = []
        
        # Assume each item in data is a dialog, e.g.:
        # {
        #   "messages": [
        #       {"role": "user", "content": "Hello"},
        #       {"role": "assistant", "content": "Hi, how can I help?"}
        #   ]
        # }
        
        # Convert dialogs into a DataFrame with one row per dialog
        dialogs = []
        for i, item in enumerate(data):
            dialog = item.get("messages", [])
            if not dialog:
                continue
            dialogs.append({
                "dialog_index": i,
                "length": len(dialog),
                "user_count": sum(1 for msg in dialog if msg.get("role", "").lower() == "user"),
                "assistant_count": sum(1 for msg in dialog if msg.get("role", "").lower() == "assistant")
            })
        
        if not dialogs:
            errors.append("No dialogs found in the dataset.")
            return errors
        
        df = pd.DataFrame(dialogs)
        
        # Check 1: Distribution of dialog lengths
        avg_length = df["length"].mean()
        if avg_length < 2:
            errors.append(f"Dialogs seem too short on average ({avg_length:.1f} turns).")
        elif avg_length > 20:
            errors.append(f"Dialogs seem excessively long on average ({avg_length:.1f} turns).")
        
        # Check 2: Ratio of user to assistant messages
        df["role_ratio"] = df["user_count"] / (df["assistant_count"] + 1e-6)  # avoid division by zero
        avg_ratio = df["role_ratio"].mean()
        if avg_ratio < 0.5:
            errors.append(f"On average, user messages are underrepresented (user/assistant ratio: {avg_ratio:.2f}).")
        elif avg_ratio > 1.5:
            errors.append(f"On average, user messages are overrepresented (user/assistant ratio: {avg_ratio:.2f}).")
        
        # Optional: Create a distribution plot and attach it to errors for review
        fig, ax = plt.subplots(figsize=(6,4))
        df["length"].plot(kind="hist", ax=ax, bins=10)
        ax.set_title("Dialog Length Distribution")
        ax.set_xlabel("Number of turns")
        buf = io.BytesIO()
        plt.tight_layout()
        fig.savefig(buf, format="png")
        plt.close(fig)
        buf.seek(0)
        img_data = base64.b64encode(buf.read()).decode("utf-8")
        errors.append(f"Dialog length distribution plot (base64 PNG): data:image/png;base64,{img_data}")
        
        return errors
