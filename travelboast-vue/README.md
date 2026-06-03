# TravelBoast — 旅行路线动画生成器

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js" alt="Vue 3">
  <img src="https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite" alt="Vite">
  <img src="https://img.shields.io/badge/MapLibre-3.0-0081FF?logo=maplibre" alt="MapLibre GL">
  <img src="https://img.shields.io/badge/Three.js-0.160-000000?logo=three.js" alt="Three.js">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
</p>

<p align="center">
  <a href="https://duguboss.github.io/MytravelBoast/">在线演示</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#功能特性">功能特性</a> ·
  <a href="#技术架构">技术架构</a>
</p>

---

## 简介

**TravelBoast** 是一款基于 Web 的旅行路线动画生成工具，灵感来源于同名移动应用。用户可以在地图上规划起点、途经点与终点，选择交通工具，生成带有电影级运镜动画的旅行路线视频。

**TravelBoast** is a web-based travel route animation generator inspired by the mobile app of the same name. Users can plan start points, waypoints, and destinations on a map, select vehicles, and generate cinematic travel route videos with camera movements.

---

## 功能特性

| 特性 | 说明 |
|------|------|
| 路线规划 | 支持起点、多个途经点、终点的自由规划 |
| 交通工具 | 飞机、汽车、火车、轮船、自行车等 20+ 种交通工具 |
| 3D 模型 | 基于 Three.js 的真实 3D 车辆模型叠加 |
| 电影运镜 | 5 阶段自动运镜：起点特写 → 切入跟随 → 巡航 → 接近终点 → 终点特写 |
| 视频导出 | 支持 MP4 / WebM 格式，可调整时长、画质、车辆尺寸 |
| 多种比例 | 9:16 竖屏、16:9 横屏、1:1 方形 |
| 自定义水印 | 导出视频可添加个人水印 |
| 响应式设计 | 完美适配桌面端与移动端 |
| 免费地图 | 基于 OpenStreetMap，商用无版权风险 |

| Feature | Description |
|---------|-------------|
| Route Planning | Free planning of start points, multiple waypoints, and destinations |
| Vehicles | 20+ vehicles including planes, cars, trains, ships, bicycles |
| 3D Models | Realistic 3D vehicle overlays powered by Three.js |
| Cinematic Camera | 5-stage auto camera: start close-up → cut-in follow → cruise → approach → end close-up |
| Video Export | MP4 / WebM export with adjustable duration, quality, and vehicle size |
| Aspect Ratios | 9:16 portrait, 16:9 landscape, 1:1 square |
| Custom Watermark | Add personal watermark to exported videos |
| Responsive | Fully optimized for desktop and mobile |
| Free Maps | OpenStreetMap-based, no commercial copyright concerns |

---

## 在线演示

访问 [https://duguboss.github.io/MytravelBoast/](https://duguboss.github.io/MytravelBoast/) 即可体验。

Visit [https://duguboss.github.io/MytravelBoast/](https://duguboss.github.io/MytravelBoast/) to try it out.

---

## 效果展示 / Demo Video

<div align="center">
  <video src="./public/assets/demo.mp4" width="80%" controls autoplay loop muted></video>
</div>

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

构建产物将输出至 `dist3/` 目录。

---

## 技术架构

```
TravelBoast
├── Vue 3 + Vite          # 前端框架与构建工具
├── MapLibre GL JS        # 地图 3D WebGL 渲染
├── Three.js              # 3D 车辆模型 (与地图混合渲染)
├── Canvas API            # 原生 Canvas 流视频捕获 (Composite Canvas)
├── FFmpeg.wasm           # 视频编码转码
└── MediaRecorder API     # 视频录制
```

---

## 项目结构

```
travelboast-vue/
├── public/               # 静态资源
│   └── models/           # 3D 模型文件
├── src/
│   ├── components/       # Vue 组件
│   │   ├── PreviewModal.vue    # 预览/导出模态框
│   │   ├── RoutePanel.vue      # 路线编辑面板
│   │   ├── VehiclePanel.vue    # 交通工具选择
│   │   ├── SettingsDrawer.vue  # 设置抽屉
│   │   ├── TopBar.vue          # 顶部导航栏
│   │   ├── Toast.vue           # 消息提示
│   │   └── ThreeVehicleOverlay.vue  # 3D 车辆叠加层
│   ├── constants/        # 常量配置
│   │   ├── map.js        # 地图瓦片源
│   │   └── vehicles.js   # 交通工具数据
│   ├── utils/            # 工具函数
│   │   ├── pathGenerator.js    # 大地测量路线生成
│   │   ├── videoRecorder.js    # 视频录制与导出
│   │   ├── routePlanner.js     # 路线规划
│   │   ├── canvasAnimation.js  # Canvas 动画
│   │   └── helpers.js          # 通用辅助函数
│   ├── App.vue           # 根组件
│   └── main.js           # 入口文件
├── index.html
├── vite.config.js
└── package.json
```

---

## 核心功能实现

### 电影级运镜

采用 5 阶段贝塞尔缓动算法，实现平滑的相机运动：

| 阶段 | 时间占比 | 相机行为 |
|------|----------|----------|
| 起点特写 | 0% - 8% | 放大至起点， zoom 13 |
| 切入跟随 | 8% - 20% | 平滑过渡至跟随模式 |
| 跟随巡航 | 20% - 80% | 居中跟随交通工具 |
| 接近终点 | 80% - 94% | 拉远展示全局 |
| 终点特写 | 94% - 100% | 放大至终点，zoom 12.5 |

### 路线绘制

使用 Vincenty 大地测量公式计算大圆航线，替代简单的线性插值，确保长距离路线符合地球曲率。

### 视频录制流程

1. **帧捕获**：通过原生 Canvas 双缓冲混合捕获技术 (Composite Canvas)，将 MapLibre 的 WebGL 地图图层与 Three.js 的 3D 模型图层实时合成渲染
2. **动画驱动**：`requestAnimationFrame` 驱动电影级运镜与 3D 车辆动态响应（引擎微震、转弯倾斜等物理效果）
3. **编码合成**：利用 `canvas.captureStream()` 配合 `MediaRecorder API` 直接将混合画面编码为 `WebM` 视频流，录制性能极高不掉帧
4. **格式转换**：内置集成 `FFmpeg.wasm` 在浏览器端完成向主流 `MP4 (H.264)` 格式的无损转码
5. **文件保存**：通过现代浏览器的 `File System Access API` 快速安全保存至本地

---

## 浏览器兼容性

| 浏览器 | 支持情况 |
|--------|----------|
| Chrome / Edge | 完全支持 |
| Firefox | 完全支持 |
| Safari | 部分支持（视频导出需用户手势触发） |
| 移动端 Chrome | 完全支持 |
| 移动端 Safari | 部分支持 |

---

## 开源协议

[MIT](LICENSE)

---

## 致谢

- 地图数据：[OpenStreetMap](https://www.openstreetmap.org/)
- 3D 渲染：[Three.js](https://threejs.org/)
- 地图库：[Leaflet](https://leafletjs.com/)
- 视频处理：[FFmpeg](https://ffmpeg.org/)

---

<p align="center">
  Made with ❤️ for travelers worldwide.
</p>
