import assert from 'node:assert/strict';
import { mock } from 'bun:test';

const memory = () => {
    const values = new Map();
    return {
        getItem: async key => values.get(key) ?? null,
        setItem: async (key, value) => { values.set(key, value); return value; },
        removeItem: async key => { values.delete(key); },
    };
};
mock.module('localforage', () => ({ default: { ...memory(), config: () => {}, createInstance: memory } }));
let canvasStore;
const remote = new Map();
let pauseNextMutation = false;
let onMutationStarted;
let releaseMutation;
let rejectRelated = false;
const mutations = [];
const uploadedAssets = [];
const baseAsset = { id: 'related', kind: 'text', title: '文本', coverUrl: '', tags: [], data: { content: '原内容' }, createdAt: '', updatedAt: '' };
mock.module('@/services/api/user-data', () => ({
    changeCanvasEditLease: async () => { throw new Error('unexpected edit lease request in scoped save fixture'); },
    getRemoteUserDataSnapshot: async () => ({ assets: [baseAsset], projects: [] }),
    getRemoteCanvasProject: async id => ({ project: remote.get(id) }),
    applyRemoteCanvasOperations: async (id, request) => {
        mutations.push(request);
        if (pauseNextMutation) {
            pauseNextMutation = false;
            onMutationStarted();
            await new Promise(resolve => { releaseMutation = resolve; });
        }
        const saved = { ...canvasStore.getState().openProject(id), revision: (remote.get(id)?.revision ?? 0) + 1 };
        remote.set(id, saved);
        return { project: { id, revision: saved.revision }, mutationId: request.mutationId };
    },
    upsertRemoteAsset: async asset => {
        assert.equal(asset.id, 'related', 'unrelated dirty asset must not be uploaded');
        if (rejectRelated) throw new Error('related asset upload failed');
        uploadedAssets.push(asset);
        return { asset };
    },
    getRemoteAsset: async () => { throw new Error('unexpected asset lookup'); },
    getRemoteAssetsByIds: async () => ({ assets: [] }),
    listRemoteAssetsPage: async () => ({ assets: [], total: 0 }),
    deleteRemoteAssets: async () => {},
    deleteRemoteCanvasProject: async () => {},
}));

const sync = await import('../../src/services/user-data-sync');
canvasStore = (await import('../../src/stores/canvas/use-canvas-store')).useCanvasStore;
const assetStore = (await import('../../src/stores/use-asset-store')).useAssetStore;
const localValues = new Map();
globalThis.window = { localStorage: { getItem: key => localValues.get(key) ?? null, setItem: (key, value) => localValues.set(key, value) }, setTimeout: () => 1, clearTimeout: () => {} };

await sync.syncRemoteUserData('scoped-sync-user');
assetStore.setState({ assets: [...assetStore.getState().assets, { ...baseAsset, id: 'unrelated', title: '无关的失败素材' }] });
const created = await sync.createCanvasProjectWithRemoteSync('新画布');
assert.equal(created.syncError, undefined, 'unrelated assets must not block canvas creation');
assert.equal(mutations.length, 1);
assert.equal(mutations[0].operations[0].type, 'create_canvas');
assert.equal(uploadedAssets.length, 0);

canvasStore.getState().updateProject(created.id, { nodes: [{ id: 'text-node', type: 'text', title: '文本', position: { x: 0, y: 0 }, width: 300, height: 150, metadata: { assetId: 'related', content: '原内容' } }] });
assetStore.setState({ assets: assetStore.getState().assets.map(asset => asset.id === 'related' ? { ...asset, title: '已编辑文本' } : asset) });
await sync.saveRemoteUserDataNow(created.id);
assert.equal(uploadedAssets.length, 1, 'referenced dirty assets must be uploaded');
assert.equal(mutations.length, 2);
assert.ok(mutations[1].operations.some(operation => operation.type === 'create_node' && operation.node.id === 'text-node'));

const second = await sync.createCanvasProjectWithRemoteSync('第二个画布');
assert.equal(second.syncError, undefined);
canvasStore.getState().updateProject(created.id, { title: '并发保存一' });
canvasStore.getState().updateProject(second.id, { title: '并发保存二' });
pauseNextMutation = true;
const started = new Promise(resolve => { onMutationStarted = resolve; });
const firstSave = sync.saveRemoteUserDataNow(created.id);
await started;
const secondSave = sync.saveRemoteUserDataNow(second.id);
releaseMutation();
await Promise.all([firstSave, secondSave]);
assert.equal(remote.get(created.id).title, '并发保存一');
assert.equal(remote.get(second.id).title, '并发保存二', 'waiting for another canvas must not falsely acknowledge this one');

const beforeFailedSave = mutations.length;
rejectRelated = true;
assetStore.setState({ assets: assetStore.getState().assets.map(asset => asset.id === 'related' ? { ...asset, title: '上传失败但保留本地' } : asset) });
await assert.rejects(sync.saveRemoteUserDataNow(created.id), /related asset upload failed/);
assert.equal(mutations.length, beforeFailedSave, 'failed referenced asset must block canvas submission');
assert.equal(assetStore.getState().assets.find(asset => asset.id === 'related').title, '上传失败但保留本地');
sync.resetRemoteUserDataSync();
console.log(JSON.stringify({ creationIsolated: true, referencedAssetsUploaded: true, concurrentScopesSaved: true, referencedFailurePreserved: true }));
