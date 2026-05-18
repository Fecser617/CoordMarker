# CoordMarker

CoordMarker 是一个基于 Flask 的图片辅助标注工具，用于在图片上生成坐标标记、进行透视矫正裁剪，并导出可供后续图像生成、图像分析或提示词工程使用的坐标数据。

## 功能

### 图片框选标记

访问路径：`/coord-mark/`

支持在图片上创建并管理多种标记：

- 方形框选
- 圆形框选
- 箭头标记
- 文字框选

主要交互：

- 左键拖动空白区域：创建当前规则对应的标记
- 左键点击已有标记：选中标记
- Ctrl + 左键：多选或取消选中
- 右键拖动选中项：移动选中的标记
- Ctrl + 右键拖动：复制选中项并拖动副本
- 拖动边、顶点或箭头端点：调整标记形状
- Delete 或“删除选中”：删除当前选中项
- “清空全部”：删除所有标记
- “保存数据”：下载 `图象坐标.txt`

导出的坐标基于原始图片坐标系：左上角为原点，x 轴向右，y 轴向下。

### 透视矫正裁剪

该功能参照仓库 https://github.com/ad-si/Perspectra

访问路径：`/perspective-clip/`

支持上传图片后自动检测文档角点，并在原图上显示可拖动的四点框。用户可以手动微调角点，然后生成透视矫正后的裁剪结果。

主要能力：

- 自动检测文档四个角点
- 在原图上拖动角点进行手动修正
- 可选输出宽度和高度
- 预览透视矫正裁剪后的结果

后端核心逻辑位于 [perspective_clip.py](src/utils/perspective_clip.py)。

## 快速开始

### 1. 创建并激活虚拟环境

Windows PowerShell：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 2. 安装依赖

```powershell
pip install -r requirements.txt
```

### 3. 启动项目

```powershell
python main.py
```

默认访问地址：

```text
http://127.0.0.1:5000/
```

## 目录结构

```text
CoordMarker/
├─ main.py
├─ requirements.txt
├─ README.md
├─ standard.md
└─ src/
   ├─ utils/
   │  └─ perspective_clip.py
   ├─ web/
   │  ├─ __init__.py
   │  ├─ routes/
   │  │  ├─ menu.py
   │  │  ├─ route_coord_mark.py
   │  │  └─ route_perspective_clip.py
   │  ├─ templates/
   │  │  ├─ base.html
   │  │  ├─ index.html
   │  │  ├─ coord_mark.html
   │  │  └─ perspective_clip.html
   │  └─ static/
   │     ├─ css/
   │     │  ├─ coord_mark.css
   │     │  └─ perspective_clip.css
   │     └─ js/
   │        ├─ coord_mark.js
   │        └─ perspective_clip.js
   └─ test/
      └─ 图象坐标.txt
```

## 开发约定

前端页面遵循 [standard.md](standard.md) 中的约定：

- URL 地址、初始配置等动态部分放在 HTML 的 `<script>` 中定义
- 其余交互逻辑抽到外部 JS
- 页面样式抽到对应 CSS 文件

例如，图片框选标记页面由以下文件组成：

- [coord_mark.html](src/web/templates/coord_mark.html)
- [coord_mark.css](src/web/static/css/coord_mark.css)
- [coord_mark.js](src/web/static/js/coord_mark.js)

## 依赖

当前依赖见 [requirements.txt](requirements.txt)：

- Flask
- imageio
- numpy
- scikit-image

## 备注

`scikit-image` 的部分接口在新版本中可能会出现 `FutureWarning`，目前不影响透视矫正裁剪功能运行。
