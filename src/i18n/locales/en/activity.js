// The activity column, the session list and the stat tiles (ui/activity.js), plus the live connection (net/live.js).
export default {
  image: { view: 'View the image', close: 'Close', gone: 'This image is no longer on the computer.' },
  subagent: 'subagent',
  working: 'working',
  starting: 'Starting…',
  more: '+{n} more',
  openSubChat: "Open this subagent's conversation",
  openChat: "Open this session's conversation",
  openToApprove: 'Open to approve',
  seeError: 'See error',
  openOnPhone: 'Open on your phone',
  empty: {
    att: 'Nothing has needed your attention in the last hour.',
    type: 'No activity of this type yet.',
    all: 'Waiting for the first activity…',
  },
  doing: {
    wait: 'Waiting for your approval',
    bg: 'Background: {desc}',
    justDone: 'Just finished',
    resting: 'Resting · {time}',
    working: 'Working',
    error: 'Stopped on an error',
    errorWhy: 'Stopped: {why}',
    // MyDesk calls it quiet: at work, no sign of life for 5 minutes (src/shared/attention.js)
    quiet: 'Quiet for {n} min',
    quietNow: 'Quiet: no sign of life',
    review: 'Done · not looked at yet',
    stuck: { repeat: 'Stuck: “{label}” keeps failing', compact: 'Stuck: compacting again and again', cost: 'Spending with nothing edited' },
  },
  // the chip at the stage's edge for someone waiting out of view (ui/needs-you.js)
  needsYou: { show: '{name} needs you: show', quiet: 'quiet', quietFor: 'quiet {n} min' },
  // why a turn ended on an API error, in a few words (MyDesk's stopError.kind: Claude Code's StopFailure error)
  stopWhy: {
    rate_limit: 'hit the usage limit', overloaded: "Anthropic's servers were busy", server_error: 'a server error at Anthropic',
    authentication_failed: 'Claude Code is signed out', oauth_org_not_allowed: 'this login may not use Claude Code',
    account_on_hold: 'the account is on hold', billing_error: 'a billing problem', invalid_request: 'the request was refused',
    model_not_found: 'the model is not available', max_output_tokens: 'its answer was too long', cloud_credential_error: 'the cloud credentials failed',
  },
  // the board on the wall (ui/needs-board.js): who waits for your approval, who finished and is not read yet
  needsBoard: { title: 'Needs you', none: 'Nobody needs you right now', wait: 'waiting for approval', review: 'finished — not looked at', quiet: 'quiet for {n} min', quietNow: 'quiet, no sign of life', error: 'stopped on an error', errorWhy: 'stopped: {why}', hint: { one: '1 needs you: click to go there', other: '{n} need you: click to go to the first' } },
  // the session list's groups
  group: {
    wait: 'Needs your approval',
    work: 'Working',
    rest: 'Resting',
  },
  waitingFor: 'waiting {time}',
  runsIn: '{dir} · running in {origin}',
  remoteOn: 'Remote Control is on: you can open it on your phone',
  ramTitle: "This session's RAM (child processes included)",
  ctxTitle: 'Context {used} / {max} · API price ≈ {cost}',
  // the stat tiles
  kpi: {
    prompts: 'Prompts',
    read: 'Reads',
    edit: 'Edits',
    cmd: 'Cmds',   // the tile is narrow: "Commands" does not fit
    cost: 'API price',
  },
  kpiToday: '{label} today',
  costTitle: "Equivalent list API price of the open sessions (not your bill if you're on a Pro/Max plan)",
  sessions: { one: '{n} session', other: '{n} sessions' },
  subsRunning: { one: '{n} subagent running', other: '{n} subagents running' },
  noSessions: 'No sessions yet',
  docTitle: '({n}) Your turn · My Office',
  // net/live.js: the connection chip and the team name over each pod of desks
  live: {
    on: 'receiving data',
    off: 'connection lost, retrying…',
    otherProject: 'other',
    team: 'Team {name}{more} · {n}',
    teamShared: "{name}'s desks, shared with: {others}",
    teamTitle: 'Desks of the {name} project',
  },
};
