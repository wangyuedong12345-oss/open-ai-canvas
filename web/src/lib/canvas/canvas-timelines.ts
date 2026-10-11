import type { CanvasNodeData } from "@/types/canvas";
import type { TimelineProject } from "@/types/timeline";

type CanvasTimelines = { nodes: CanvasNodeData[]; timeline?: TimelineProject };

/** 资源检查同时覆盖节点剪辑和仍保留在画布文档中的项目剪辑。 */
export function collectCanvasTimelines(project: CanvasTimelines): TimelineProject[] {
    return [project.timeline, ...project.nodes.map((node) => node.metadata?.timeline)]
        .filter((timeline): timeline is TimelineProject => Boolean(timeline));
}

export function mapCanvasTimelines(project: CanvasTimelines, transform: (timeline: TimelineProject) => TimelineProject): CanvasTimelines {
    const nodes = project.nodes.map((node) => {
        const current = node.metadata?.timeline;
        if (!current) return node;
        const timeline = transform(current);
        return timeline === current ? node : { ...node, metadata: { ...node.metadata, timeline } };
    });
    return { nodes, timeline: project.timeline ? transform(project.timeline) : undefined };
}
