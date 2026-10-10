import { describe, expect, test } from "bun:test";
import { documentFromPrevis, previsFromDocument, reconcileDirectorDocument } from "../director-desk/projection";
import { createPrevisSceneFromTemplate, PREVIS_TEMPLATES } from "../src/lib/canvas/previs/previs-templates";
import { entity } from "../vendor/director-desk/src/model";
import { defaultLight } from "../vendor/director-desk/src/lighting/model";
import { isDirectorMessage } from "../src/lib/canvas/director-desk/bridge";

describe("DirectorDesk native integration", () => {
    test("empty Agent scene becomes a validated native production document", () => {
        const scene = createPrevisSceneFromTemplate("empty", "测试镜头");
        const document = documentFromPrevis(scene);
        expect(document.version).toBe(3);
        const projected = previsFromDocument(document, scene);
        expect(projected.shots[0].id).toBe(scene.shots[0].id);
        expect(projected.cameras[0].id).toBe(scene.cameras[0].id);
    });
    test("all built-in templates convert their default unmapped actors", () => {
        for (const template of PREVIS_TEMPLATES) {
            const scene = createPrevisSceneFromTemplate(template.id, template.name);
            expect(documentFromPrevis(scene).scenes[0].state.entities.length).toBe(scene.objects.length + scene.cameras.length + scene.lights.filter((l) => l.type !== "ambient").length);
        }
    });
    test("approved position edits preserve native action clips and motion paths", () => {
        const base = createPrevisSceneFromTemplate("empty", "原生工程");
        const document = documentFromPrevis(base);
        const state = document.scenes[0].state;
        const actor = entity("actor", "person", "角色");
        actor.clips = [{ id: "walk", start: 0, end: state.duration, action: "walk", speed: 1 }];
        actor.path = { smooth: true, points: [{ time: 0, position: [0, 0, 0] }, { time: state.duration, position: [3, 0, 0] }] };
        state.entities.push(actor);
        const projection = previsFromDocument(document, base);
        const edited = structuredClone(projection);
        edited.directorDesk = { version: 1, upstreamVersion: "0.4.11", document: document as unknown as Record<string, unknown>, resources: [], projection };
        edited.objects[0].transform.position = [4, 0, 2];
        const reconciled = reconcileDirectorDocument(document, edited);
        const result = reconciled.scenes[0].state.entities.find((e) => e.id === actor.id)!;
        expect(result.position).toEqual([4, 0, 2]);
        expect(result.clips).toEqual(actor.clips);
        expect(result.path?.points.map((p) => p.position)).toEqual([[4, 0, 2], [7, 0, 2]]);
        expect(result.path?.smooth).toBe(actor.path?.smooth);
        expect(document.scenes[0].state.entities.find((e) => e.id === actor.id)!.position).toEqual([0, 0, 0]);
    });
    test("renaming a light preserves animated intensity and native light parameters", () => {
        const base = createPrevisSceneFromTemplate("empty", "灯光");
        const document = documentFromPrevis(base);
        const light = entity("prop", "light-point", "灯");
        light.light = { ...defaultLight("light-point"), intensity: { keys: [{ time: 0, value: 100 }, { time: 1, value: 200 }] }, temperature: 4000 };
        document.scenes[0].state.entities.push(light);
        const projection = previsFromDocument(document, base), edited = structuredClone(projection);
        edited.directorDesk = { version: 1, upstreamVersion: "0.4.11", document: document as unknown as Record<string, unknown>, resources: [], projection };
        edited.lights.find((l) => l.id === light.id)!.name = "新灯名";
        const result = reconcileDirectorDocument(document, edited).scenes[0].state.entities.find((e) => e.id === light.id)!;
        expect(result.name).toBe("新灯名"); expect(result.light).toEqual(light.light);
    });
    test("legacy data that cannot be converted is rejected without modifying its scene", () => {
        const base = createPrevisSceneFromTemplate("empty", "模型场景");
        base.objects.push({ id: "model", name: "导入模型", kind: "model", transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, visible: true, color: "#ffffff", castShadow: true, receiveShadow: true, keyframes: [] });
        const before = structuredClone(base);
        expect(() => documentFromPrevis(base)).toThrow("尚不支持无损转换");
        expect(base).toEqual(before);
    });
    test("bridge rejects another editor session and unknown message types", () => {
        expect(isDirectorMessage({ protocol: "yingce-director-v1", session: "a", type: "response" }, "b")).toBe(false);
        expect(isDirectorMessage({ protocol: "yingce-director-v1", session: "a", type: "execute" }, "a")).toBe(false);
    });
});
