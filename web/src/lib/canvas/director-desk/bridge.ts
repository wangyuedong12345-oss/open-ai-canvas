export const DIRECTOR_BRIDGE = "yingce-director-v1";
export type DirectorMessage = {
    protocol: typeof DIRECTOR_BRIDGE;
    session: string;
    type: "ready" | "request" | "response" | "host-request" | "host-response" | "state";
    id?: string;
    method?: string;
    data?: unknown;
    error?: string;
};

export function isDirectorMessage(value: unknown, session: string): value is DirectorMessage {
    if (!value || typeof value !== "object") return false;
    const message = value as DirectorMessage;
    return message.protocol === DIRECTOR_BRIDGE && message.session === session &&
        ["ready", "request", "response", "host-request", "host-response", "state"].includes(message.type);
}

export function createDirectorBridge(frame: HTMLIFrameElement, session: string) {
    const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    let disposed = false;
    const listeners = new Set<(message: DirectorMessage) => void>();
    const send = (message: Omit<DirectorMessage, "protocol" | "session">) => {
        if (disposed || !frame.contentWindow) throw new Error("导演台连接已关闭");
        frame.contentWindow.postMessage({ ...message, protocol: DIRECTOR_BRIDGE, session }, window.location.origin);
    };
    const receive = (event: MessageEvent) => {
        if (event.origin !== window.location.origin || event.source !== frame.contentWindow || !isDirectorMessage(event.data, session)) return;
        const message = event.data;
        if (message.type === "response" && message.id) {
            const request = pending.get(message.id);
            if (!request) return;
            clearTimeout(request.timer); pending.delete(message.id);
            if (message.error) request.reject(new Error(message.error)); else request.resolve(message.data);
        } else listeners.forEach((listener) => listener(message));
    };
    window.addEventListener("message", receive);
    return {
        send,
        subscribe(listener: (message: DirectorMessage) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        request<T>(method: string, data?: unknown, timeout = 120_000): Promise<T> {
            if (disposed) return Promise.reject(new Error("导演台连接已关闭"));
            const id = crypto.randomUUID();
            return new Promise<T>((resolve, reject) => {
                const timer = setTimeout(() => { pending.delete(id); reject(new Error("导演台响应超时，请重试")); }, timeout);
                pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
                try { send({ type: "request", id, method, data }); } catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
            });
        },
        dispose() {
            disposed = true; window.removeEventListener("message", receive); listeners.clear();
            pending.forEach((request) => { clearTimeout(request.timer); request.reject(new Error("导演台连接已关闭")); }); pending.clear();
        },
    };
}
export type DirectorBridge = ReturnType<typeof createDirectorBridge>;
