# 03-WYSIWYG 模式行为一致性修正方案

关联方案：`02-WYSIWYG模式格式命令补齐方案.md`  
关联验证结论：WYSIWYG 格式命令主体已接线，但仍有行为一致性和边界问题需要修正。

## 1. 方案目标

本方案针对已实现后的 4 个注意点继续收口：

1. `blockquote / ordered-list / unordered-list` 重复触发可能嵌套，而不是切换取消。
2. `toc / footnote / yaml-front-matter` 在 Milkdown 中可能无法稳定保留为预期 Markdown。
3. `hyperlink / image` 允许空 URL，可能产生空链接或空图片。
4. `comment` 仍使用 `indexOf(selectedText)`，存在修改错误位置的问题。

目标是让 WYSIWYG 模式不仅“点了有反应”，还要做到：

- 行为和源码模式语义一致。
- 不产生无效 Markdown。
- 不静默破坏文档结构。
- 不把有已知缺陷的命令标记为完全支持。

## 2. 修正点一：引用和列表命令改成真正 Toggle

### 2.1 当前问题

当前 WYSIWYG 中：

- `blockquote` 使用 `wrapInBlockquoteCommand`
- `ordered-list` 使用 `wrapInOrderedListCommand`
- `unordered-list` 使用 `wrapInBulletListCommand`

这些命令更接近“包裹”，不是“切换”。如果当前光标已经在引用或列表里，再次执行可能继续嵌套，而不是取消。

### 2.2 期望行为

应与源码模式一致：

- 当前段落不是引用时，执行 `blockquote` 变成引用。
- 当前段落已经在引用中，执行 `blockquote` 取消引用。
- 当前段落不是列表时，执行列表命令变成列表。
- 当前段落已经是同类列表时，执行列表命令取消列表。
- 当前段落是另一类列表时，执行列表命令转换列表类型。

### 2.3 实现建议

新增通用检测函数：

```ts
function findAncestorDepth(state: EditorState, nodeName: string): number | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === nodeName) return depth
  }
  return null
}
```

引用切换逻辑：

```ts
function toggleBlockquote() {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const commands = ctx.get(commandsCtx)
    const { state, dispatch } = view
    const depth = findAncestorDepth(state, 'blockquote')

    if (depth != null) {
      const pos = state.selection.$from.before(depth)
      dispatch(state.tr.lift(state.selection.$from.blockRange(state.selection.$to)!, depth - 1))
      view.focus()
      return
    }

    commands.call(wrapInBlockquoteCommand.key)
    view.focus()
  })
}
```

实际实现时建议不要直接照抄上面伪代码，需要对 `blockRange()` 为空的情况做保护。

列表切换建议：

- 先判断当前祖先节点是否在 `bullet_list` 或 `ordered_list` 中。
- 如果是同类列表，执行 lift / unwrap。
- 如果是异类列表，先 unwrap，再 wrap 成目标列表。
- 如果不在列表中，直接 wrap。

### 2.4 验收标准

- 对普通段落执行引用，再执行一次可以恢复普通段落。
- 对普通段落执行无序列表，再执行一次可以恢复普通段落。
- 对无序列表执行有序列表，可以转换为有序列表。
- 重复执行不会产生多层嵌套引用或列表。

## 3. 修正点二：TOC / 脚注 / YAML Front Matter 的源码结果必须稳定

### 3.1 当前问题

`toc`、`footnote`、`yaml-front-matter` 都属于 Markdown 结构语法，而不是普通富文本节点。

在 WYSIWYG 中通过 ProseMirror 插入文本或段落后，Milkdown 再序列化回 Markdown 时，可能出现：

- `[TOC]` 被转义或变成普通段落。
- 脚注定义位置不符合预期。
- YAML Front Matter 被解析成分割线或普通文本。

### 3.2 总体策略

这三类命令建议不要强行走 ProseMirror 节点操作，而是走“Markdown 源文本变换”。

即：

1. 从 `props.modelValue` 生成新的 Markdown 字符串。
2. `emit('update:modelValue', nextMarkdown)`。
3. 让已有 `watch(props.modelValue)` + `replaceAll()` 刷新 Milkdown。

这样可以保证最终源码就是预期 Markdown。

### 3.3 TOC 修正方案

当前项目没有 TOC 渲染插件，所以 `[TOC]` 只是标记。

建议：

```ts
function insertTocPlaceholder() {
  insertMarkdownAtSelection('[TOC]')
  editorStore.showStatusToast('[TOC] 已插入；当前预览端未启用目录插件时为纯文本标记')
}
```

如果暂时无法安全根据选区插入，则可以退化为追加块：

```ts
appendMarkdownBlock('[TOC]')
```

验收标准：

- 插入后切到源码模式，能看到原样 `[TOC]`。
- 不应该变成 `\\[TOC\\]` 或其他转义文本。

### 3.4 脚注修正方案

建议使用纯 Markdown 字符串变换：

```ts
function insertFootnoteSnippet() {
  const n = nextFootnoteIndex(props.modelValue)
  const refText = `[^${n}]`
  const defLine = `[^${n}]: `
  const next = insertMarkdownTextAtCurrentSelection(props.modelValue, refText)
    .replace(/\s*$/, `\n\n${defLine}`)
  emit('update:modelValue', next)
}
```

如果暂时没有可靠的 Markdown 选区映射，可以第一版采用追加引用提示：

```ts
appendMarkdownBlock(`[^${n}]\n\n[^${n}]: `)
```

更好的方案是后续引入 Milkdown selection 到 Markdown offset 的映射，但这可以放到下一阶段。

验收标准：

- 插入后源码包含 `[^n]` 和 `[^n]: `。
- 序号不会和已有脚注重复。
- 预览能被 `markdown-it-footnote` 正确渲染。

### 3.5 YAML Front Matter 修正方案

YAML Front Matter 必须直接插入到 Markdown 字符串开头，不能走 ProseMirror 段落节点。

建议保持当前 `emit('update:modelValue', block + props.modelValue)` 的方向，但增加两点：

1. 识别 BOM 和空白后仍能判断已有 front matter。
2. 插入后提示用户已经写入源码开头。

建议逻辑：

```ts
function hasFrontMatter(markdown: string) {
  const normalized = markdown.replace(/^\ufeff/, '')
  return normalized.startsWith('---\n') || normalized.startsWith('---\r\n')
}
```

插入：

```ts
function insertYamlFrontMatterIfAbsent() {
  if (hasFrontMatter(props.modelValue)) {
    editorStore.showStatusToast('文档开头已包含 YAML Front Matter，未重复插入')
    return
  }

  const date = new Date().toISOString().slice(0, 10)
  const block = `---\ntitle: \ndate: ${date}\n---\n\n`
  emit('update:modelValue', block + props.modelValue.replace(/^\ufeff/, ''))
  editorStore.showStatusToast('YAML Front Matter 已插入到文档开头')
}
```

验收标准：

- 插入后源码开头保持标准 YAML Front Matter。
- 重复触发不会插入第二个 YAML 块。
- 不会被 Milkdown 变成水平分割线。

## 4. 修正点三：链接和图片禁止空 URL

### 4.1 当前问题

当前逻辑中：

```ts
commands.call(toggleLinkCommand.key, { href: href || '', title: null })
commands.call(insertImageCommand.key, { src: url || '', alt: alt ?? 'image', title: '' })
```

用户输入空字符串时仍会插入空链接或空图片。

### 4.2 期望行为

- 用户取消：不做任何修改。
- 用户输入空字符串：提示并不插入。
- 用户输入仅空白：提示并不插入。

### 4.3 实现建议

链接：

```ts
function insertHyperlinkMark() {
  const href = window.prompt('链接地址', 'https://')
  if (href === null) return

  const normalizedHref = href.trim()
  if (!normalizedHref) {
    editorStore.showStatusToast('链接地址不能为空')
    return
  }

  editor.action((ctx) => {
    const commands = ctx.get(commandsCtx)
    const view = ctx.get(editorViewCtx)
    commands.call(toggleLinkCommand.key, { href: normalizedHref, title: null })
    view.focus()
  })
}
```

图片：

```ts
function insertImageNode() {
  const url = window.prompt('图片 URL', 'https://')
  if (url === null) return

  const src = url.trim()
  if (!src) {
    editorStore.showStatusToast('图片 URL 不能为空')
    return
  }

  const alt = window.prompt('替代文本', 'image')
  const normalizedAlt = alt?.trim() || 'image'

  editor.action((ctx) => {
    const commands = ctx.get(commandsCtx)
    const view = ctx.get(editorViewCtx)
    commands.call(insertImageCommand.key, { src, alt: normalizedAlt, title: '' })
    view.focus()
  })
}
```

### 4.4 验收标准

- 空链接不会写入文档。
- 空图片 URL 不会写入文档。
- 取消 prompt 不改变文档。
- 有效 URL 能正常插入。

## 5. 修正点四：comment 命令不要继续使用 indexOf

### 5.1 当前问题

当前 `comment` 仍使用：

```ts
const idx = md.indexOf(selectedText)
```

如果文档中有重复文本，会修改第一处匹配，而不是当前选区。

### 5.2 短期方案：从支持清单中移除 comment

在没有可靠实现前，不建议把 `comment` 放在 `WYSIWYG_SUPPORTED_COMMANDS` 中。

修改：

```ts
export const WYSIWYG_SUPPORTED_COMMANDS = new Set([
  // ...
  // 暂时移除 'comment'
])
```

同时在 `MilkdownEditor.vue` 中：

```ts
case 'comment':
  editorStore.showStatusToast('注释命令暂仅建议在源码模式使用')
  break
```

如果菜单层后续支持按模式禁用，则在 WYSIWYG 模式下禁用“注释”。

### 5.3 中期方案：用 ProseMirror selection 插入注释文本

如果仍要支持 WYSIWYG 注释，不能用 `indexOf`。

可以在 ProseMirror 当前选区直接插入文本：

```ts
function wrapSelectionAsComment() {
  const editor = getEditor()
  if (!editor || loading.value) return

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { state, dispatch } = view
    const { from, to, empty } = state.selection

    if (empty) {
      editorStore.showStatusToast('请先选择要注释的文本')
      return
    }

    const selected = state.doc.textBetween(from, to)
    if (!selected) return

    dispatch(
      state.tr.insertText(`<!-- ${selected} -->`, from, to).scrollIntoView()
    )
    view.focus()
  })
}
```

注意：

Milkdown 是否会把 `<!-- -->` 原样序列化，需要实际验证。如果不能稳定保留，仍应只在源码模式支持注释。

### 5.4 推荐选择

推荐短期先采用：

- 从 `WYSIWYG_SUPPORTED_COMMANDS` 移除 `comment`。
- WYSIWYG 下触发 `comment` 时显示提示。
- 源码模式继续保留现有注释能力。

原因：

- 这是最安全的止血方式。
- 不会误导命令覆盖率。
- 避免重复文本误改。

## 6. 推荐落地顺序

### 第一批：低风险修复

1. 链接 URL 为空时不插入。
2. 图片 URL 为空时不插入。
3. `comment` 从 WYSIWYG 支持清单移除。
4. WYSIWYG 下触发 `comment` 显示提示。

这些改动风险低，能马上避免无效内容和误标记支持。

### 第二批：Markdown 结构命令稳定化

1. `toc` 改成确保源码原样插入 `[TOC]`。
2. `footnote` 改成源码层面的 Markdown 字符串变换。
3. `yaml-front-matter` 增强已有判断和插入提示。

这些改动保证切换源码后结果可控。

### 第三批：列表和引用 Toggle 化

1. 引用重复触发取消引用。
2. 无序列表重复触发取消列表。
3. 有序列表重复触发取消列表。
4. 异类列表之间可以转换。

这部分涉及 ProseMirror 结构操作，建议单独做并充分手测。

## 7. 测试建议

### 7.1 手动验证清单

链接：

- 取消 prompt，文档不变。
- 输入空字符串，文档不变并提示。
- 输入 `https://example.com`，链接插入成功。

图片：

- 取消 prompt，文档不变。
- 输入空 URL，文档不变并提示。
- 输入图片 URL，图片插入成功。

TOC：

- 插入后切到源码模式，看到 `[TOC]`。

脚注：

- 插入后切到源码模式，看到 `[^1]` 和 `[^1]: `。
- 文档已有 `[^1]` 时，再插入得到 `[^2]`。

YAML：

- 空文档插入后，源码以 `---` 开头。
- 已有 YAML 时，再触发不会重复插入。

引用 / 列表：

- 普通段落触发一次变成对应结构。
- 同一位置再触发一次取消结构。
- 不会出现重复嵌套。

注释：

- WYSIWYG 下触发时提示不支持或建议源码模式。
- 源码模式下仍可使用注释命令。

### 7.2 自动化测试建议

如果后续加测试，优先写：

- `editorCommands.ts`：支持清单不包含未安全实现的 `comment`。
- URL 校验：空 URL 不触发命令。
- `nextFootnoteIndex()`：能正确取下一个脚注序号。
- YAML 判断：已有 front matter 不重复插入。

## 8. 验收标准

完成本方案后，应满足：

1. `npm run type-check` 通过。
2. WYSIWYG 下链接和图片不会插入空 URL。
3. WYSIWYG 支持清单不包含仍有已知误改风险的命令。
4. TOC、脚注、YAML 插入后切换源码模式仍是预期 Markdown。
5. 引用和列表重复触发不再制造嵌套。
6. 用户不会遇到“看起来支持但实际有隐藏风险”的命令。

## 9. 结论

`02` 方案已经解决了“空实现”的主体问题；本方案进一步解决“实现后行为是否可靠”的问题。

建议先做低风险修复：空 URL 拦截、`comment` 暂时降级、TOC/脚注/YAML 保证源码稳定。引用和列表的真正 toggle 涉及 ProseMirror 结构调整，可以作为单独一批改动处理。
