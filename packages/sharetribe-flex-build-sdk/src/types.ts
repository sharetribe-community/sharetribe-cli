/**
 * Type definitions for Sharetribe Flex Build SDK
 */

export interface ProcessState {
  name: string;
  in: string[];
  out: string[];
}

export interface ProcessAction {
  name: string;
  config?: unknown;
}

export interface ProcessTransition {
  name: string;
  /** Absent on the transitions that start a process */
  from?: string;
  to: string;
  /** Absent on time-based transitions, which carry an `:at` instead of an actor */
  actor?: string;
  privileged?: boolean;
  actions?: ProcessAction[];
}

export interface ProcessNotification {
  name: string;
  on: string;
  to: string;
  template: string;
}

export interface ProcessDefinition {
  name: string;
  version?: number;
  states: ProcessState[];
  transitions: ProcessTransition[];
  notifications: ProcessNotification[];
}
