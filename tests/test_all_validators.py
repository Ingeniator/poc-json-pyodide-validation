import importlib.util
import inspect
import asyncio
from pathlib import Path
from validators.base_validator import BaseValidator

def get_validator_classes():
    validator_classes = []
    validators_dir = Path(__file__).parent.parent / "validators"  # adjust if needed

    for file_path in validators_dir.rglob("*.py"):
        if file_path.name == "base_validator.py":
            continue  # skip base class

        module_name = "validators_" + file_path.stem.replace(".", "_")
        spec = importlib.util.spec_from_file_location(module_name, file_path)
        module = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(module)
        except Exception as e:
            print(f"⚠️ Failed to load {file_path}: {e}")
            continue

        for name, obj in inspect.getmembers(module):
            if inspect.isclass(obj) and issubclass(obj, BaseValidator) and obj is not BaseValidator:
                validator_classes.append(obj)
                print(f"✅ Found validator class: {name} in {file_path}")

    return validator_classes


async def test_validators_against_unified_json(unified_test_case):
    file_name, data, expectations = unified_test_case
    for ValidatorClass in get_validator_classes():
        validator_name = ValidatorClass.__name__
        expected_status = expectations.get(validator_name)
        if expected_status is None:
            print(f"{validator_name} ⏩ skipped on {file_name}")
            continue  # skip if not specified

        validator = ValidatorClass()
        result = await validator.validate(data)

        assert result["status"] == expected_status, (
            f"{validator_name} in {file_name} expected {expected_status}, got {result['status']}. Result {result}"
        )
        print(f"{validator_name} passed ✅ on {file_name}")
