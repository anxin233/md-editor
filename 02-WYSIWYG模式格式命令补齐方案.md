# 02-WYSIWYG 模式格式命令补齐方案

关联审查项：`PROJECT_AUDIT.md` 第 3.1 节  
问题标题：WYSIWYG 模式大量格式命令未实现

## 1. 问题背景

当前项目默认编辑模式是 `wysiwyg`，也就是“所见即所得”模式。用户在这个模式下会通过顶部菜单、快捷键、状态栏按钮等入口执行格式命令。

但 `src/components/editor/MilkdownEditor.vue` 中的 `handleFormatCommand()` 对多项命令只做了 `break`，没有实际处理逻辑。

未实现命令包括：

- `hyperlink`
- `image`
- `blockquote`
- `ordered-list`
- `unordered-list`
- `task-list`
- `insert-above`
- `insert-below`
- `footnote`
- `toc`
- `yaml-front-matter`
- `table`

这会导致一个明显体验问题：菜单项看起来可用，但点击后没有任何反应。

## 2. 方案目标

本方案目标不是一次性重写编辑器，而是在保持现有架构的前提下，让 WYSIWYG 模式的格式命令达到可预期、可验证、可逐步扩展的状态。

目标分为三层：

1. 不再出现“按钮可点但无反应”的体验。
2. 常用格式命令在 WYSIWYG 模式下直接生效。
3. 暂时无法原生支持的命令有明确降级策略，不静默失败。

## 3. 总体策略

建议采用“三步走”：

1. 先建立命令支持清单，区分“已实现 / 可快速实现 / 需要降级 / 暂不支持”。
2. 对可快速实现的命令直接补齐 Milkdown / ProseMirror 操作。
3. 对复杂命令采用受控降级：自动切换到源码模式执行，或给出明确提示。

不要继续保留空 `break`，因为空实现会让问题变得不可见，也不利于后续测试。

## 4. 命令处理分级

### 4.1 第一批：应直接补齐

这些命令是 Markdown 编辑器高频能力，建议优先在 WYSIWYG 模式中直接实现：

- `hyperlink`
- `image`
- `blockquote`
- `ordered-list`
- `unordered-list`
- `task-list`
- `insert-above`
- `insert-below`

建议原因：

- 用户最常用。
- 菜单和快捷键已经暴露。
- Milkdown / ProseMirror 通常能直接表达这些结构。

### 4.2 第二批：可以用 Markdown 片段插入

这些命令不一定需要复杂的 ProseMirror 节点操作，可以先通过受控插入 Markdown 片段解决：

- `footnote`
- `toc`
- `yaml-front-matter`

建议行为：

- `footnote`：插入 `[^1]` 和对应定义。
- `toc`：插入 `[TOC]`。
- `yaml-front-matter`：如果文档开头没有 `---`，在文档顶部插入模板。

### 4.3 第三批：已有独立入口，需要统一接线

`table` 当前已经有 `TableEditor.vue` 和 `table-insert` 命令。

问题不是完全没有表格能力，而是普通 `table` 命令在 `MilkdownEditor.vue` 中没有处理。

建议：

- `table` 命令仍交给上层打开 `TableEditor`。
- `table-insert` 继续由 `MilkdownEditor.vue` 插入表格。
- 避免让 `table` 在 Milkdown 内部静默 `break`。

## 5. 具体实现方案

### 5.1 增加命令能力声明

新增一个集中声明，例如在 `src/utils/appCommands.ts` 或新文件 `src/utils/editorCommands.ts` 中维护：

```ts
export const WYSIWYG_SUPPORTED_COMMANDS = new Set([
  'bold',
  'italic',
  'underline',
  'code',
  'strikethrough',
  'paragraph',
  'promote-heading',
  'demote-heading',
  'code-block',
  'math-block',
  'horizontal-rule',
  'clear-format',
  'hyperlink',
  'image',
  'blockquote',
  'ordered-list',
  'unordered-list',
  'task-list',
  'insert-above',
  'insert-below',
  'footnote',
  'toc',
  'yaml-front-matter',
  'table-insert',
])
```

作用：

- 菜单层可以判断是否启用。
- 测试可以检查命令覆盖率。
- 后续新增命令时不容易遗漏。

### 5.2 改造 `MilkdownEditor.vue` 的空实现

当前空实现集中在：

```ts
function handleFormatCommand(command: string, data?: string) {
  switch (command) {
    // ...
    case 'hyperlink':
    case 'image':
    case 'blockquote':
    case 'ordered-list':
    case 'unordered-list':
    case 'task-list':
    case 'insert-above':
    case 'insert-below':
    case 'footnote':
    case 'toc':
    case 'yaml-front-matter':
    case 'table':
      break
  }
}
```

建议改为：

- 每个命令都调用独立函数。
- 暂不支持的命令调用统一 fallback。
- fallback 至少输出用户可见提示，不能静默失败。

示例结构：

```ts
function handleFormatCommand(command: string, data?: string) {
  switch (command) {
    case 'hyperlink':
      insertHyperlink()
      break
    case 'image':
      insertImage()
      break
    case 'blockquote':
      toggleBlockquote()
      break
    case 'ordered-list':
      toggleOrderedList()
      break
    case 'unordered-list':
      toggleBulletList()
      break
    case 'task-list':
      toggleTaskList()
      break
    case 'insert-above':
      insertParagraphAbove()
      break
    case 'insert-below':
      insertParagraphBelow()
      break
    case 'footnote':
      insertMarkdownSnippet('[^1]', '\n\n[^1]: ')
      break
    case 'toc':
      insertMarkdownBlock('[TOC]')
      break
    case 'yaml-front-matter':
      insertYamlFrontMatter()
      break
    case 'table':
      notifyUnsupportedInEditor(command)
      break
  }
}
```

## 6. 各命令建议行为

### 6.1 超链接 `hyperlink`

期望行为：

- 有选区：把选区变成 `[选中文字](url)` 或 ProseMirror link mark。
- 无选区：插入 `link text`，并选中可编辑部分。

建议优先级：

1. 优先使用 Milkdown / ProseMirror link mark。
2. 如果成本较高，短期可插入 Markdown 片段并刷新编辑器。

验收标准：

- WYSIWYG 模式下点击“超链接”有可见结果。
- 相同文字重复出现时，不会修改错误位置。

### 6.2 图片 `image`

期望行为：

- 插入图片占位：`![alt text](url)`。
- 粘贴图片时插入到当前光标位置，而不是追加到文档末尾。

建议：

- 优先通过 ProseMirror selection 插入 image node。
- 如果仍使用 Markdown 片段，也必须基于当前 selection 插入。

验收标准：

- 菜单插入图片在当前光标位置生效。
- 粘贴图片在当前光标位置生效。

### 6.3 引用 `blockquote`

期望行为：

- 当前段落切换为引用。
- 再次触发可取消引用。

建议：

- 使用 Milkdown / ProseMirror 的 blockquote node 命令。
- 不建议通过字符串替换整篇 Markdown。

验收标准：

- 单段落可切换引用。
- 多段落选择时行为可预期。

### 6.4 有序列表、无序列表、任务列表

期望行为：

- `ordered-list`：当前段落变成有序列表。
- `unordered-list`：当前段落变成无序列表。
- `task-list`：当前段落变成任务列表。

建议：

- 优先调用 Milkdown GFM / commonmark 相关命令。
- 如果命令 API 不稳定，先封装一层本地 helper，避免调用散落在组件里。

验收标准：

- 空段落触发后能创建列表。
- 已有文本触发后能包成列表项。
- 再次触发不会破坏文档结构。

### 6.5 在上方 / 下方插入段落

期望行为：

- `insert-above`：在当前块前插入空段落。
- `insert-below`：在当前块后插入空段落。

建议：

- 使用当前 ProseMirror selection 计算所在 block。
- 通过 transaction 插入 paragraph node。

验收标准：

- 在标题、段落、列表、表格附近触发都不崩溃。
- 插入后光标落在新段落中。

### 6.6 脚注 `footnote`

期望行为：

- 在光标处插入脚注引用。
- 在文档末尾插入脚注定义。

建议：

- 第一版可以插入 Markdown 片段。
- 后续再做脚注编号自动递增。

验收标准：

- 插入后源码可被 `markdown-it-footnote` 正确渲染。

### 6.7 TOC `toc`

期望行为：

- 插入 `[TOC]`。

注意：

当前项目的大纲面板是运行时根据标题生成的，`[TOC]` 是否在预览中渲染，需要单独确认。当前 markdown-it 配置未看到专门的 TOC 插件，因此插入 `[TOC]` 可能只是普通文本。

建议：

- 如果要支持文档内 TOC，需要引入 markdown-it TOC 插件或自定义渲染。
- 如果暂不支持，应把菜单名改成“插入 TOC 标记”或禁用该功能。

验收标准：

- 插入行为和预览行为一致，不误导用户。

### 6.8 YAML Front Matter

期望行为：

- 文档开头没有 front matter 时插入模板。
- 已存在时不重复插入。

建议模板：

```yaml
---
title: 
date: 2026-04-28
---
```

验收标准：

- 只会插入到文档开头。
- 重复触发不会生成多个 front matter。

## 7. UI 层配套调整

### 7.1 菜单禁用策略

涉及文件：

- `src/components/layout/TitleBar.vue`
- `src/components/layout/StatusBar.vue`
- `src/components/editor/TableEditor.vue`

建议：

- 如果命令在当前模式下不支持，菜单项应禁用。
- 或者点击时提示“该命令当前仅支持源码模式”。
- 不允许继续出现可点击但无反应。

### 7.2 反馈策略

建议增加轻量提示机制，例如：

- 状态栏临时消息
- 简单 toast
- 对话框提示

用于显示：

- 命令暂不支持
- 命令执行失败
- 导出完成 / 失败

这不只解决 3.1，也能复用到其他问题。

## 8. 测试方案

建议先补最小测试，不必一次性搭完整测试体系。

### 8.1 单元测试

适合覆盖：

- 命令支持清单是否包含菜单暴露的命令。
- Markdown 片段插入函数。
- YAML Front Matter 插入逻辑。
- 脚注编号逻辑。

### 8.2 组件 / E2E 测试

建议用 Playwright 覆盖：

1. 打开应用。
2. 新建文档。
3. 保持 WYSIWYG 模式。
4. 依次点击加粗、链接、引用、列表、图片、表格。
5. 断言内容发生变化。
6. 切到源码模式，确认 Markdown 文本符合预期。

### 8.3 回归测试重点

重点防止：

- 点击菜单无反应。
- 命令修改错误位置。
- 切换编辑模式后内容丢失。
- 表格插入后 Milkdown 崩溃。
- 相同文本选区被错误替换。

## 9. 分阶段落地计划

### 第一阶段：止血

目标：消除“可点击但无反应”。

任务：

1. 找出所有 WYSIWYG 空实现命令。
2. 给暂不支持命令增加提示或禁用。
3. 修正菜单状态，让不可用命令不可点击。

预估改动文件：

- `src/components/editor/MilkdownEditor.vue`
- `src/components/layout/TitleBar.vue`
- `src/utils/appCommands.ts`

### 第二阶段：补齐高频命令

目标：让常用格式在 WYSIWYG 模式可用。

任务：

1. 实现超链接。
2. 实现图片插入。
3. 实现引用。
4. 实现有序列表、无序列表、任务列表。
5. 实现在上方 / 下方插入段落。

预估改动文件：

- `src/components/editor/MilkdownEditor.vue`
- `src/components/editor/WysiwygEditor.vue`

### 第三阶段：补齐 Markdown 结构命令

目标：补齐偏文档结构的命令。

任务：

1. 实现脚注插入。
2. 实现 YAML Front Matter 插入。
3. 明确 TOC 行为：支持渲染或禁用入口。
4. 统一表格命令入口。

预估改动文件：

- `src/components/editor/MilkdownEditor.vue`
- `src/utils/markdown.ts`
- `src/components/editor/TableEditor.vue`

### 第四阶段：测试和验收

目标：防止后续回归。

任务：

1. 增加测试工具。
2. 增加命令覆盖测试。
3. 增加 WYSIWYG 菜单 E2E 测试。
4. 把 `type-check` 和测试加入 `check` 脚本。

预估改动文件：

- `package.json`
- 测试配置文件
- `tests` 或 `src/**/*.spec.ts`

## 10. 验收标准

完成后应满足：

1. WYSIWYG 模式下没有静默空实现的菜单命令。
2. 高频格式命令点击后都有可见结果。
3. 暂不支持的命令有明确禁用或提示。
4. 同一命令在源码模式和 WYSIWYG 模式下语义一致。
5. 切换编辑模式不丢内容。
6. `npm run type-check` 通过。
7. 新增测试通过。

## 11. 推荐最终文件改动清单

建议优先改动：

- `src/components/editor/MilkdownEditor.vue`
- `src/components/editor/WysiwygEditor.vue`
- `src/components/layout/TitleBar.vue`
- `src/utils/appCommands.ts`

可能新增：

- `src/utils/editorCommands.ts`
- `src/utils/editorNotifications.ts`
- `tests/editor-commands.spec.ts`
- `tests/wysiwyg-format.spec.ts`

## 12. 结论

3.1 的本质不是单个 bug，而是“命令入口已经暴露，但 WYSIWYG 实现没有跟上”。最稳妥的解决方式是先消除静默失败，再逐步补齐高频命令，最后用测试保证菜单、快捷键和编辑器能力一致。

推荐从“止血 + 高频命令补齐”开始，不建议一开始就大规模重构整个编辑器。
