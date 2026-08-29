/**
 * Process.edn file parser
 *
 * Parses transaction process definitions from EDN format.
 *
 * Written against the process.edn files Sharetribe actually ships, which are
 * `{:format :v3 :transitions [...] :notifications [...]}` maps. They declare
 * neither `:name` nor `:states`: the name comes from the directory holding the
 * file, and the states are whatever the transitions' `:from` and `:to` name.
 * That is why this module derives both rather than reading them off the map.
 */

import edn from 'jsedn';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import type {
  ProcessAction,
  ProcessDefinition,
  ProcessNotification,
  ProcessState,
  ProcessTransition,
} from './types.js';

export type {
  ProcessAction,
  ProcessDefinition,
  ProcessNotification,
  ProcessState,
  ProcessTransition,
};

const NAME = edn.kw(':name');
const TRANSITIONS = edn.kw(':transitions');
const NOTIFICATIONS = edn.kw(':notifications');
const FROM = edn.kw(':from');
const TO = edn.kw(':to');
const ACTOR = edn.kw(':actor');
const PRIVILEGED = edn.kw(':privileged?');
const ACTIONS = edn.kw(':actions');
const CONFIG = edn.kw(':config');
const ON = edn.kw(':on');
const TEMPLATE = edn.kw(':template');

/**
 * Reads one key off an EDN map, or undefined when the map does not carry it.
 *
 * jsedn's `Map.prototype.at` throws the bare string "key does not exist" for a
 * missing key, so every read has to be guarded by `exists` first.
 */
function fieldOf(map: unknown, key: unknown): unknown {
  if (!(map instanceof edn.Map)) return undefined;
  return map.exists(key) ? map.at(key) : undefined;
}

/**
 * Unwraps an EDN vector or list into a plain array.
 *
 * jsedn parses `[...]` into its own Vector class wrapping an internal `val`
 * array, so `Array.isArray` is false for every collection in a process file.
 */
function itemsOf(value: unknown): unknown[] {
  if (value instanceof edn.Vector || value instanceof edn.List) return value.val;
  if (Array.isArray(value)) return value;
  return [];
}

/**
 * Renders an EDN keyword as a string, keeping its namespace and dropping the
 * leading colon: `:transition/accept` becomes `transition/accept`. Keeping the
 * namespace is what lets a notification's `:on` be compared with a transition's
 * `:name` without either one losing what kind of thing it names.
 */
function keywordToString(value: unknown): string | undefined {
  if (value instanceof edn.Keyword) return value.val.replace(/^:/, '');
  if (typeof value === 'string') return value;
  return undefined;
}

/**
 * Converts an arbitrary EDN value into plain JavaScript, so an action's
 * `:config` reaches the caller as data rather than as jsedn internals.
 */
function toPlain(value: unknown): unknown {
  if (value instanceof edn.Keyword) return keywordToString(value);
  if (value instanceof edn.Symbol) return value.val;
  if (value instanceof edn.Vector || value instanceof edn.List) {
    return value.val.map(toPlain);
  }
  if (value instanceof edn.Set) return value.val.map(toPlain);
  if (value instanceof edn.Map) {
    const plain: Record<string, unknown> = {};
    value.keys.forEach((key: unknown, index: number) => {
      const name = keywordToString(key) ?? String(key);
      plain[name] = toPlain(value.vals[index]);
    });
    return plain;
  }
  return value;
}

/**
 * Parses one transition's `:actions` into `{ name, config }` entries, skipping
 * anything that is not a map carrying a `:name`.
 */
function parseActions(value: unknown): ProcessAction[] {
  const actions: ProcessAction[] = [];
  for (const item of itemsOf(value)) {
    const name = keywordToString(fieldOf(item, NAME));
    if (name === undefined) continue;
    const config = fieldOf(item, CONFIG);
    actions.push(config === undefined ? { name } : { name, config: toPlain(config) });
  }
  return actions;
}

/**
 * Builds the state list from the transitions, the way Sharetribe does: a state
 * exists because some transition names it, `in` holds the transitions arriving
 * at it and `out` the transitions leaving it. States are ordered by first
 * mention, so the initial state of the process comes first.
 */
function deriveStates(transitions: ProcessTransition[]): ProcessState[] {
  const states = new Map<string, ProcessState>();
  const stateNamed = (name: string): ProcessState => {
    const existing = states.get(name);
    if (existing) return existing;
    const created: ProcessState = { name, in: [], out: [] };
    states.set(name, created);
    return created;
  };

  for (const transition of transitions) {
    if (transition.from) stateNamed(transition.from).out.push(transition.name);
    if (transition.to) stateNamed(transition.to).in.push(transition.name);
  }

  return [...states.values()];
}

/**
 * Parses a process.edn file
 *
 * @param filePath - Path to the process.edn file
 * @returns The process, named after the directory holding the file, with its
 *   states derived from its transitions
 */
export function parseProcessFile(filePath: string): ProcessDefinition {
  const content = readFileSync(filePath, 'utf-8');
  const parsed = edn.parse(content);

  const transitions: ProcessTransition[] = [];
  for (const item of itemsOf(fieldOf(parsed, TRANSITIONS))) {
    const name = keywordToString(fieldOf(item, NAME));
    if (name === undefined) continue;

    const transition: ProcessTransition = {
      name,
      to: keywordToString(fieldOf(item, TO)) ?? '',
      privileged: fieldOf(item, PRIVILEGED) === true,
      actions: parseActions(fieldOf(item, ACTIONS)),
    };

    const from = keywordToString(fieldOf(item, FROM));
    if (from !== undefined) transition.from = from;
    const actor = keywordToString(fieldOf(item, ACTOR));
    if (actor !== undefined) transition.actor = actor;

    transitions.push(transition);
  }

  const notifications: ProcessNotification[] = [];
  for (const item of itemsOf(fieldOf(parsed, NOTIFICATIONS))) {
    const name = keywordToString(fieldOf(item, NAME));
    if (name === undefined) continue;
    notifications.push({
      name,
      on: keywordToString(fieldOf(item, ON)) ?? '',
      to: keywordToString(fieldOf(item, TO)) ?? '',
      template: keywordToString(fieldOf(item, TEMPLATE)) ?? '',
    });
  }

  return {
    name: basename(dirname(resolve(filePath))),
    states: deriveStates(transitions),
    transitions,
    notifications,
  };
}

/**
 * Serializes a process definition to EDN format
 */
export function serializeProcess(process: ProcessDefinition): string {
  // For now, return a simplified EDN representation
  // A full implementation would properly serialize to EDN format
  return `{:name :${process.name}
 :states [${process.states.map((s) => `{:name :${s.name} :in [${s.in.map((i) => `:${i}`).join(' ')}] :out [${s.out.map((o) => `:${o}`).join(' ')}]}`).join('\n          ')}]
 :transitions [${process.transitions.map((t) => `{:name :${t.name} :from :${t.from} :to :${t.to} :actor :${t.actor}}`).join('\n               ')}]
 :notifications [${process.notifications.map((n) => `{:name :${n.name} :on :${n.on} :to :${n.to} :template :${n.template}}`).join('\n                 ')}]}`;
}
