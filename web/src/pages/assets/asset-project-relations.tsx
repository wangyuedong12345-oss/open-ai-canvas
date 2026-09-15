import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Popconfirm, Select, Tag } from "antd";
import { Link2, Plus, Unlink } from "lucide-react";

import type { AssetCategory } from "@/lib/asset-category";
import { linkProjectAsset, listProjects, unlinkProjectAsset } from "@/services/api/projects";
import { listAssetProjectRelations } from "@/services/api/user-data";

const relationQueryKey = (assetId: string) => ["asset-project-relations", assetId] as const;

export function AssetProjectRelations({ assetId, category }: { assetId: string; category: AssetCategory }) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const relationsQuery = useQuery({
        queryKey: relationQueryKey(assetId),
        queryFn: () => listAssetProjectRelations(assetId),
        enabled: Boolean(assetId),
    });
    const projectsQuery = useQuery({ queryKey: ["projects", "asset-relation-options"], queryFn: () => listProjects() });
    const refresh = () => Promise.all([
        queryClient.invalidateQueries({ queryKey: relationQueryKey(assetId) }),
        queryClient.invalidateQueries({ queryKey: ["asset-library"] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
    ]);
    const linkMutation = useMutation({
        mutationFn: (projectId: string) => linkProjectAsset(projectId, { assetId, category }),
        onSuccess: async () => { await refresh(); message.success("已关联到项目"); },
        onError: (error: Error) => message.error(error.message || "关联项目失败"),
    });
    const unlinkMutation = useMutation({
        mutationFn: (projectId: string) => unlinkProjectAsset(projectId, assetId),
        onSuccess: async () => { await refresh(); message.success("已从项目移除"); },
        onError: (error: Error) => message.error(error.message || "移除项目关联失败"),
    });
    const relations = relationsQuery.data?.projects || [];
    const linkedIds = new Set(relations.map((item) => item.projectId));
    const availableProjects = (projectsQuery.data?.projects || []).filter((item) => !linkedIds.has(item.project.id));
    const busy = linkMutation.isPending || unlinkMutation.isPending;

    return (
        <section className="asset-archive-section" aria-labelledby="asset-project-relations-title">
            <div className="flex items-center justify-between gap-3">
                <span id="asset-project-relations-title" className="asset-archive-section-title flex items-center gap-1.5"><Link2 className="size-3.5" />所属项目</span>
                <span className="text-[var(--fs-tiny)] text-foreground/42">{relations.length} 个项目</span>
            </div>
            {relationsQuery.isLoading ? <p className="asset-archive-section-body">正在读取项目关联...</p> : relations.length ? (
                <div className="mt-2 grid gap-2">
                    {relations.map((relation) => (
                        <div key={relation.projectId} className="flex min-w-0 items-center justify-between gap-3 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                            <div className="min-w-0"><div className="truncate text-[var(--fs-body)] font-medium">{relation.projectName}</div>{relation.status === "archived" ? <Tag className="mt-1">已归档</Tag> : null}</div>
                            <Popconfirm title={`从“${relation.projectName}”移除该素材？`} description="若素材仍被镜头或角色节点使用，系统会阻止移除。" okText="移除" cancelText="取消" onConfirm={() => unlinkMutation.mutate(relation.projectId)}>
                                <Button type="text" size="small" danger disabled={busy} icon={<Unlink className="size-3.5" />}>移除</Button>
                            </Popconfirm>
                        </div>
                    ))}
                </div>
            ) : <p className="asset-archive-section-body">尚未关联项目</p>}
            <Select
                className="mt-3 w-full"
                showSearch
                allowClear
                loading={projectsQuery.isLoading || linkMutation.isPending}
                disabled={busy || availableProjects.length === 0}
                placeholder={availableProjects.length ? "添加到项目" : "没有可添加的项目"}
                suffixIcon={<Plus className="size-3.5" />}
                optionFilterProp="label"
                options={availableProjects.map(({ project }) => ({ value: project.id, label: project.status === "archived" ? `${project.name}（已归档）` : project.name }))}
                onSelect={(projectId) => linkMutation.mutate(projectId)}
            />
        </section>
    );
}
