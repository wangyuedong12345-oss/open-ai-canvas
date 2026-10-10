import { expect, test } from "bun:test";
import { shouldYieldCanvasKeyboard } from "../src/lib/canvas/canvas-keyboard-scope";

function overlayDocument(overlays: { rendered: boolean; visibility: string; display: string }[]): Document {
    return {
        querySelectorAll: () => overlays.map((overlay) => ({
            getClientRects: () => overlay.rendered ? [{}] : [],
            style: overlay,
        })),
        defaultView: { getComputedStyle: (overlay: { style: unknown }) => overlay.style },
    } as unknown as Document;
}

test("弹窗可见时，即使键盘目标仍是背景也必须让出画布快捷键", () => {
    expect(shouldYieldCanvasKeyboard(null, overlayDocument([{ rendered: true, visibility: "visible", display: "block" }]))).toBe(true);
});

test("保留挂载但已隐藏的弹窗不能永久禁用画布快捷键", () => {
    expect(shouldYieldCanvasKeyboard(null, overlayDocument([
        { rendered: false, visibility: "visible", display: "none" },
        { rendered: true, visibility: "hidden", display: "block" },
        { rendered: true, visibility: "collapse", display: "block" },
    ]))).toBe(false);
});

test("事件源在浮层内时，画布让出快捷键且不依赖全局弹窗列表", () => {
    const target = { closest: () => ({}) } as unknown as Element;
    expect(shouldYieldCanvasKeyboard(target, overlayDocument([]))).toBe(true);
});

test("没有浮层时恢复普通画布快捷键", () => {
    const target = { closest: () => null } as unknown as Element;
    expect(shouldYieldCanvasKeyboard(target, overlayDocument([]))).toBe(false);
});
