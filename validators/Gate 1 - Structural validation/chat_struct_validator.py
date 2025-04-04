"""
---
id: chat_structure
name: Chat Structure Validator
description: Checks message roles and order in a chat-style dataset.
tags: [structure, pydantic, schema]
---
"""

from pydantic import BaseModel, validator, ValidationError
from typing import Literal
from base_validator import BaseValidator

class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ChatSample(BaseModel):
    messages: list[Message]

    @validator("messages")
    def must_start_with_user(cls, v):
        if not v or v[0].role != "user":
            raise ValueError("Chat must start with a user message.")
        return v

class ChatStructureValidator(BaseValidator):

    def _validate(self, data: list[dict]) -> dict[str, Any]:
        errors = []
        for i, item in enumerate(data):
            try:
                ChatSample(**item)
            except ValidationError as e:
                errors.append({"index": i, "error": str(e)})
        if errors:
            return {"status": "fail", "errors": errors}
        return {"status": "pass"}

def run(data: str):
    from pydantic import ValidationError
    try:
        items = json.loads(data)
    except json.JSONDecodeError:
        return {"status": "fail", "reason": "Invalid JSON format."}

    errors = []
    for i, item in enumerate(items):
        try:
            ChatSample(**item)
        except ValidationError as e:
            errors.append({"index": i, "error": str(e)})

    if errors:
        return {"status": "fail", "errors": errors}
    return {"status": "pass"}
    
def validate(data):
    data = data.to_py()
    try:
        item = Item(**data)
        return 'Validation passed.'
    except ValidationError as e:
        return str(e)