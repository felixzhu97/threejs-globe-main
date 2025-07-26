# threejs-globe

A 3D interactive globe visualization built with Three.js featuring flying lines between major cities and dynamic lighting effects.

This is inspired by Github & Stripes webgl globes.

## 部署到 Vercel

这个项目已经配置为可以直接部署到 Vercel：

### 方法 1: 通过 Vercel CLI
```bash
npm install -g vercel
vercel
```

### 方法 2: 通过 GitHub 集成
1. 将代码推送到 GitHub 仓库
2. 在 Vercel 控制台中连接你的 GitHub 仓库
3. Vercel 会自动检测配置并部署

### 方法 3: 拖拽部署
1. 将整个项目文件夹拖拽到 [Vercel 部署页面](https://vercel.com/new)
2. Vercel 会自动处理部署

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## 项目结构

```
├── public/           # 静态文件目录
│   ├── img/         # 图片资源
│   ├── index.html   # 主页面
│   ├── index.css    # 样式文件
│   └── index.js     # 主要 JavaScript 代码
├── package.json     # 项目配置
└── vercel.json      # Vercel 部署配置
```

## 特性

- 3D 地球可视化
- 城市间飞行路线动画
- 交互式控制（鼠标拖拽、缩放）
- 响应式设计
- 动态光照效果

## 技术实现

The dots clustered together resembling continents are achieved by reading an image of the world.
Getting the image data for each pixel and iterating over each pixel.
If the pixels r,g,b values exceed 100, display dot.
The position of the dot is worked out by determining the lat and long position of the pixel.

Each dot within the canvas independently changes colour to give off a twinkling effect.
This is achieved by shaders. 

If the globe is clicked and dragged, the globe rotates in the direction of the drag.
Along with this functionality, each dot independently extrudes off the globe creating a scattered effect.
This is achieved by shaders.

![alt text](https://github.com/jessehhydee/threejs-globe/blob/main/public/img/app_screen_shot.png?raw=true)

