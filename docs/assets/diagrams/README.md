# Diagrams

The images used throughout the documentation. Each diagram exists as an SVG (the source of truth, editable and crisp at any size) and a 2× PNG (what the docs embed).

| Diagram | Used in |
|---|---|
| `system-architecture` | [README](../../../README.md), [system context](../../architecture/system-context.md) |
| `service-communication` | [service communication](../../architecture/service-communication.md) |
| `flow-authentication`, `flow-ai-generation`, `flow-live-preview` | [request flows](../../architecture/README.md) |
| `file-revisions` | [file revisions](../../architecture/file-revisions.md) |
| `er-account`, `er-workspace`, `er-intelligence` | [data model](../../schema/README.md) |
| `deployment-topology`, `ci-cd-pipeline` | [deployment](../../deployment/README.md), [CI/CD](../../deployment/ci-cd.md) |

## Regenerating

The diagrams are generated from code in `src/`, so they stay consistent in style and can be updated alongside the system:

```bash
cd docs/assets/diagrams/src
python build.py      # writes out/*.svg
python render.py     # renders out/*.png at 2x with headless Chrome or Edge
cp out/* ..          # replace the committed images
```

Python 3 and Chrome (or Edge) are the only requirements. Edit the `d_*.py` file that owns a diagram; `kit.py` holds the shared theme, layout primitives, sequence and ER renderers.

When the system changes — a new service, endpoint, table or pipeline step — update the diagram in the same change as the docs that describe it.

## Icons

Technology logos come from [Simple Icons](https://simpleicons.org/) (CC0 1.0), in `src/icons/`. Each logo is a trademark of its owner and is used only to identify the technology.
