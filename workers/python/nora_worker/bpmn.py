"""BPMN 2.0 validation: safe XML parse (no DTD/entities), task extraction, PM4Py Petri net conversion."""

import re
from pathlib import Path

import pm4py
from lxml import etree

TASK_TAGS = {"task", "userTask", "serviceTask", "manualTask", "scriptTask", "sendTask", "receiveTask", "businessRuleTask", "callActivity", "subProcess"}
NODE_TAGS = TASK_TAGS | {"startEvent", "endEvent", "intermediateCatchEvent", "intermediateThrowEvent", "boundaryEvent", "exclusiveGateway", "parallelGateway", "inclusiveGateway", "eventBasedGateway", "complexGateway", "sequenceFlow"}


def _local(tag) -> str:
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def validate_bpmn(path: Path) -> dict:
    result = {"valid": False, "readable": False, "tasks": [], "elementCount": 0, "error": None, "pm4py": None}
    raw = path.read_bytes()
    if re.search(rb"<!DOCTYPE|<!ENTITY", raw[:1 << 16], re.I):
        result["error"] = "BPMN dengan DOCTYPE/ENTITY ditolak (perlindungan XXE)."
        return result
    try:
        parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False)
        root = etree.fromstring(raw, parser)
    except etree.XMLSyntaxError as e:
        result["error"] = f"XML tidak valid: {str(e)[:200]}"
        return result
    if _local(root.tag) != "definitions":
        result["error"] = "Bukan dokumen BPMN 2.0 (elemen definitions tidak ditemukan)."
        return result
    tasks, count = [], 0
    for el in root.iter():
        name = _local(el.tag)
        if name in NODE_TAGS:
            count += 1
        if name in TASK_TAGS:
            tasks.append({"id": el.get("id") or "", "name": (el.get("name") or el.get("id") or "").strip()})
    result.update(readable=True, tasks=tasks, elementCount=count)
    if not tasks:
        result["error"] = "Model tidak memiliki task."
        return result
    try:
        bpmn = pm4py.read_bpmn(str(path))
        net, _, _ = pm4py.convert_to_petri_net(bpmn)
        result["pm4py"] = {"places": len(net.places), "transitions": len(net.transitions)}
        result["valid"] = True
    except Exception as e:  # PM4Py raises a variety of errors for unsupported constructs
        result["error"] = f"Konversi PM4Py gagal: {str(e)[:200]}"
    return result
