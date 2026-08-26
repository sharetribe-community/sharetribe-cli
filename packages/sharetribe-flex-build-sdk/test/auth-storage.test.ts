/**
 * Pins the config directory to flex-cli's own resolution order.
 *
 * `configDirFor` takes the platform and environment as arguments so the
 * Windows and XDG branches are exercised on any machine. The order is taken
 * from flex-cli's `sharetribe.flex-cli.xdg` namespace: XDG_CONFIG_HOME, then
 * %LOCALAPPDATA% on Windows only, then <home>/.config.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { configDirFor, getAuthFilePath } from '../src/auth-storage.js';

const NO_ENV = {};

describe('configDirFor', () => {
  it('honours XDG_CONFIG_HOME ahead of everything else, on every platform', () => {
    for (const platform of ['linux', 'darwin', 'win32'] as NodeJS.Platform[]) {
      expect(
        configDirFor(
          platform,
          {
            XDG_CONFIG_HOME: '/xdg',
            LOCALAPPDATA: 'C:\\Local',
            HOME: '/home/u',
          },
          '/os/home'
        )
      ).toBe(join('/xdg', 'flex-cli'));
    }
  });

  it('uses %LOCALAPPDATA% on Windows when XDG_CONFIG_HOME is unset', () => {
    expect(
      configDirFor(
        'win32',
        { LOCALAPPDATA: 'C:\\Local', USERPROFILE: 'C:\\Users\\u' },
        'C:\\Users\\u'
      )
    ).toBe(join('C:\\Local', 'flex-cli'));
  });

  it('ignores %LOCALAPPDATA% off Windows', () => {
    expect(
      configDirFor('linux', { LOCALAPPDATA: 'C:\\Local', HOME: '/home/u' }, '/os/home')
    ).toBe(join('/home/u', '.config', 'flex-cli'));
  });

  it('falls back to <home>/.config', () => {
    expect(configDirFor('darwin', { HOME: '/Users/u' }, '/os/home')).toBe(
      join('/Users/u', '.config', 'flex-cli')
    );
  });

  it('prefers HOME over the OS home directory', () => {
    expect(configDirFor('linux', { HOME: '/home/u' }, '/os/home')).toBe(
      join('/home/u', '.config', 'flex-cli')
    );
  });

  it('uses HOMEDRIVE + HOMEPATH on Windows when HOME and LOCALAPPDATA are unset', () => {
    expect(
      configDirFor(
        'win32',
        { HOMEDRIVE: 'C:', HOMEPATH: '\\Users\\u', USERPROFILE: 'D:\\other' },
        'E:\\os'
      )
    ).toBe(join(join('C:', '\\Users\\u'), '.config', 'flex-cli'));
  });

  it('falls back to USERPROFILE on Windows when HOMEDRIVE/HOMEPATH are absent', () => {
    expect(configDirFor('win32', { USERPROFILE: 'C:\\Users\\u' }, 'E:\\os')).toBe(
      join('C:\\Users\\u', '.config', 'flex-cli')
    );
  });

  it('falls back to the OS home directory when the environment says nothing', () => {
    expect(configDirFor('linux', NO_ENV, '/os/home')).toBe(
      join('/os/home', '.config', 'flex-cli')
    );
  });
});

describe('getAuthFilePath', () => {
  it('is auth.edn inside the resolved config directory', () => {
    expect(getAuthFilePath().endsWith(join('flex-cli', 'auth.edn'))).toBe(true);
  });
});
