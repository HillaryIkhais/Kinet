# KINET — World Atelier

**Create worlds that think, respond and obey their own rules.**

KINET is a prompt-to-playable-world creation studio for the Victoria VR AI Builder Hackathon 2026.

It transforms natural-language descriptions into interconnected, interactive 3D experiences containing environments, objects, stateful world logic, AI characters, character roles and action contracts, conditions and consequences — with a runtime that checks AI-proposed actions against actual world state before executing them.

## The Showcase: The Drowned Archive

A vast underwater archive preserving the memories of a vanished civilization. Features:

- Ancient futuristic architecture with bioluminescent lighting
- Three damaged memory relays, each gating part of the archive
- Interconnected energy conduits that activate when relays are restored
- A sealed central chamber that cannot open until all three relays are restored
- The Archivist — an AI character with limited, contract-bound authority

The central gameplay condition is enforced by the runtime, not just described: `open_chamber` requires `all_relays_restored`. The AI Archivist can propose the action, but the world will not permit it until the precondition holds.

## Four Modes

| Mode | Purpose |
|------|---------|
| **WORLD** | Spatial composition workspace — explore the archive, select objects, inspect conditions |
| **LOGIC** | Visual behaviour graph — see relay conditions connected to the chamber unlock rule, with live state |
| **CHARACTERS** | Archivist profile — identity, role, permitted vs conditional actions, relationships |
| **PLAY** | Immersive playable preview — minimal chrome, full interaction with the world and Archivist |

## Runtime Enforcement (the core differentiator)

The AI never executes actions directly. It proposes a typed action (`{action, target, reason}`), and a deterministic runtime checks it against:

- Permission: is this actor allowed this action on this object?
- Resource scope: is the target in scope?
- Preconditions: are all world-state conditions met?

Only when all checks pass does the world state change. Every attempt produces an execution receipt (allowed/blocked, reason, state before/after). The AI cannot bypass this by generating different formats, inventing objects, or persuading the user.

## Tech Stack

- Three.js (cinematic underwater scene with dynamic lighting, particles, fog)
- Zustand (deterministic world state)
- Zod (contract schema validation)
- Custom deterministic event/runtime engine
- LLM (NVIDIA NIM / OpenAI-compatible) for natural-language interpretation, with rule-based fallback
- Static ES modules — no build step, deploys to any static host

## Local Run

```bash
python3 -m http.server 8090
# open http://localhost:8090/index.html
```

The page is fully static. No API key is required — the built-in rule-based compiler handles all demonstrated commands. Paste an NVIDIA NIM key (`nvapi-…`) into the console to use the real LLM compiler.

## Submission

- Public GitHub repo: this repository
- Hosted demo: deploy this static folder to Vercel (vercel.json included) or any static host
- Video: record the demo story (restore relays → chamber unlock blocked → allowed once preconditions met) — under 3 minutes
- Focus category: AI-generated interactive experiences / simulation

## License

MIT