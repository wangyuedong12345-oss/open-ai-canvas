export type DirectorHostWindow = Window & {
    yingceDirector?: { scope: string; save: (document: unknown) => Promise<void> };
};
export function hostDatabaseName(name: string) {
    const scope = typeof window === "undefined" ? undefined : (window as DirectorHostWindow).yingceDirector?.scope;
    return scope ? `${name}:${scope}` : name;
}
