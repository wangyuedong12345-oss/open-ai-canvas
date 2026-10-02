import { uploadImage } from "@/services/image-storage";
import { assetStorageUsageQueryKey, AssetStorageUsage } from "./asset-storage-usage";
import { readFileAsDataUrl, readImageMeta, formatBytes } from "@/lib/image-utils";
import { uploadMediaFile } from "@/services/file-storage";
import { exportAssets, readAssetPackage } from "./asset-transfer";
import { WorkspacePage, PageHeader, CollectionGrid, PaginationBar, ListToolbar } from "@/components/layout/workspace-page";
import { Trash2, RotateCcw, Plus, Images, FolderOpen, FileUp, Upload, Download, MoreHorizontal, Search, LayoutGrid, FolderPlus, PencilLine, AlertTriangle } from "lucide-react";
import { CollectionToolbar } from "@/components/layout/collection-toolbar";
import { Select } from "@/components/ui/base/select";
import { AssetFilterGroup, AssetsBatchBar, AssetsEmptyState, AssetDrawer } from "./asset-library-panels";
import { DeleteButton } from "@/components/ui/base/buttons/delete-button";
import { cn } from "@/lib/utils";
import { WorkspaceState } from "@/components/layout/workspace-state";
import { AssetCard } from "./asset-library-cards";
import { Switch } from "@/components/ui/base/switch";
import { resourceStorageTitle, resourceStorageLabel } from "@/lib/canvas/resource-storage-status";
import { AssetBatchUploadModal } from "./asset-batch-upload-modal";
import { assetGridCardMinWidth, type AssetGridDensity, assetGridDensityOptions, parseAssetGridDensity } from "./asset-grid-density";
import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Form, Popconfirm, Button, Dropdown, Input, Modal, Space, Tag, Typography, Progress } from "antd";
import { useNavigate } from "react-router";
import { useCopyText } from "@/hooks/use-copy-text";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ASSET_CATEGORY_OPTIONS, assetCategoryLabel } from "@/lib/asset-category";
import { downloadBrowserMedia } from "@/services/browser-download";
import { flushAssetStorePersistence, useAssetStore, type AssetCategory, type AssetKind, type ImageAsset } from "@/stores/use-asset-store";
import { loadAssetLibraryPage, loadAssetsForUse, saveRemoteUserDataNow, localSavedRemotePendingMessage, deleteAssetsWithRemoteSync, deleteAssetWithRemoteSync } from "@/services/user-data-sync";
import { useUserStore } from "@/stores/use-user-store";
import { createAssetFolder, deleteAssetFolder, listAssetFolders, updateAssetFolder, type AssetFolder, moveRemoteAssetsToFolder } from "@/services/api/user-data";
import { assetCountMap, assetSearchText, readAssetGridDensity, assetKindIcons, assetKindLabel } from "./asset-library-format";
import { ASSET_GRID_DENSITY_KEY, type LibraryAsset } from "./asset-library-format";

export { ASSET_GRID_DENSITY_KEY, type LibraryAsset, assetKindIcons } from "./asset-library-format";

type AssetFormValues = {
    kind: AssetKind;
    category: AssetCategory;
    folderId?: string;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    content?: string;
    arkAssetId?: string;
    portraitCertified?: boolean;
};

type ImageDraft = ImageAsset["data"] | null;

const kindOptions = [
    { label: "全部", value: "all" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
    { label: "3D 模型", value: "model" },
    { label: "角色", value: "entity" },
];

const categoryOptions = [{ label: "全部用途", value: "all" }, ...ASSET_CATEGORY_OPTIONS];
const ASSET_LIBRARY_QUERY_KEY = ["asset-library"] as const;
const ASSET_FOLDER_QUERY_KEY = ["asset-folders"] as const;
type AssetFolderFilter = "all" | "uncategorized" | string;

export default function AssetsPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const copyText = useCopyText();
    const [form] = Form.useForm<AssetFormValues>();
    const coverInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const mediaInputRef = useRef<HTMLInputElement>(null);
    const assetInputRef = useRef<HTMLInputElement>(null);
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);

    const updateAsset = useAssetStore((state) => state.updateAsset);
    const userId = useUserStore((state) => state.user?.id || "");
    const retentionDays = useUserStore((state) => state.runtimeLimits.recycleBinRetentionDays ?? 30);
    const [viewMode, setViewMode] = useState<"library" | "trash">("library");
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");
    const [categoryFilter, setCategoryFilter] = useState<AssetCategory | "all">("all");
    const [folderFilter, setFolderFilter] = useState<AssetFolderFilter>("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(40);
    const [gridDensity, setGridDensity] = useState<AssetGridDensity>(readAssetGridDensity);
    const [editingAsset, setEditingAsset] = useState<LibraryAsset | null>(null);
    const [isAssetOpen, setIsAssetOpen] = useState(false);
    const [previewAsset, setPreviewAsset] = useState<LibraryAsset | null>(null);
    const [deletingAsset, setDeletingAsset] = useState<LibraryAsset | null>(null);
    const [archivingAsset, setArchivingAsset] = useState<LibraryAsset | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
    const [batchArchiveOpen, setBatchArchiveOpen] = useState(false);
    const [batchUploadOpen, setBatchUploadOpen] = useState(false);
    const [folderEditor, setFolderEditor] = useState<AssetFolder | "new" | null>(null);
    const [folderName, setFolderName] = useState("");
    const [folderSaving, setFolderSaving] = useState(false);

    const [formKind, setFormKind] = useState<AssetKind>("text");
    const [imageDraft, setImageDraft] = useState<ImageDraft>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [imageUploading, setImageUploading] = useState(false);
    const [imageUploadProgress, setImageUploadProgress] = useState<{ phase: "uploading" | "confirming"; percent?: number } | null>(null);
    const coverUrl = Form.useWatch("coverUrl", form) || "";
    const title = Form.useWatch("title", form) || "";
    const tags = Form.useWatch("tags", form) || [];
    const content = Form.useWatch("content", form) || "";
    const debouncedKeyword = useDebouncedValue(keyword.trim(), 250);

    const foldersQuery = useQuery({
        queryKey: ASSET_FOLDER_QUERY_KEY,
        queryFn: () => listAssetFolders(),
        enabled: Boolean(userId),
    });
    const folders = foldersQuery.data?.folders || [];

    const allLibraryAssets = useMemo(() => assets, [assets]);
    const activeAssets = useMemo(() => allLibraryAssets.filter((asset) => asset.status !== "archived"), [allLibraryAssets]);
    const trashAssets = useMemo(() => allLibraryAssets.filter((asset) => asset.status === "archived"), [allLibraryAssets]);
    const validAssets = viewMode === "trash" ? trashAssets : activeAssets;
    const selectedAssets = useMemo(() => validAssets.filter((asset) => selectedIds.includes(asset.id)), [selectedIds, validAssets]);
    const filteredAssets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return validAssets.filter((asset) => {
            if (kindFilter !== "all" && asset.kind !== kindFilter) return false;
            if (categoryFilter !== "all" && (asset.category || "other") !== categoryFilter) return false;
            if (folderFilter === "uncategorized" && asset.folderId) return false;
            if (folderFilter !== "all" && folderFilter !== "uncategorized" && asset.folderId !== folderFilter) return false;
            if (!query) return true;
            return assetSearchText(asset).includes(query);
        });
    }, [validAssets, keyword, kindFilter, categoryFilter, folderFilter]);

    const assetPageQuery = useQuery({
        queryKey: [...ASSET_LIBRARY_QUERY_KEY, page, pageSize, viewMode, kindFilter, categoryFilter, folderFilter, debouncedKeyword],
        queryFn: ({ signal }) => loadAssetLibraryPage({
            page,
            pageSize,
            status: viewMode === "trash" ? "archived" : "active",
            kind: kindFilter === "all" ? undefined : kindFilter,
            category: categoryFilter === "all" ? undefined : categoryFilter,
            folderId: folderFilter !== "all" && folderFilter !== "uncategorized" ? folderFilter : undefined,
            uncategorized: folderFilter === "uncategorized",
            query: debouncedKeyword || undefined,
            signal,
        }),
        enabled: Boolean(userId),
        placeholderData: keepPreviousData,
    });

    const activeFolderStatsQuery = useQuery({
        queryKey: [...ASSET_LIBRARY_QUERY_KEY, "active-folder-stats"],
        queryFn: ({ signal }) => loadAssetLibraryPage({ page: 1, pageSize: 1, status: "active", signal }),
        enabled: Boolean(userId),
    });

    const localVisibleAssets = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAssets.slice(start, start + pageSize);
    }, [filteredAssets, page, pageSize]);
    // 远端成功且本页有可展示素材时用远端。真正的空结果保持空页。
    // 仅在「远端空、本地仍有筛选结果」或「远端总数>0 但本页全是被排除的 entity」时回退本地。
    const remotePageAssets = useMemo(() => assetPageQuery.data?.assets || [], [assetPageQuery.data?.assets]);
    const remoteTotal = assetPageQuery.data?.total ?? 0;
    const remoteReady = assetPageQuery.isSuccess && assetPageQuery.data !== undefined;
    const preferLocalUnsynced = remoteReady && remoteTotal === 0 && localVisibleAssets.length > 0;
    const remoteEntityOnlyPage = remoteReady && remotePageAssets.length === 0 && remoteTotal > 0;
    const useRemotePage = remoteReady && !preferLocalUnsynced && !remoteEntityOnlyPage && (remotePageAssets.length > 0 || remoteTotal === 0);
    const visibleAssets = useMemo(() => useRemotePage ? remotePageAssets : localVisibleAssets, [useRemotePage, remotePageAssets, localVisibleAssets]);
    const visibleAssetIds = useMemo(() => visibleAssets.map((asset) => asset.id), [visibleAssets]);
    const allFilteredSelected = visibleAssetIds.length > 0 && visibleAssetIds.every((id) => selectedIds.includes(id));
    const totalAssets = assetPageQuery.data?.total ?? filteredAssets.length;
    const kindCounts = useMemo(() => assetCountMap(kindOptions, assetPageQuery.data?.kindCounts, viewMode === "trash" ? trashAssets : activeAssets, (asset) => asset.kind), [activeAssets, assetPageQuery.data?.kindCounts, trashAssets, viewMode]);
    const categoryCounts = useMemo(() => assetCountMap(categoryOptions, assetPageQuery.data?.categoryCounts, viewMode === "trash" ? trashAssets : activeAssets, (asset) => asset.category || "other"), [activeAssets, assetPageQuery.data?.categoryCounts, trashAssets, viewMode]);
    const folderCounts = activeFolderStatsQuery.data?.folderCounts || {};
    const folderCountTotal = activeFolderStatsQuery.data?.total || 0;
    const headerAssetCount = viewMode === "trash" ? totalAssets : folderCountTotal;

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(totalAssets / pageSize));
        setPage((value) => Math.min(value, maxPage));
    }, [pageSize, totalAssets]);

    useEffect(() => {
        window.localStorage.setItem(ASSET_GRID_DENSITY_KEY, String(gridDensity));
    }, [gridDensity]);

    useEffect(() => {
        const existingIds = new Set(validAssets.map((asset) => asset.id));
        setSelectedIds((current) => current.filter((id) => existingIds.has(id)));
    }, [validAssets]);

    const folderSelectOptions = useMemo(() => [
        { label: "未整理", value: "" },
        ...folders.map((folder) => ({ label: folder.name, value: folder.id })),
    ], [folders]);

    const invalidateAssetLibrary = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ASSET_LIBRARY_QUERY_KEY }),
            queryClient.invalidateQueries({ queryKey: ASSET_FOLDER_QUERY_KEY }),
        ]);
    };

    const saveFolder = async () => {
        const name = folderName.trim();
        if (!name || !folderEditor) return;
        setFolderSaving(true);
        try {
            if (folderEditor === "new") await createAssetFolder(name);
            else await updateAssetFolder(folderEditor.id, name);
            setFolderEditor(null);
            setFolderName("");
            await invalidateAssetLibrary();
            message.success(folderEditor === "new" ? "文件夹已创建" : "文件夹已重命名");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "文件夹保存失败");
        } finally {
            setFolderSaving(false);
        }
    };

    const removeFolder = async (folder: AssetFolder) => {
        try {
            await deleteAssetFolder(folder.id);
            for (const asset of useAssetStore.getState().assets) {
                if (asset.folderId === folder.id) updateAsset(asset.id, { folderId: undefined });
            }
            await flushAssetStorePersistence();
            if (folderFilter === folder.id) setFolderFilter("all");
            setPage(1);
            await invalidateAssetLibrary();
            message.success(`已删除文件夹「${folder.name}」，其中素材已移至未整理`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "文件夹删除失败");
        }
    };

    const selectFolder = (nextFolder: AssetFolderFilter) => {
        const leavingTrash = viewMode === "trash";
        setViewMode("library");
        setFolderFilter((current) => {
            if (leavingTrash || nextFolder === "all") return nextFolder;
            return current === nextFolder ? "all" : nextFolder;
        });
        setPage(1);
        setSelectedIds([]);
    };

    const moveAssetsToFolder = async (assetIds: string[], folderId: string) => {
        if (!assetIds.length) return;
        try {
            await moveRemoteAssetsToFolder(assetIds, folderId);
            assetIds.forEach((id) => updateAsset(id, { folderId: folderId || undefined }));
            await flushAssetStorePersistence();
            setSelectedIds([]);
            await invalidateAssetLibrary();
            message.success(`已移动 ${assetIds.length} 个素材`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "移动素材失败");
        }
    };

    const openCreate = () => {
        setEditingAsset(null);
        setImageDraft(null);
        setImageFile(null);
        setMediaFile(null);
        setImageUploading(false);
        setImageUploadProgress(null);
        setFormKind("text");
        form.setFieldsValue({ kind: "text", category: "material", folderId: folderFilter !== "all" && folderFilter !== "uncategorized" ? folderFilter : "", title: "", coverUrl: "", tags: [], note: "", content: "", arkAssetId: "", portraitCertified: false });
        setIsAssetOpen(true);
    };

    const openEdit = async (asset: LibraryAsset) => {
        let editableAsset = useAssetStore.getState().assets.find((item) => item.id === asset.id);
        if (!editableAsset) {
            try {
                // 分页卡片是轻量 DTO，编辑前补齐完整记录，避免保存时覆盖远端 metadata。
                await loadAssetsForUse([asset.id]);
                editableAsset = useAssetStore.getState().assets.find((item) => item.id === asset.id);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "素材详情读取失败，请重试");
                return;
            }
        }
        if (!editableAsset) {
            message.error("素材详情读取失败，请重试");
            return;
        }
        setEditingAsset(editableAsset);
        setImageFile(null);
        setMediaFile(null);
        setImageUploading(false);
        setImageUploadProgress(null);
        setFormKind(editableAsset.kind);
        setImageDraft(editableAsset.kind === "image" ? editableAsset.data : null);
        form.setFieldsValue({
            kind: editableAsset.kind,
            category: editableAsset.category || "other",
            folderId: editableAsset.folderId || "",
            title: editableAsset.title,
            coverUrl: editableAsset.coverUrl,
            tags: editableAsset.tags || [],
            source: editableAsset.source,
            note: editableAsset.note,
            content: editableAsset.kind === "text" ? editableAsset.data.content : "",
            arkAssetId: editableAsset.arkAssetId || "",
            portraitCertified: editableAsset.portraitCertified === true,
        });
        setIsAssetOpen(true);
    };

    const ensureAssetsInStore = async (assetIds: string[]) => {
        const missingIds = assetIds.filter((id) => !useAssetStore.getState().assets.some((asset) => asset.id === id));
        if (missingIds.length) await loadAssetsForUse(missingIds);
    };

    const saveAsset = async () => {
        const values = await form.validateFields();
        let imageData = imageDraft;
        let uploadedMedia: Awaited<ReturnType<typeof uploadMediaFile>> | undefined;
        if (values.kind === "image" && imageFile) {
            setImageUploading(true);
            setImageUploadProgress({ phase: "uploading", percent: 0 });
            try {
                const image = await uploadImage(imageFile);
                setImageUploadProgress({ phase: "confirming" });
                imageData = { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType };
                setImageDraft(imageData);
                setImageFile(null);
                void queryClient.invalidateQueries({ queryKey: assetStorageUsageQueryKey });
            } catch (error) {
                message.error(error instanceof Error ? error.message : "图片上传失败，请重试");
                return;
            } finally {
                setImageUploading(false);
                setImageUploadProgress(null);
            }
        }
        if ((values.kind === "video" || values.kind === "audio" || values.kind === "model") && mediaFile) {
            setImageUploading(true);
            setImageUploadProgress({ phase: "uploading", percent: 0 });
            try {
                uploadedMedia = await uploadMediaFile(mediaFile, values.kind, (uploadedBytes, totalBytes) => {
                    setImageUploadProgress({ phase: "uploading", percent: totalBytes ? Math.round((uploadedBytes / totalBytes) * 100) : 0 });
                });
                void queryClient.invalidateQueries({ queryKey: assetStorageUsageQueryKey });
            } catch (error) {
                message.error(error instanceof Error ? error.message : `${assetKindLabel(values.kind)}上传失败，请重试`);
                return;
            } finally {
                setImageUploading(false);
                setImageUploadProgress(null);
            }
        }

        const base = {
            title: values.title.trim(),
            category: values.category,
            folderId: values.folderId || undefined,
            status: editingAsset?.status || ("confirmed" as const),
            primaryVersionId: editingAsset?.primaryVersionId,
            coverUrl: values.coverUrl?.trim() || (values.kind === "image" && imageData ? imageData.dataUrl : ""),
            tags: values.tags || [],
            source: editingAsset?.source || "手动添加",
            note: values.note?.trim(),
            arkAssetId: values.arkAssetId?.trim() || undefined,
            portraitCertified: values.portraitCertified || undefined,
            metadata: editingAsset?.metadata || { source: "manual" },
        };

        if (values.kind === "text") {
            const asset = { ...base, kind: "text" as const, data: { content: (values.content || "").trim() } };
            editingAsset ? updateAsset(editingAsset.id, asset) : addAsset(asset);
        } else if (values.kind === "image") {
            if (!imageData) {
                message.error("请选择图片文件");
                return;
            }
            const asset = { ...base, kind: "image" as const, data: imageData };
            editingAsset ? updateAsset(editingAsset.id, asset) : addAsset(asset);
        } else if (values.kind === "video") {
            const existingData = editingAsset?.kind === "video" ? editingAsset.data : undefined;
            const data = uploadedMedia ? { url: uploadedMedia.url, storageKey: uploadedMedia.storageKey, width: uploadedMedia.width || 0, height: uploadedMedia.height || 0, durationMs: uploadedMedia.durationMs, hasAudio: uploadedMedia.hasAudio, bytes: uploadedMedia.bytes, mimeType: uploadedMedia.mimeType } : existingData;
            if (!data) {
                message.error("请选择视频文件");
                return;
            }
            const asset = { ...base, kind: "video" as const, data };
            editingAsset ? updateAsset(editingAsset.id, asset) : addAsset(asset);
        } else if (values.kind === "audio") {
            const existingData = editingAsset?.kind === "audio" ? editingAsset.data : undefined;
            const data = uploadedMedia ? { url: uploadedMedia.url, storageKey: uploadedMedia.storageKey, durationMs: uploadedMedia.durationMs, bytes: uploadedMedia.bytes, mimeType: uploadedMedia.mimeType } : existingData;
            if (!data) {
                message.error("请选择音频文件");
                return;
            }
            const asset = { ...base, kind: "audio" as const, data };
            editingAsset ? updateAsset(editingAsset.id, asset) : addAsset(asset);
        } else if (values.kind === "model") {
            const existingData = editingAsset?.kind === "model" ? editingAsset.data : undefined;
            const data = uploadedMedia ? { url: uploadedMedia.url, storageKey: uploadedMedia.storageKey, bytes: uploadedMedia.bytes, mimeType: uploadedMedia.mimeType, fileName: mediaFile?.name || uploadedMedia.storageKey } : existingData;
            if (!data) {
                message.error("请选择 3D 模型文件");
                return;
            }
            const asset = { ...base, kind: "model" as const, data };
            editingAsset ? updateAsset(editingAsset.id, asset) : addAsset(asset);
        }

        await flushAssetStorePersistence();
        try {
            await saveRemoteUserDataNow();
            await invalidateAssetLibrary();
            message.success(editingAsset ? "素材已更新" : "素材已保存");
        } catch (error) {
            message.warning(localSavedRemotePendingMessage(editingAsset ? "素材已在本地更新" : "素材已在本地保存", error));
        }
        setIsAssetOpen(false);
    };

    const readCoverFile = async (file?: File) => {
        if (!file) return;
        const dataUrl = await readFileAsDataUrl(file);
        form.setFieldValue("coverUrl", dataUrl);
    };

    const readImageFile = async (file?: File) => {
        if (!file || !file.type.startsWith("image/") || imageUploading) return;
        try {
            const dataUrl = await readFileAsDataUrl(file);
            const meta = await readImageMeta(dataUrl);
            setImageFile(file);
            const draft = { dataUrl, storageKey: "", width: meta.width, height: meta.height, bytes: file.size, mimeType: file.type || meta.mimeType };
            setImageDraft(draft);
            if (!form.getFieldValue("coverUrl")) form.setFieldValue("coverUrl", dataUrl);
            if (!form.getFieldValue("title")) form.setFieldValue("title", file.name);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取图片失败，请重试");
        }
    };

    const readMediaFile = (file?: File) => {
        if (!file || imageUploading) return;
        const valid = formKind === "video" ? file.type.startsWith("video/") : formKind === "audio" ? file.type.startsWith("audio/") : formKind === "model" ? /\.(glb|gltf)$/i.test(file.name) : false;
        if (!valid) {
            message.error(formKind === "video" ? "请选择视频文件" : formKind === "audio" ? "请选择音频文件" : "请选择 GLB 或 GLTF 模型文件");
            return;
        }
        setMediaFile(file);
        if (!form.getFieldValue("title")) form.setFieldValue("title", file.name.replace(/\.(glb|gltf|mp4|mov|webm|mp3|wav|m4a)$/i, ""));
    };

    const copyAssetText = async (asset: LibraryAsset) => {
        if (asset.kind !== "text") return;
        copyText(asset.data.content, "文本已复制");
    };

    const downloadImage = async (asset: LibraryAsset) => {
        if (asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio" && asset.kind !== "model") return;
        const url = asset.kind === "image" ? asset.data.dataUrl : asset.data.url;
        const extension = asset.kind === "model" ? asset.data.fileName.split(".").pop() || "glb" : asset.data.mimeType.split("/")[1] || "png";
        try {
            await downloadBrowserMedia({ storageKey: asset.data.storageKey, url, fileName: `${asset.title || "asset"}.${extension}` });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "下载失败");
        }
    };

    const exportAllAssets = async () => {
        if (!validAssets.length) {
            message.warning("暂无素材可导出");
            return;
        }
        await exportAssets(validAssets);
    };

    const importAssetZip = async (file?: File) => {
        if (!file) return;
        try {
            const importedAssets = await readAssetPackage(file);
            importedAssets.forEach((asset) => {
                const payload = { ...asset } as Record<string, unknown>;
                delete payload.id;
                delete payload.createdAt;
                delete payload.updatedAt;
                addAsset(payload as Parameters<typeof addAsset>[0]);
            });
            message.success(`已导入 ${importedAssets.length} 个素材`);
        } catch {
            message.error("导入失败，请选择有效的素材压缩包");
        } finally {
            if (assetInputRef.current) assetInputRef.current.value = "";
        }
    };

    const restoreAsset = async (asset: LibraryAsset) => {
        try {
            await ensureAssetsInStore([asset.id]);
            updateAsset(asset.id, { status: "confirmed" });
            await flushAssetStorePersistence();
            await saveRemoteUserDataNow();
            await invalidateAssetLibrary();
            message.success(`已还原素材「${asset.title}」`);
        } catch (error) {
            message.warning(localSavedRemotePendingMessage("已在本地还原", error));
        }
    };

    const batchRestore = async () => {
        if (!selectedIds.length) return;
        try {
            await ensureAssetsInStore(selectedIds);
            for (const id of selectedIds) updateAsset(id, { status: "confirmed" });
            const count = selectedIds.length;
            setSelectedIds([]);
            await flushAssetStorePersistence();
            await saveRemoteUserDataNow();
            await invalidateAssetLibrary();
            message.success(`已还原 ${count} 个素材`);
        } catch (error) {
            message.warning(localSavedRemotePendingMessage("已在本地还原", error));
        }
    };

    const archiveAsset = async (asset: LibraryAsset) => {
        try {
            await ensureAssetsInStore([asset.id]);
            updateAsset(asset.id, { status: "archived" });
            await flushAssetStorePersistence();
            await saveRemoteUserDataNow();
            await invalidateAssetLibrary();
            message.success(`已将「${asset.title}」移入回收站`);
        } catch (error) {
            message.warning(localSavedRemotePendingMessage("已移入回收站", error));
        }
    };

    const batchArchive = async () => {
        if (!selectedIds.length) return;
        try {
            await ensureAssetsInStore(selectedIds);
            for (const id of selectedIds) updateAsset(id, { status: "archived" });
            const count = selectedIds.length;
            setSelectedIds([]);
            await flushAssetStorePersistence();
            await saveRemoteUserDataNow();
            await invalidateAssetLibrary();
            message.success(`已将 ${count} 个素材移入回收站`);
        } catch (error) {
            message.warning(localSavedRemotePendingMessage("已移入回收站", error));
        }
    };

    const emptyTrash = async () => {
        const count = trashAssets.length;
        if (!count) return;
        try {
            await deleteAssetsWithRemoteSync(trashAssets.map((asset) => asset.id));
            setSelectedIds([]);
            message.success(`已彻底清空回收站 ${count} 个素材`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "清空回收站失败");
        }
    };

    const confirmDelete = async () => {
        if (!deletingAsset) return;
        try {
            await deleteAssetWithRemoteSync(deletingAsset.id);
            message.success("素材已彻底删除");
            setDeletingAsset(null);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材删除失败");
        }
    };

    const exportSelectedAssets = async () => {
        if (!selectedAssets.length) return;
        await exportAssets(selectedAssets);
    };

    const confirmBatchDelete = async () => {
        if (!selectedAssets.length) return;
        try {
            await deleteAssetsWithRemoteSync(selectedAssets.map((asset) => asset.id));
            message.success(`已彻底删除 ${selectedAssets.length} 个素材`);
            setSelectedIds([]);
            setBatchDeleteOpen(false);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "批量删除失败");
        }
    };

    return (
        <>
            <WorkspacePage grid className="library-page assets-library-page canvas-library-page">
                <div className="studio-band">
                    <PageHeader
                        title={viewMode === "trash" ? "资产库 / 回收站" : "资产库"}
                        description={viewMode === "trash" ? "已删除画布或手动归档的临时素材，可随时还原或彻底清理。" : "管理文本、图片、视频、音频和 3D 模型素材。"}
                        meta={<span className="app-projects-header-meta assets-header-meta">{headerAssetCount} 个素材</span>}
                        actions={
                            <div className="assets-header-actions">
                                <div className="assets-header-action-buttons">
                                    {viewMode === "trash" ? (
                                        <>
                                            {trashAssets.length > 0 ? (
                                                <Popconfirm
                                                    title="确定清空回收站吗？"
                                                    description="清空后所有回收站素材及其文件将被彻底永久删除，不可恢复。"
                                                    onConfirm={() => void emptyTrash()}
                                                    okText="清空"
                                                    okButtonProps={{ danger: true }}
                                                    cancelText="取消"
                                                >
                                                    <Button danger icon={<Trash2 className="size-3.5" />}>
                                                        清空回收站
                                                    </Button>
                                                </Popconfirm>
                                            ) : null}
                                            <Button
                                                icon={<RotateCcw className="size-3.5" />}
                                                onClick={() => {
                                                    setViewMode("library");
                                                    setPage(1);
                                                    setSelectedIds([]);
                                                }}
                                            >
                                                返回资产库
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button type="primary" icon={<Plus className="size-3.5" />} onClick={openCreate}>
                                                新增素材
                                            </Button>
                                            <Button icon={<Images className="size-3.5" />} onClick={() => setBatchUploadOpen(true)}>
                                                上传图片
                                            </Button>
                                            <Dropdown
                                                trigger={["click"]}
                                                menu={{
                                                    items: [
                                                        { key: "eagle", icon: <FolderOpen className="size-4" />, label: "Eagle 素材库", onClick: () => navigate("/plugins/eagle") },
                                                        { key: "package", icon: <FileUp className="size-4" />, label: "导入素材包", onClick: () => assetInputRef.current?.click() },
                                                        { key: "export", icon: <Download className="size-4" />, label: "导出全部素材", onClick: () => void exportAllAssets() },
                                                    ],
                                                }}
                                            >
                                                <Button type="text" aria-label="更多素材操作" icon={<MoreHorizontal className="size-4" />} />
                                            </Dropdown>
                                        </>
                                    )}
                                </div>
                                <AssetStorageUsage />
                            </div>
                        }
                    />
                    <ListToolbar
                        className="library-toolbar"
                        active={Boolean(keyword || kindFilter !== "all" || categoryFilter !== "all" || folderFilter !== "all")}
                        filtersAlwaysVisible
                        filters={
                            <>
                                <Select
                                    value={kindFilter}
                                    className="w-full sm:w-36"
                                    options={kindOptions.map((option) => ({ ...option, label: `${option.value === "all" ? "全部类型" : option.label} · ${kindCounts.get(option.value) || 0}` }))}
                                    onChange={(value) => {
                                        setViewMode("library");
                                        setKindFilter(value as AssetKind | "all");
                                        setPage(1);
                                    }}
                                />
                                <Select
                                    value={categoryFilter}
                                    className="w-full sm:w-36"
                                    options={categoryOptions.map((option) => ({ ...option, label: `${option.label} · ${categoryCounts.get(option.value) || 0}` }))}
                                    onChange={(value) => {
                                        setViewMode("library");
                                        setCategoryFilter(value as AssetCategory | "all");
                                        setPage(1);
                                    }}
                                />
                                {kindFilter !== "all" ? <Tag closable onClose={() => { setKindFilter("all"); setPage(1); }}>类型：{kindOptions.find((option) => option.value === kindFilter)?.label}</Tag> : null}
                                {categoryFilter !== "all" ? <Tag closable onClose={() => { setCategoryFilter("all"); setPage(1); }}>用途：{assetCategoryLabel(categoryFilter)}</Tag> : null}
                                {folderFilter !== "all" ? <Tag closable onClose={() => { setFolderFilter("all"); setPage(1); }}>文件夹：{folderFilter === "uncategorized" ? "未整理" : folders.find((folder) => folder.id === folderFilter)?.name || "未知"}</Tag> : null}
                            </>
                        }
                        trailing={
                            <Select
                                value={gridDensity}
                                className="w-full sm:w-32"
                                suffixIcon={<LayoutGrid className="size-3.5" />}
                                options={assetGridDensityOptions}
                                onChange={(value) => setGridDensity(parseAssetGridDensity(value))}
                            />
                        }
                    >
                        <Input
                            allowClear
                            className="w-full sm:w-[280px]"
                            prefix={<Search className="size-4 text-foreground/40" />}
                            value={keyword}
                            placeholder="搜索标题、内容、标签或来源"
                            onChange={(event) => {
                                setPage(1);
                                setKeyword(event.target.value);
                            }}
                            />
                        </ListToolbar>
                </div>

                <div className="canvas-library-frame assets-library-frame">
                    <div className="assets-collection-layout">
                        <aside className="assets-collection-filters thin-scrollbar flex gap-2 overflow-x-auto py-3 lg:sticky lg:top-0 lg:block lg:max-h-[calc(100vh-150px)] lg:overflow-x-hidden lg:overflow-y-auto lg:pr-3" aria-label="素材分类">
                            <div>
                                <div className="mb-1.5 flex items-center justify-between px-1 text-[var(--fs-tiny)] font-semibold uppercase tracking-[0.08em] text-foreground/38">
                                    <span>我的分类</span>
                                    <button type="button" className="assets-folder-add" title="新建文件夹" aria-label="新建文件夹" onClick={() => { setFolderName(""); setFolderEditor("new"); }}><FolderPlus className="size-3.5" /></button>
                                </div>
                                <div className="space-y-0.5">
                                    <div className="assets-folder-row">
                                        <button type="button" aria-pressed={viewMode === "library" && folderFilter === "all"} className={`assets-filter-item ${viewMode === "library" && folderFilter === "all" ? "is-active" : ""}`} onClick={() => selectFolder("all")}>
                                            <span className="assets-filter-item-label">全部素材</span><span className="assets-filter-count">{folderCountTotal}</span>
                                        </button>
                                        <span className="assets-folder-action-spacer" aria-hidden="true" />
                                    </div>
                                    <div className="assets-folder-row">
                                        <button type="button" aria-pressed={viewMode === "library" && folderFilter === "uncategorized"} className={`assets-filter-item ${viewMode === "library" && folderFilter === "uncategorized" ? "is-active" : ""}`} onClick={() => selectFolder("uncategorized")}>
                                            <span className="assets-filter-item-label">未整理</span><span className="assets-filter-count">{folderCounts[""] ?? 0}</span>
                                        </button>
                                        <span className="assets-folder-action-spacer" aria-hidden="true" />
                                    </div>
                                    {folders.map((folder) => (
                                        <div key={folder.id} className="assets-folder-row">
                                            <button type="button" aria-pressed={viewMode === "library" && folderFilter === folder.id} className={`assets-filter-item min-w-0 flex-1 ${viewMode === "library" && folderFilter === folder.id ? "is-active" : ""}`} onClick={() => selectFolder(folder.id)}>
                                                <span className="assets-filter-item-label min-w-0 truncate">{folder.name}</span><span className="assets-filter-count">{folderCounts[folder.id] ?? 0}</span>
                                            </button>
                                            <Dropdown trigger={["click"]} menu={{ items: [{ key: "rename", icon: <PencilLine className="size-3.5" />, label: "重命名", onClick: () => { setFolderName(folder.name); setFolderEditor(folder); } }, { key: "delete", danger: true, icon: <Trash2 className="size-3.5" />, label: "删除文件夹", onClick: () => void removeFolder(folder) }] }}>
                                                <button type="button" className="assets-folder-more" aria-label={`管理文件夹 ${folder.name}`} title="管理文件夹"><MoreHorizontal className="size-3.5" /></button>
                                            </Dropdown>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="mt-6 border-t border-border/40 pt-3">
                                <div className="assets-folder-row">
                                    <button
                                        type="button"
                                        aria-pressed={viewMode === "trash"}
                                        className={cn(
                                            "assets-filter-item w-full transition-colors",
                                            viewMode === "trash" ? "is-active !bg-amber-500/15 !text-amber-600 dark:!text-amber-400 font-semibold shadow-sm" : "text-foreground/65 hover:text-foreground",
                                        )}
                                        onClick={() => {
                                            if (viewMode === "trash") {
                                                setViewMode("library");
                                        } else {
                                            setViewMode("trash");
                                            setKeyword("");
                                            setKindFilter("all");
                                            setCategoryFilter("all");
                                            setFolderFilter("all");
                                        }
                                            setPage(1);
                                            setSelectedIds([]);
                                        }}
                                    >
                                        <span className="assets-filter-item-label flex items-center gap-1.5">
                                            <Trash2 className="size-3.5" />
                                            <span>回收站</span>
                                        </span>
                                        <span className="assets-filter-count">{trashAssets.length}</span>
                                    </button>
                                    <span className="assets-folder-action-spacer" aria-hidden="true" />
                                </div>
                            </div>
                        </aside>
                        <section className="min-w-0">
                            {viewMode === "trash" ? (
                                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-600 dark:text-amber-300">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                                        <span>{retentionDays > 0 ? `回收站内的素材将在 ${retentionDays} 天后自动彻底清除。您可以随时还原素材，或手动彻底删除释放空间。` : "回收站内的素材当前设置为永久保留，您可以随时还原素材或手动彻底清除。"}</span>
                                    </div>
                                </div>
                            ) : null}
                            {selectedAssets.length ? (
                                <AssetsBatchBar
                                    count={selectedAssets.length}
                                    isTrash={viewMode === "trash"}
                                    allSelected={allFilteredSelected}
                                    onSelectAll={() => setSelectedIds((current) => Array.from(new Set([...current, ...visibleAssetIds])))}
                                    onClear={() => setSelectedIds([])}
                                    onExport={() => void exportSelectedAssets()}
                                    onRestore={() => void batchRestore()}
                                    onArchive={() => setBatchArchiveOpen(true)}
                                    onDelete={() => setBatchDeleteOpen(true)}
                                />
                            ) : null}
                            {validAssets.length === 0 ? (
                                viewMode === "trash" ? (
                                    <WorkspaceState icon="assets" compact title="回收站是空的" description="删除画布或手动移入回收站的素材会暂存到这里，可在需要时随时还原。" />
                                ) : (
                                    <AssetsEmptyState onNew={openCreate} onImport={() => assetInputRef.current?.click()} onGoCanvas={() => navigate("/canvas")} />
                                )
                            ) : (
                                <>
                                    {filteredAssets.length === 0 ? (
                                        <WorkspaceState icon="assets" compact title="没有匹配的素材" description="调整关键词、类型、用途或文件夹后再试。" />
                                    ) : (
                                        <CollectionGrid className="library-grid assets-library-grid" style={{ "--collection-grid-min-width": `${assetGridCardMinWidth[gridDensity]}px` } as React.CSSProperties}>
                                            {visibleAssets.map((asset) => (
                                                <AssetCard
                                                    key={asset.id}
                                                    asset={asset}
                                                    projectRelations={assetPageQuery.data?.projectRelations?.[asset.id]}
                                                    selected={selectedIds.includes(asset.id)}
                                                    isTrash={viewMode === "trash"}
                                                    retentionDays={retentionDays}
                                                    onSelect={(selected) => setSelectedIds((current) => (selected ? [...new Set([...current, asset.id])] : current.filter((id) => id !== asset.id)))}
                                                    onOpen={() => setPreviewAsset(asset)}
                                                    onEdit={() => void openEdit(asset)}
                                                    onCopy={copyAssetText}
                                                    onDownload={downloadImage}
                                                    onRestore={() => void restoreAsset(asset)}
                                                    onArchive={() => setArchivingAsset(asset)}
                                                    onDelete={() => setDeletingAsset(asset)}
                                                    folderOptions={folderSelectOptions}
                                                    onMoveToFolder={(folderId) => void moveAssetsToFolder([asset.id], folderId)}
                                                />
                                            ))}
                                        </CollectionGrid>
                                    )}
                                    <PaginationBar
                                        current={page}
                                        pageSize={pageSize}
                                        total={totalAssets}
                                        pageSizeOptions={[40, 80, 120]}
                                        onChange={(nextPage, nextPageSize) => {
                                            setPage(nextPageSize !== pageSize ? 1 : nextPage);
                                            setPageSize(nextPageSize);
                                        }}
                                    />
                                </>
                            )}
                        </section>
                    </div>
                </div>
            </WorkspacePage>

            <Modal
                className="workspace-modal workspace-modal-wide library-modal"
                title={editingAsset ? "编辑素材" : "新增素材"}
                open={isAssetOpen}
                onCancel={() => {
                    if (!imageUploading) setIsAssetOpen(false);
                }}
                onOk={() => void saveAsset()}
                okText={imageUploading ? "正在上传" : "保存"}
                cancelText="取消"
                confirmLoading={imageUploading}
                cancelButtonProps={{ disabled: imageUploading }}
                closable={!imageUploading}
                destroyOnHidden
            >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <Form form={form} layout="vertical" requiredMark={false} initialValues={{ kind: "text", category: "material", tags: [] }}>
                        <Form.Item name="kind" label="类型">
                            <Select
                                options={[
                                    { label: "文本", value: "text" },
                                    { label: "图片", value: "image" },
                                    { label: "视频", value: "video" },
                                    { label: "音频", value: "audio" },
                                    { label: "3D 模型", value: "model" },
                                ]}
                                onChange={(value: AssetKind) => {
                                    setFormKind(value);
                                    setImageFile(null);
                                    setMediaFile(null);
                                    if (value !== "image") setImageDraft(null);
                                }}
                            />
                        </Form.Item>
                        <Form.Item name="category" label="素材用途">
                            <Select options={categoryOptions.slice(1)} />
                        </Form.Item>
                        <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
                            <Input placeholder="给素材起一个容易检索的名字" />
                        </Form.Item>
                        <Form.Item name="coverUrl" label="封面 URL">
                            <Space.Compact className="library-cover-url-row w-full">
                                <Input placeholder="可粘贴图片 URL，也可以上传本地封面" />
                                <Button icon={<Upload className="size-3.5" />} onClick={() => coverInputRef.current?.click()}>
                                    上传
                                </Button>
                            </Space.Compact>
                        </Form.Item>
                        <Form.Item name="tags" label="标签">
                            <Select mode="tags" tokenSeparators={[",", "，"]} placeholder="输入标签后回车" />
                        </Form.Item>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Form.Item name="arkAssetId" label="方舟素材 ID" rules={[{ pattern: /^asset-[A-Za-z0-9-]+$/, message: "请输入 asset- 开头的方舟素材 ID" }]}>
                                <Input autoComplete="off" allowClear placeholder="asset-…，需为本人或被授权可用的方舟素材" />
                            </Form.Item>
                            <Form.Item name="portraitCertified" label="人像认证" valuePropName="checked" extra="标记已通过火山方舟实人认证的真人人像素材">
                                <Switch aria-label="人像认证" />
                            </Form.Item>
                        </div>
                        <Form.Item name="note" label="备注">
                            <Input placeholder="可选" />
                        </Form.Item>
                        {formKind === "text" ? (
                            <Form.Item name="content" label="文本内容" rules={[{ required: true, message: "请输入文本内容" }]}>
                                <Input.TextArea rows={8} placeholder="保存提示词、说明文案、参考描述等文本素材" />
                            </Form.Item>
                        ) : formKind === "image" ? (
                            <Form.Item label="图片内容" required>
                                <div className="rounded-lg border border-dashed border-stone-300 p-4 dark:border-stone-700">
                                    <Button disabled={imageUploading} icon={<Upload className="size-4" />} onClick={() => imageInputRef.current?.click()}>
                                        {imageUploading ? "正在上传图片" : "选择图片文件"}
                                    </Button>
                                    {imageFile ? (
                                        <Tag color="gold" className="ml-3">
                                            待保存上传
                                        </Tag>
                                    ) : null}
                                    {imageDraft ? (
                                        <Typography.Text type="secondary" className="ml-3 text-xs" title={resourceStorageTitle(imageDraft.storageKey)}>
                                            {imageDraft.width}x{imageDraft.height} · {formatBytes(imageDraft.bytes)} · {resourceStorageLabel(imageDraft.storageKey)}
                                        </Typography.Text>
                                    ) : (
                                        <Typography.Text type="secondary" className="ml-3 text-xs">
                                            未选择图片
                                        </Typography.Text>
                                    )}
                                </div>
                            </Form.Item>
                        ) : (
                            <Form.Item label={`${assetKindLabel(formKind)}文件`} required>
                                <div className="rounded-lg border border-dashed border-stone-300 p-4 dark:border-stone-700">
                                    <Button disabled={imageUploading} icon={<Upload className="size-4" />} onClick={() => mediaInputRef.current?.click()}>
                                        {imageUploading ? `正在上传${assetKindLabel(formKind)}` : `选择${assetKindLabel(formKind)}文件`}
                                    </Button>
                                    {mediaFile ? (
                                        <Tag color="gold" className="ml-3">
                                            {mediaFile.name}
                                        </Tag>
                                    ) : editingAsset?.kind === formKind ? (
                                        <Typography.Text type="secondary" className="ml-3 text-xs">
                                            已有素材文件，选择新文件可替换
                                        </Typography.Text>
                                    ) : (
                                        <Typography.Text type="secondary" className="ml-3 text-xs">
                                            未选择文件
                                        </Typography.Text>
                                    )}
                                </div>
                            </Form.Item>
                        )}
                    </Form>
                    <div className="lg:pl-4">
                        <Typography.Text strong className="text-xs">
                            预览
                        </Typography.Text>
                        <div className="mt-2 overflow-hidden rounded-md bg-stone-100 dark:bg-stone-900">
                            {coverUrl || imageDraft?.dataUrl ? (
                                <div className={`asset-preview-uploading ${imageUploading ? "is-uploading" : ""}`}>
                                    <img src={coverUrl || imageDraft?.dataUrl} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" />
                                    {imageUploading && imageUploadProgress ? (
                                        <div className="asset-preview-uploading-panel">
                                            <div className="asset-preview-uploading-copy">
                                                <span>{imageUploadProgress.phase === "confirming" ? "正在确认资源" : "正在上传到云端"}</span>
                                                {typeof imageUploadProgress.percent === "number" ? <strong>{imageUploadProgress.percent}%</strong> : null}
                                            </div>
                                            <Progress percent={imageUploadProgress.percent} showInfo={false} size="small" status="active" />
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-5 text-center text-sm text-stone-500 dark:bg-stone-900">{content || "暂无封面"}</div>
                            )}
                            <div className="bg-background p-3">
                                <Typography.Text strong ellipsis className="block">
                                    {title || "未命名素材"}
                                </Typography.Text>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {tags.length ? (
                                        tags.map((tag) => (
                                            <Tag key={tag} className="m-0">
                                                {tag}
                                            </Tag>
                                        ))
                                    ) : (
                                        <Tag className="m-0">未打标签</Tag>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        void readCoverFile(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                />
                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        void readImageFile(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                />
            </Modal>

            <AssetDrawer asset={previewAsset} onClose={() => setPreviewAsset(null)} onCopy={copyAssetText} onDownload={downloadImage} />

            <AssetBatchUploadModal open={batchUploadOpen} defaultFolderId={folderFilter !== "all" && folderFilter !== "uncategorized" ? folderFilter : ""} folders={folders} onClose={() => setBatchUploadOpen(false)} onComplete={async () => { setBatchUploadOpen(false); await invalidateAssetLibrary(); }} />

            <Modal
                className="library-modal library-confirm-modal"
                title={folderEditor === "new" ? "新建文件夹" : "重命名文件夹"}
                open={Boolean(folderEditor)}
                confirmLoading={folderSaving}
                onCancel={() => { if (!folderSaving) setFolderEditor(null); }}
                onOk={() => void saveFolder()}
                okText="保存"
                cancelText="取消"
            >
                <Input autoFocus value={folderName} maxLength={40} placeholder="例如：角色参考、场景灵感" onChange={(event) => setFolderName(event.target.value)} onPressEnter={() => void saveFolder()} />
            </Modal>

            <input ref={assetInputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importAssetZip(event.target.files?.[0])} />
            <input
                ref={mediaInputRef}
                type="file"
                accept={assetUploadAccept(formKind)}
                className="hidden"
                onChange={(event) => {
                    readMediaFile(event.target.files?.[0]);
                    event.currentTarget.value = "";
                }}
            />

            <Modal
                className="library-modal library-confirm-modal"
                title="移入回收站"
                open={Boolean(archivingAsset)}
                onCancel={() => setArchivingAsset(null)}
                onOk={() => {
                    if (archivingAsset) {
                        void archiveAsset(archivingAsset);
                        setArchivingAsset(null);
                    }
                }}
                okText="移入回收站"
                cancelText="取消"
            >
                确定将「{archivingAsset?.title}」移入回收站吗？移入后不会出现在正常资产库中，可在回收站随时还原。
            </Modal>
            <Modal
                className="library-modal library-confirm-modal"
                title="批量移入回收站"
                open={batchArchiveOpen}
                onCancel={() => setBatchArchiveOpen(false)}
                onOk={() => {
                    void batchArchive();
                    setBatchArchiveOpen(false);
                }}
                okText="移入回收站"
                cancelText="取消"
            >
                确定将已选择的 {selectedAssets.length} 个素材移入回收站吗？移入后可随时在回收站批量还原。
            </Modal>
            <Modal
                className="library-modal library-confirm-modal"
                title="彻底删除素材"
                open={Boolean(deletingAsset)}
                onCancel={() => setDeletingAsset(null)}
                onOk={() => void confirmDelete()}
                okText="彻底删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定彻底删除「{deletingAsset?.title}」吗？未被其他素材复用的服务器文件会直接释放，原画布或任务中的旧引用可能失效，操作不可恢复。
            </Modal>
            <Modal
                className="library-modal library-confirm-modal"
                title="批量彻底删除素材"
                open={batchDeleteOpen}
                onCancel={() => setBatchDeleteOpen(false)}
                onOk={() => void confirmBatchDelete()}
                okText="彻底删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定彻底删除已选择的 {selectedAssets.length} 个素材吗？未被其他素材复用的服务器文件会直接释放，原画布或任务中的旧引用可能失效，操作不可恢复。
            </Modal>
        </>
    );
}

/** 素材上传输入框按类型限制可选文件；model 类型补充 glTF 二进制与 JSON 扩展。 */
function assetUploadAccept(kind: AssetKind) {
    return kind === "image" ? "image/*" : kind === "video" ? "video/*" : kind === "audio" ? "audio/*" : kind === "model" ? ".glb,.gltf,model/gltf-binary,model/gltf+json" : undefined;
}
