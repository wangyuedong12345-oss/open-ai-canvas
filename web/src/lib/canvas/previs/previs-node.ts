import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export function isDirectorDeskNode(node: CanvasNodeData) {
    return node.type === CanvasNodeType.DirectorDesk || (node.type === CanvasNodeType.Video && Boolean(node.metadata?.previsSceneId));
}

export function nextDirectorDeskNodeIndex(nodes: CanvasNodeData[]) {
    const directors = nodes.filter(isDirectorDeskNode);
    return Math.max(directors.length, ...directors.map((node) => {
        const titleIndex = /^(?:导演台|镜头)\s+(\d+)$/.exec(node.title)?.[1];
        return Math.max(Number(titleIndex) || 0, node.metadata?.shotIndex || 0);
    })) + 1;
}

/** 把已绑定场景的视频节点转为导演台；节点 ID、场景、产物和自定义名称保持原值。 */
export function normalizeDirectorDeskNodes(nodes: CanvasNodeData[]) {
    let changed = false;
    const next = nodes.map((node) => {
        if (node.type !== CanvasNodeType.Video || !node.metadata?.previsSceneId) return node;
        changed = true;
        const { generationMode: _mode, videoEditOperation: _operation, ...metadata } = node.metadata;
        return {
            ...node,
            type: CanvasNodeType.DirectorDesk,
            title: node.title.replace(/^镜头\s+(\d+)$/, "导演台 $1"),
            metadata: { ...metadata, workflowTitle: metadata.workflowTitle?.replace(/^镜头\s+(\d+)$/, "导演台 $1") },
        };
    });
    return changed ? next : nodes;
}
