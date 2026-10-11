import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";

import { imageMetadata, videoMetadata } from "@/lib/canvas/canvas-generation-task-sync";
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { createCanvasNode } from "@/lib/canvas/canvas-project-domain";
import { createPrevisSceneFromTemplate, type PrevisTemplateId } from "@/lib/canvas/previs/previs-templates";
import { upsertPrevisSceneById } from "@/lib/canvas/previs/previs-session";
import { applyPrevisMediaOutput } from "@/lib/canvas/previs/previs-output";
import { isDirectorDeskNode, nextDirectorDeskNodeIndex } from "@/lib/canvas/previs/previs-node";
import { uploadImage } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";
import { ensureCanvasNodeAsset } from "@/services/project-asset-sync";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type Position } from "@/types/canvas";
import type { PrevisScene, PrevisSceneOutput } from "@/types/previs";

type UseCanvasPrevisOptions = {
    projectId: string;
    domainProjectId?: string;
    previsNodeId: string | null;
    previsScenes: PrevisScene[];
    nodesRef: { current: CanvasNodeData[] };
    connectionsRef: { current: CanvasConnection[] };
    getCanvasCenter: () => Position;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setPrevisNodeId: Dispatch<SetStateAction<string | null>>;
    updateProject: (projectId: string, patch: { previsScenes: PrevisScene[] }) => void;
};

const NODE_STATUS_IDLE = "idle" as const;
const PREVIS_NODE_SIZE = { width: 520, height: 340 } as const;
const PREVIS_LEGACY_NODE_SIZE = { width: 760, height: 500 } as const;

function shouldUpgradePrevisNodeSize(node: CanvasNodeData) {
    // 只迁移预演台曾经写入的默认尺寸；用户后续手动调整过的节点保持原样。
    const isLegacyDefault = node.width === PREVIS_LEGACY_NODE_SIZE.width && node.height === PREVIS_LEGACY_NODE_SIZE.height;
    const isEarlyCompactDefault = node.width <= 720 && node.height <= 320;
    return isLegacyDefault || isEarlyCompactDefault;
}

/**
 * 项目真实内存权威在 useCanvasStore.getState().projects；
 * 闭包里的 previsScenes 只作为 store 尚未就绪时的兜底。
 */
function currentPrevisScenes(projectId: string, fallback: PrevisScene[]) {
    const project = useCanvasStore.getState().projects.find((item) => item.id === projectId);
    return project?.previsScenes ?? fallback;
}
export function useCanvasPrevis({
    projectId,
    domainProjectId,
    previsNodeId,
    previsScenes,
    nodesRef,
    connectionsRef,
    getCanvasCenter,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setPrevisNodeId,
    updateProject,
}: UseCanvasPrevisOptions) {
    const { message } = App.useApp();
    const projectIdRef = useRef<string | null>(projectId);
    projectIdRef.current = projectId;

    useEffect(() => {
        projectIdRef.current = projectId;
        return () => {
            if (projectIdRef.current === projectId) projectIdRef.current = null;
        };
    }, [projectId]);

    /**
     * 新建镜头。templateId 由调用方（模板选择弹窗）显式给出 —— 这里不设默认模板，
     * 否则又会回到「无条件塞一个默认演员」的老问题。
     */
    const createPrevisShot = useCallback((templateId: PrevisTemplateId, position?: Position) => {
        const shotIndex = nextDirectorDeskNodeIndex(nodesRef.current);
        const title = `导演台 ${shotIndex}`;
        let scene = createPrevisSceneFromTemplate(templateId, title);
        const shot = scene.shots[0];
        scene = { ...scene, shots: [{ ...shot, name: `镜头 ${shotIndex}` }] };
        const node = createCanvasNode(CanvasNodeType.DirectorDesk, position || getCanvasCenter(), {
            workflowKind: "shot",
            workflowTitle: title,
            shotIndex,
            status: NODE_STATUS_IDLE,
            composerContent: "",
            previsSceneId: scene.id,
            previsShotId: shot.id,
        });
        node.title = title;
        node.width = PREVIS_NODE_SIZE.width;
        node.height = PREVIS_NODE_SIZE.height;
        const nextNodes = [...nodesRef.current, node];
        nodesRef.current = nextNodes;
        setNodes(nextNodes);
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        updateProject(projectId, { previsScenes: upsertPrevisSceneById(currentPrevisScenes(projectId, previsScenes), scene) });
        message.success("已创建导演台节点，点击缩略图进入编辑");
    }, [previsScenes, getCanvasCenter, message, nodesRef, projectId, setNodes, setSelectedConnectionId, setSelectedNodeIds, updateProject]);

    const openPrevisWorkbench = useCallback((nodeId: string) => {
        const node = nodesRef.current.find((item) => item.id === nodeId);
        if (!node || (!isDirectorDeskNode(node) && node.metadata?.workflowKind !== "shot")) return;
        if (shouldUpgradePrevisNodeSize(node)) {
            const upgradedNodes = nodesRef.current.map((item) => item.id === nodeId ? { ...item, width: PREVIS_NODE_SIZE.width, height: PREVIS_NODE_SIZE.height } : item);
            nodesRef.current = upgradedNodes;
            setNodes(upgradedNodes);
        }
        let scene = currentPrevisScenes(projectId, previsScenes).find((item) => item.id === node.metadata?.previsSceneId);
        if (!scene) {
            // 孤儿节点修复路径：节点存在但场景丢了。这不是「新建」，不弹模板选择，
            // 用空场景兜底 —— 绝不在用户没选过的情况下塞演员进去。
            scene = createPrevisSceneFromTemplate("empty", node.metadata?.workflowTitle || node.title || "镜头场景");
            const shot = scene.shots[0];
            scene = { ...scene, shots: [{ ...shot, name: node.metadata?.workflowTitle || node.title || shot.name, prompt: node.metadata?.workflowDescription || "" }] };
            const previsSceneId = scene.id;
            const previsShotId = shot.id;
            setNodes((current) => current.map((item) => item.id === nodeId ? { ...item, metadata: { ...item.metadata, previsSceneId, previsShotId } } : item));
            updateProject(projectId, { previsScenes: upsertPrevisSceneById(currentPrevisScenes(projectId, previsScenes), scene) });
        }
        setPrevisNodeId(nodeId);
    }, [previsScenes, nodesRef, projectId, setPrevisNodeId, setNodes, updateProject]);

    /** 每次保存都基于 store 中最新 previsScenes upsert，避免旧闭包数组覆盖并发保存。 */
    const savePrevisScene = useCallback((scene: PrevisScene) => {
        updateProject(projectId, { previsScenes: upsertPrevisSceneById(currentPrevisScenes(projectId, previsScenes), scene) });
    }, [previsScenes, projectId, updateProject]);

    const applyPrevisOutput = useCallback(async (output: PrevisSceneOutput) => {
        const outputProjectId = projectId;
        if (projectIdRef.current !== outputProjectId) throw new Error("画布项目已切换，请重试");
        const sourceNodeAtStart = nodesRef.current.find((item) => item.id === previsNodeId);
        if (!sourceNodeAtStart || sourceNodeAtStart.metadata?.previsSceneId !== output.scene.id) throw new Error("镜头节点不存在或场景已切换");
        const sourceNodeId = sourceNodeAtStart.id;
        if (!output.clayVideo && !output.beauty) throw new Error("导演台没有返回构图或视频文件");
        const [image, videoUpload] = await Promise.all([
            !output.clayVideo && output.beauty ? uploadImage(output.beauty) : Promise.resolve(null),
            output.clayVideo ? uploadMediaFile(output.clayVideo, "previs-clay") : Promise.resolve(null),
        ]);
        // 上传期间项目、节点和镜头都可能变化。以当前权威状态重新核验并合并，
        // 不允许旧输出写入另一项目，也不允许旧 scene 快照覆盖并发编辑。
        const currentOutputContext = () => {
            const outputProject = useCanvasStore.getState().projects.find((item) => item.id === outputProjectId);
            const sourceNode = nodesRef.current.find((item) => item.id === sourceNodeId);
            const latestScene = outputProject?.previsScenes.find((item) => item.id === output.scene.id);
            if (projectIdRef.current !== outputProjectId || !outputProject || !sourceNode || sourceNode.metadata?.previsSceneId !== output.scene.id || !latestScene || !latestScene.shots.some((shot) => shot.id === output.shot.id)) throw new Error("输出期间项目或镜头已切换、删除，请重试");
            return { source: sourceNode, scene: latestScene, nodes: nodesRef.current, connections: connectionsRef.current, shot: output.shot, prompt: output.prompt };
        };
        const initialContext = currentOutputContext();
        const referenceKey = image ? "previsPreviewNodeId" : "previsClayVideoNodeId";
        const nodeId = initialContext.source.metadata?.[referenceKey] || `${image ? "image-previs" : "video-previs-clay"}-${nanoid()}`;
        const videoLabel = output.videoKind === "depth" ? "深度视频" : output.videoKind === "color" ? "普通视频" : "白模视频";
        const media = image
            ? { id: nodeId, type: CanvasNodeType.Image as const, label: "预演台构图", ...fitNodeSize(image.width, image.height), metadata: imageMetadata(image) }
            : { id: nodeId, type: CanvasNodeType.Video as const, label: videoLabel, width: 360, height: 220, metadata: videoMetadata(videoUpload!) };
        const first = applyPrevisMediaOutput({ ...initialContext, media });
        const asset = await ensureCanvasNodeAsset({ canvasId: projectId, domainProjectId, node: first.mediaNode, source: "canvas-manual" });
        // 素材登记也可能跨越异步编辑，提交前重新读取节点、连线与场景。
        const latestContext = currentOutputContext();
        if (latestContext.source.metadata?.[referenceKey] !== initialContext.source.metadata?.[referenceKey]) throw new Error("输出期间产物引用已有其他更新，请重试");
        const { nodes: nextNodes, connections: nextConnections, scene: mergedScene } = applyPrevisMediaOutput({ ...latestContext, media: { ...media, metadata: { ...media.metadata, assetId: asset.assetId } } });
        nodesRef.current = nextNodes;
        connectionsRef.current = nextConnections;
        setNodes(nextNodes);
        setConnections(nextConnections);
        savePrevisScene(mergedScene);
    }, [connectionsRef, previsNodeId, domainProjectId, nodesRef, projectId, savePrevisScene, setConnections, setNodes]);

    return { applyPrevisOutput, createPrevisShot, openPrevisWorkbench, savePrevisScene };
}
