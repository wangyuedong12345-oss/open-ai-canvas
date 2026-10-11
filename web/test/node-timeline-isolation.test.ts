import { describe, expect, test } from "bun:test";
import { applyNodeConfigPatch } from "@/lib/canvas/canvas-project-domain";
import { buildNodeTimelineDraft, buildNodeTimelineMetadata, buildTimelineFromNodes, syncNodeSubtitlesToTimeline } from "@/lib/timeline/timeline-build";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

function video(id: string): CanvasNodeData {
    return {
        id, type: CanvasNodeType.Video, title: id, position: { x: 0, y: 0 }, width: 320, height: 180,
        metadata: { content: `${id}.mp4`, durationMs: 5_000, subtitleEntries: [{ index: 1, startMs: 100, endMs: 1_000, text: id }] },
    };
}

describe("节点独立剪辑", () => {
    test("画布已有共享时间线和导演台输出时，首次打开仍只加载当前素材", () => {
        const nodes = [video("director-output"), video("ordinary")];
        const project = { nodes, timeline: buildTimelineFromNodes(nodes) };
        expect(buildNodeTimelineDraft(project.nodes[1]).clips.every((clip) => clip.nodeId === "ordinary")).toBe(true);
        expect(buildNodeTimelineDraft(project.nodes[0]).clips.every((clip) => clip.nodeId === "director-output")).toBe(true);
        const audio = { ...video("audio"), type: CanvasNodeType.Audio };
        expect(buildNodeTimelineDraft(audio).clips.map((clip) => clip.kind)).toEqual(["audio"]);
    });

    test("保存和序列化后重开保留裁剪与手动素材，不影响其他节点", () => {
        const owner = video("owner");
        const other = video("other");
        const before = JSON.stringify(other);
        const draft = buildNodeTimelineDraft(owner);
        draft.clips[0] = { ...draft.clips[0], durationMs: 2_000, sourceStartMs: 500 };
        draft.clips.push({ ...buildNodeTimelineDraft(other).clips[0], startMs: 2_000 });
        const saved = applyNodeConfigPatch(owner, buildNodeTimelineMetadata(owner, draft));
        const reloaded = JSON.parse(JSON.stringify([saved, other])) as CanvasNodeData[];
        const reopened = buildNodeTimelineDraft(reloaded[0]);
        expect(reopened.clips[0]).toMatchObject({ durationMs: 2_000, sourceStartMs: 500 });
        expect(reopened.clips.some((clip) => clip.nodeId === "other")).toBe(true);
        expect(buildNodeTimelineDraft(reloaded[1]).clips.every((clip) => clip.nodeId === "other")).toBe(true);
        expect(JSON.stringify(other)).toBe(before);
        expect(owner.metadata?.timeline).toBeUndefined();
    });

    test("保存空时间线后重开不会自动恢复已删除的视频", () => {
        const owner = video("owner");
        const draft = buildNodeTimelineDraft(owner);
        draft.clips = [];
        const saved = applyNodeConfigPatch(owner, buildNodeTimelineMetadata(owner, draft));
        expect(buildNodeTimelineDraft(saved).clips).toEqual([]);
    });

    test("保存后重开保留轨道锁定、可见性和静音状态", () => {
        const owner = video("owner");
        const draft = buildNodeTimelineDraft(owner);
        draft.tracks = draft.tracks.map((track) => ({ ...track, locked: true, visible: false, muted: true }));
        const saved = applyNodeConfigPatch(owner, buildNodeTimelineMetadata(owner, draft));
        expect(buildNodeTimelineDraft(saved).tracks).toEqual(draft.tracks);
    });

    test("保存只回写拥有者字幕，其他素材字幕作为剪辑快照保留", () => {
        const owner = video("owner");
        const other = video("other");
        const before = JSON.stringify(other);
        const draft = buildTimelineFromNodes([owner, other]);
        draft.clips.find((clip) => clip.kind === "subtitle" && clip.nodeId === "owner")!.text = "当前剪辑字幕";
        draft.clips.find((clip) => clip.kind === "subtitle" && clip.nodeId === "other")!.text = "其他素材快照";
        const patch = buildNodeTimelineMetadata(owner, draft);
        expect(patch.subtitleEntries?.map((entry) => entry.text)).toEqual(["当前剪辑字幕"]);
        const saved = applyNodeConfigPatch(owner, patch);
        expect(buildNodeTimelineDraft(saved).clips.find((clip) => clip.kind === "subtitle" && clip.nodeId === "other")?.text).toBe("其他素材快照");
        expect(JSON.stringify(other)).toBe(before);
    });

    test("清空拥有者字幕不会删除其他素材字幕，也不会重新带回旧字幕", () => {
        const owner = video("owner");
        const other = video("other");
        const draft = buildTimelineFromNodes([owner, other]);
        const cleared = applyNodeConfigPatch(owner, { subtitleEntries: [], timeline: syncNodeSubtitlesToTimeline(draft, owner.id, []) });
        const saved = applyNodeConfigPatch(cleared, buildNodeTimelineMetadata(cleared, draft));
        const clips = buildNodeTimelineDraft(saved).clips;
        expect(clips.some((clip) => clip.kind === "subtitle" && clip.nodeId === owner.id)).toBe(false);
        expect(clips.some((clip) => clip.kind === "subtitle" && clip.nodeId === other.id)).toBe(true);
        expect(other.metadata?.timeline).toBeUndefined();
    });
});
