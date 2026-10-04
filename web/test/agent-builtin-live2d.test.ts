import { expect, test } from "bun:test";
import { resolve, sep } from "node:path";
import { BUILTIN_LIVE2D_MODELS, DEFAULT_CANVAS_APPEARANCE, builtinLive2DModel, live2DSource } from "../src/lib/canvas/agent-appearance";
import { agentLive2DModelURL, builtinLive2DModelURL } from "../src/services/api/appearance";

test("builtin selection preserves the custom resource and the last builtin fallback", () => {
    const custom = { ...DEFAULT_CANVAS_APPEARANCE, live2dResourceId: "uploaded", live2dEntry: "avatar/model.model3.json" };
    expect(live2DSource(custom)).toBe("custom");
    expect(agentLive2DModelURL(custom, true)).toContain("/admin/settings/appearance/live2d/uploaded/avatar/model.model3.json");
    const selected = { ...custom, live2dSource: "builtin" as const, live2dBuiltinModel: "nico" as const };
    expect(agentLive2DModelURL(selected)).toBe("/live2d/models/nico/nico.model3.json");
    expect(selected.live2dResourceId).toBe("uploaded");
    const reselectedCustom = { ...selected, live2dSource: "custom" as const };
    expect(agentLive2DModelURL(reselectedCustom)).toContain("/public/appearance/live2d/uploaded/");
    expect(builtinLive2DModel(reselectedCustom)).toBe("nico");
    expect(agentLive2DModelURL(DEFAULT_CANVAS_APPEARANCE)).toBe(builtinLive2DModelURL("nito"));
});

for (const name of BUILTIN_LIVE2D_MODELS) {
    test(`${name} has complete local runtime references and valid texture headers`, async () => {
        const root = resolve(import.meta.dir, `../public/live2d/models/${name}`);
        const manifest = await Bun.file(resolve(root, `${name}.model3.json`)).json();
        expect(manifest.Version).toBe(3);
        const refs = manifest.FileReferences;
        const paths = [refs.Moc, ...refs.Textures, refs.Physics, refs.Pose, refs.DisplayInfo, refs.UserData,
            ...(refs.Expressions || []).map((item: { File: string }) => item.File),
            ...Object.values(refs.Motions || {}).flatMap((motions) => (motions as { File: string; Sound?: string }[]).map((motion) => {
                expect(motion.Sound || "").toBe("");
                return motion.File;
            }))].filter(Boolean) as string[];
        for (const path of paths) {
            const target = resolve(root, path);
            expect(target.startsWith(root + sep)).toBe(true);
            expect(await Bun.file(target).exists()).toBe(true);
            if (target.endsWith(".json")) expect(await Bun.file(target).json()).toBeDefined();
        }
        expect(await Bun.file(resolve(root, refs.Moc)).slice(0, 4).text()).toBe("MOC3");
        for (const texture of refs.Textures) {
            const header = new DataView(await Bun.file(resolve(root, texture)).slice(0, 24).arrayBuffer());
            expect(header.getUint32(0)).toBe(0x89504e47);
            expect(header.getUint32(16)).toBeLessThanOrEqual(4096);
            expect(header.getUint32(20)).toBeLessThanOrEqual(4096);
        }
    });
}
