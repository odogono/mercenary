from __future__ import annotations

import base64
import hashlib
import json
import re
from pathlib import Path
from typing import Any

from .core import LabError


MCJ_MAX_DEPTH = 64
MCJ_MAX_NODES = 1_000_000
MCJ_MAX_STRING_BYTES = 1024 * 1024
INT64_MIN = -(2**63)
INT64_MAX = 2**63 - 1

DIGEST_FAMILIES = {
    "member",
    "unsigned-manifest",
    "package",
    "resolved-content-set",
    "execution-environment",
    "save-envelope",
    "consent",
    "xpc-envelope",
    "verification-adapter",
}
VERSIONED_CONTRACT_FAMILIES = {
    "content-manifest",
    "resource-graph",
    "signature",
    "lua-host-abi",
    "transition",
    "state",
    "save",
    "migration",
    "xpc",
    "diagnostic",
    "verification-adapter",
}

SAFE_DIAGNOSTIC_FIELDS = {
    "schemaMajor",
    "schemaMinor",
    "code",
    "severity",
    "phase",
    "safeContentSetId",
    "safeModuleId",
    "safeRecordId",
    "safeContext",
}
UNSAFE_DIAGNOSTIC_TERMS = {
    "path",
    "payload",
    "value",
    "hash",
    "sha256",
    "digest",
    "source",
    "lua",
    "content",
    "bytes",
    "excerpt",
}


def _mcj_sort_key(value: str) -> bytes:
    try:
        value.encode("utf-8")
        return value.encode("utf-16-be")
    except UnicodeError as error:
        raise LabError("MCJ-1 strings must contain valid Unicode scalar values") from error


def _validate_mcj(value: Any, *, depth: int, counter: list[int]) -> None:
    if depth > MCJ_MAX_DEPTH:
        raise LabError(f"MCJ-1 nesting exceeds depth {MCJ_MAX_DEPTH}")
    counter[0] += 1
    if counter[0] > MCJ_MAX_NODES:
        raise LabError(f"MCJ-1 document exceeds node limit {MCJ_MAX_NODES}")

    if value is None or isinstance(value, bool):
        return
    if isinstance(value, float):
        raise LabError("MCJ-1 forbids floating-point values")
    if isinstance(value, int):
        if not INT64_MIN <= value <= INT64_MAX:
            raise LabError("MCJ-1 integer is outside signed Int64")
        return
    if isinstance(value, str):
        try:
            encoded = value.encode("utf-8")
        except UnicodeEncodeError as error:
            raise LabError("MCJ-1 strings must be valid UTF-8") from error
        if len(encoded) > MCJ_MAX_STRING_BYTES:
            raise LabError(f"MCJ-1 string limit is {MCJ_MAX_STRING_BYTES} UTF-8 bytes")
        return
    if isinstance(value, list):
        for item in value:
            _validate_mcj(item, depth=depth + 1, counter=counter)
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise LabError("MCJ-1 object keys must be strings")
            _validate_mcj(key, depth=depth + 1, counter=counter)
            _validate_mcj(item, depth=depth + 1, counter=counter)
        return
    raise LabError(f"MCJ-1 does not support {type(value).__name__}")


def _ordered_mcj(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _ordered_mcj(value[key]) for key in sorted(value, key=_mcj_sort_key)}
    if isinstance(value, list):
        return [_ordered_mcj(item) for item in value]
    return value


def mcj_bytes(value: Any) -> bytes:
    """Encode one already-parsed value using Mercenary Canonical JSON v1."""
    _validate_mcj(value, depth=0, counter=[0])
    text = json.dumps(_ordered_mcj(value), ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    return text.encode("utf-8")


def parse_mcj_bytes(raw: bytes) -> Any:
    """Preflight and parse exact MCJ-1 bytes without normalizing hostile input."""
    if raw.startswith(b"\xef\xbb\xbf"):
        raise LabError("MCJ-1 forbids a UTF-8 BOM")
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_reject_duplicate_pairs)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise LabError(f"Invalid MCJ-1 JSON: {error}") from error
    if raw != mcj_bytes(value):
        raise LabError("JSON input is valid but not canonical MCJ-1")
    return value


def domain_digest(family: str, content: bytes) -> str:
    if family not in DIGEST_FAMILIES:
        raise LabError(f"Unknown implementation-contract digest family: {family}")
    prefix = f"mercenary/{family}/v1\0".encode("ascii")
    return hashlib.sha256(prefix + content).hexdigest()


def _reject_duplicate_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise LabError(f"JSON object contains duplicate key {key!r}")
        result[key] = value
    return result


def _load_json(path: Path) -> Any:
    try:
        raw = path.read_bytes()
    except OSError as error:
        raise LabError(f"Could not read implementation contract {path}: {error}") from error
    if raw.startswith(b"\xef\xbb\xbf"):
        raise LabError(f"Implementation contract {path} contains a forbidden UTF-8 BOM")
    try:
        return json.loads(raw.decode("utf-8"), object_pairs_hook=_reject_duplicate_pairs)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise LabError(f"Could not parse implementation contract {path}: {error}") from error


def validate_safe_diagnostic(diagnostic: dict[str, Any]) -> None:
    unknown = set(diagnostic) - SAFE_DIAGNOSTIC_FIELDS
    if unknown:
        raise LabError(f"unsafe diagnostic fields: {', '.join(sorted(unknown))}")
    if diagnostic.get("schemaMajor") != 1 or diagnostic.get("schemaMinor") != 0:
        raise LabError("Diagnostic schema version must be 1.0")
    if diagnostic.get("severity") not in {"info", "warning", "error", "fatal"}:
        raise LabError("Diagnostic severity is invalid")
    if not isinstance(diagnostic.get("code"), str) or not re.fullmatch(r"[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+", diagnostic["code"]):
        raise LabError("Diagnostic code must be a stable dotted identifier")
    context = diagnostic.get("safeContext", {})
    if not isinstance(context, dict):
        raise LabError("Diagnostic safeContext must be an object")
    for key, value in context.items():
        lowered = key.lower()
        if any(term in lowered for term in UNSAFE_DIAGNOSTIC_TERMS):
            raise LabError(f"unsafe diagnostic context field: {key}")
        if not isinstance(value, (bool, int, str)) or isinstance(value, float):
            raise LabError(f"Diagnostic context {key} must be a safe scalar")


def validate_resource_graph(graph: dict[str, Any]) -> None:
    records = graph.get("records")
    edges = graph.get("referenceEdges")
    if not isinstance(records, list) or not isinstance(edges, list):
        raise LabError("ResourceGraph records and referenceEdges must be arrays")
    identifiers: set[str] = set()
    for record in records:
        identifier = record.get("id") if isinstance(record, dict) else None
        if not isinstance(identifier, str):
            raise LabError("ResourceGraph record ID must be a string")
        if identifier in identifiers:
            raise LabError(f"ResourceGraph contains duplicate record {identifier}")
        identifiers.add(identifier)
    for edge in edges:
        if not isinstance(edge, dict):
            raise LabError("ResourceGraph reference edge must be an object")
        source = edge.get("source")
        target = edge.get("target")
        if source not in identifiers or target not in identifiers:
            raise LabError(f"ResourceGraph contains dangling reference {source!r} -> {target!r}")


def _validate_cddl(path: Path) -> None:
    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        raise LabError(f"Could not read CDDL contract {path}: {error}") from error
    if "\t" in source:
        raise LabError(f"CDDL contract {path} contains tabs")
    if "schema-major = 1" not in source or "schema-minor = 0" not in source:
        raise LabError(f"CDDL contract {path} must declare schema version 1.0")
    if not re.search(r"(?m)^[a-z][a-z0-9-]*\s*=", source):
        raise LabError(f"CDDL contract {path} contains no definitions")
    pairs = {"{": "}", "[": "]", "(": ")"}
    stack: list[str] = []
    in_string = False
    escaped = False
    for character in source:
        if in_string:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
            continue
        if character == '"':
            in_string = True
        elif character in pairs:
            stack.append(pairs[character])
        elif character in pairs.values():
            if not stack or stack.pop() != character:
                raise LabError(f"CDDL contract {path} has unbalanced delimiters")
    if in_string or stack:
        raise LabError(f"CDDL contract {path} has unbalanced delimiters")


class _StrictCBORDecoder:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.offset = 0

    def decode(self) -> Any:
        value, _ = self._item(0)
        if self.offset != len(self.data):
            raise LabError("Deterministic CBOR forbids trailing bytes")
        return value

    def _take(self, count: int) -> bytes:
        end = self.offset + count
        if end > len(self.data):
            raise LabError("CBOR item is truncated")
        value = self.data[self.offset:end]
        self.offset = end
        return value

    def _argument(self, additional: int) -> int:
        if additional < 24:
            return additional
        widths = {24: 1, 25: 2, 26: 4, 27: 8}
        if additional not in widths:
            raise LabError("Deterministic CBOR forbids indefinite or reserved arguments")
        width = widths[additional]
        value = int.from_bytes(self._take(width), "big")
        minimum = {1: 24, 2: 256, 4: 65536, 8: 2**32}[width]
        if value < minimum:
            raise LabError("Deterministic CBOR requires shortest integer encoding")
        return value

    def _item(self, depth: int) -> tuple[Any, bytes]:
        if depth > 64:
            raise LabError("CBOR nesting exceeds depth 64")
        start = self.offset
        initial = self._take(1)[0]
        major = initial >> 5
        additional = initial & 0x1F
        if major == 6:
            raise LabError("Deterministic CBOR profile forbids tags")
        if major == 7:
            if additional == 20:
                return False, self.data[start:self.offset]
            if additional == 21:
                return True, self.data[start:self.offset]
            if additional == 22:
                return None, self.data[start:self.offset]
            raise LabError("Deterministic CBOR profile forbids floats and simple values")
        argument = self._argument(additional)
        if major == 0:
            if argument > INT64_MAX:
                raise LabError("CBOR integer is outside signed Int64")
            return argument, self.data[start:self.offset]
        if major == 1:
            value = -1 - argument
            if value < INT64_MIN:
                raise LabError("CBOR integer is outside signed Int64")
            return value, self.data[start:self.offset]
        if major == 2:
            value = self._take(argument)
            return value, self.data[start:self.offset]
        if major == 3:
            try:
                value = self._take(argument).decode("utf-8")
            except UnicodeDecodeError as error:
                raise LabError("CBOR text must be valid UTF-8") from error
            return value, self.data[start:self.offset]
        if major == 4:
            result = [self._item(depth + 1)[0] for _ in range(argument)]
            return result, self.data[start:self.offset]
        if major == 5:
            result: dict[int, Any] = {}
            previous_key_bytes: bytes | None = None
            for _ in range(argument):
                key, key_bytes = self._item(depth + 1)
                if not isinstance(key, int) or isinstance(key, bool) or key < 0:
                    raise LabError("Protocol CBOR map keys must be unsigned integers")
                if previous_key_bytes is not None and key_bytes <= previous_key_bytes:
                    raise LabError("Deterministic CBOR map keys are duplicate or out of order")
                previous_key_bytes = key_bytes
                if key in result:
                    raise LabError("Deterministic CBOR forbids duplicate map keys")
                result[key] = self._item(depth + 1)[0]
            return result, self.data[start:self.offset]
        raise LabError(f"Unsupported CBOR major type {major}")


def _decode_base64url(value: str) -> bytes:
    if "=" in value:
        raise LabError("Signature fields must use unpadded base64url")
    try:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except (ValueError, base64.binascii.Error) as error:
        raise LabError("Signature field is not base64url") from error


# Compact RFC 8032 verification oracle used only for public-safe golden vectors.
_Q = 2**255 - 19
_L = 2**252 + 27742317777372353535851937790883648493
_D = (-121665 * pow(121666, _Q - 2, _Q)) % _Q
_I = pow(2, (_Q - 1) // 4, _Q)


def _xrecover(y: int) -> int:
    xx = (y * y - 1) * pow(_D * y * y + 1, _Q - 2, _Q) % _Q
    x = pow(xx, (_Q + 3) // 8, _Q)
    if (x * x - xx) % _Q:
        x = x * _I % _Q
    return x if x % 2 == 0 else _Q - x


_B_Y = 4 * pow(5, _Q - 2, _Q) % _Q
_B = (_xrecover(_B_Y), _B_Y)


def _edwards(point: tuple[int, int], other: tuple[int, int]) -> tuple[int, int]:
    x1, y1 = point
    x2, y2 = other
    product = _D * x1 * x2 * y1 * y2 % _Q
    x3 = (x1 * y2 + x2 * y1) * pow(1 + product, _Q - 2, _Q) % _Q
    y3 = (y1 * y2 + x1 * x2) * pow(1 - product, _Q - 2, _Q) % _Q
    return x3, y3


def _scalarmult(point: tuple[int, int], scalar: int) -> tuple[int, int]:
    result = (0, 1)
    addend = point
    while scalar:
        if scalar & 1:
            result = _edwards(result, addend)
        addend = _edwards(addend, addend)
        scalar >>= 1
    return result


def _decode_point(encoded: bytes) -> tuple[int, int]:
    if len(encoded) != 32:
        raise LabError("Ed25519 point must contain 32 bytes")
    y = int.from_bytes(encoded, "little") & ((1 << 255) - 1)
    if y >= _Q:
        raise LabError("Ed25519 point is not canonical")
    x = _xrecover(y)
    if x & 1 != encoded[31] >> 7:
        x = _Q - x
    point = (x, y)
    if _scalarmult(point, _L) != (0, 1):
        raise LabError("Ed25519 point is outside the prime-order subgroup")
    return point


def _verify_ed25519(public_key: bytes, message: bytes, signature: bytes) -> None:
    if len(public_key) != 32 or len(signature) != 64:
        raise LabError("Ed25519 key/signature length is invalid")
    scalar = int.from_bytes(signature[32:], "little")
    if scalar >= _L:
        raise LabError("Ed25519 signature scalar is not canonical")
    public_point = _decode_point(public_key)
    signature_point = _decode_point(signature[:32])
    challenge = int.from_bytes(hashlib.sha512(signature[:32] + public_key + message).digest(), "little") % _L
    if _scalarmult(_B, scalar) != _edwards(signature_point, _scalarmult(public_point, challenge)):
        raise LabError("Ed25519 golden signature does not verify")


def validate_implementation_contracts(root: Path) -> dict[str, int]:
    if not root.is_dir():
        raise LabError(f"Implementation contract root does not exist: {root}")

    registry = _load_json(root / "version-registry.json")
    if registry.get("schemaMajor") != 1 or registry.get("schemaMinor") != 0:
        raise LabError("Implementation contract registry must declare schema version 1.0")
    families = registry.get("families")
    if not isinstance(families, list) or not families:
        raise LabError("Implementation contract registry must list versioned families")
    names = [family.get("name") for family in families if isinstance(family, dict)]
    if len(names) != len(set(names)) or any(not isinstance(name, str) for name in names):
        raise LabError("Implementation contract registry family names must be unique strings")
    if set(names) != VERSIONED_CONTRACT_FAMILIES:
        raise LabError("Implementation contract registry does not contain the exact v1 family set")
    for family in families:
        if family.get("major") != 1 or family.get("minor") != 0:
            raise LabError(f"Implementation contract family {family.get('name')} must declare version 1.0")

    try:
        from jsonschema import Draft202012Validator
    except ImportError as error:
        raise LabError("Implementation contract validation requires jsonschema==4.26.0") from error

    schema_paths = sorted((root / "json-schema").glob("*.schema.json"))
    schema_by_name: dict[str, dict[str, Any]] = {}
    schema_ids: set[str] = set()
    for path in schema_paths:
        schema = _load_json(path)
        if not isinstance(schema, dict):
            raise LabError(f"JSON Schema {path} must be an object")
        try:
            Draft202012Validator.check_schema(schema)
        except Exception as error:
            raise LabError(f"Invalid Draft 2020-12 schema {path}: {error}") from error
        identifier = schema.get("$id")
        if not isinstance(identifier, str) or identifier in schema_ids:
            raise LabError(f"JSON Schema {path} must have a unique $id")
        schema_ids.add(identifier)
        schema_by_name[path.name] = schema

    cddl_paths = sorted((root / "cddl").glob("*.cddl"))
    for path in cddl_paths:
        _validate_cddl(path)

    vectors = _load_json(root / "vectors" / "index.json")
    positive = vectors.get("positive", [])
    negative = vectors.get("negative", [])
    if not isinstance(positive, list) or not isinstance(negative, list):
        raise LabError("Vector index positive/negative entries must be arrays")
    for vector in positive:
        kind = vector.get("kind")
        if kind == "json":
            path = root / "vectors" / vector["path"]
            value = _load_json(path)
            schema = schema_by_name.get(vector["schema"])
            if schema is None:
                raise LabError(f"Positive vector references unknown schema {vector['schema']}")
            errors = list(Draft202012Validator(schema).iter_errors(value))
            if errors:
                raise LabError(f"Positive vector {path} fails schema: {errors[0].message}")
            mcj_bytes(value)
            if vector["schema"] == "resource-graph.schema.json":
                validate_resource_graph(value)
            if vector["schema"] == "diagnostic.schema.json":
                validate_safe_diagnostic(value)
        elif kind == "cbor":
            encoded = bytes.fromhex(vector["hex"])
            if len(encoded) > 4 * 1024 * 1024:
                raise LabError("Positive CBOR vector exceeds envelope limit")
            _StrictCBORDecoder(encoded).decode()
        elif kind == "digest":
            content = bytes.fromhex(vector["contentHex"])
            if domain_digest(vector["family"], content) != vector["expected"]:
                raise LabError(f"Digest vector {vector['name']} does not match")
        elif kind == "signature":
            public_key = _decode_base64url(vector["publicKey"])
            signature = _decode_base64url(vector["signature"])
            message = bytes.fromhex(vector["messageHex"])
            if hashlib.sha256(public_key).hexdigest() != vector["keyId"]:
                raise LabError(f"Signature vector {vector['name']} key ID does not match")
            _verify_ed25519(public_key, message, signature)
        else:
            raise LabError(f"Unknown positive vector kind: {kind}")

    for vector in negative:
        kind = vector.get("kind")
        try:
            if kind == "json":
                value = _load_json(root / "vectors" / vector["path"])
                schema = schema_by_name[vector["schema"]]
                errors = list(Draft202012Validator(schema).iter_errors(value))
                if errors:
                    raise LabError(errors[0].message)
                mcj_bytes(value)
            elif kind == "cbor":
                _StrictCBORDecoder(bytes.fromhex(vector["hex"])).decode()
            else:
                raise LabError(f"Unknown negative vector kind: {kind}")
        except (LabError, ValueError, KeyError):
            continue
        raise LabError(f"Negative vector {vector.get('name', '<unnamed>')} was accepted")

    malicious = _load_json(root / "malicious" / "index.json")
    fixtures = malicious.get("fixtures", [])
    if malicious.get("schemaMajor") != 1 or malicious.get("schemaMinor") != 0 or not isinstance(fixtures, list):
        raise LabError("Malicious fixture index must declare schema version 1.0 and a fixture array")
    fixture_ids: set[str] = set()
    for fixture in fixtures:
        if not isinstance(fixture, dict):
            raise LabError("Malicious fixture entry must be an object")
        fixture_id = fixture.get("id")
        code = fixture.get("expectedCode")
        if not isinstance(fixture_id, str) or fixture_id in fixture_ids:
            raise LabError("Malicious fixture IDs must be unique strings")
        fixture_ids.add(fixture_id)
        if not isinstance(code, str) or not re.fullmatch(r"[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+", code):
            raise LabError(f"Malicious fixture {fixture_id} has an invalid expected code")
        sources = sum(key in fixture for key in ("path", "inlineHex", "generator"))
        if sources != 1:
            raise LabError(f"Malicious fixture {fixture_id} must declare exactly one source")
        if "path" in fixture:
            path = root / "malicious" / fixture["path"]
            if path.parent != (root / "malicious") or not path.is_file():
                raise LabError(f"Malicious fixture {fixture_id} path is missing or escapes its directory")
            try:
                path.read_text(encoding="utf-8")
            except (OSError, UnicodeError) as error:
                raise LabError(f"Malicious fixture {fixture_id} must be tracked UTF-8 text") from error
        elif "inlineHex" in fixture:
            try:
                bytes.fromhex(fixture["inlineHex"])
            except (TypeError, ValueError) as error:
                raise LabError(f"Malicious fixture {fixture_id} inlineHex is invalid") from error

    fuzz = _load_json(root / "fuzz-targets.json")
    targets = fuzz.get("targets", [])
    if fuzz.get("schemaMajor") != 1 or fuzz.get("schemaMinor") != 0 or fuzz.get("engine") != "LLVM-libFuzzer":
        raise LabError("Fuzz target registry must declare v1.0 and LLVM-libFuzzer")
    if fuzz.get("durationsSecondsPerTarget") != {"pullRequest": 30, "nightly": 600, "release": 7200}:
        raise LabError("Fuzz target registry has the wrong PR/nightly/release durations")
    if fuzz.get("sanitizers") != ["address", "undefined"] or fuzz.get("retainEveryCrashCorpus") is not True:
        raise LabError("Fuzz target registry must use address/undefined sanitizers and retain every crash corpus")
    if not isinstance(targets, list) or len({target.get("name") for target in targets if isinstance(target, dict)}) != len(targets):
        raise LabError("Fuzz targets must be an array with unique names")
    for target in targets:
        if not isinstance(target, dict) or set(target) != {"name", "entry", "seed"}:
            raise LabError("Each fuzz target must declare only name, entry, and seed")
        seed = root / target["seed"]
        if not seed.exists() or not seed.resolve().is_relative_to(root.resolve()):
            raise LabError(f"Fuzz target {target['name']} seed is missing or escapes the contract root")

    return {
        "schemaMajor": registry["schemaMajor"],
        "schemaMinor": registry["schemaMinor"],
        "jsonSchemas": len(schema_paths),
        "cddlFiles": len(cddl_paths),
        "positiveVectors": len(positive),
        "negativeVectors": len(negative),
        "maliciousFixtures": len(fixtures),
        "fuzzTargets": len(targets),
    }
