/**
 * Type definitions for jsedn
 *
 * Only the surface this package uses. The collection and scalar classes are
 * declared because EDN values have to be narrowed with `instanceof`: jsedn
 * wraps every `[...]`, `(...)` and `{...}` in its own class, so `Array.isArray`
 * is false for a parsed vector and a map's contents are unreachable without it.
 */

declare module 'jsedn' {
  /** An EDN keyword. `name` drops the namespace, `val` keeps the whole literal. */
  export class Keyword {
    constructor(name: string);
    ns?: string;
    name: string;
    val: string;
  }

  export class Symbol {
    constructor(name: string);
    ns?: string;
    name: string;
    val: string;
  }

  export class List {
    constructor(val?: unknown[]);
    val: unknown[];
  }

  export class Vector {
    constructor(val?: unknown[]);
    val: unknown[];
  }

  export class Set {
    constructor(val?: unknown[]);
    val: unknown[];
  }

  export class Map {
    constructor(val?: unknown[]);
    val: unknown[];
    keys: unknown[];
    vals: unknown[];
    /** Throws the string "key does not exist" when the key is absent. */
    at(key: unknown): unknown;
    exists(key: unknown): boolean;
    set(key: unknown, value: unknown): Map;
  }

  export function parse(str: string): any;
  export function kw(name: string): Keyword;
  export function encode(value: any): string;
}
