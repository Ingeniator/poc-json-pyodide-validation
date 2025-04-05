import importlib
import pkgutil
import validators
import inspect
from validators.base_validator import BaseValidator
import pytest

def get_validator_classes():
    validator_classes = []
    for _, module_name, is_pkg in pkgutil.iter_modules(validators.__path__, "validators."):
        if is_pkg:
            continue
        module = importlib.import_module(module_name)
        for name, obj in inspect.getmembers(module):
            if inspect.isclass(obj) and issubclass(obj, BaseValidator) and obj is not BaseValidator:
                validator_classes.append(obj)
    return validator_classes

def test_validators_against_unified_json(unified_test_case):
    file_name, data, expectations = unified_test_case

    for ValidatorClass in get_validator_classes():
        validator_name = ValidatorClass.__name__
        expected_status = expectations.get(validator_name)
        if expected_status is None:
            continue  # skip if not specified

        validator = ValidatorClass()
        result = validator.validate(data)

        assert result["status"] == expected_status, (
            f"{validator_name} in {file_name} expected {expected_status}, got {result['status']}"
        )