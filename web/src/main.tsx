import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { bootWorkspace } from "@/lib/workspace-boot";

// 根路径与 /welcome 都由欢迎页接管：它是独立入口，自行检查可用开关，
// 关闭时回落到工作台（/welcome 则跳回根路径）。
const pathname = window.location.pathname;
if (pathname === "/" || /^\/welcome\/?$/.test(pathname)) void import("./welcome-application");
else bootWorkspace();
