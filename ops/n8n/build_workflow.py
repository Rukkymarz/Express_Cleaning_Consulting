"""Builds ecc-operator-failure-alert.json from evaluate.js (embedded verbatim).
Run: python3 ops/n8n/build_workflow.py   — output is deterministic."""
import json, pathlib
here = pathlib.Path(__file__).parent
evaluator = (here / "evaluate.js").read_text()
glue = r"""
// ---- n8n glue (deterministic; no model calls) ----
const staticData = $getWorkflowStaticData('global');
const item = $input.first().json || {};
const probe = item.error
  ? { statusCode: 0, error: String(item.error.message || item.error.code || item.error).slice(0, 120) }
  : { statusCode: item.statusCode, body: item.body };
const result = evaluate(probe, staticData.monitor, Date.now());
staticData.monitor = result.state;
return [{ json: { ...result, probeStatus: probe.statusCode, checkedAt: new Date().toISOString() } }];
"""
API = "https://express-cleaning-edge-api.rukkymarz.workers.dev/api/v1/ops/delivery-health"

def node(name, typ, ver, pos, params, **extra):
    return {"parameters": params, "name": name, "type": typ, "typeVersion": ver, "position": pos, **extra}

nodes = [
    node("Every 15 minutes", "n8n-nodes-base.scheduleTrigger", 1.2, [0, 0],
         {"rule": {"interval": [{"field": "minutes", "minutesInterval": 15}]}}),
    node("Probe delivery health", "n8n-nodes-base.httpRequest", 4.2, [240, 0], {
        "url": API,
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "options": {"timeout": 10000, "response": {"response": {"fullResponse": True, "neverError": True, "responseFormat": "json"}}},
    }, retryOnFail=True, maxTries=3, waitBetweenTries=5000, onError="continueRegularOutput",
       notes="Credential: create an 'HTTP Header Auth' credential named 'ECC Ops Health Token' (Name: Authorization, Value: Bearer <token>). Stored encrypted by n8n; never in this file."),
    node("Evaluate (deterministic)", "n8n-nodes-base.code", 2, [480, 0],
         {"mode": "runOnceForAllItems", "language": "javaScript", "jsCode": evaluator + glue}),
    node("Route by action", "n8n-nodes-base.switch", 3.2, [720, 0], {
        "rules": {"values": [
            {"conditions": {"options": {"caseSensitive": True, "typeValidation": "strict", "version": 2},
                            "combinator": "and",
                            "conditions": [{"leftValue": "={{ $json.action }}", "rightValue": v,
                                            "operator": {"type": "string", "operation": "equals"}}]},
             "renameOutput": True, "outputKey": v}
            for v in ("alert", "recovery", "terminal")]},
        "options": {"fallbackOutput": "extra", "renamedFallbackOutput": "none"},
    }),
    node("Format message", "n8n-nodes-base.set", 3.4, [960, -100], {
        "assignments": {"assignments": [
            {"id": "s1", "name": "subject", "type": "string",
             "value": "=[ECC {{ $json.alert.severity.toUpperCase() }}] {{ $json.alert.title }}"},
            {"id": "s2", "name": "text", "type": "string",
             "value": "={{ $json.alert.title }}\nProblems: {{ ($json.alert.problems || []).join(', ') || 'none' }}\nCounts: {{ JSON.stringify($json.alert.counts || {}) }}\nOldest pending (min): {{ $json.alert.oldestPendingMinutes ?? 'n/a' }}\nChecked: {{ $json.checkedAt }}\nAction: open https://www.expresscleaningconsult.com/admin/inquiries and the Cloudflare Worker logs for express-cleaning-edge-api."},
            {"id": "s3", "name": "fingerprint", "type": "string", "value": "={{ $json.alert.fingerprint }}"},
            {"id": "s4", "name": "action", "type": "string", "value": "={{ $json.action }}"},
        ]}, "options": {}}),
    node("Send alert (Gmail)", "n8n-nodes-base.gmail", 2.1, [1200, -100], {
        "sendTo": "expressconsulting92@gmail.com",
        "subject": "={{ $json.subject }}",
        "emailType": "text",
        "message": "={{ $json.text }}",
        "options": {"appendAttribution": False},
    }, retryOnFail=True, maxTries=3, waitBetweenTries=10000, onError="continueRegularOutput",
       notes="Owner-approved destination (2026-11-20). Credential: Gmail OAuth2 named 'ECC Gmail alerts' (stored encrypted by n8n). Bounded: 3 tries, 10s apart; the 120s execution cap is the hard timeout. A failed send still continues to the terminal check."),
    node("Terminal state?", "n8n-nodes-base.if", 2.2, [1440, -100], {
        "conditions": {"options": {"caseSensitive": True, "typeValidation": "strict", "version": 2}, "combinator": "and",
                       "conditions": [{"leftValue": "={{ $('Format message').item.json.action }}", "rightValue": "terminal",
                                       "operator": {"type": "string", "operation": "equals"}}]}, "options": {}}),
    node("Monitor terminal failure", "n8n-nodes-base.stopAndError", 1, [1680, -180],
         {"errorMessage": "={{ $('Format message').item.json.subject }}"},
         notes="Visible terminal state: the execution is marked Error in n8n's Executions list."),
    node("No action", "n8n-nodes-base.noOp", 1, [960, 140], {}),
]
conn = lambda *targets: {"main": [[{"node": t, "type": "main", "index": 0}] if t else [] for t in targets]}
connections = {
    "Every 15 minutes": conn("Probe delivery health"),
    "Probe delivery health": conn("Evaluate (deterministic)"),
    "Evaluate (deterministic)": conn("Route by action"),
    "Route by action": conn("Format message", "Format message", "Format message", "No action"),
    "Format message": conn("Send alert (Gmail)"),
    "Send alert (Gmail)": conn("Terminal state?"),
    "Terminal state?": conn("Monitor terminal failure", None),
}
wf = {
    "name": "ECC - Operator failure alert (A01)",
    "nodes": nodes,
    "connections": connections,
    "active": False,
    "settings": {"executionOrder": "v1", "executionTimeout": 120, "saveDataErrorExecution": "all",
                 "saveDataSuccessExecution": "none", "timezone": "America/New_York"},
    "pinData": {},
    "tags": [],
}
out = here / "ecc-operator-failure-alert.json"
out.write_text(json.dumps(wf, indent=2) + "\n")
print("wrote", out)
