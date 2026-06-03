# TravelBoast — 旅行路线动画生成器

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js" alt="Vue 3">
  <img src="https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite" alt="Vite">
  <img src="https://img.shields.io/badge/MapLibre--GL-5.24-brightgreen?logo=maplibre" alt="MapLibre GL">
  <img src="https://img.shields.io/badge/Three.js-0.160-000000?logo=three.js" alt="Three.js">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
</p>

<p align="center">
  <a href="https://duguboss.github.io/MytravelBoast/">在线演示</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#效果演示">效果演示</a> ·
  <a href="#功能特性">功能特性</a> ·
  <a href="#技术架构">技术架构</a>
</p>

---

## 简介

**TravelBoast** 是一款基于 Web 的旅行路线动画生成工具，灵感来源于同名移动应用。用户可以在地图上规划起点、途经点与终点，选择交通工具，生成带有电影级运镜动画的旅行路线视频。

**TravelBoast** is a web-based travel route animation generator inspired by the mobile app of the same name. Users can plan start points, waypoints, and destinations on a map, select vehicles, and generate cinematic travel route videos with camera movements.

---

## 效果演示

<p align="center">
  <video src="https://raw.githubusercontent.com/duguBoss/MytravelBoast/main/travelboast-vue/assets/demo.mp4" width="600" style="border-radius: 12px; max-width: 100%;" controls>
    您的浏览器不支持 HTML5 video 标签，请直接播放/下载本地 `travelboast-vue/assets/demo.mp4` 视频文件。
  </video>
</p>

> [!TIP]
> **效果视频录制说明**：
> 录像效果可以通过系统自带的“导出视频”功能直接无损捕获并转码生成。您可以将录制生成的 MP4 文件重命名为 `demo.mp4` 并放置在 `travelboast-vue/assets/` 目录下，即可在上方的视频播放器中进行直接预览。

---

## 功能特性

| 特性 | 说明 |
|------|------|
| 路线规划 | 支持起点、多个途经点、终点的自由规划，支持途经点实时动态拖拽与重新排序 |
| 交通工具 | 飞机、汽车、火车、轮船、自行车、飞碟等 30+ 种交通工具，并支持多路段分别使用不同载具 |
| 3D 模型 | 基于 Three.js 的真实 3D 模型叠加，支持 **物理动画模拟**（转弯向心倾斜、车辆前俯后仰、车轮滚动、直升机与飞机螺旋桨飞速旋转等） |
| 3D 地球投影 | 基于 MapLibre GL 的原生 WebGL 3D 渲染，支持 **3D 地球视角**、星空背景、大气雾效果以及三维楼块显示 |
| 电影运镜 | 5 阶段自动运镜：起点特写 → 切入跟随 → 巡航 → 接近终点 → 终点特写，平滑的贝塞尔缓冲过渡 |
| 视频导出 | 支持 WebM / MP4 (H.264) 格式，可调整时长、画质、车辆尺寸、倾斜角度及镜头缩放比 |
| 多种比例 | 9:16 竖屏（适合抖音/小红书/视频号）、16:9 横屏（适合B站/YouTube）、1:1 方形 |
| 自定义水印 | 导出视频可一键添加/移除个人专属水印 |
| 响应式设计 | 极简毛玻璃微光动效 UI，完美适配桌面端与移动端 |

---

## 技术架构

```
TravelBoast
├── Vue 3 + Vite              # 前端响应式框架与极速构建工具
├── MapLibre GL               # 地图渲染与 3D 地球引擎 (原生支持三维投影、瓦片过渡及环境光晕)
├── Three.js                  # 3D 物理交互层 (通过 WebGL 直接向地图容器追加高性能 3D 模型)
├── Canvas captureStream API  # 视频流捕获 (无损捕获 MapLibre WebGL 地图帧，不依赖 html2canvas，效率提升 500%)
├── FFmpeg.wasm               # 浏览器端视频转码 (本地运行 FFmpeg，将 WebM 视频编码转换为高兼容 H.264 MP4 格式)
└── MediaRecorder API         # 视频媒体流录制
```

---

## 项目结构

```
travelboast-vue/
├── public/                   # 静态资源
│   ├── models/               # 3D 载具模型文件 (.glb)
│   ├── favicon.svg           # 网站图标
│   └── screenshot.png        # 网页预览截图
├── src/
│   ├── components/           # Vue 核心组件
│   │   ├── PreviewModal.vue       # 路线预览与视频导出控制抽屉
│   │   ├── RoutePanel.vue         # 路线节点列表及拖拽排序面板
│   │   ├── VehiclePanel.vue       # 交通工具选择与分类过滤网格
│   │   ├── SettingsDrawer.vue     # 全局属性设置抽屉 (3D地球、显示里程、倾角调节等)
│   │   ├── TopBar.vue             # 顶部操作按钮栏
│   │   ├── Toast.vue              # 毛玻璃风格轻提示
│   │   └── ThreeVehicleOverlay.vue # Three.js WebGL 3D 车辆渲染挂载层
│   ├── constants/            # 核心静态常量
│   │   ├── map.js                 # 多数据源地图瓦片及国旗配置
│   │   └── vehicles.js            # 交通工具基础配置 (ID, 名字, 图标, 类别)
│   ├── utils/                # 业务逻辑工具集
│   │   ├── pathGenerator.js       # 基于 Vincenty 公式的大圆地球航线生成算法
│   │   ├── videoRecorder.js       # 视频帧率捕获、WebM录制及FFmpeg转码流水线
│   │   └── helpers.js             # 地理方位角 (Bearing) 及大地线距离计算等辅助工具
│   ├── App.vue               # 主应用入口及三维视图容器挂载
│   └── main.js               # 项目启动文件
├── index.html
├── vite.config.js
└── package.json
```

---

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装

```bash
# 克隆仓库
git clone https://github.com/duguBoss/MytravelBoast.git
cd MytravelBoast/travelboast-vue

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 构建

```bash
npm run build
```

构建产物将输出至 `dist/` 目录。

---

## 核心功能实现细节

### 1. 3D 车辆物理反馈动画
在 [ThreeVehicleOverlay.vue](file:///e:/workspace/TravelBoast/travelboast-vue/src/components/ThreeVehicleOverlay.vue) 中实现了逼真的物理交互状态：
* **向心倾斜 (Roll)**：在路线转弯时，车辆会向转弯方向倾斜（银行角，最大 23°），直升机或飞机飞越弧线时更显动感。
* **俯仰起伏 (Pitch)**：通过方位角变化量计算加减速的俯仰角，提供真实的惯性悬挂反馈。
* **旋转滚动**：飞机与直升机的螺旋桨在运动状态下维持 60fps 的快速旋转；地面车辆（如汽车、卡车）的车轮会根据运动速度进行同步滚动计算。

### 2. 电影级五阶段相机控制
采用 5 阶段贝塞尔缓动算法，实现平滑的相机运动：

| 阶段 | 时间占比 | 相机行为 |
|------|----------|----------|
| 起点特写 | 0% - 8% | 视角快速倾斜放大至起点（zoom 13） |
| 切入跟随 | 8% - 20% | 平滑过渡，相机逐步过渡到车辆后上方 |
| 跟随巡航 | 20% - 80% | 动态锁定居中跟随交通工具，自适应调整旋转角（bearing） |
| 接近终点 | 80% - 94% | 镜头平滑拉远展示全程大圆航线视图 |
| 终点特写 | 94% - 100% | 缓动放大至终点位置（zoom 12.5） |

### 3. 大圆航线渲染 (Vincenty's Formula)
在 [pathGenerator.js](file:///e:/workspace/TravelBoast/travelboast-vue/src/utils/pathGenerator.js) 中使用 **Vincenty 大地测量公式** 计算两点之间的大圆路径，确保长距离路径（例如北京到巴黎）完美贴合 3D 地球的曲率，而非生硬的直线。

### 4. 浏览器端视频零开销录制与转码
视频导出流程已完全舍弃 html2canvas 的 DOM 截图方案，极大地提升了录制速率：
1. **直接提取 WebGL 缓冲区**：在 [videoRecorder.js](file:///e:/workspace/TravelBoast/travelboast-vue/src/utils/videoRecorder.js) 中通过 `canvas.captureStream(30)` 直接获取 MapLibre GL 渲染的原始像素帧流。
2. **MediaRecorder API 实时采集**：无需生成图片，直接把流保存为 WebM 文件块。
3. **FFmpeg.wasm 客户端转码**：在浏览器沙箱内调用 WebAssembly 版本的 FFmpeg，一键将 WebM 视频无损转码为主流平台完全支持的 H.264 AAC MP4 文件。

---

## 浏览器兼容性

| 浏览器 | 支持情况 |
|--------|----------|
| Chrome / Edge | 完全支持 (包含 WebAssembly 加速) |
| Firefox | 完全支持 |
| Safari | 完全支持 (视频导出和保存基于标准 File System Access API) |
| 移动端 Chrome | 完全支持 (视频直接导出下载) |
| 移动端 Safari | 支持在线预览，视频导出因 iOS 文件安全机制可能降级为 Blob 下载 |

---

## 开源协议

[MIT](LICENSE)

---

## 致谢

- 地图引擎：[MapLibre GL](https://maplibre.org/)
- 3D 渲染：[Three.js](https://threejs.org/)
- 地图样式数据：[Amap Map Tiles](https://amap.com/) & [CartoDB](https://carto.com/)
- 视频编解码：[FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)

---

<p align="center">
  Made with ❤️ for travelers worldwide.
</p>
