import { getCachedResourceBlob } from "@/services/resource-blob-cache";
import { resourceStorageKey, uploadResourceFile } from "@/services/api/resources";
import type { DirectorDeskResource, DirectorDeskState } from "@/types/previs";
import { getActiveUserScope } from "@/lib/user-scope";
import { packDirectorResources, restoreDirectorResources } from "@/lib/canvas/director-desk/resources";

export async function hydrateDirectorDocument(state: DirectorDeskState): Promise<Record<string, unknown>> {
    const scope = getActiveUserScope();
    return restoreDirectorResources(state, async (key) => {
        const blob = await getCachedResourceBlob(key);
        if (getActiveUserScope() !== scope) throw new Error("加载期间用户已切换");
        return blob;
    });
}

export function createDirectorResourceWriter() {
    const uploads = new Map<string, Omit<DirectorDeskResource, "path">>();
    let uploadScope = "";
    return async (input: Record<string, unknown>) => {
        const scope = getActiveUserScope();
        if (scope === "guest") throw new Error("请先登录后保存导演台工程");
        if (scope !== uploadScope) { uploads.clear(); uploadScope = scope; }
        const checkScope = () => { if (getActiveUserScope() !== scope) throw new Error("素材保存期间用户已切换"); };
        const result = await packDirectorResources(input, async (item) => {
            checkScope();
            const bytes = new TextEncoder().encode(item);
            const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
            let resource = uploads.get(digest);
            if (!resource) {
                const uploaded = await uploadResourceFile(new Blob([bytes], { type: "text/plain" }), "file", { fileName: `director-${digest}.txt`, idempotencyKey: `director-${digest}` });
                checkScope();
                resource = { storageKey: resourceStorageKey(uploaded.id), bytes: bytes.byteLength };
                uploads.set(digest, resource);
            }
            return resource;
        });
        checkScope();
        return result;
    };
}
