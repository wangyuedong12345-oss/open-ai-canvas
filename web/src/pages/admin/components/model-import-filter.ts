import type { ChannelModelCatalogItem } from "@/lib/channel-model-catalog";

export const importCategories = ["all", "text", "image", "video", "audio", "unknown"] as const;
export type ImportCategory = (typeof importCategories)[number];
type OutputCapability = Exclude<ImportCategory, "all" | "unknown">;

export function modelImportCapabilities(item: ChannelModelCatalogItem): OutputCapability[] {
    const explicit = new Set<OutputCapability>();
    for (const modality of item.outputModalities || []) {
        const value = modality.trim().toLowerCase();
        if (value === "text" || value === "image" || value === "video" || value === "audio") explicit.add(value);
    }
    if (explicit.size) return [...explicit];
    if (item.modelType) explicit.add(item.modelType);
    for (const endpoint of item.supportedEndpointTypes || []) {
        const value = endpoint.toLowerCase();
        if (/image|images/.test(value)) explicit.add("image");
        else if (/video/.test(value)) explicit.add("video");
        else if (/audio|speech|tts/.test(value)) explicit.add("audio");
        else if (/chat|completion|responses|messages/.test(value)) explicit.add("text");
    }
    if (explicit.size) return [...explicit];
    const name = item.id.toLowerCase().replace(/^models\//, "").split("/").pop() || "";
    if (/^(gpt-image|chatgpt-image|dall-e|flux|imagen|recraft|stable-diffusion|sdxl)|(?:^|[-_])image(?:[-_]|$)/.test(name)) return ["image"];
    if (/^(sora|veo|seedance|kling|hunyuan-video|wan[.-]?2)|hailuo/.test(name)) return ["video"];
    if (/^(tts|whisper|suno)|(?:^|[-_])(audio|speech|tts)(?:[-_]|$)/.test(name)) return ["audio"];
    if (/^(gpt-|chatgpt-|claude-|deepseek-|qwen|llama|gemini-|mistral|codestral|o[134](?:-|$)|minimax-(?:h|m)\d)/.test(name)) return ["text"];
    return [];
}

export function filterImportModels(items: ChannelModelCatalogItem[], keyword: string, category: ImportCategory) {
    const query = keyword.trim().toLowerCase();
    return items.filter((item) => {
        if (query && !`${item.id} ${item.displayName || ""}`.toLowerCase().includes(query)) return false;
        const capabilities = modelImportCapabilities(item);
        return category === "all" || (category === "unknown" ? capabilities.length === 0 : capabilities.includes(category));
    });
}

export function replaceVisibleSelection(selected: string[], visible: string[], checked: string[]) {
    const visibleIDs = new Set(visible);
    return [...new Set([...selected.filter((id) => !visibleIDs.has(id)), ...checked])];
}
