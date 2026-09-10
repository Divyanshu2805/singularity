"""
Builds every documentation diagram into ./out as SVG; render.py then turns each into a PNG.

Handles: the list of diagrams and their output file names.
"""
import os
import d_architecture, d_platform, d_flows, d_er

HERE = os.path.dirname(os.path.abspath(__file__))
DIAGRAMS = {
    "system-architecture": d_architecture.build,
    "service-communication": d_platform.service_communication,
    "deployment-topology": d_platform.deployment_topology,
    "ci-cd-pipeline": d_platform.cicd,
    "flow-authentication": d_flows.auth,
    "flow-ai-generation": d_flows.ai_generation,
    "flow-live-preview": d_flows.live_preview,
    "file-revisions": d_flows.revisions,
    "er-account": d_er.account,
    "er-workspace": d_er.workspace,
    "er-intelligence": d_er.intelligence,
}

if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
    for name, fn in DIAGRAMS.items():
        fn().save(os.path.join(HERE, "out", name + ".svg"))
        print("built", name)
