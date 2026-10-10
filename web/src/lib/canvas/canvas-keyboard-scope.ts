const KEYBOARD_OVERLAY_SELECTOR = "[role='dialog'],[role='alertdialog'],.ant-modal-wrap,.ant-drawer,.ant-dropdown,.ant-popover,.ant-select-dropdown,.ant-picker-dropdown,[data-canvas-context-menu],[data-canvas-previs-workbench]";
const EXCLUSIVE_OVERLAY_SELECTOR = "[role='dialog'],[role='alertdialog'],.ant-modal-wrap,.ant-drawer-content-wrapper,[data-canvas-previs-workbench]";

export function isCanvasTextEditingTarget(target: Element | null): boolean {
    return Boolean(target?.closest("input,textarea,select,[contenteditable='true'],[contenteditable=''],[contenteditable='plaintext-only'],[role='textbox']"));
}

/** 全局捕获监听必须先让出弹窗；焦点暂留画布或 body 时也不能执行背景操作。 */
export function shouldYieldCanvasKeyboard(target: Element | null, ownerDocument = document): boolean {
    if (target?.closest(KEYBOARD_OVERLAY_SELECTOR)) return true;
    return Array.from(ownerDocument.querySelectorAll<HTMLElement>(EXCLUSIVE_OVERLAY_SELECTOR)).some((overlay) => {
        if (!overlay.getClientRects().length) return false;
        const style = ownerDocument.defaultView?.getComputedStyle(overlay);
        if (!style) return false;
        return style.visibility !== "hidden" && style.visibility !== "collapse" && style.display !== "none";
    });
}
