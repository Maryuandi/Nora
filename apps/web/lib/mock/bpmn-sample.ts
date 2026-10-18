const shape = (id: string, x: number) => `<bpmndi:BPMNShape bpmnElement="${id}"><dc:Bounds x="${x}" y="60" width="120" height="60"/></bpmndi:BPMNShape>`;

// Illustrative P2P model; "Approve Purchase Order" and "Verify Invoice" have no log activity yet.
export const SAMPLE_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC">
<bpmn:process id="p2p"><bpmn:startEvent id="start" name="PO dibutuhkan"/>
<bpmn:userTask id="t1" name="Create Purchase Order Item"/><bpmn:userTask id="t2" name="Approve Purchase Order"/><bpmn:userTask id="t3" name="Record Goods Receipt"/>
<bpmn:userTask id="t4" name="Verify Invoice"/><bpmn:userTask id="t5" name="Clear Invoice"/><bpmn:endEvent id="end" name="Selesai"/>
<bpmn:sequenceFlow id="f0" sourceRef="start" targetRef="t1"/><bpmn:sequenceFlow id="f1" sourceRef="t1" targetRef="t2"/><bpmn:sequenceFlow id="f2" sourceRef="t2" targetRef="t3"/>
<bpmn:sequenceFlow id="f3" sourceRef="t3" targetRef="t4"/><bpmn:sequenceFlow id="f4" sourceRef="t4" targetRef="t5"/><bpmn:sequenceFlow id="f5" sourceRef="t5" targetRef="end"/></bpmn:process>
<bpmndi:BPMNDiagram><bpmndi:BPMNPlane>
<bpmndi:BPMNShape bpmnElement="start"><dc:Bounds x="30" y="72" width="36" height="36"/></bpmndi:BPMNShape>
${shape("t1", 100)}${shape("t2", 250)}${shape("t3", 400)}${shape("t4", 550)}${shape("t5", 700)}
<bpmndi:BPMNShape bpmnElement="end"><dc:Bounds x="850" y="72" width="36" height="36"/></bpmndi:BPMNShape>
</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`;
