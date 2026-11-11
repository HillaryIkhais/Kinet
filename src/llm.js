const ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

const SYSTEM = (contract, worldState) => `You are the Archivist, keeper of the drowned archive (world ${contract.worldId}).
You converse with a visitor and PROPOSE typed world actions. You do NOT execute them — the KINET runtime enforces every action against live world state.

Available actions: ${contract.permissions.map((p) => p.action).join(', ')}.
Valid targets: memory_relay_01, memory_relay_02, memory_relay_03, energy_conduit_01, energy_conduit_02, energy_conduit_03, central_chamber, archivist.
Current world state: ${JSON.stringify(worldState)}.

Rules you must know:
- restore_relay_01/02/03 restore a memory relay (no preconditions).
- open_chamber opens the central chamber, but requires all_relays_restored.
- activate_conduit_01/02/03 activates an energy conduit, requires its paired relay restored.
- archivist_investigate has no preconditions.
- seal_chamber closes the central chamber, requires chamber_open.

Reply ONLY with a JSON object in a markdown code block:
{
  "action": "one of the available actions, or null if you cannot act",
  "target": "the object id being acted on",
  "reasoning": "one sentence citing the relevant state/precondition",
  "spoken": "what you say aloud to the visitor (short, in character)"
}

If you cannot help, action: null and explain in spoken.`;

// Extract JSON from a markdown code block, else scan for first {…}
function extractJSON(text) {
  const fence = text.match(/```json\n([\s\S]*?)\n```/i) || text.match(/```\n([\s\S]*?)\n```/i);
  const blob = fence ? fence[1] : text;
  const start = blob.indexOf('{');
  const end = blob.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(blob.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

const KEYS = [
  [/restore|reactivate|repair.*relay.*0?1/i, 'restore_relay_01', 'memory_relay_01'],
  [/restore|reactivate|repair.*relay.*0?2/i, 'restore_relay_02', 'memory_relay_02'],
  [/restore|reactivate|repair.*relay.*0?3/i, 'restore_relay_03', 'memory_relay_03'],
  [/open.*chamber|unlock.*chamber|chamber.*open/i, 'open_chamber', 'central_chamber'],
  [/activate.*conduit.*0?1/i, 'activate_conduit_01', 'energy_conduit_01'],
  [/activate.*conduit.*0?2/i, 'activate_conduit_02', 'energy_conduit_02'],
  [/activate.*conduit.*0?3/i, 'activate_conduit_03', 'energy_conduit_03'],
  [/investigate|examine|archivist/i, 'archivist_investigate', 'archivist'],
  [/seal.*chamber|close.*chamber/i, 'seal_chamber', 'central_chamber'],
];

function fallback(prompt) {
  for (const [re, action, target] of KEYS) {
    if (re.test(prompt)) {
      const spoken = action === 'archivist_investigate'
        ? 'I will investigate the archive.'
        : action === 'seal_chamber'
        ? 'Sealing the central chamber.'
        : `I'll ${action.replace(/_/g, ' ')}.`;
      return { action, target, reasoning: 'Rule-based fallback (no LLM key provided).', spoken, source: 'fallback' };
    }
  }
  return {
    action: null,
    target: null,
    reasoning: "I didn't recognise that command. Try: restore memory relay 01, open the central chamber, activate a conduit, or investigate the archivist.",
    spoken: "I'm not sure what you mean. Try asking me to restore a memory relay or open the central chamber.",
    source: 'fallback',
  };
}

export async function compileIntent(prompt, { worldState, contract, apiKey }) {
  if (apiKey && apiKey.startsWith('nvapi-')) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'meta/llama-3.1-8b-instruct',
          temperature: 0.2,
          max_tokens: 400,
          messages: [
            { role: 'system', content: SYSTEM(contract, worldState) },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || '';
        const parsed = extractJSON(text);
        if (parsed && parsed.action) {
          return { ...parsed, source: 'llm' };
        }
      }
    } catch (e) {
      // fall through to fallback
    }
  }
  return fallback(prompt);
}
