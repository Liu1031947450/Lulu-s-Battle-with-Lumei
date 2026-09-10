# 实际验收记录

验收日期：2026 年 9 月 10 日。环境：macOS / Apple Silicon，Node.js 22.22.0，Playwright 1.63.0。

## 结果概览

| 项目 | 结果 |
| --- | --- |
| Node 核心 / 输入 / 实际 GLB 测试 | **31 / 31 通过** |
| 固定种子人机自动对战 | **100 / 100 正常结束，全部 KO** |
| 模拟统计 | 1604 次有效命中、888 次成功格挡，无异常数值、越界或超时卡死 |
| Chrome 153.0.8010.37 | **20 / 20 浏览器流程通过，实际 WebGL 2 渲染** |
| Firefox 155.0（Playwright） | **20 / 20 浏览器流程通过，实际 WebGL 2 渲染** |
| WebKit 26.6（Playwright） | **20 / 20 浏览器流程通过，实际 WebGL 2 渲染** |
| 两份 GLB 标准验证 | Khronos glTF Validator：每份均 **0 errors / 0 warnings / 0 infos** |
| 独立单文件验证 | **通过**：仅复制 HTML 到中文 / 空格路径的空目录，仍能离线加载 3D、开始对战和键盘移动 |
| 三维预览 | **通过**：正 / 侧 / 背 / 转台切换，行走逐帧画面变化，暂停后像素保持不变 |
| WebGL 不可用 | 三内核均通过强制关闭 WebGL 后的二维回退、开局与移动检查 |
| 网络与运行时错误 | 三内核流程中均无页面错误、无 HTTP/HTTPS 请求 |
| 图集边界 | 两个角色的全部 240 帧均自动检查边缘透明，不裁切旋转与倒地动作 |

被验收成品 `index.html` 的 SHA-256：

```text
2aedeb46b169e58184a0688327c1f3e44334c947e577a807b38e9b5e938ae558
```

## 覆盖内容

- 模式选择、操作指南、音频解锁与静音、三秒倒计时、对战 HUD。
- 双方同时移动、双击奔跑、后退、二段跳、长按重复事件过滤、落地重置、下蹲和起身。
- P1 J/K/L、P2 小键盘 1/2/3、主键区 1/2/3 的实际浏览器按键输入；Num Lock 不改变物理 code 的逻辑另有原生测试。
- 普攻前摇、有效命中距离、高度判断、同次攻击只命中一次、双方同帧交换伤害。
- 正面防御减伤、背后不可格挡、空中不可防御、击退、硬直和恢复保护。
- 噜噜突进、噜妹远程泡泡、技能冷却、投射物命中及过期销毁。
- 双人对局通过按键打至 KO；人机对局双方实际命中并正常结算；完整推进 90 秒判平局。
- 暂停冻结时间、冷却与投射物；失焦事件自动暂停；恢复时没有卡住的方向键。
- 结算前打开帮助页不叠加胜负弹窗；再次挑战、R 重开、连续重开与返回主页清理状态。
- 五种窗口尺寸：1440×1000、1280×800、1280×720、768×700、390×844；无横向溢出。
- 减少动态效果偏好、弹窗 Tab / Shift+Tab 顺序、焦点循环与 Escape 关闭。

浏览器测试通过 Playwright 键盘事件操作页面，并用可控时钟逐帧运行游戏；**没有给角色直接改血量、跳过战斗或伪造胜负结果**。`LuluGame.snapshot()` 仅用于读取状态。

## 自制资源检查

- 两个独立 GLB：噜噜 138,768 个三角面，噜妹 260,056 个三角面；每个模型包含完整 16 个关节动画片段，无外部贴图或 `.bin` 依赖。
- 原生测试实际重新载入 GLB，检查关键造型节点、脚底锚点、真实前后体积、材质、有限坐标 / 法线、动画采样与动作关节变化；额外检查换边后使用另一侧出拳关节且不遗留伸长，不通过镜像颠倒胸前徽章。
- 两张 1800×720 三视图与离线预览，均从实际三维网格生成；人工逐视角检查头型、帽壳 / 帽边、圆领、蝴蝶结、鸭子徽章、裤装与圆尾巴。
- 原分层 SVG 保留为 WebGL 不可用时的二维兼容资源，不作为新版三维模型交付。
- 两套 4992×5632 PNG 动作图集；每套 16 种动作、120 帧，每帧 416×352，含逐帧 JSON 坐标与脚底锚点。
- 两张透明立绘、一张 2560×1240 花园背景、一套 8 类特效图集。
- 13 个 WAV 文件，包含 16 秒原创循环旋律；验证 WAV 头、采样率和数据长度，合成样本无 NaN 与超量程。
- 检查首页、命中、格挡、胜负弹窗、小窗口画面及角色立绘截图。当前机器 Chrome 无头模式下，首页 90 个连续帧的短采样约 60 FPS；这不是其他设备或长时间性能保证。

## 证据与复验

- `artifacts/unit-tests.tap`：原生测试原始输出。
- `artifacts/chromium-report.json`、`artifacts/firefox-report.json`、`artifacts/webkit-report.json`：逐项结果、浏览器版本、成品 SHA-256 与截图清单。
- `artifacts/assets-report.json`、`artifacts/standalone-report.json`：资源与单文件验证结果。
- `artifacts/lulu-gltf-validation.json`、`artifacts/lumei-gltf-validation.json`：Khronos GLB 校验结果及对应文件 SHA-256。
- `artifacts/models-front.png`、`artifacts/models-side.png`、`artifacts/models-back.png`、`artifacts/standalone-3d.png`：预览交互与独立离线文件截图。
- 项目 ZIP 中的 `verification/` 保存以上报告、原生测试输出和代表性截图；`SHA256SUMS.txt` 列出包内文件校验值。
- 打包脚本拒绝失败报告或旧版成品的浏览器报告，并运行 `unzip -t` 检查压缩包完整性。

```sh
npm test
node tests/browser.mjs
TEST_BROWSER=firefox node tests/browser.mjs
TEST_BROWSER=webkit node tests/browser.mjs
node scripts/export-assets.mjs
node scripts/package.mjs
```

## 验证边界

- 本次交付更新根目录游戏及 `assets/`，未重打包此前的 `release/` ZIP；旧压缩包不能代表此次三维更新。
- 三维网格按提供的图片观察重建，不宣称逐像素 / 扫描级一致；采用分部件关节动画，未交付 Humanoid 蒙皮重定向、布料物理或 FBX。具体使用边界见 `assets/models/README.md`。
- WebKit 的离线模拟在本机也会阻止导航到 `file://`。已对照验证：同一文件在未开启模拟时可正常加载。因此 WebKit 测试在导航前阻断全部 HTTP/HTTPS，请求本地文件后立即开启离线模拟，再完成全部对局；游戏没有增加服务器依赖或联网回退。
- WebKit 测试不等于对所有正式 Safari 版本的实机验证；未在 Windows、Android、iOS 或游戏手柄上做实机验收。本版明确面向桌面键盘。
- 失焦保护使用标准 `blur` 事件验证，未逐一验证所有操作系统窗口切换方式；真实键盘的多键冲突也受硬件限制。
- 音频已验证生成和浏览器音频上下文运行，未进行专业设备试听；未进行数小时的持续运行压力测试。
- 不声称绝对零 BUG、官方形象完全一致或官方授权；资源参考与重绘边界详见 `ASSETS.md`。
