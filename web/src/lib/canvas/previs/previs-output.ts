import { nanoid } from "nanoid";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";
import type { PrevisScene, PrevisShot } from "@/types/previs";
import { mergePrevisOutputPreview } from "./previs-session";

type PrevisMedia = {
    id: string;
    type: CanvasNodeType.Image | CanvasNodeType.Video;
    label: string;
    width: number;
    height: number;
    metadata: CanvasNodeMetadata;
};

/** 产物落在导演台右侧；重复回流复用已在右侧的位置，旧左侧产物移到右侧。 */
function outputPosition(source: CanvasNodeData, nodes: CanvasNodeData[], media: PrevisMedia) {
    const gap = 48;
    const x = source.position.x + source.width + gap;
    const existing = nodes.find((node) => node.id === media.id);
    let y = existing?.position.x === x ? Math.max(source.position.y, existing.position.y) : source.position.y;
    const blockers = nodes.filter((node) => node.id !== source.id && node.id !== media.id && node.position.x < x + media.width + gap && node.position.x + node.width + gap > x)
        .sort((a, b) => a.position.y - b.position.y);
    for (const node of blockers) {
        if (node.position.y < y + media.height + gap && node.position.y + node.height + gap > y) y = node.position.y + node.height + gap;
    }
    return { x, y };
}

/** 只更新本次产物，另一种产物及其预览、引用和场景并发修改保持原值。 */
export function applyPrevisMediaOutput(input: {
    source: CanvasNodeData; nodes: CanvasNodeData[]; connections: CanvasConnection[];
    scene: PrevisScene; shot: PrevisShot; prompt: string; media: PrevisMedia;
}) {
    const { source, nodes, connections, scene, shot, prompt } = input;
    if (source.metadata?.previsSceneId !== scene.id || !scene.shots.some((item) => item.id === shot.id)) throw new Error("导演台节点或镜头已切换，请重试");
    const image = input.media.type === CanvasNodeType.Image;
    const existing = nodes.find((node) => node.id === input.media.id);
    if (existing && existing.type !== input.media.type) throw new Error("产物引用的节点类型已改变，请重试");
    const media = { ...input.media, ...(!image && existing ? { width: existing.width, height: existing.height } : {}) };
    const mediaNode: CanvasNodeData = {
        ...existing,
        id: media.id, type: media.type, title: `${source.title} · ${media.label}`,
        position: outputPosition(source, nodes, media), width: media.width, height: media.height,
        metadata: {
            ...existing?.metadata, ...media.metadata, prompt,
            workflowKind: image ? "reference_set" : "reference_video",
            assetTags: [image ? media.label : `预演台${media.label}`, `镜头:${source.title}`], producedModel: undefined, producedModelCandidate: undefined,
        },
    };
    const metadata: Partial<CanvasNodeMetadata> = {
        previsShotId: shot.id, composerContent: prompt, prompt,
        ...(image ? { previsPreviewNodeId: media.id } : { previsClayVideoNodeId: media.id, videoCameraMoveId: shot.cameraMove, videoCameraMovePrompt: prompt }),
        referenceAssetNodeIds: Array.from(new Set([...(source.metadata?.referenceAssetNodeIds || []), media.id])),
    };
    const nextNodes = nodes.map((node) => node.id === source.id ? { ...node, metadata: { ...node.metadata, ...metadata } } : node.id === media.id ? mediaNode : node);
    if (!existing) nextNodes.push(mediaNode);
    const linked = connections.some((connection) => connection.fromNodeId === source.id && connection.toNodeId === media.id);
    const reverse = connections.find((connection) => connection.fromNodeId === media.id && connection.toNodeId === source.id);
    let nextConnections = connections;
    if (reverse) {
        // 旧回流把产物连回导演台；复用连线 ID 调整方向，并消除同一产物的反向重复。
        nextConnections = connections.flatMap((connection) => {
            if (connection.fromNodeId !== media.id || connection.toNodeId !== source.id) return [connection];
            if (linked || connection !== reverse) return [];
            return [{ ...connection, fromNodeId: source.id, toNodeId: media.id,
                fromHandleId: connection.toHandleId, toHandleId: connection.fromHandleId,
                fromAnchorRatio: connection.toAnchorRatio, toAnchorRatio: connection.fromAnchorRatio }];
        });
    } else if (!linked) {
        nextConnections = [...connections, { id: nanoid(), fromNodeId: source.id, toNodeId: media.id }];
    }
    const nextScene = image ? mergePrevisOutputPreview(scene, { sceneId: scene.id, shotId: shot.id, previewNodeId: media.id }) : scene;
    if (!nextScene) throw new Error("输出期间镜头已切换或删除，请重试");
    return {
        nodes: nextNodes, mediaNode, scene: nextScene,
        connections: nextConnections,
    };
}
