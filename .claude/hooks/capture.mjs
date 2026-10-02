#!/usr/bin/env node
// Agent capture for the 8x assignment. Wired to Claude Code's UserPromptSubmit and Stop hooks
// (.claude/settings.json), so it runs on every prompt and every end of turn with no manual step.
//
// It rebuilds .agent-logs/<first-prompt-time>_<session-id>.md from Claude Code's own session
// transcript (JSONL). Per turn it keeps only the user's prompt (verbatim) and the final response:
// assistant text emitted after the turn's last tool call. Thinking, tool calls and intermediate
// narration are dropped, as the brief asks. Regenerating from the raw transcript (rather than
// appending) means a crashed hook can never leave a partial or reordered log.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const AUTHOR = 'Asadatf';
const PROJECT = 'bazario-amazon-clone';
const TOOL = 'claude-code';

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  if (content.some((b) => b.type === 'tool_result')) return null;
  const texts = content.filter((b) => b.type === 'text').map((b) => b.text);
  return texts.length ? texts.join('\n') : null;
}

/** Splits the transcript into turns: { prompt, promptTime, response, responseTime, model }. */
function extractTurns(entries) {
  const turns = [];
  let current = null;
  let lastModel = 'unknown';
  for (const e of entries) {
    if (e.isSidechain) continue; // subagent traffic is not part of the user<->agent conversation
    if (e.type === 'user' && !e.isMeta) {
      const text = textOf(e.message?.content);
      if (text === null) continue; // tool results
      current = { prompt: text, promptTime: e.timestamp, response: '', responseTime: null, model: lastModel };
      turns.push(current);
    } else if (e.type === 'assistant' && current) {
      lastModel = e.message?.model ?? lastModel;
      current.model = lastModel;
      for (const block of e.message?.content ?? []) {
        if (block.type === 'tool_use') {
          current.response = ''; // text before a tool call is intermediate narration, not the final answer
        } else if (block.type === 'text' && block.text.trim()) {
          current.response += (current.response ? '\n\n' : '') + block.text;
          current.responseTime = e.timestamp;
        }
      }
    }
  }
  return turns;
}

function render(sessionId, turns) {
  const short = sessionId.slice(0, 8);
  const first = turns[0].promptTime;
  const last = turns[turns.length - 1].promptTime;
  const models = [...new Set(turns.map((t) => t.model).filter((m) => m !== 'unknown'))];
  const out = [
    '---',
    `session_id: ${sessionId}`,
    `date: ${first.slice(0, 10)}`,
    `author: ${AUTHOR}`,
    `model: ${models.join(', ') || 'unknown'}`,
    `tool: ${TOOL}`,
    `project: ${PROJECT}`,
    `total_exchanges: ${turns.length}`,
    `first_prompt_time: ${first}`,
    `last_prompt_time: ${last}`,
    '---',
    '',
    `# Session Log - ${first.slice(0, 10)}`,
    '',
    `Session: \`${short}\` | Project: \`${PROJECT}\` | Author: \`${AUTHOR}\``,
    '',
    '---',
    '',
  ];
  turns.forEach((t, i) => {
    const n = i + 1;
    out.push(`[LOG_ENTRY type=PROMPT num=${n} session=${short}]`, `timestamp: ${t.promptTime}`, `model: ${t.model}`, '', t.prompt, '', '');
    if (t.responseTime) {
      out.push(`[LOG_ENTRY type=RESPONSE num=${n} session=${short}]`, `timestamp: ${t.responseTime}`, `model: ${t.model}`, '', t.response, '', '');
    }
  });
  return out.join('\n');
}

function main() {
  const input = readStdin();
  const { session_id: sessionId, transcript_path: transcriptPath, hook_event_name: event, prompt } = input;
  if (!sessionId || !transcriptPath) return;

  let entries = [];
  try {
    entries = readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    // transcript not written yet (very first prompt of a session)
  }
  const turns = extractTurns(entries);

  // On UserPromptSubmit the new prompt may not be in the transcript yet; record it now so a
  // session that dies mid-turn still has the prompt.
  if (event === 'UserPromptSubmit' && typeof prompt === 'string' && turns.at(-1)?.prompt !== prompt) {
    turns.push({ prompt, promptTime: new Date().toISOString(), response: '', responseTime: null, model: turns.at(-1)?.model ?? 'unknown' });
  }
  if (!turns.length) return;

  const dir = join(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd(), '.agent-logs');
  mkdirSync(dir, { recursive: true });
  const stamp = turns[0].promptTime.slice(0, 19).replace('T', '_').replace(/:/g, '-');
  writeFileSync(join(dir, `${stamp}_${sessionId}.md`), render(sessionId, turns));
}

try {
  main();
} catch (err) {
  // Never block the user's prompt because logging failed; leave a trace instead.
  process.stderr.write(`agent capture failed: ${err instanceof Error ? err.message : String(err)}\n`);
}
