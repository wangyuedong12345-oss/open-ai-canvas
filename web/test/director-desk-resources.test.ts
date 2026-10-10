import { expect, test } from "bun:test";
import { packDirectorResources, restoreDirectorResources } from "../src/lib/canvas/director-desk/resources";
import type { DirectorDeskState } from "../src/types/previs";

test("native model and media bytes round trip without inline canvas payloads", async () => {
    const document = { resources: [{ files: [{ data: "GLB-base64" }] }], media: [{ data: "data:video/mp4;base64,AA==" }], scenes: [{ name: "第一场", entity: { resourceId: "model-native", "$director:resourceId": "custom-extension-value" } }] };
    const blobs = new Map<string, Blob>();
    const packed = await packDirectorResources(document, async (data) => {
        const storageKey = `resource:${blobs.size}`;
        const blob = new Blob([data]); blobs.set(storageKey, blob);
        return { storageKey, bytes: blob.size };
    });
    expect(JSON.stringify(packed.document)).not.toContain("GLB-base64");
    expect(JSON.stringify(packed.document)).not.toContain('"resourceId":');
    expect(packed.resources[0].path).toEqual(["resources", 0, "files", 0, "data"]);
    expect(document.resources[0].files[0].data).toBe("GLB-base64");
    expect(await restoreDirectorResources({ ...packed, version: 1 } as DirectorDeskState, async (key) => blobs.get(key) ?? null)).toEqual(document);
});

test("missing resources and invalid paths fail instead of opening a partial document", async () => {
    const state = { version: 1, document: { media: [{ data: "" }] }, resources: [{ path: ["media", 0, "data"], storageKey: "resource:missing", bytes: 1 }] } as DirectorDeskState;
    await expect(restoreDirectorResources(state, async () => null)).rejects.toThrow("素材不可用");
    state.resources[0].path = ["__proto__", "data"];
    await expect(restoreDirectorResources(state, async () => new Blob(["bad"]))).rejects.toThrow("路径无效");
});

test("resource upload failure aborts packing and leaves the source untouched", async () => {
    const document = { media: [{ data: "original" }] };
    await expect(packDirectorResources(document, async () => { throw new Error("permission denied"); })).rejects.toThrow("permission denied");
    expect(document.media[0].data).toBe("original");
});
