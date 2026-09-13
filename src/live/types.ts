/**
 * Live conversational audit sessions — shared types.
 *
 * Doctrine: the session is a deterministic state machine. The transcript is
 * the artifact; it carries no timestamps so its rendering is byte-stable and
 * test-assertable (structure asserted, never times).
 */

import type { ChatRequest, ChatResult } from '../agent/types.js';

/** Conversational phases, in walking order. */
export type SessionPhase = 'idle' | 'foundation' | 'audit' | 'triage' | 'report' | 'done';

/** Who produced a transcript line. */
export type TranscriptKind = 'user' | 'tool' | 'model' | 'decision';

/** One deterministic transcript line: no timestamps by design. */
export interface TranscriptEntry {
  phase: SessionPhase;
  kind: TranscriptKind;
  text: string;
}

/** Reducer state: where the session is, what was said, what was learned. */
export interface SessionState {
  phase: SessionPhase;
  transcript: TranscriptEntry[];
  facts: string[];
}

/** LLM call behind an injectable interface. Types come from `src/agent` only. */
export type ChatFn = (req: ChatRequest) => Promise<ChatResult>;

/** Synchronous line reader injected by the caller (stdin in the CLI). */
export type AskFn = (prompt: string) => string | null | Promise<string | null>;

/** Line printer injected by the caller (console in the CLI). */
export type PrintFn = (line: string) => void;
