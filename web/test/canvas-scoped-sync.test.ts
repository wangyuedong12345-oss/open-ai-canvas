import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('scoped canvas sync isolates unrelated assets and preserves referenced upload failures', () => {
    const fixture = fileURLToPath(new URL('./fixtures/canvas-scoped-sync.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [fixture], { encoding: 'utf8', timeout: 30000 });
    if (result.status !== 0) throw new Error(`${result.error?.message ?? ''}\n${result.stderr}\n${result.stdout}`);
    expect(JSON.parse(result.stdout.trim())).toEqual({ creationIsolated: true, referencedAssetsUploaded: true, concurrentScopesSaved: true, referencedFailurePreserved: true });
}, 35000);
