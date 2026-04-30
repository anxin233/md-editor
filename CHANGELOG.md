# 更新日志

本文档记录 MD Editor 面向用户的版本变更。打包脚本 `scripts/bump-version-pack.ts` 仍会在执行 `npm run build*` 时用「年.MMDD.HHMM」覆盖 `package.json` 版本号，供安装包与自动更新；此处 **CHANGELOG 以语义化版本（如 1.1.0）为准**，便于对照提交与 Git 标签。

## [1.1.0] - 2026-04-28

### 新增

- **Typora 风格右键菜单（源码 CodeMirror + WYSIWYG Milkdown）**  
  - 剪贴板与常用格式、段落/列表/插入子菜单；链接、图片、代码块、任务列表等场景的上下文专项条目。
  - 全局右键面板：`src/stores/contextMenu.ts`、`src/components/common/`（上下文菜单组件），菜单内容由 `src/utils/contextMenuRegistry.ts` 与 `src/utils/editorContextMenu.ts` 组装。
- **源码模式：严格 GFM 边界管道表格**  
  - 表头、分隔行、数据行须首尾为 `|`，避免正文「`foo | bar`」被误判为表格行（方案 09.2）。
  - `parseMarkdownTableAt` / `serializeMarkdownTable` 与行列编辑：`src/utils/markdownTable.ts`。
  - 表格右键：**插入/删除行与列**、**删除表格**、**对齐方式**子菜单（默认 / 左 / 中 / 右，对应 `---`、`:---`、`:---:`、`---:`）。
- **WYSIWYG 模式：表格结构编辑（ProseMirror Transaction）**  
  - 插入行（上/下）、插入列（左/右）、删除当前行/列、删除整表；禁止直接改 DOM。  
  - 实现：`src/utils/proseMirrorTable.ts`；命令接线：`src/components/editor/MilkdownEditor.vue`、`src/utils/editorCommands.ts`。  
  - **列对齐**：若单元格 schema 含 `alignment` 属性则写入并可保存；否则点击对齐菜单项会提示改用源码或表格编辑器（方案 09.3 兜底）。
- **编辑器商店**：`formatRequest` 支持 `pmRange`，便于删除代码块/表格等结构性命令精确替换文档区间。
- **文档**：仓库内新增/收录方案说明 `08.1`、`09`、`09.1`、`09.2`、`09.3`（设计备忘，非安装包内容）。

### 变更

- **标签栏 / 侧边栏**：右键菜单接入统一上下文菜单组件与文案调整（`TabBar.vue`、`FileTree.vue`）。
- **自动更新 IPC**：`electron-updater` 改为默认导入后再解构 `autoUpdater`，并修正 `update:install` 回调缩进（`electron/main/ipc/update.ipc.ts`）。

### 修复与稳定性

- 表格解析范围与列数校验收紧，减少「删除表格」误删紧随其后的普通文本。

---

## [1.0.1] 及更早

早期版本未在本文件中逐项追溯；若需历史提交记录，请使用 `git log`。
