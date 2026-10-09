import { bootstrapAppearance } from "@/services/appearance-bootstrap";
import { isIsolatedPrevisRepro } from "@/lib/dev-repro";

/**
 * 启动工作台应用。
 *
 * 根路径默认由欢迎页接管，因此欢迎页入口在开关关闭时需要回落工作台；
 * 工作台引导顺序（外观配置 → 主应用）在这里保持唯一来源。
 */
export function bootWorkspace() {
    // The backend-free DEV lab must not make requests before AppProviders isolates it.
    const appearanceReady = isIsolatedPrevisRepro(import.meta.env.DEV, window.location.pathname) ? Promise.resolve() : bootstrapAppearance();
    void appearanceReady.catch(() => undefined).then(() => import("@/application"));
}
