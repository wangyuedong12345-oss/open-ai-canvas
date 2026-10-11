import type { Engine } from "../vendor/director-desk/src/engine";

/** 截取当前取景画面；截图失败也必须恢复预览尺寸和时间。 */
export async function captureDirectorComposition(engine: Pick<Engine, "prepareOutput" | "renderOutput" | "restorePreview" | "exporting">, input: { time: number; width: number; height: number; cameraId: string; signal: AbortSignal }) {
    engine.exporting = true;
    try {
        await engine.prepareOutput(input.time, input.signal);
        input.signal.throwIfAborted();
        const canvas = engine.renderOutput(input.time, input.width, input.height, input.cameraId, null);
        return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("构图截图失败")), "image/png"));
    } finally {
        engine.restorePreview(input.time);
    }
}
