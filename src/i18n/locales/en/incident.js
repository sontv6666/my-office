// Incidents, pushes, CI and reports (life/incidents.js), and "your turn" (life/your-turn.js).
export default {
  banner: 'Incident: 3 failures in 5 minutes',
  bubble: 'Incident!',
  pushed: '🚀 {name} just pushed to {branch}',
  ciRed: '🚨 CI is red: {label} · {repo}',
  ciRedDefault: 'tests failing',
  ciGreen: '✅ CI is green again: {label} · {repo}',
  deployed: '🚀 {name} just deployed {label}',
  againFail: 'Not again! {text}',
  // a worker reporting a finished turn to the director
  report: 'Report: done with “{task}”',
  // a finished turn told with its numbers (life/finish.js): "done · 12 min · 5 file edits"
  finish: { done: 'done', report: 'Report: done', edits: { one: '{n} file edit', other: '{n} file edits' } },
  reportLeft: "Left it on the director's desk",
  turn: {
    done: '{name} is done',
    body: 'Your turn: come see the result',
    none: 'No sessions are waiting for you.',
  },
};
