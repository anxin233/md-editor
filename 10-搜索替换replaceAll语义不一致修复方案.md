# 搜索替换 replaceAll 语义不一致修复方案

## 1. 问题描述

**文件**：`src/components/editor/SearchReplace.vue`

搜索替换面板的「全部替换」功能在非正则模式下存在语义不一致：替换文本中的特殊模式（`$&`、`$1`、`$'`、`` $` `` 等）会被 JavaScript `String.prototype.replace()` 解释为反向引用，而非按字面量插入。

### 1.1 根因分析

`replaceAll()` 函数（第 142-148 行）：

```ts
function replaceAll() {
  const pattern = createPattern(true)
  if (!pattern) return
  const nextContent = props.content.replace(pattern, replaceText.value)  // ← 问题在此
  emit('update:content', nextContent)
  currentIndex.value = 0
}
```

`String.replace(regexp, replacementString)` 的第二个参数遵循 [ECMAScript Replacement 约定](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_the_replacement)：

| 替换模式 | 含义 |
|----------|------|
| `$$` | 插入字面 `$` |
| `$&` | 插入匹配的子串 |
| `` $` `` | 插入匹配子串之前的文本 |
| `$'` | 插入匹配子串之后的文本 |
| `$n` | 插入第 n 个捕获组（正则模式下） |

这意味着在非正则模式下，如果用户搜索 `price` 并替换为 `$100`，实际结果是 `00`（因为 `$&` 被替换为匹配文本 `price`，而 `$1` 在无捕获组时为空字符串）。这不是用户预期的行为。

### 1.2 两处不一致

| 函数 | 模式 | 行为 | 是否一致 |
|------|------|------|----------|
| `replaceCurrent()` | 非正则 | 字面量替换（`applySingleReplacement` 直接返回 `replaceText.value`） | ✅ 正确 |
| `replaceAll()` | 非正则 | 经过 `String.replace` 解释特殊模式 | ❌ 错误 |
| `applySingleReplacement()` | 正则 | 经过 `String.replace` 解释 `$1` 等 | ✅ 符合预期 |
| `replaceAll()` | 正则 | 经过 `String.replace` 解释 `$1` 等 | ✅ 符合预期 |

核心矛盾：**非正则模式下**，`replaceCurrent()` 和 `replaceAll()` 对同一替换文本的处理语义不同。

## 2. 修复方案

### 2.1 改动范围

仅修改 `src/components/editor/SearchReplace.vue`，共 2 处。

### 2.2 具体改动

**改动 1**：`replaceAll()` — 非正则模式使用替换函数绕过特殊模式解释

```ts
// 修复前（第 142-148 行）
function replaceAll() {
  const pattern = createPattern(true)
  if (!pattern) return
  const nextContent = props.content.replace(pattern, replaceText.value)
  emit('update:content', nextContent)
  currentIndex.value = 0
}

// 修复后
function replaceAll() {
  const pattern = createPattern(true)
  if (!pattern) return
  // 非正则模式：替换函数返回字面量，避免 $&/$1 等被解释
  // 正则模式：保留原始语义，允许用户使用 $1/$& 等反向引用
  const replacement = useRegex.value
    ? replaceText.value
    : () => replaceText.value
  const nextContent = props.content.replace(pattern, replacement)
  emit('update:content', nextContent)
  currentIndex.value = 0
}
```

**改动 2**：`applySingleReplacement()` — 正则单次替换同样存在风险，一并收紧

```ts
// 修复前（第 118-124 行）
function applySingleReplacement(sourceText: string): string {
  if (useRegex.value) {
    const singlePattern = createPattern(false)
    return singlePattern ? sourceText.replace(singlePattern, replaceText.value) : sourceText
  }
  return replaceText.value
}

// 修复后
function applySingleReplacement(sourceText: string): string {
  if (useRegex.value) {
    const singlePattern = createPattern(false)
    return singlePattern ? sourceText.replace(singlePattern, replaceText.value) : sourceText
  }
  // 非正则模式：替换函数返回字面量
  return sourceText.replace(createPattern(false)!, () => replaceText.value)
}
```

> 注：改动 2 为防御性加固。当前 `replaceCurrent()` 的调用方已通过字符串拼接实现了字面量替换（第 131 行 `props.content.slice(0, match.start) + replacement + props.content.slice(match.end)`），因此 `applySingleReplacement` 在非正则路径下的返回值不会经过 `String.replace`，实际不受影响。但统一收口可避免未来重构时引入同类问题。

### 2.3 修复原理

`String.replace(pattern, function)` 当第二个参数为函数时，**不会**对返回值执行特殊模式解释。函数的返回值直接作为替换文本插入。

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 非正则，替换为 `$100` | `$1` → 空，`$00` → `00` | `$100` |
| 非正则，替换为 `$$price` | `$price` | `$$price` |
| 非正则，替换为 `$&test` | `{匹配文本}test` | `$&test` |
| 正则，替换为 `$1-$2` | 第1组-第2组 | 第1组-第2组（不变） |

## 3. 验证用例

| 编号 | 搜索文本 | 替换文本 | 正则模式 | 文档内容 | 预期结果 |
|------|----------|----------|----------|----------|----------|
| T1 | `price` | `$100` | ❌ | `the price is high` | `the $100 is high` |
| T2 | `foo` | `$&bar` | ❌ | `foo baz` | `$&bar baz` |
| T3 | `hello` | `` $` `` | ❌ | `hello world` | `` $`  world`` |
| T4 | `(\w+)` | `$1-$1` | ✅ | `hello world` | `hello-hello world-world` |
| T5 | `cat` | `dog` | ❌ | `cat cat cat` | `dog dog dog` |
| T6 | `a(b)c` | `$1` | ✅ | `abc abc` | `b b` |

T1-T3 验证非正则字面量修复，T4/T6 验证正则反向引用不受影响，T5 验证基本替换功能。

## 4. 影响评估

- **改动量**：1 个文件，核心改动 3 行
- **风险**：极低。仅影响非正则模式下包含 `$` 的替换文本，且改为更符合用户预期的行为
- **兼容性**：正则模式行为完全不变，不影响已有的正则替换使用习惯
- **回归范围**：搜索替换面板，不涉及其他组件
