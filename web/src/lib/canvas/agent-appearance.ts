export const BUILTIN_LIVE2D_MODELS = ["nito", "nico", "nietzsche", "ni-j", "nipsilon"] as const;
export type BuiltinLive2DModel = (typeof BUILTIN_LIVE2D_MODELS)[number];

export type CanvasAppearance = {
    agentName: string;
    launcherLabel: string;
    panelTitle: string;
    welcomeTitle: string;
    welcomeDescription: string;
    inputPlaceholder: string;
    avatarType: "orb" | "live2d";
    live2dResourceId: string;
    live2dEntry: string;
    live2dSource?: "builtin" | "custom";
    live2dBuiltinModel?: BuiltinLive2DModel;
    avatarHeight: number;
};

export const DEFAULT_CANVAS_APPEARANCE: CanvasAppearance = {
    agentName: "影策",
    launcherLabel: "Agent",
    panelTitle: "画布助手",
    welcomeTitle: "在这里，和{agentName}让灵感，慢慢成形",
    welcomeDescription: "从一个想法开始，和{agentName}一起创作。",
    inputPlaceholder: "输入操作指导；用 @ 引用画布节点，用 / 或 、 引用 Skills",
    avatarType: "orb",
    live2dResourceId: "",
    live2dEntry: "",
    live2dBuiltinModel: "nito",
    avatarHeight: 220,
};

export function live2DSource(appearance: CanvasAppearance) {
    return appearance.live2dSource || (appearance.live2dResourceId ? "custom" : "builtin");
}

export function builtinLive2DModel(appearance: CanvasAppearance): BuiltinLive2DModel {
    return appearance.live2dBuiltinModel || "nito";
}

export function agentCopy(template: string, name: string) {
    return template.replaceAll("{agentName}", () => name);
}
