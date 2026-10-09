export const creationPromptMinHeights = { empty: 136, thread: 116 };

export function creationPromptLayout(contentHeight: number, lineHeight: number, variant: "empty" | "thread" = "empty") {
    const minHeight = creationPromptMinHeights[variant];
    const maxHeight = Math.ceil(lineHeight * (variant === "thread" ? 10 : 12));
    const height = Math.max(minHeight, Math.min(contentHeight, maxHeight));
    return {
        height,
        growth: height - minHeight,
        overflow: contentHeight > maxHeight ? "auto" : "hidden",
    };
}
