import { describe, expect, it } from 'vitest';
import { resolveTeamPath, teamsDir } from '../src/index.js';

const FAKE_HOME = '/Users/test';
const FAKE_CWD = '/Users/test/project';

describe('resolveTeamPath — bare ID', () => {
  it('uses --teams-dir when provided', () => {
    const path = resolveTeamPath('charx-vgc', {
      cliTeamsDir: '/explicit/teams',
      home: FAKE_HOME,
      env: {},
      cwd: FAKE_CWD,
    });
    expect(path).toBe('/explicit/teams/charx-vgc.txt');
  });

  it('uses $PVA_TEAMS_DIR when no --teams-dir', () => {
    const path = resolveTeamPath('charx-vgc', {
      home: FAKE_HOME,
      env: { PVA_TEAMS_DIR: '/env/teams' },
      cwd: FAKE_CWD,
    });
    expect(path).toBe('/env/teams/charx-vgc.txt');
  });

  it('uses $XDG_CONFIG_HOME when set', () => {
    const path = resolveTeamPath('charx-vgc', {
      home: FAKE_HOME,
      env: { XDG_CONFIG_HOME: '/Users/test/.xdg' },
      cwd: FAKE_CWD,
    });
    expect(path).toBe('/Users/test/.xdg/pva/teams/charx-vgc.txt');
  });

  it('falls back to ~/.config/pva/teams when nothing else is set', () => {
    const path = resolveTeamPath('charx-vgc', {
      home: FAKE_HOME,
      env: {},
      cwd: FAKE_CWD,
    });
    expect(path).toBe('/Users/test/.config/pva/teams/charx-vgc.txt');
  });

  it('priority: --teams-dir > PVA_TEAMS_DIR > XDG > ~/.config', () => {
    const path = resolveTeamPath('charx-vgc', {
      cliTeamsDir: '/cli',
      home: FAKE_HOME,
      env: { PVA_TEAMS_DIR: '/env', XDG_CONFIG_HOME: '/xdg' },
      cwd: FAKE_CWD,
    });
    expect(path).toBe('/cli/charx-vgc.txt');
  });

  it('rejects non-ID, non-path values', () => {
    expect(() =>
      resolveTeamPath('not a valid id', {
        home: FAKE_HOME,
        env: {},
        cwd: FAKE_CWD,
      }),
    ).toThrow(/neither a path/);
  });
});

describe('resolveTeamPath — path-like', () => {
  it('treats relative paths as files relative to cwd', () => {
    const path = resolveTeamPath('./teams/charx.txt', {
      home: FAKE_HOME,
      env: {},
      cwd: FAKE_CWD,
    });
    expect(path).toBe('/Users/test/project/teams/charx.txt');
  });

  it('treats absolute paths as-is', () => {
    const path = resolveTeamPath('/absolute/path/team.txt', {
      home: FAKE_HOME,
      env: {},
      cwd: FAKE_CWD,
    });
    expect(path).toBe('/absolute/path/team.txt');
  });

  it('expands ~/ prefix to home', () => {
    const path = resolveTeamPath('~/teams/charx.txt', {
      home: FAKE_HOME,
      env: {},
      cwd: FAKE_CWD,
    });
    expect(path).toBe('/Users/test/teams/charx.txt');
  });

  it('treats anything containing a dot as a path', () => {
    // Filenames with extensions go through the path branch even
    // without a slash, so a user can write `--my-team team.txt` in
    // the current dir.
    const path = resolveTeamPath('team.txt', {
      home: FAKE_HOME,
      env: {},
      cwd: FAKE_CWD,
    });
    expect(path).toBe('/Users/test/project/team.txt');
  });
});

describe('teamsDir', () => {
  it('exposes the resolved directory without an ID', () => {
    expect(teamsDir(undefined, {}, FAKE_HOME)).toBe('/Users/test/.config/pva/teams');
  });
});
