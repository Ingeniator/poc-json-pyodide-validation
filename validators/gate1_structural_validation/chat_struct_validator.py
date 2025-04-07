"""
---
id: chat_structure
name: Chat Structure Validator
description: Checks message roles and order in a chat-style dataset.
tags: [structure, pydantic, schema, gate1]
---
"""

from pydantic import BaseModel, validator, ValidationError
from typing import Literal
from validators.base_validator import BaseValidator
import asyncio

class Message(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str

class ChatSample(BaseModel):
    messages: list[Message]

    @field_validator("messages")
    def must_start_with_user(cls, v):
        if not v:
            raise ValueError("Chat must contain messages.")

        roles = [msg.role for msg in v]
        if roles[0] == "user":
            return v
        if roles[0] == "system" and len(roles) > 1 and roles[1] == "user":
            return v

        raise ValueError("Chat must start with a user message, or a system message followed by a user.")

class ChatStructureValidator(BaseValidator):

    async def _validate(self, data: list[dict]) -> list[str]:
        try:
            errors = []
            if not data:
                errors.append("Empty array detected")
                return errors
            for i, item in enumerate(data):
                try:
                    ChatSample(**item)
                except ValidationError as e:
                    errors.append({
                        "index": i,
                        "error": str(e)
                    })
            return errors
        except ValidationError as e:
            return [ str(e) ]