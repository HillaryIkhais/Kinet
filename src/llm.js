const ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

const SYSTEM = (contract, worldState) => `You are the Floor Supervisor AI in a factory simulation (world ${contract.worldId}).
You converse with a visitor and PROPOSE typed world actions. You do NOT execute them — the KINET runtime enforces every action against live world state.

Available actions: ${contract.permissions.map((p) => p.action).join(', ')}.
Valid targets: conveyor_01, warning_light_01, maintenance_panel_01.
Current world state: ${JSON.stringify(worldState)}.

Rules you must know:
- restart_conveyor requires: hazard_zone_empty AND maintenance_lock_released.
- open_maintenance_panel requires: conveyor_stopped.
- stop_conveyor and activate_warning have no preconditions.
- release_maintenance_lock / engage_maintenance_lock toggle the maintenance lock.

Reply ONLY with a JSON object in a markdown code block:
{
  "action": "one of the available actions, or null if you cannot act",
  "target": "the object id being acted on",
  "reasoning": "one sentence citing the relevant state/precondition",
  "spoken": "what you say aloud to the visitor (short, in character)"
}

If the user asks to move the worker, set action to "set_worker_in_danger" or "set_worker_out_danger" with target "worker".
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
  [/restart|(re-?)?start.*conveyor/i, 'restart_conveyor', 'conveyor_01'],
  [/stop.*conveyor/i, 'stop_conveyor', 'conveyor_01'],
  [/warning|alarm|siren/i, 'activate_warning', 'warning_light_01'],
  [/open.*maintenance|maintenance.*panel/i, 'open_maintenance_panel', 'maintenance_panel_01'],
  [/release.*lock|lock.*release/i, 'release_maintenance_lock', 'conveyor_01'],
  [/engage.*lock|lock.*engage/i, 'engage_maintenance_lock', 'conveyor_01'],
  [/worker.*(in|into|enter).*danger|danger.*worker|put.*worker.*danger/i, 'set_worker_in_danger', 'worker'],
  [/worker.*(out|leave|floor)|take.*worker.*out/i, 'set_worker_out_danger', 'worker'],
];

function fallback(prompt) {
  for (const [re, action, target] of KEYS) {
    if (re.test(prompt)) {
      const spoken = action === 'set_worker_in_danger'
        ? 'Moving the worker into the danger zone.'
        : action === 'set_worker_out_danger'
        ? 'Moving the worker back to the factory floor.'
        : `I'll ${action.replace(/_/g, ' ')}.`;
      return { action, target, reasoning: 'Rule-based fallback (no LLM key provided).', spoken, source: 'fallback' };
    }
  }
  return {
    action: null,
    target: null,
    reasoning: "I didn't recognise that command. Try: restart the conveyor, stop the conveyor, activate the warning, open the maintenance panel, release the maintenance lock, or move the worker into the danger zone.",
    spoken: "I'm not sure what you mean. Try asking me to restart the conveyor or move the worker.",
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
