import { describe, expect, test } from "bun:test";
import { applyPrevisMediaOutput } from "../src/lib/canvas/previs/previs-output";
import { createPrevisScene } from "../src/lib/canvas/previs/previs-scene";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import { captureDirectorComposition } from "../director-desk/capture-composition";
import { canvasConnectionPath } from "../src/components/canvas/canvas-connections";

function fixture() {
    const scene = createPrevisScene("导演台 1");
    scene.shots[0].previewNodeId = "image";
    const source: CanvasNodeData = {
        id: "director", type: CanvasNodeType.DirectorDesk, title: "导演台 1",
        position: { x: -100, y: 20 }, width: 520, height: 340,
        metadata: { previsSceneId: scene.id, previsPreviewNodeId: "image", previsClayVideoNodeId: "video", referenceAssetNodeIds: ["image", "video"] },
    };
    const image: CanvasNodeData = { id: "image", type: CanvasNodeType.Image, title: "构图", position: { x: -500, y: 20 }, width: 300, height: 200, metadata: { content: "old.png" } };
    const video: CanvasNodeData = { id: "video", type: CanvasNodeType.Video, title: "视频", position: { x: -500, y: 300 }, width: 400, height: 240, metadata: { content: "old.mp4" } };
    return { scene, source, image, video, shot: scene.shots[0], prompt: "当前提示词", connections: [{ id: "image-link", fromNodeId: source.id, toNodeId: "image" }] };
}

describe("导演台独立产物回流", () => {
    test("视频只更新视频，保留构图节点、场景预览和手动视频尺寸", () => {
        const f = fixture();
        const result = applyPrevisMediaOutput({ ...f, nodes: [f.source, f.image, f.video], media: { id: "video", type: CanvasNodeType.Video, label: "白模视频", width: 360, height: 220, metadata: { content: "new.mp4" } } });
        expect(result.nodes).toHaveLength(3);
        expect(result.nodes.find((n) => n.id === "image")).toBe(f.image);
        expect(result.scene).toBe(f.scene);
        expect(result.mediaNode).toMatchObject({ type: CanvasNodeType.Video, width: 400, height: 240, position: { x: 468, y: 20 }, metadata: { content: "new.mp4" } });
        expect(result.nodes[0].metadata?.previsPreviewNodeId).toBe("image");
        expect(result.connections).toHaveLength(2);
        expect(result.connections[1]).toMatchObject({ fromNodeId: f.source.id, toNodeId: "video" });
    });

    test("构图只更新图片并合并最新场景，不覆盖已有视频及其他编辑", () => {
        const f = fixture();
        f.scene.title = "期间修改的标题";
        f.scene.shots[0].name = "期间修改的镜头";
        const result = applyPrevisMediaOutput({ ...f, nodes: [f.source, f.image, f.video], media: { id: "image", type: CanvasNodeType.Image, label: "预演台构图", width: 320, height: 180, metadata: { content: "new.png" } } });
        expect(result.nodes).toHaveLength(3);
        expect(result.nodes.find((n) => n.id === "video")).toBe(f.video);
        expect(result.scene).toMatchObject({ title: "期间修改的标题", shots: [{ name: "期间修改的镜头", previewNodeId: "image" }] });
        expect(result.nodes[0].metadata?.previsClayVideoNodeId).toBe("video");
        expect(result.connections).toBe(f.connections);
        expect(f.image.metadata?.content).toBe("old.png");
    });

    test("两个新产物依次位于右侧并避让，重复回流复用位置与连线", () => {
        const f = fixture();
        const image = { id: "new-image", type: CanvasNodeType.Image as const, label: "预演台构图", width: 320, height: 180, metadata: { content: "new.png" } };
        const first = applyPrevisMediaOutput({ ...f, nodes: [f.source], media: image });
        const video = { id: "new-video", type: CanvasNodeType.Video as const, label: "普通视频", width: 360, height: 220, metadata: { content: "new.mp4" } };
        const second = applyPrevisMediaOutput({ ...f, source: first.nodes[0], nodes: first.nodes, connections: first.connections, scene: first.scene, media: video });
        expect(first.mediaNode.position).toEqual({ x: 468, y: 20 });
        expect(second.mediaNode.position).toEqual({ x: 468, y: 248 });
        const connection = first.connections.find((c) => c.toNodeId === image.id)!;
        expect(connection.fromNodeId).toBe(f.source.id);
        expect(canvasConnectionPath(connection, first.nodes[0], first.mediaNode)).toMatchObject({ startX: f.source.position.x + f.source.width, endX: first.mediaNode.position.x });
        const repeated = applyPrevisMediaOutput({ ...f, source: second.nodes[0], nodes: second.nodes, connections: second.connections, scene: second.scene, media: video });
        expect(repeated.nodes).toHaveLength(3);
        expect(repeated.connections).toBe(second.connections);
        expect(repeated.mediaNode.position).toEqual(second.mediaNode.position);
    });

    test("右侧已有普通节点时避让到其下方", () => {
        const f = fixture();
        const blocker = { ...f.video, id: "ordinary", position: { x: 500, y: 0 } };
        const result = applyPrevisMediaOutput({ ...f, nodes: [f.source, blocker], media: { id: "new", type: CanvasNodeType.Image, label: "预演台构图", width: 320, height: 180, metadata: {} } });
        expect(result.mediaNode.position).toEqual({ x: 468, y: 288 });
        expect(result.nodes[1]).toBe(blocker);
    });

    test("再次回流纠正旧反向连线，保留 ID 和其他连接", () => {
        const f = fixture();
        const reverse = { id: "legacy-link", fromNodeId: f.image.id, toNodeId: f.source.id };
        const unrelated = { id: "other-link", fromNodeId: "other", toNodeId: f.source.id };
        const result = applyPrevisMediaOutput({ ...f, nodes: [f.source, f.image], connections: [reverse, unrelated], media: { id: "image", type: CanvasNodeType.Image, label: "预演台构图", width: 320, height: 180, metadata: {} } });
        expect(result.connections).toHaveLength(2);
        expect(result.connections[0]).toMatchObject({ id: "legacy-link", fromNodeId: f.source.id, toNodeId: f.image.id });
        expect(result.connections[1]).toBe(unrelated);
        expect(reverse.toNodeId).toBe(f.source.id);
        expect(canvasConnectionPath(result.connections[0], result.nodes[0], result.mediaNode)).toMatchObject({ startX: 420, endX: 468 });
    });

    test("正反连线并存时保留已有输出连线，移除该产物的反向重复", () => {
        const f = fixture();
        const result = applyPrevisMediaOutput({ ...f, nodes: [f.source, f.image], connections: [...f.connections, { id: "reverse", fromNodeId: f.image.id, toNodeId: f.source.id }], media: { id: "image", type: CanvasNodeType.Image, label: "预演台构图", width: 320, height: 180, metadata: {} } });
        expect(result.connections).toEqual(f.connections);
        expect(result.connections[0]).toBe(f.connections[0]);
    });

    test("拒绝场景、镜头或产物类型变化，保持输入不变", () => {
        const f = fixture();
        const input = { ...f, nodes: [f.source, f.image], media: { id: "image", type: CanvasNodeType.Image as const, label: "预演台构图", width: 320, height: 180, metadata: {} } };
        expect(() => applyPrevisMediaOutput({ ...input, scene: { ...f.scene, id: "other" } })).toThrow("切换");
        expect(() => applyPrevisMediaOutput({ ...input, scene: { ...f.scene, shots: [] } })).toThrow("切换");
        expect(() => applyPrevisMediaOutput({ ...input, media: { ...input.media, type: CanvasNodeType.Video } })).toThrow("类型已改变");
        expect(input.nodes).toEqual([f.source, f.image]);
    });
});

describe("当前时间构图截图与预览恢复", () => {
    function engine(fail = false) {
        const calls: unknown[][] = [];
        const png = new Blob(["png"], { type: "image/png" });
        const fake = {
            exporting: false,
            prepareOutput: async (...args: unknown[]) => { calls.push(["prepare", ...args]); },
            renderOutput: (...args: unknown[]) => {
                calls.push(["render", ...args]);
                return { toBlob: (callback: BlobCallback, mime: string) => { calls.push(["blob", mime]); callback(fail ? null : png); } };
            },
            restorePreview: (time: number) => { calls.push(["restore", time]); fake.exporting = false; },
        };
        return { fake, png, calls, engine: fake as unknown as Parameters<typeof captureDirectorComposition>[0] };
    }
    const input = () => ({ time: 2.5, width: 1280, height: 720, cameraId: "selected-camera", signal: new AbortController().signal });

    test("使用当前时间与取景机位输出 PNG 并恢复预览", async () => {
        const f = engine();
        expect(await captureDirectorComposition(f.engine, input())).toBe(f.png);
        expect(f.calls[1]).toEqual(["render", 2.5, 1280, 720, "selected-camera", null]);
        expect(f.calls.slice(2)).toEqual([["blob", "image/png"], ["restore", 2.5]]);
        expect(f.fake.exporting).toBe(false);
    });

    test("截图失败仍恢复预览且暴露错误", async () => {
        const f = engine(true);
        await expect(captureDirectorComposition(f.engine, input())).rejects.toThrow("构图截图失败");
        expect(f.calls.at(-1)).toEqual(["restore", 2.5]);
        expect(f.fake.exporting).toBe(false);
    });

    test("已取消的截图不渲染，仍释放导出状态", async () => {
        const f = engine();
        const aborter = new AbortController();
        aborter.abort();
        await expect(captureDirectorComposition(f.engine, { ...input(), signal: aborter.signal })).rejects.toThrow();
        expect(f.calls.map((call) => call[0])).toEqual(["prepare", "restore"]);
        expect(f.fake.exporting).toBe(false);
    });
});
