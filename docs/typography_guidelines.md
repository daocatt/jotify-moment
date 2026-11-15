# Jotify Moment 字体与排版设计规范 (Typography Guidelines)

本文档制定了 Jotify Moment 项目的中西文字体回退链、六级字号梯度规则，以及 Moments 动态图文富文本排版标准。

---

## 1. 字体族与回退链 (Font Families)

项目统一采用「西文优先、优质中文字体梯次回退、系统原生保底、Emoji 兜底」的现代字体栈设计，并通过 OpenType 特性与平滑抗锯齿提升渲染质感。

### 1.1 全局正文字体栈 (Sans-Serif / CJK)

```css
font-family:
  var(--font-geist-sans),
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  Roboto,
  "PingFang SC",
  "Hiragino Sans GB",
  "Microsoft YaHei UI",
  "Microsoft YaHei",
  "Source Han Sans SC",
  "Noto Sans SC",
  "HarmonyOS Sans SC",
  system-ui,
  sans-serif,
  "Apple Color Emoji",
  "Segoe UI Emoji",
  "Segoe UI Symbol";
```

- **西文质感**：优先由 Next.js 载入的 Geist Sans，提供极其现代、干净的西文字形。
- **macOS / iOS**：首选 `PingFang SC`（苹方）及 `Hiragino Sans GB`，字形饱满端正。
- **Windows**：指定 `Microsoft YaHei UI` 与 `Microsoft YaHei`（微软雅黑），确保在 ClearType 与高分屏下均具备清晰骨架。
- **Android / 鸿蒙 / Linux**：回退至 `Source Han Sans SC`（思源黑体）、`Noto Sans SC` 与 `HarmonyOS Sans SC`。
- **文字渲染优化**：
  - `-webkit-font-smoothing: antialiased;`
  - `text-rendering: optimizeLegibility;`
  - `font-feature-settings: "cv02", "cv03", "cv04", "cv11";`（改善易混淆字形如 1/l/I，增强西文辨识度）
  - 全局正文行高标准化：`1.625`（约 24.375px @ 15px 正文），既不拥挤也不松散。
  - 自动折行保障：`overflow-wrap: anywhere; word-break: break-word;`，杜绝长链接或无空格英文字符破坏卡片布局。

### 1.2 等宽代码字体栈 (Monospace)

```css
font-family:
  var(--font-geist-mono),
  ui-monospace,
  SFMono-Regular,
  "SF Mono",
  Menlo,
  Monaco,
  Consolas,
  "Liberation Mono",
  "Courier New",
  "Noto Sans Mono CJK SC",
  monospace;
```

---

## 2. 六级字号梯队规则 (Typography Scale)

为消除随意使用的孤立字号，建立层级明确、移动端与桌面端兼顾的 6 级字号规范：

| 级别 | 定义 | 字号 (px / rem) | Tailwind 类名 | 典型应用场景 |
| :--- | :--- | :--- | :--- | :--- |
| **T1** | **Display / Hero** | 20px ~ 24px (`1.25rem` ~ `1.5rem`) | `text-xl sm:text-2xl` | 个人主页大封面用户名、重要弹窗大标题 |
| **T2** | **Heading / Title** | 16px ~ 18px (`1rem` ~ `1.125rem`) | `text-base sm:text-lg` | 动态卡片作者名 (`15px~16px`)、区域小标题、Markdown H1-H2 |
| **T3** | **Primary Body** | 15px (`0.9375rem`) | `text-[15px]` / `.prose-moment` | **Moments 动态正文**、动态发布输入框。针对中文字符密集度优化的最佳阅读字号 |
| **T4** | **Secondary Body** | 13px ~ 14px (`0.8125rem` ~ `0.875rem`) | `text-[13px] sm:text-sm` | 评论内容、作者签名/Bio、作品卡片 Slogan 简介、设置项说明 |
| **T5** | **Meta / Auxiliary** | 12px (`0.75rem`) | `text-xs` | 相对时间戳、互动按钮文字、表单辅提示语、点赞统计 |
| **T6** | **Micro Badges** | 11px (`0.6875rem`) | `text-[11px]` | 状态角标（置顶、审核中、版本号、开源标签）、快捷工具提示（Tooltip）、字数计数器 |

> [!IMPORTANT]
> **绝对禁止使用低于 11px 的字号**：
> 全面废除 `text-[9px]` 与 `text-[10px]`。在移动端及高分屏上，小于 11px 的中文笔画粘连、严重损害可读性与无障碍体验。所有微型标签与计数统一以 `11px` 为硬性下限。

---

## 3. Moments 动态图文富文本格式化 (`prose-moment`)

原先依赖 Tailwind 默认 `@tailwindcss/typography` 的 `prose prose-sm` 导致了如下问题：
1. 段落间距过大（默认 `margin: 1.25em 0`），几行简短随笔被割裂得非常松散。
2. 行内代码块缺少横向边距，与中文字符粘连在一起。
3. 标题字号过大，喧宾夺主。

为此，我们在 `src/app/globals.css` 中封装了专属于朋友圈/社交动态流的 `.prose-moment` 样式类：

### 3.1 核心特性
- **基准字号与行高**：`15px` 基准字号，`1.625` 行距，`text-wrap: pretty;` 改善中文排版断行。
- **微距段落垂直韵律**：段落外边距压缩至 `0.35em 0`，让短篇幅动态紧凑自然，长篇图文错落有致。
- **行内代码防粘连机制**：
  ```css
  .prose-moment :not(pre) > code {
    font-size: 0.8125rem; /* 13px */
    padding: 0.15em 0.35em;
    margin: 0 0.2em; /* 关键：隔离中英文字符粘连 */
    border-radius: 0.25rem;
    background-color: var(--muted);
    border: 1px solid var(--border);
  }
  ```
- **轻量紧凑的标题层级**：
  - H1: `1.125rem` (18px)，加粗收紧
  - H2: `1.0625rem` (17px)
  - H3: `1rem` (16px)
  - H4: `0.9375rem` (15px)
- **优雅的引用块与列表**：引用块带有左侧品牌色竖条（`3px solid var(--primary)`），底色轻微柔化，内边距紧凑；列表缩进由默认的 `1.75em` 优化为 `1.25em`。
- **长代码块**：深色背景搭配半透明微边框，代码语法平滑横向滚动，并在移动端保留适当圆角。

---

## 4. 维护与更新规范

1. 新增 UI 组件或调整页面文本时，请对照上述六级梯度直接选用规范类名（如 `text-[15px]`、`text-sm`、`text-xs`、`text-[11px]`）。
2. 在渲染动态正文、富文本内容时，请统一包裹 `<div className="prose-moment">`。
