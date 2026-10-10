import { useCallback, useEffect, useRef, useState } from "react";
import { App, Button, Select } from "antd";
import localforage from "localforage";
import { createDirectorBridge, type DirectorBridge } from "@/lib/canvas/director-desk/bridge";
import { getActiveUserScope } from "@/lib/user-scope";
import { createDirectorResourceWriter, hydrateDirectorDocument } from "@/services/director-desk-resources";
import { saveRemoteUserDataNow } from "@/services/user-data-sync";
import { useUserStore } from "@/stores/use-user-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import type { CanvasNodeData } from "@/types/canvas";
import type { PrevisScene, PrevisSceneOutput } from "@/types/previs";
import { canvasThemes } from "@/lib/canvas-theme";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { isPrevisPreviewRequestForWorkbench, previsPreviewRequestKey, type PrevisPreviewRequest } from "@/lib/canvas/previs/previs-preview";

type Snapshot = { document: Record<string, unknown>; scene: PrevisScene; revision: number };
type Draft = Snapshot & { baseUpdatedAt: string; savedAt: number };
const drafts = localforage.createInstance({ name: "yingce-director-desk-drafts" });
type Props = {
    open: boolean; canvasId?: string; scene: PrevisScene | null; imageNodes: CanvasNodeData[]; onboardingScope: string;
    onClose: () => void; onChange: (scene: PrevisScene) => void; onApply: (output: PrevisSceneOutput) => Promise<void>;
    onDeleteImageNode: (nodeId: string) => void; onFlush?: () => void | Promise<void>;
};

export function DirectorDeskWorkbench(props: Props) {
    const { message, modal } = App.useApp();
    const userId = useUserStore((state) => state.user?.id);
    const theme = canvasThemes[useActiveTheme()];
    const frameRef = useRef<HTMLIFrameElement>(null);
    const bridgeRef = useRef<DirectorBridge | null>(null);
    const propsRef = useRef(props); propsRef.current = props;
    const [session, setSession] = useState(() => crypto.randomUUID());
    const [revision, setRevision] = useState(0);
    const [loaded, setLoaded] = useState(false), [nativeBusy, setNativeBusy] = useState(false), [error, setError] = useState("");
    const [hostTasks, setHostTasks] = useState(0);
    const busy = nativeBusy || hostTasks > 0;
    const [dirty, setDirty] = useState(false), [status, setStatus] = useState("正在加载导演台…");
    const [kind, setKind] = useState<"color" | "clay" | "depth">("clay");
    const [format, setFormat] = useState<"mp4" | "webm">("mp4");
    const [progress, setProgress] = useState<number | null>(null);
    const scope = getActiveUserScope();
    const draftKey = `${scope}:${props.canvasId}:${props.scene?.id}`;
    const baseline = useRef("");
    const saveTask = useRef<Promise<PrevisScene> | null>(null);
    const writerRef = useRef(createDirectorResourceWriter());
    const exportRef = useRef<(request?: PrevisPreviewRequest) => Promise<void>>(async () => {});
    const handledPreviewRequests = useRef(new Set<string>());

    const assertCurrent = useCallback(() => {
        const current = propsRef.current;
        if (!current.canvasId || !current.scene || getActiveUserScope() !== scope || !userId) throw new Error("用户或画布已切换，请重新打开导演台");
        const scene = useCanvasStore.getState().projects.find((p) => p.id === current.canvasId)?.previsScenes.find((s) => s.id === current.scene!.id);
        if (!scene || JSON.stringify(scene) !== baseline.current) throw new Error("场景已有其他修改，本次未覆盖；请保留草稿并重新打开导演台");
        return scene;
    }, [scope, userId]);

    const persist = useCallback((snapshot: Snapshot): Promise<PrevisScene> => {
        if (saveTask.current) return saveTask.current;
        setHostTasks((count) => count + 1);
        const task = (async () => {
            const initial = assertCurrent();
            await drafts.setItem<Draft>(draftKey, { ...snapshot, baseUpdatedAt: initial.updatedAt, savedAt: Date.now() });
            setStatus("正在保存…");
            const stored = await writerRef.current(snapshot.document);
            assertCurrent();
            const { directorDesk, ...projection } = snapshot.scene;
            const next: PrevisScene = { ...projection, directorDesk: { version: 1, upstreamVersion: "0.4.11", ...stored, projection } };
            propsRef.current.onChange(next); baseline.current = JSON.stringify(next);
            await propsRef.current.onFlush?.();
            setStatus("已保存到本地，正在同步云端…");
            try { await saveRemoteUserDataNow({ projectId: propsRef.current.canvasId }); }
            catch (failure) { setStatus("本地已保存 · 云端同步失败"); throw failure; }
            if (getActiveUserScope() !== scope) throw new Error("保存期间用户已切换");
            const acknowledged = await bridgeRef.current?.request<{ saved: boolean }>("saved", { revision: snapshot.revision, scene: next });
            if (!acknowledged?.saved) throw new Error("保存期间又有新编辑，本次快照已保存，请继续保存最新修改");
            await drafts.removeItem(draftKey); setDirty(false); setStatus("已保存到云端");
            return next;
        })();
        saveTask.current = task;
        void task.finally(() => { if (saveTask.current === task) saveTask.current = null; setHostTasks((count) => count - 1); }).catch(() => {});
        return task;
    }, [assertCurrent, draftKey, scope]);

    useEffect(() => {
        if (!props.open || !props.scene || !props.canvasId || !frameRef.current || !userId) return;
        setLoaded(false); setNativeBusy(false); setDirty(false); setError(""); setStatus("正在加载导演台…");
        let alive = true, initializing = false;
        const bridge = createDirectorBridge(frameRef.current, session); bridgeRef.current = bridge;
        const initial = props.scene; baseline.current = JSON.stringify(initial);
        const unsubscribe = bridge.subscribe((event) => {
            if (event.type === "ready" && !initializing) {
                initializing = true;
                void (async () => {
                    const document = initial.directorDesk ? await hydrateDirectorDocument(initial.directorDesk) : undefined;
                    const draft = await drafts.getItem<Draft>(draftKey);
                    let restore = false;
                    if (draft && draft.baseUpdatedAt === initial.updatedAt) {
                        restore = await new Promise<boolean>((resolve) => modal.confirm({ title: "恢复导演台草稿？", content: "有尚未完成云端保存的编辑，可以恢复后继续保存。", okText: "恢复草稿", cancelText: "使用已保存工程", onOk: () => resolve(true), onCancel: () => resolve(false) }));
                    }
                    if (!alive) return;
                    await bridge.request("init", { scope, scene: restore ? draft!.scene : initial, document: restore ? draft!.document : document, restore });
                    if (!alive) return;
                    setLoaded(true); setError(""); setStatus(restore ? "已恢复本地草稿，请保存" : "导演台已就绪"); setDirty(restore);
                })().catch((failure) => { if (alive) { setError(failure.message); setStatus("加载失败"); } });
            } else if (event.type === "state" && event.data && typeof event.data === "object") {
                const state = event.data as { dirty?: boolean; busy?: boolean; progress?: number; revision?: number; error?: string };
                if (typeof state.error === "string") setError(state.error);
                if (typeof state.revision === "number") setRevision(state.revision);
                if (typeof state.dirty === "boolean") setDirty(state.dirty);
                if (typeof state.busy === "boolean") setNativeBusy(state.busy);
                if (typeof state.progress === "number") setProgress(state.progress);
            } else if (event.type === "host-request" && event.method === "save") {
                void persist(event.data as Snapshot).then(() => bridge.send({ type: "host-response", id: event.id })).catch((failure) => { if (alive) { setError(failure.message); bridge.send({ type: "host-response", id: event.id, error: failure.message }); } });
            }
        });
        return () => { alive = false; unsubscribe(); bridge.dispose(); bridgeRef.current = null; };
    }, [props.open, props.scene?.id, props.canvasId, userId, scope, session, draftKey, modal, persist]);

    // Back up native documents in user-scoped IndexedDB; binary payloads never enter localStorage.
    useEffect(() => {
        if (!loaded || !dirty || busy) return;
        const timer = setTimeout(() => {
            void bridgeRef.current?.request<Snapshot>("snapshot").then((snapshot) => drafts.setItem<Draft>(draftKey, { ...snapshot, baseUpdatedAt: propsRef.current.scene!.updatedAt, savedAt: Date.now() })).catch((failure) => { setError(`草稿保存失败：${failure.message}`); });
        }, 1200);
        return () => clearTimeout(timer);
    }, [loaded, dirty, busy, draftKey, revision]);

    useEffect(() => {
        if (!loaded || busy || saveTask.current || !props.scene || JSON.stringify(props.scene) === baseline.current) return;
        if (dirty) { setError("画布或 Agent 已更新此场景；当前编辑未被覆盖，请保存草稿后重新载入"); return; }
        const scene = props.scene;
        void (async () => {
            const document = scene.directorDesk ? await hydrateDirectorDocument(scene.directorDesk) : undefined;
            await bridgeRef.current!.request("load", { scene, document }); baseline.current = JSON.stringify(scene);
        })().catch((failure) => setError(failure.message));
    }, [props.scene, loaded, dirty, busy]);

    useEffect(() => {
        const onPreview = (event: Event) => {
            const request = (event as CustomEvent<PrevisPreviewRequest>).detail;
            if (!request || !loaded || !isPrevisPreviewRequestForWorkbench({ request, canvasId: props.canvasId, sceneId: props.scene?.id, activeShotId: props.scene?.activeShotId })) return;
            const key = previsPreviewRequestKey(request);
            if (handledPreviewRequests.current.has(key)) return;
            handledPreviewRequests.current.add(key);
            if (handledPreviewRequests.current.size > 64) handledPreviewRequests.current.delete(handledPreviewRequests.current.values().next().value!);
            if (busy) { message.info("导演台正在编辑或导出，请稍后重新请求预演"); return; }
            void exportRef.current(request);
        };
        window.addEventListener("previs:preview-requested", onPreview);
        return () => window.removeEventListener("previs:preview-requested", onPreview);
    }, [props.canvasId, props.scene?.id, props.scene?.activeShotId, loaded, busy, message]);

    useEffect(() => {
        const protect = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ""; } };
        window.addEventListener("beforeunload", protect);
        return () => window.removeEventListener("beforeunload", protect);
    }, [dirty, busy]);

    const save = async () => {
        if (!bridgeRef.current) throw new Error("导演台尚未连接");
        setError(""); const snapshot = await bridgeRef.current.request<Snapshot>("snapshot");
        return persist(snapshot);
    };
    const close = async () => {
        if (!loaded) { props.onClose(); return; }
        if (busy) { message.info("请先完成编辑，或取消视频导出"); return; }
        try { await save(); props.onClose(); }
        catch (failure) {
            setError((failure as Error).message);
            const draft = await drafts.getItem(draftKey);
            if (draft) modal.confirm({ title: "云端保存未完成", content: "本地草稿已保留。返回画布后，下次打开可恢复。", okText: "保留草稿并返回", cancelText: "继续编辑", onOk: props.onClose });
        }
    };
    const reload = async () => {
        try {
            if (loaded && dirty) {
                const snapshot = await bridgeRef.current!.request<Snapshot>("snapshot");
                await drafts.setItem<Draft>(draftKey, { ...snapshot, baseUpdatedAt: propsRef.current.scene!.updatedAt, savedAt: Date.now() });
            }
            setLoaded(false); setDirty(false); setSession(crypto.randomUUID());
        } catch (failure) { setError(`未重新载入，草稿保留失败：${(failure as Error).message}`); }
    };
    const output = async (request?: PrevisPreviewRequest) => {
        setError(""); setHostTasks((count) => count + 1); setProgress(0);
        try {
            const result = await bridgeRef.current!.request<Snapshot & PrevisSceneOutput>("export", { kind: request ? "clay" : kind, format, ...(request ? { shotId: request.shotId, duration: request.duration, fps: request.fps } : {}) }, 1_200_000);
            setProgress(null);
            const saved = await persist(result);
            assertCurrent();
            setStatus("正在上传预演视频到画布…");
            await propsRef.current.onApply({ ...result, scene: saved });
            await propsRef.current.onFlush?.(); await saveRemoteUserDataNow({ projectId: propsRef.current.canvasId });
            const latest = useCanvasStore.getState().projects.find((p) => p.id === propsRef.current.canvasId)?.previsScenes.find((s) => s.id === saved.id);
            if (latest) baseline.current = JSON.stringify(latest);
            setStatus("已保存到云端"); message.success(result.videoKind === "depth" ? "深度视频已添加到画布" : "预演视频已添加到画布");
        } catch (failure) { setStatus("视频回流未完成"); setError((failure as Error).message); }
        finally { setHostTasks((count) => count - 1); setProgress(null); }
    };
    exportRef.current = output;
    if (!props.open || !props.scene) return null;
    return <section data-canvas-previs-workbench data-canvas-no-zoom className="fixed inset-0 z-[var(--z-toast)] flex flex-col" style={{ background: theme.canvas.background, color: theme.node.text }}>
        <header className="flex flex-wrap items-center gap-2 px-4 py-2" style={{ borderBottom: `1px solid ${theme.node.stroke}` }}>
            <strong className="mr-auto">导演台</strong><span role="status" className="text-xs">{progress === null ? hostTasks > 0 ? status : dirty ? "有未保存修改" : status : `生成视频 ${Math.round(progress * 100)}%`}</span>
            <Select aria-label="回流视频画面" value={kind} onChange={setKind} disabled={busy} options={[{ value: "color", label: "普通视频" }, { value: "clay", label: "白模视频" }, { value: "depth", label: "深度视频" }]} />
            <Select aria-label="回流视频格式" value={format} onChange={setFormat} disabled={busy} options={[{ value: "mp4", label: "MP4" }, { value: "webm", label: "WebM" }]} />
            <Button disabled={!loaded || busy} onClick={() => void save().catch((failure) => setError(failure.message))}>保存</Button>
            <Button type="primary" disabled={!loaded || busy} onClick={() => void output()}>添加视频到画布</Button>
            {progress !== null && <Button onClick={() => void bridgeRef.current?.request("cancel")}>取消导出</Button>}
            <Button onClick={() => void close()}>返回画布</Button>
        </header>
        {error && <div role="alert" className="flex items-center gap-2 px-4 py-2 text-sm">{error}<Button size="small" disabled={busy} onClick={() => void reload()}>重新载入</Button></div>}
        <iframe key={`${scope}:${props.canvasId}:${props.scene.id}:${session}`} ref={frameRef} title="DirectorDesk 预演编辑器" src={`/director-desk/index.html?session=${encodeURIComponent(session)}`} style={{ visibility: loaded ? "visible" : "hidden" }} className="min-h-0 w-full flex-1 border-0" allow="clipboard-write" />
    </section>;
}
