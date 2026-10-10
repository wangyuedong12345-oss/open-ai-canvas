import { DIRECTOR_BRIDGE, isDirectorMessage, type DirectorMessage } from "../src/lib/canvas/director-desk/bridge";
import type { PrevisScene } from "../src/types/previs";
import type { AppContext } from "../vendor/director-desk/src/app-context";
import type { DirectorHostWindow } from "../vendor/director-desk/src/storage/host-scope";

const session = new URLSearchParams(location.search).get("session");
if (!session || parent === window) throw new Error("请从影策画布打开导演台");
const send = (message: Omit<DirectorMessage, "protocol" | "session">) => parent.postMessage({ ...message, protocol: DIRECTOR_BRIDGE, session }, location.origin);
let ctx: AppContext | undefined, base: PrevisScene | undefined;
let projection: typeof import("./projection") | undefined;
let queue = Promise.resolve();
let exportAborter: AbortController | undefined;
const saves = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const readyTimer = setInterval(() => { if (!ctx) send({ type: "ready" }); }, 500);
send({ type: "ready" });
async function saveToHost(document: unknown) {
    const id = crypto.randomUUID();
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { saves.delete(id); reject(new Error("画布保存超时，请重试")); }, 120_000);
        saves.set(id, { resolve, reject, timer });
        send({ type: "host-request", id, method: "save", data: { document, scene: projection!.previsFromDocument(document as never, base!), revision: ctx!.revision } });
    });
}
function idle() {
    if (!ctx || !base || !projection) throw new Error("导演台尚未加载");
    if (ctx.busy || ctx.engine.exporting || ctx.history.pending || ctx.draft || ctx.engine.dragging) throw new Error("请先结束当前编辑或导出");
    return ctx;
}
async function execute(method: string, data: any) {
    if (method === "init") {
        if (ctx || typeof data?.scope !== "string" || !data.scope || !data.scene?.id) throw new Error("导演台初始化无效");
        (window as DirectorHostWindow).yingceDirector = { scope: data.scope, save: saveToHost };
        projection = await import("./projection");
        const app = await import("../vendor/director-desk/src/main");
        ctx = app.uiContext; clearInterval(readyTimer);
        await load(data); ctx.dirty = Boolean(data.restore); installIntegrationUI();
        let last = "";
        setInterval(() => {
            const state = { revision: ctx!.revision, dirty: ctx!.dirty, busy: Boolean(ctx!.busy || ctx!.engine.exporting || ctx!.history.pending || ctx!.draft || ctx!.engine.dragging) };
            const key = JSON.stringify(state);
            if (last !== key) { last = key; send({ type: "state", data: state }); }
        }, 250);
        return { loaded: true };
    }
    if (method === "saved") {
        if (!ctx || ctx.revision !== data.revision) return { saved: false };
        ctx.scenes.markSaved(); ctx.dirty = false; base = data.scene;
        return { saved: true };
    }
    const current = idle();
    if (method === "load") { await load(data); return { loaded: true }; }
    if (method === "snapshot") {
        const document = current.scenes.document();
        return { document, scene: projection!.previsFromDocument(document, base!), revision: current.revision };
    }
    if (method === "export") {
        current.playing = false; current.busy = true; exportAborter = new AbortController();
        const document = current.scenes.document(), scene = projection!.previsFromDocument(document, base!);
        const { outputSize } = await import("../vendor/director-desk/src/model");
        const { exportVideo } = await import("../vendor/director-desk/src/export");
        const { DEFAULT_DEPTH_VIDEO } = await import("../vendor/director-desk/src/cinematography/depth-video");
        const [width, height] = outputSize(current.project.aspect, 1280);
        const shotIndex = data.shotId ? scene.shots.findIndex((shot) => shot.id === data.shotId) : -1;
        if (data.shotId && shotIndex < 0) { current.busy = false; throw new Error("请求的预演镜头不存在"); }
        const start = shotIndex < 0 ? 0 : scene.shots.slice(0, shotIndex).reduce((sum, shot) => sum + shot.duration, 0);
        const end = Math.min(current.project.duration, start + (data.duration ?? (shotIndex < 0 ? current.project.duration : scene.shots[shotIndex].duration)));
        try {
            current.engine.exporting = true;
            await current.engine.prepareOutput(start, exportAborter.signal);
            const canvas = current.engine.renderOutput(start, width, height, "program", null);
            const beauty = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("构图截图失败")), "image/png"));
            current.engine.restorePreview(current.time);
            const video = await exportVideo(current.engine, {
                start, end, fps: data.fps ?? current.project.fps, width, height, cameraId: "program", format: data.format === "webm" ? "webm" : "mp4",
                monochrome: data.kind === "clay", ...(data.kind === "depth" ? { depth: current.project.depthVideo ?? DEFAULT_DEPTH_VIDEO } : {}),
            }, exportAborter.signal, (progress) => send({ type: "state", data: { progress, busy: true } }));
            if (!video) throw new Error("视频导出没有返回文件");
            return { scene, document, revision: current.revision, beauty, clayVideo: video, clayVideoMimeType: video.type, videoKind: data.kind, prompt: current.project.production?.promptText ?? current.project.production?.fixedPrompt ?? "", shot: scene.shots[Math.max(0, shotIndex)] };
        } finally { exportAborter = undefined; current.busy = false; current.engine.restorePreview(current.time); }
    }
    throw new Error("不支持的导演台请求");
}
async function load(data: any) {
    const { readSceneDocument } = await import("../vendor/director-desk/src/scenes/sequence-project");
    const { prepareDocumentModels } = await import("../vendor/director-desk/src/scenes/document-models");
    const scene = data.scene as PrevisScene;
    const document = data.document ? projection!.reconcileDirectorDocument(readSceneDocument(data.document), scene) : projection!.documentFromPrevis(scene);
    await prepareDocumentModels(ctx!.engine.externalModels, document);
    base = scene; ctx!.playing = false; ctx!.project = ctx!.scenes.reset(document); ctx!.time = 0; ctx!.preview = "program";
    ctx!.selected = ctx!.project.entities[0].id; ctx!.changed(); ctx!.scenes.markSaved(); ctx!.dirty = false;
}
function installIntegrationUI() {
    const style = document.createElement("style");
    style.textContent = "#ai-toggle,#ai-changes-toggle,#timeline-to-ai,#update-toggle,[data-act='ai-open'],[data-act='plugins-open'],[data-menu='extensions']{display:none!important} .topbar .brand,.topbar .version{display:none} @media(max-width:1100px){body{min-width:0!important}}";
    document.head.append(style);
    const toasts = document.querySelector("#toasts");
    if (toasts) new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) {
            if (node instanceof HTMLElement && node.classList.contains("error")) send({ type: "state", data: { error: node.textContent } });
        }
    }).observe(toasts, { childList: true });
    // Save is handled by the host; desktop-only features remain unavailable in this browser.
    window.addEventListener("pagehide", () => { exportAborter?.abort(); ctx?.engine.dispose(); }, { once: true });
}
window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== parent || !isDirectorMessage(event.data, session)) return;
    const message = event.data;
    if (message.type === "host-response" && message.id) {
        const save = saves.get(message.id); if (!save) return;
        clearTimeout(save.timer); saves.delete(message.id);
        if (message.error) save.reject(new Error(message.error)); else save.resolve(); return;
    }
    if (message.type !== "request" || !message.id || !message.method) return;
    if (message.method === "cancel") { exportAborter?.abort(); send({ type: "response", id: message.id }); return; }
    queue = queue.then(async () => {
        try { send({ type: "response", id: message.id, data: await execute(message.method!, message.data) }); }
        catch (error) { send({ type: "response", id: message.id, error: error instanceof Error ? error.message : "导演台操作失败" }); }
    });
});
