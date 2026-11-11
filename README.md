# KINET — World Atelier

**Create worlds that think, respond and obey their own rules.**

KINET is a prompt-to-playable-world creation studio for the Victoria VR AI Builder Hackathon 2026.

It transforms natural-language descriptions into **interconnected, playable 3D experiences** — environments, objects, stateful logic, AI characters, objectives and ending conditions that all work together as one coherent system.

Other world generators can give you a beautiful place. KINET gives you a place that actually **works** as a world: a door has conditions, objects have relationships, characters have bounded abilities, and actions have consequences. The AI participates in the world, but it cannot talk its way past the world's rules.

## The Showcase: The Drowned Archive

A submerged archive preserving the memories of a vanished civilization:

- Ancient futuristic architecture with bioluminescent lighting
- Three damaged memory relays, each gating part of the archive
- A sealed central chamber that cannot open until all three relays are restored
- Energy conduits that activate when their paired relay is restored
- The Archivist — an AI character with limited, contract-bound authority

## The Differentiator: Playability Validation

KINET doesn't just generate a scene — it **compiles a connected playable system** and validates that it stays playable when the creator changes it.

**The dangerous edit:** A creator says *"Move the third memory relay inside the final chamber."* KINET detects the circular dependency:

> **Playability problem detected**
> Relay 03 is required to open the chamber, but it is now inside the chamber.
> The required objective is unreachable under the current rules.

KINET blocks the change, proposes a valid alternative (restore Relay 03 to the observatory), and confirms playability is restored. The same logic governs both the editor preview and the playable world.

## Four Work Modes

| Mode | Purpose |
|------|---------|
| **WORLD** | Spatial composition — explore the archive, describe and generate worlds, inspect objects |
| **LOGIC** | Visual behaviour graph — relay conditions connected to the chamber unlock rule, with live state |
| **CHARACTERS** | Archivist profile — identity, role, permitted vs conditional action contracts |
| **PLAY** | Immersive playable preview — minimal chrome, explore and interact with the world |

A fifth **Playability Check** panel continuously validates that the world's objectives remain reachable as the creator edits.

## Tech Stack

- Three.js (cinematic underwater scene with dynamic lighting, particles, fog)
- Zustand (deterministic world state)
- Zod (contract schema validation)
- Custom deterministic event/runtime engine + playability validator
- LLM (NVIDIA NIM / OpenAI-compatible) for natural-language interpretation, with rule-based fallback
- Static ES modules — no build step, deploys to any static host

## Local Run

```bash
python3 -m http.server 8090
# open http://localhost:8090/index.html
```

No API key required — the built-in rule-based compiler handles all demonstrated commands. Paste an NVIDIA NIM key (`nvapi-…`) into the console to use the real LLM compiler.

## Submission

- Public GitHub repo: this repository
- Hosted demo: deploy this static folder to Vercel (vercel.json included) or any static host
- Video: record the demo story — restore relays → attempt blocked edit → playability problem detected → fix → chamber opens — under 3 minutes
- Focus category: AI-generated interactive experiences / simulation

## License

MIT