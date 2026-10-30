import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight', () => {
  it('reads the real night', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    if (!night) return;
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(night.badLines).toBe(1);
    const row = (job: string) => night.rows.find((r) => r.job === job);
    expect(row('fixtures/refresh')).toMatchObject({ retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(row('notes/backup')?.lastStatus).toBe('fail');
    expect(row('digest/render')?.owner).toBeNull();
    expect(row('rig/rotate-logs')?.firstAt).toBe('2026-10-28T23:00:02+01:00');
  });

  it('returns null for a missing file and an empty Night for an empty one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    expect(readNight(dir, '2026-01-01')).toBeNull();
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({
      night: '2026-01-02', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });
});
