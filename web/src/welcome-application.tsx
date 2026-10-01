import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getWelcomeAvailability } from "@/services/api/welcome";
import { bootWorkspace } from "@/lib/workspace-boot";
import WelcomePage from "@/pages/welcome";

async function renderWelcome() {
    const atRoot = window.location.pathname === "/";
    try {
        const { welcomeEnabled } = await getWelcomeAvailability();
        if (welcomeEnabled !== true) {
            // 开关关闭：根路径直接回落工作台；/welcome 跳回根路径，由其自行判断降级。
            if (atRoot) bootWorkspace();
            else window.location.replace("/");
            return;
        }
        createRoot(document.getElementById("root")!).render(<StrictMode><WelcomePage /></StrictMode>);
    } catch (error) {
        console.error("Welcome page initialization failed", error);
        createRoot(document.getElementById("root")!).render(
            <main role="alert">
                <p>暂时无法打开欢迎页，请稍后重试。</p>
                <button onClick={() => window.location.reload()}>重试</button>
                <a href="/create">进入工作台</a>
            </main>,
        );
    }
}

void renderWelcome();
