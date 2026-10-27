import { describe, expect, test } from "bun:test";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import { nextDirectorDeskNodeIndex, normalizeDirectorDeskNodes } from "../src/lib/canvas/previs/previs-node";
import { getNodeDefinition, getNodeGenerationMode, getNodeLabel, getNodeResourceKind } from "../src/lib/canvas/node-registry";
import { nodeHoverToolbarTools } from "../src/lib/canvas/tool-registry/definitions/node-hover-tools";
import { resolveNodeToolbarPlacement, type ToolContext } from "../src/lib/canvas/tool-registry";
import { parseCanvasStorageDocument } from "../src/lib/canvas/canvas-storage-revision";

function video(title: string, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return { id: title, type: CanvasNodeType.Video, title, position: { x: 10, y: 20 }, width: 520, height: 340, metadata };
}

describe("导演台专门节点", () => {
    test("存量转换保留场景、引用、ID、自定义名称与普通视频", () => {
        const ordinary = video("镜头 9", { content: "video.mp4", workflowKind: "shot", shotIndex: 9 });
        const existing = video("镜头 2", { previsSceneId: "scene", previsShotId: "shot", previsPreviewNodeId: "image", workflowTitle: "镜头 2", generationMode: "video", videoEditOperation: "text_to_video" });
        const custom = video("奔跑的主角", { previsSceneId: "custom", content: "keep" });
        const converted = normalizeDirectorDeskNodes([ordinary, existing, custom]);
        expect(converted[0]).toBe(ordinary);
        expect(converted[1]).toMatchObject({ id: existing.id, type: CanvasNodeType.DirectorDesk, title: "导演台 2", position: existing.position, metadata: { previsSceneId: "scene", previsShotId: "shot", previsPreviewNodeId: "image", workflowTitle: "导演台 2" } });
        expect(converted[1].metadata?.generationMode).toBeUndefined();
        expect(converted[1].metadata?.videoEditOperation).toBeUndefined();
        expect(converted[2].title).toBe("奔跑的主角");
        expect(converted[2].metadata?.content).toBe("keep");
        expect(normalizeDirectorDeskNodes(converted)).toBe(converted);
    });

    test("编号只计算导演台，删除后不会复用仍在使用的编号", () => {
        expect(nextDirectorDeskNodeIndex([])).toBe(1);
        const directors = normalizeDirectorDeskNodes([video("镜头 2", { previsSceneId: "scene", shotIndex: 2 })]);
        expect(nextDirectorDeskNodeIndex([...directors, video("镜头 99", { shotIndex: 99 })])).toBe(3);
    });

    test("真实持久状态解析转换节点，保留场景、连线和项目版本", () => {
        const project = { id: "canvas", revision: 7, nodes: [video("镜头 1", { previsSceneId: "scene" })], connections: [{ id: "link", fromNodeId: "image", toNodeId: "镜头 1" }], previsScenes: [{ id: "scene" }] };
        const document = parseCanvasStorageDocument(JSON.stringify({ state: { projects: [project] }, storageRevision: 12 }));
        expect(document.storageRevision).toBe(12);
        expect(document.state.projects[0]).toMatchObject({ revision: 7, connections: project.connections, previsScenes: project.previsScenes });
        expect(document.state.projects[0].nodes[0]).toMatchObject({ id: "镜头 1", type: CanvasNodeType.DirectorDesk, title: "导演台 1" });
    });

    test("类型可发现，但不能被当作视频生成或参考素材，没有左右加号", () => {
        const director = { ...video("导演台 1", { content: "old", previsSceneId: "scene" }), type: CanvasNodeType.DirectorDesk };
        expect(getNodeLabel(director.type)).toBe("导演台");
        expect(getNodeGenerationMode(director)).toBeNull();
        expect(getNodeResourceKind(director)).toBeNull();
        expect(getNodeDefinition(director.type)).toMatchObject({ showInputConnection: false, showOutputConnection: false });
    });

    test("导演台菜单只保留节点管理和移除，普通视频保留上传并隐藏生成设置", () => {
        const director = normalizeDirectorDeskNodes([video("镜头 1", { previsSceneId: "scene", status: "error" })])[0];
        const context = (node: CanvasNodeData) => ({ node, nodeMetadata: node.metadata, workspaceMode: "professional", handlers: {} } as ToolContext);
        const ctx = context(director);
        const tools = nodeHoverToolbarTools.filter((tool) => !tool.applicable || tool.applicable(ctx));
        expect(tools.map((tool) => tool.id).sort()).toEqual(["info", "delete", "node-lock"].sort());
        expect(tools.every((tool) => resolveNodeToolbarPlacement(tool, ctx).group === "more")).toBe(true);
        const videoTools = nodeHoverToolbarTools.filter((tool) => !tool.applicable || tool.applicable(context(video("视频"))));
        expect(videoTools.some((tool) => tool.id === "uploadVideo")).toBe(true);
        expect(videoTools.some((tool) => tool.id === "edit")).toBe(false);
    });
});
