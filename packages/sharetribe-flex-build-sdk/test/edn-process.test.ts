/**
 * Pins `parseProcessFile` to the shape Sharetribe's own process.edn files take.
 *
 * Every fixture here omits the top-level `:name` and `:states`, because no real
 * process file declares either, and that omission is what used to make the
 * parser throw. The privileged-action and template assertions are the ones that
 * matter most: a parser that returns empty transitions passes a "no privileged
 * actions" check while checking nothing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProcessFile } from '../src/edn-process.js';

const BOOKING = `{:format :v3,
 :transitions
 [{:name :transition/inquire,
   :actor :actor.role/customer,
   :actions [{:name :action/update-protected-data}],
   :to :state/inquiry}
  {:name :transition/request-payment,
   :actor :actor.role/customer,
   :actions
   [{:name :action/create-pending-booking, :config {:type :time}}
    {:name :action/privileged-set-line-items}],
   :to :state/pending-payment,
   :privileged? true}
  {:name :transition/expire-payment,
   :at {:fn/plus [{:fn/timepoint [:time/first-entered-state :state/pending-payment]}
                  {:fn/period ["PT15M"]}]},
   :actions [{:name :action/decline-booking}],
   :from :state/pending-payment,
   :to :state/payment-expired}],
 :notifications
 [{:name :notification/booking-new-request,
   :on :transition/request-payment,
   :to :actor.role/provider,
   :template :booking-new-request}]}
`;

let root: string;
let bookingFile: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'edn-process-'));
  mkdirSync(join(root, 'default-booking'));
  bookingFile = join(root, 'default-booking', 'process.edn');
  writeFileSync(bookingFile, BOOKING);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('parseProcessFile', () => {
  it('parses a file that declares neither :name nor :states', () => {
    const process = parseProcessFile(bookingFile);
    expect(process.transitions).toHaveLength(3);
    expect(process.notifications).toHaveLength(1);
  });

  it('names the process after the directory holding the file', () => {
    expect(parseProcessFile(bookingFile).name).toBe('default-booking');
  });

  it('keeps the namespace on every keyword it renders', () => {
    const [inquire] = parseProcessFile(bookingFile).transitions;
    expect(inquire.name).toBe('transition/inquire');
    expect(inquire.to).toBe('state/inquiry');
    expect(inquire.actor).toBe('actor.role/customer');
  });

  it('converts actions to { name, config } rather than passing EDN through', () => {
    const requestPayment = parseProcessFile(bookingFile).transitions[1];
    expect(requestPayment.actions).toEqual([
      { name: 'action/create-pending-booking', config: { type: 'time' } },
      { name: 'action/privileged-set-line-items' },
    ]);
  });

  it('reports :privileged? as a boolean, false when the key is absent', () => {
    const [inquire, requestPayment] = parseProcessFile(bookingFile).transitions;
    expect(requestPayment.privileged).toBe(true);
    expect(inquire.privileged).toBe(false);
  });

  it('leaves :from and :actor undefined where the file omits them', () => {
    const [inquire, , expirePayment] = parseProcessFile(bookingFile).transitions;
    expect(inquire.from).toBeUndefined();
    expect(expirePayment.actor).toBeUndefined();
    expect(expirePayment.from).toBe('state/pending-payment');
  });

  it('derives states from the transitions, in first-mention order', () => {
    const states = parseProcessFile(bookingFile).states;
    expect(states.map((s) => s.name)).toEqual([
      'state/inquiry',
      'state/pending-payment',
      'state/payment-expired',
    ]);
    const pendingPayment = states[1];
    expect(pendingPayment.in).toEqual(['transition/request-payment']);
    expect(pendingPayment.out).toEqual(['transition/expire-payment']);
  });

  it('parses notifications, including the template a directory has to match', () => {
    expect(parseProcessFile(bookingFile).notifications[0]).toEqual({
      name: 'notification/booking-new-request',
      on: 'transition/request-payment',
      to: 'actor.role/provider',
      template: 'booking-new-request',
    });
  });

  it('returns empty collections for a process with no transitions at all', () => {
    const dir = join(root, 'empty-process');
    mkdirSync(dir);
    const file = join(dir, 'process.edn');
    writeFileSync(file, '{:format :v3}\n');

    const process = parseProcessFile(file);
    expect(process).toEqual({
      name: 'empty-process',
      states: [],
      transitions: [],
      notifications: [],
    });
  });

  it('throws on a file that is not valid EDN', () => {
    const dir = join(root, 'broken-process');
    mkdirSync(dir);
    const file = join(dir, 'process.edn');
    writeFileSync(file, '{:format :v3, :transitions [{:name :transition/x\n');

    expect(() => parseProcessFile(file)).toThrow();
  });
});
