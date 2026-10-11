import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { VideoNodeContent } from "../src/components/canvas/canvas-node-media-content";
import { canvasThemes } from "../src/lib/canvas-theme";
import { applyPrevisMediaOutput } from "../src/lib/canvas/previs/previs-output";
import { createPrevisScene } from "../src/lib/canvas/previs/previs-scene";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function preview(node: CanvasNodeData, mediaActive = false) {
    return renderToStaticMarkup(<VideoNodeContent node={node} theme={canvasThemes.dark} mediaActive={mediaActive} isEditingContent={false} textareaRef={{ current: null }} isBatchRoot={false} batchCount={1} batchExpanded={false} batchOpening={false} batchRecovering={false} mentionReferences={[]} onContentChange={() => undefined} onStopEditing={() => undefined} onMediaPlayRequest={() => undefined} />);
}

const ordinary: CanvasNodeData = {
    id: "ordinary", type: CanvasNodeType.Video, title: "普通视频", position: { x: 0, y: 0 }, width: 360, height: 220,
    metadata: { content: "video.mp4", mimeType: "video/mp4", videoPreview: { content: "poster.png", width: 1280, height: 720, bytes: 10, mimeType: "image/png" } },
};

test("普通视频初始显示中央播放按钮，未挂载完整播放器", () => {
    const html = preview(ordinary);
    expect(html).toContain('aria-label="播放 普通视频"');
    expect(html).toContain("group/video-preview");
    expect(html).not.toContain("canvas-video-player");
});

test("导演台实际输出即使带有外部激活状态，未点播放仍使用普通预览", () => {
    const scene = createPrevisScene("导演台 1");
    const source = { ...ordinary, id: "director", type: CanvasNodeType.DirectorDesk, title: "导演台 1", metadata: { previsSceneId: scene.id } };
    const output = applyPrevisMediaOutput({ source, nodes: [source], connections: [], scene, shot: scene.shots[0], prompt: "", media: { id: "output", type: CanvasNodeType.Video, label: "白模视频", width: 360, height: 220, metadata: ordinary.metadata! } });
    for (const active of [false, true]) {
        const html = preview(output.mediaNode, active);
        expect(html).toContain('aria-label="播放 导演台 1 · 白模视频"');
        expect(html).toContain("group/video-preview");
        expect(html).not.toContain("canvas-video-player");
    }
});

test("首帧尚未生成时也显示播放按钮，不因缺少缩略图直接进入播放器", () => {
    const html = preview({ ...ordinary, metadata: { content: "video.mp4", storageKey: "resource:video", mimeType: "video/mp4" } }, true);
    expect(html).toContain('aria-label="播放 普通视频"');
    expect(html).not.toContain("canvas-video-player");
});
