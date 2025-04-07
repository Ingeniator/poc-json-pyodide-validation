import os
import json
import pytest

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

@pytest.fixture(params=os.listdir(DATA_DIR))
def unified_test_case(request):
    file_path = os.path.join(DATA_DIR, request.param)
    with open(file_path) as f:
        content = json.load(f)
    return request.param, content["input"], content.get("expect", {})
