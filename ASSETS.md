# 自制资源与参考说明

## 本次三维重建依据

2026 年 9 月 10 日的角色重建以用户在本次任务提供的正面、侧面、背面设计图为准，**不再以历史平台截图推断服装与头饰**。沿用项目 ID：`lulu` 为橙色短裤款，`lumei` 为粉色围兜连体衣款。

主交付为 `assets/models/lulu.glb` 与 `assets/models/lumei.glb`；它们包含真实三维曲面、PBR 材质、头身和四肢关节及 16 个动画片段。`assets/models/preview.html` 可离线切换三视角、转台与动作。导入及播放示例、尺寸、可编辑来源和交付边界见 `assets/models/README.md`。

## 旧版二维形象的公开参考

研究日期：2026 年 9 月 10 日。参考仅用于确认形象，不作为游戏需要在线加载的资源。

| 来源 | 用途 | 可信边界 |
| --- | --- | --- |
| [TapTap：水豚噜噜联名宣传](https://www.taptap.cn/moment/739448723062392995) | 噜噜的暖黄色体色、橙色口鼻、头顶橘子、白牙、小圆耳与棕色短裤 | 官方游戏联名宣传内容参考；不代表对本游戏的授权 |
| [哔哩哔哩：噜妹现在有点小肥肥，怎么办呀](https://www.bilibili.com/video/BV1MGbZ6HEcG/) | 噜妹的白色荷叶边帽、橘子芽头饰、粉色服装与温柔表情 | 用户发布的视频，未核验为角色官方设定 |
| [哔哩哔哩：在噜噜心中，噜妹是最重要的](https://www.bilibili.com/video/BV1RrbW6YE6y/) | 交叉观察噜妹的荷叶边帽、粉色配饰和角色比例 | 用户发布的视频，形象存在不同演绎 |

本包不包含参考平台的原视频、截帧、宣传图、字体或音乐文件。未宣称「百分之百官方复刻」或已取得角色商业授权。

## 本项目制作的美术

- `scripts/export-models.mjs`：可编辑三维建模来源；生成一体化口鼻头型、软帽与荷叶边、服饰和小装饰，导出标准 GLB。
- `src/characters.mjs` 与 `src/character-rig.mjs`：模型导入、实时渲染及共享关节映射。
- `src/art.js`：统一渲染入口、动画姿势与原二维回退。场景中的云朵、太阳、橘子树、木栅栏、小屋、草地、平台和花朵仍使用原绘制逻辑。
- `assets/models/lulu.svg`、`assets/models/lumei.svg`：旧版二维兼容模型，**不是新版 GLB 的替代三视图**。
- `assets/models/lulu-views.png`、`assets/models/lumei-views.png`：由实际 GLB 渲染的三视图。
- `assets/portraits/`：由 GLB 渲染的透明背景 PNG 角色立绘。
- `assets/sprites/`：两套 3D 渲染动作图集，每格 416×352，JSON 记录模型路径、逐帧区域、脚底锚点、帧率和是否循环。每帧自动检查四边留白，避免旋转或倒地动作被裁切。透明空白区域是未使用的图集格，不是缺失动作。
- `assets/backgrounds/orange-cloud-garden.png`：2560×1240 花园背景。
- `assets/effects/effects.png`：星星、爱心、泡泡、护盾、尘雾、橘子、闪光和小花。
- UI 图标为页面内嵌 SVG；不使用外部图标库、网络图片或在线字体。

## 完整动作列表

| 英文状态 | 中文 | 类型 |
| --- | --- | --- |
| idle | 站立 / 待机 / 眨眼 | 循环 |
| walk | 行走 | 循环 |
| run | 奔跑 | 循环 |
| jump | 一段跳 | 单次 |
| double-jump | 二段跳旋转 | 单次 |
| crouch | 下蹲 | 单次后保持 |
| rise | 起身 | 单次 |
| backstep | 后退 | 循环 |
| attack | 普攻 | 单次 |
| skill | 角色专属技能 | 单次 |
| guard | 防御 | 按住保持 |
| hit | 受击 | 单次 |
| stun | 硬直表情 | 循环；实时由 hit 状态覆盖硬直期 |
| defeat | 倒地 / 失败 | 单次后保持 |
| victory | 胜利欢呼 | 循环 |
| draw | 平局摊手 | 循环 |

引擎按真实动作阶段计算命中，动画表现不会替代命中判定。角色死亡时先播放倒地，结算弹窗稍后出现。

## 原创音频

`src/audio.js` 生成 16 秒循环花园音乐，以及普攻、受击、格挡、跳跃、二段跳、落地、技能、泡泡、倒计时、开打、胜利和按钮音效。

`assets/audio/` 导出单声道、22050 Hz、16-bit PCM WAV。浏览器使用同一份乐谱和合成器生成 AudioBuffer，因此复制单个成品 HTML 时不会丢失音效。

## 生成方法

```sh
node scripts/build.mjs
node scripts/export-assets.mjs
```

安装开发依赖后，第一步生成两份 GLB、单文件成品、模型预览、二维回退 SVG、动画定义和 WAV；第二步使用本地离线页面中的 3D 渲染器导出 PNG 与图集坐标，WebGL 不可用时明确报错，不会静默输出旧版立绘。没有隐藏的在线生成服务、运行时 API 密钥或需要补齐的用户素材。
