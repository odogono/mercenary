#!/usr/bin/env python3
"""Read-only #771 pickup-effect audit; exports numeric evidence, never ROM text."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
LAB = REPO / "research/mercenary-iii-st"
ROOT = REPO / "restricted/mercenary-iii-771/effects"
LEDGER = LAB / "object-interaction-r2-effects-audit.json"
SOURCE_HASH = "71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170"
STATIC_HASH = "ed5aa5ebfab747659c4c31ae33643698e2b67fde92637a29cd93ca8340e5ff39"
HELPER_HASHES = {
    "observe.py": "0ad6f1bd126aae4a35b1143b66dc943c2c70af6bd4a2fbfb66543de64e80fb40",
    "controls.py": "5ddb28f3dc65d6fd0124520facb95a6a23d32b7bd32f2399a9b23aafdb1da405",
    "read_results.py": "0ec9b54199e1031f5d61e02eea5f266f3abf8b4e0905f6ff66711017c04ee712",
}
LABELS = "TOP TAKE DROP LEFT RIGHT SUPPORT_TOP DROP_ACCEPT TAKE_ACCEPT REFUSAL_STRING MODE_HELPER VM OP START DIRECT PICKUP TIMER MODELB".split()
FAMILIES = "child-idle child-candidacy child-active child-unavailable child-unavailable-active child-busy queue-busy queue-continuation queue-overwrite queue-stale threshold-first threshold-and-timer timer-first child-candidacy-drop pcb-idle pcb-repeat pcb-drop-before-timer ore-idle".split()


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local(path: str) -> Path:
    """Manifests name the original main checkout; resolve its restricted suffix."""
    return REPO / "restricted" / path.split("/restricted/", 1)[1]


def number(data: bytes | dict[int, int], address: int, width: int) -> int:
    # Missing debugger memory is an error, rather than an invented zero owner.
    return int.from_bytes(bytes(data[address + i] for i in range(width)), "big")


def parse(path: Path) -> list[dict]:
    records = []
    current = None
    for line in path.read_text(errors="replace").splitlines():
        match = re.match(r"^(" + "|".join(LABELS) + r")=.*#(\d+) \(dec\)", line)
        if match:
            current = {"label": match[1], "memory": {}, "registers": {}}
            records.append(current)
        if current is None:
            continue
        match = re.match(r"^([\da-fA-F]{8}): ((?:[\da-fA-F]{2} ){1,16})", line)
        if match:
            for offset, value in enumerate(match[2].split()):
                current["memory"][int(match[1], 16) + offset] = int(value, 16)
        for register, value in re.findall(r"\b([DA][0-7]) ([\dA-F]{8})", line):
            current["registers"][register] = int(value, 16)
        match = re.match(r"^SR=([\dA-F]+)", line)
        if match:
            current["sr"] = int(match[1], 16)
    for record in records:
        memory = record["memory"]
        record.update(frame=number(memory, 0x7180, 2), ticks=number(memory, 0x53096, 2))
        if record["label"] != "TOP":
            assert record["sr"] & 0x700 == 0x700
        if record["label"] in ("VM", "OP", "START", "DIRECT", "PICKUP", "TIMER", "MODELB"):
            record.update(pc=number(memory, 0x6EDA, 4), stackPointer=number(memory, 0x56D6, 4),
                          queue=number(memory, 0x711C, 2), flags=number(memory, 0x7270, 4),
                          timerBits=number(memory, 0x727E, 2), target=number(memory, 0x7280, 2),
                          availability={str(n): number(memory, 0x7352+n, 1) for n in (5, 6, 28, 115, 24, 119)})
            pointer = record["stackPointer"]
            record["returnStack"] = [number(memory, a, 4) for a in range(pointer, 0x56D6, 4)]
        if record["label"] == "OP":
            record["site"] = record["registers"]["A0"] - 1
    return records


def capture(path: Path) -> dict:
    raw = path.read_bytes()
    n = lambda address, width: number(raw, address, width)
    table = n(0x4BD10, 4)
    pointer = n(0x56D6, 4)
    return dict(sha256=digest(path), frame=n(0x7180, 2), ticks=n(0x53096, 2),
                stack=list(raw[0x563E:0x563E+n(0x563C, 2)]), pc=n(0x6EDA, 4),
                stackPointer=pointer, returnStack=[n(a, 4) for a in range(pointer, 0x56D6, 4)],
                flags=n(0x7270, 4), queue=n(0x711C, 2), timerBits=n(0x727E, 2), target=n(0x7280, 2),
                busy=n(0x723A, 2), continuationBits=n(0x7230, 2), poll=list(raw[0x6EAA:0x6EAC]),
                availability={str(s): n(0x7352+s, 1) for s in (5, 6, 28, 115, 24, 119)},
                objectBits={str(s): n(0x641E+4*s, 1) for s in (38, 127, 216, 218)},
                modelWords={str(a): n(table+a, 2) for a in (0, 0xC2, 0x1B4, 0x278)})


def audit() -> dict:
    for helper, expected in HELPER_HASHES.items():
        assert digest(ROOT / helper) == expected
    static_path = ROOT / "static.json"
    assert digest(static_path) == STATIC_HASH
    static = json.loads(static_path.read_text())
    source_path = REPO / "restricted/mercenary-iii-708/presentation/exact2/start.ram"
    assert digest(source_path) == SOURCE_HASH
    source = source_path.read_bytes()
    for region in static["ranges"] + [v for c in static["closures"].values() for v in c["ranges"]]:
        start, end = (int(a[1:], 16) for a in region["range"])
        assert hashlib.sha256(source[start:end]).hexdigest() == region["sha256"]
    graphs = {}
    for script, count in (("1c", 28), ("73", 28), ("18", 68)):
        graph = static["closures"][script]
        assert len(graph["instructions"]) == count and graph["availability"] == 0xA0
        assert not any(i["name"] in ("object_bit", "set_account", "add_account", "add_accounts", "set_6FF48", "model_swap_a") for i in graph["instructions"])
        sites = {int(i["address"][1:], 16) for i in graph["instructions"]}
        assert all(edge in sites for i in graph["instructions"] for edge in i["edges"])
        graphs[script] = {"object": graph["object"], "sites": count, "availability": 160,
                          "noObjectBitWriter": True, "ranges": graph["ranges"]}
    runs = {}
    traces = {}
    for name in FAMILIES:
        manifest_path = ROOT / name / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        assert manifest["waitSha256"] == "9f0f02ea22a98b4fe4556da86129ad571daa1805ae73e98cdf397b9e55d670eb"
        assert manifest["patchSha256"] == "1ccd3989761d9bf69ad107d8f5a981714719fc232526c7b5246a0737cbfe705f"
        source_prefix = local(manifest["source"])
        assert digest(source_prefix.with_suffix(".ram")) == manifest["sourceRamSha256"]
        assert digest(source_prefix.with_suffix(".sav")) == manifest["sourceSavSha256"]
        log_path = local(manifest["run"]) / "hatari.log"
        records = parse(log_path)
        tops = [r for r in records if r["label"] == "TOP"]
        assert tops
        for previous, following in zip(tops, tops[1:]):
            assert (following["frame"]-previous["frame"]) % 65536 == 1
            assert (following["ticks"]-previous["ticks"]) % 65536 == 11
        ticks = {r["frame"]: r["ticks"] for r in tops}
        for record in records:
            if record["frame"] in ticks:
                assert record["ticks"] == ticks[record["frame"]]
        captures = {p.stem: capture(p) for p in sorted((ROOT/name).glob("f*.ram"), key=lambda p: int(p.stem[1:]))}
        assert sorted(int(cut[1:]) for cut in captures) == sorted(manifest["captures"])
        for cut, state in captures.items():
            assert state["frame"] == (manifest["baseFrame"] + int(cut[1:])) % 65536
            assert state["ticks"] == (manifest["baseTicks"] + 11*int(cut[1:])) % 65536
            assert state["ticks"] == ticks[state["frame"]]
            assert state["objectBits"]["38"] == 0x85 and 38 not in state["stack"]
        requests = []
        for record in records:
            if record["label"] != "OP":
                continue
            site = record["site"]
            opcode = source[site] & 63
            assert record["registers"]["D0"] & 63 == opcode
            if opcode in (0x14, 0x25):
                request = {"frame": record["frame"], "site": site, "kind": "id" if opcode == 0x14 else "packed"}
                if opcode == 0x14:
                    request["messageId"] = source[site+1]
                requests.append(request)
        launches = [{k: record[k] for k in ("label", "frame", "pc", "stackPointer", "returnStack", "queue", "availability")}
                    for record in records if record["label"] in ("START", "DIRECT")]
        timer_arms = []
        for index, record in enumerate(records):
            if record["label"] != "TIMER":
                continue
            site = record["pc"]
            assert source[site] & 63 == 0x26
            delay = number(source, site+1, 2)
            target = number(source, site+3, 2)
            following = next(r for r in records[index+1:] if r["label"] == "VM")
            assert following["frame"] == record["frame"] + 1
            assert following["timerBits"] == (delay-11) % 65536 and following["target"] == target
            timer_arms.append({"frame": record["frame"], "delay": delay, "target": target,
                               "nextFrameCountdown": following["timerBits"]})
        runs[name] = dict(manifestSha256=digest(manifest_path), sourceRamSha256=manifest["sourceRamSha256"],
                          sourceSavSha256=manifest["sourceSavSha256"], waitSha256=manifest["waitSha256"],
                          logSha256=digest(log_path), tops=len(tops), gaps=len(tops)-1,
                          captures=captures, requests=requests, launches=launches, timerArms=timer_arms)
        traces[name] = records
    check_results(runs, traces)
    assert sum(r["tops"] for r in runs.values()) == 4886
    assert sum(r["gaps"] for r in runs.values()) == 4868
    return {"issue": 771, "evidenceClass": "synthetic-original-program", "sourceSha256": SOURCE_HASH,
            "staticLedgerSha256": STATIC_HASH, "helperSha256": HELPER_HASHES,
            "families": 18, "tops": 4886, "elevenTickGaps": 4868,
            "graphs": graphs, "runs": runs}


def check_results(runs: dict, traces: dict) -> None:
    c = lambda name, cut: runs[name]["captures"][f"f{cut}"]
    for name, slot, script in (("child-idle", 216, 28), ("child-candidacy", 216, 28), ("pcb-idle", 218, 115), ("ore-idle", 127, 24)):
        assert c(name, 2)["stack"][0] == slot and c(name, 2)["objectBits"][str(slot)] & 128
        assert c(name, 2)["availability"][str(script)] == 0x20
    for name in ("child-active", "queue-busy", "queue-continuation"):
        assert c(name, 8)["stack"][0] == 216 and c(name, 8)["queue"] == 28
        assert c(name, 8)["availability"]["28"] == 0xA0
    for name in ("child-unavailable", "child-unavailable-active", "queue-stale"):
        assert c(name, 8)["stack"][0] == 216 and c(name, 8)["objectBits"]["216"] & 128
        assert c(name, 8)["queue"] == 0 and c(name, 8)["availability"]["28"] == 0x20
        assert not any(r["label"] == "OP" and r["site"] == 0x75467 for r in traces[name])
    for cut in (2, 30):
        assert c("child-busy", cut)["pc"] == 0x75467 and c("child-busy", cut)["busy"]
        assert c("child-busy", cut)["availability"]["28"] == 0x20
    assert min(r["frame"] for r in traces["child-busy"] if r["label"] == "OP") == 188
    assert c("child-busy", 200)["pc"] == 0x6FF54
    assert c("queue-overwrite", 2)["queue"] == 28 and c("queue-overwrite", 4)["queue"] == 24
    assert c("queue-overwrite", 4)["availability"]["28"] == c("queue-overwrite", 4)["availability"]["24"] == 160
    assert c("queue-overwrite", 300)["stack"][:2] == [127, 216]
    assert c("queue-overwrite", 300)["availability"]["28"] == 160 and c("queue-overwrite", 300)["availability"]["24"] == 32
    assert not any(r["label"] == "OP" and r["site"] == 0x75467 for r in traces["queue-overwrite"])
    for name, frame in (("threshold-first", 210), ("threshold-and-timer", 210), ("timer-first", 153)):
        before = next(r for r in traces[name] if r["label"] == "START" and r["frame"] == frame)
        after = next(r for r in traces[name] if r["label"] == "OP" and r["frame"] == frame)
        assert before["pc"] == 0x766D1 and before["stackPointer"] == 0x56D2
        assert after["site"] == 0x75467 and after["stackPointer"] == 0x56CE
        assert after["returnStack"][0] == 0x766D1 and after["returnStack"][1:] == before["returnStack"]
        assert before["availability"]["28"] == 160 and after["availability"]["28"] == 32
        assert all(216 in state["stack"] and state["objectBits"]["216"] & 128 for cut, state in runs[name]["captures"].items() if int(cut[1:]) >= 3)
    for name in ("threshold-first", "threshold-and-timer"):
        assert any(r["label"] == "START" and r["frame"] == 142 and r["registers"]["D1"] & 0xFFFF == 119 for r in traces[name])
        assert c(name, 3)["queue"] == 28 and c(name, 3)["availability"]["28"] == 160
    assert c("threshold-and-timer", 3)["target"] == 0x5785 and c("threshold-and-timer", 80)["target"] == 0x5CD2
    direct = lambda name: [(r["frame"], r["registers"]["D1"]) for r in traces[name] if r["label"] == "DIRECT"]
    assert direct("threshold-first") == [(335, 0x5CD2), (501, 0x5E18)]
    assert direct("threshold-and-timer") == [(335, 0x5CD2)]
    assert direct("timer-first") == [(142, 0x575A)]
    assert c("child-candidacy", 200)["poll"] == [0x31, 0x69] and c("child-candidacy", 200)["target"] == 0x575A
    assert c("child-candidacy", 400)["poll"] == [0x16, 0x84] and c("child-candidacy", 400)["target"] == 0x5785
    assert c("child-candidacy", 650)["target"] == 0
    assert c("child-idle", 650)["target"] == 0 and c("child-idle", 650)["poll"] == [0x27, 0x73]
    assert c("child-candidacy-drop", 131)["objectBits"]["216"] & 128 == 0
    assert c("child-candidacy-drop", 300)["target"] == 0 and c("child-candidacy-drop", 300)["poll"] == [0x31, 0x69]
    assert direct("pcb-idle") == [(299, 0x4967), (411, 0x4991), (569, 0x49BD)]
    assert direct("pcb-repeat") == [(863, 0x49BD)]
    assert c("pcb-repeat", 70)["target"] == 0x49BD
    assert runs["pcb-repeat"]["sourceRamSha256"] == c("pcb-idle", 700)["sha256"]
    assert runs["pcb-repeat"]["sourceSavSha256"] == digest(ROOT / "pcb-idle/f700.sav")
    for name in ("child-candidacy", "pcb-idle", "pcb-repeat", "pcb-drop-before-timer", "timer-first"):
        for index, record in enumerate(traces[name]):
            if record["label"] == "DIRECT":
                following = next(r for r in traces[name][index+1:] if r["label"] == "VM")
                assert following["availability"] == record["availability"]
    assert c("pcb-drop-before-timer", 51)["objectBits"]["218"] == 4
    assert c("pcb-drop-before-timer", 300)["target"] == 0
    assert c("ore-idle", 400)["flags"] == 0x60A000 and c("ore-idle", 400)["target"] == 0
    assert c("ore-idle", 400)["availability"]["5"] == c("ore-idle", 400)["availability"]["6"] == 0
    assert c("ore-idle", 400)["modelWords"]["194"] == c("ore-idle", 1)["modelWords"]["632"]
    assert c("ore-idle", 400)["modelWords"]["436"] == c("ore-idle", 1)["modelWords"]["0"]
    # Exact native request-site order and frame gaps, rather than a display string.
    expected = {
        "child-idle": [(145, 0x766C6)],
        "child-busy": [(191, 0x766C6)],
        "child-candidacy": [(193, 0x75470), (212, 0x7547F), (232, 0x75494), (255, 0x766C6), (390, 0x754A4), (409, 0x754B3), (433, 0x766C6), (702, 0x754C9), (724, 0x766C6)],
        "pcb-idle": [(143, 0x7468D), (166, 0x766C6), (301, 0x746B1), (324, 0x766C6), (413, 0x746DB), (436, 0x766C6), (571, 0x74707), (594, 0x766C6)],
        "pcb-repeat": [(865, 0x74707), (888, 0x766C6)],
        "ore-idle": [(143, 0x76245), (162, 0x76257), (184, 0x76717), (192, 0x7626D), (214, 0x76717), (222, 0x76292), (261, 0x76717), (275, 0x75F16), (298, 0x76717), (309, 0x75F3A), (329, 0x75F4F), (361, 0x75F65), (400, 0x766C6)],
    }
    for name, sequence in expected.items():
        assert [(r["frame"], r["site"]) for r in runs[name]["requests"]] == sequence
    assert [(r["frame"]-4, r["site"]) for r in runs["queue-overwrite"]["requests"]] == expected["ore-idle"]
    for name in ("child-active", "child-unavailable", "child-unavailable-active", "queue-busy", "queue-continuation", "queue-stale"):
        assert runs[name]["requests"] == []


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="update the portable numeric ledger after all assertions pass")
    args = parser.parse_args()
    result = json.dumps(audit(), indent=2) + "\n"
    if args.write:
        LEDGER.write_text(result)
    else:
        assert LEDGER.read_text() == result, "portable ledger differs; inspect evidence before --write"
    print("PASS: 18 synthetic families, 4,886 tops, 4,868 eleven-tick gaps; availability, acquisition, nesting, timers and ordered requests")
