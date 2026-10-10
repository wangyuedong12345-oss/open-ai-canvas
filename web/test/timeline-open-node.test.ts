import { describe, expect, test } from "bun:test";
import { buildTimelineFromNodes, ensureNodeInTimeline } from "../src/lib/timeline/timeline-build";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function videoNode(id: string): CanvasNodeData {
    return {
        id, type: CanvasNodeType.Video, title: id, position: { x: 0, y: 0 }, width: 100, height: 100,
        metadata: { content: "video.mp4", durationMs: 4_000, subtitleEntries: [{ index: 1, startMs: 500, endMs: 1_500, text: "字幕" }] },
    };
}

describe("从视频节点进入已保存的剪辑", () => {
    test("旧源节点失效时补入当前视频，保留已有裁剪并同步字幕偏移", () => {
        const timeline = buildTimelineFromNodes([videoNode("deleted")]);
        timeline.clips[0] = { ...timeline.clips[0], durationMs: 2_000, sourceStartMs: 1_000 };
        const before = JSON.stringify(timeline);
        const next = ensureNodeInTimeline(timeline, videoNode("current"));
        expect(JSON.stringify(timeline)).toBe(before);
        expect(next.clips[0]).toEqual(timeline.clips[0]);
        expect(next.clips.find((clip) => clip.nodeId === "current" && clip.kind === "video")).toMatchObject({ startMs: 2_000, durationMs: 4_000, sourceStartMs: 0 });
        expect(next.clips.find((clip) => clip.nodeId === "current" && clip.kind === "subtitle")).toMatchObject({ startMs: 2_500, durationMs: 1_000 });
        expect(next.durationMs).toBe(6_000);
    });

    test("当前视频已经入轨时保持裁剪位置且不重复添加", () => {
        const node = videoNode("current");
        const timeline = buildTimelineFromNodes([node]);
        timeline.clips[0].sourceStartMs = 500;
        expect(ensureNodeInTimeline(timeline, node)).toBe(timeline);
    });

    test("锁定轨道和没有媒体的节点不自动入轨", () => {
        const timeline = buildTimelineFromNodes([videoNode("existing")]);
        timeline.tracks[0].locked = true;
        expect(ensureNodeInTimeline(timeline, videoNode("current"))).toBe(timeline);
        timeline.tracks[0].locked = false;
        const node = videoNode("empty");
        node.metadata = {};
        expect(ensureNodeInTimeline(timeline, node)).toBe(timeline);
    });
});
