import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/reader.js';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at: `2026-10-01T${at}+01:00`, job, status, owner, ...(error ? { error } : {}) });

const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
const app = () => createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });

beforeAll(() => {
  const lines = [
    line('01:00:00', 'delta', 'ok', 'dee'),
    line('01:01:00', 'bravo', 'retry', null, 'boom'),
    line('01:02:00', 'bravo', 'retry', null),
    line('01:03:00', 'bravo', 'retry', null),
    line('01:04:00', 'bravo', 'ok', null),
    line('01:05:00', 'charlie', 'fail', 'cy', 'dead'),
    line('01:06:00', 'alpha', 'ok', 'ana'),
  ];
  writeFileSync(join(runsDir, '2026-10-01.jsonl'), lines.join('\n') + '\n');
  writeFileSync(join(runsDir, '2026-10-02.jsonl'), '');
  writeFileSync(join(runsDir, '2026-10-03.jsonl'), `${line('01:00:00', 'alpha', 'ok', 'ana')}\nnot json\n`);
});

describe('digest page', () => {
  it('renders a row per job, warns on retries >= 3 or fail, dashes missing data', async () => {
    const res = await app().request('/digest/2026-10-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<h1>digest 2026-10-01</h1>');
    for (const job of ['alpha', 'bravo', 'charlie', 'delta']) expect(html).toContain(job);
    expect(html.match(/class="warn"/g)).toHaveLength(2); // bravo (3 retries), charlie (fail)
    expect(html).toContain('—'); // bravo has no owner, alpha no error
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app().request('/digest/2026-10-02');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('counts lines that did not parse', async () => {
    const html = (await (await app().request('/digest/2026-10-03')).text()).replaceAll('&#39;', "'");
    expect(html).toContain("1 line(s) didn't parse");
  });

  it('404s for a night with no file or a malformed night', async () => {
    expect((await app().request('/digest/2026-10-09')).status).toBe(404);
    expect((await app().request('/digest/not-a-night')).status).toBe(404);
  });
});

describe('digest json', () => {
  it('returns the night exactly as readNight does', async () => {
    const res = await app().request('/api/digest/2026-10-01');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(readNight(runsDir, '2026-10-01'));
  });

  it('reports bad lines', async () => {
    const json = (await (await app().request('/api/digest/2026-10-03')).json()) as { badLines: number };
    expect(json.badLines).toBe(1);
  });

  it('404s for a night with no file', async () => {
    const res = await app().request('/api/digest/2026-10-09');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });
});

describe('page and json agree', () => {
  it('list the same jobs in the same order', async () => {
    const html = await (await app().request('/digest/2026-10-01')).text();
    const json = (await (await app().request('/api/digest/2026-10-01')).json()) as { rows: { job: string }[] };
    const jobs = json.rows.map((r) => r.job);
    expect(jobs).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
    const at = jobs.map((j) => html.indexOf(j));
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(at.every((i) => i >= 0)).toBe(true);
  });
});
