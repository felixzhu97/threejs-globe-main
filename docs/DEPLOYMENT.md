# 部署指南

## Vercel 部署步骤

### 1. 准备工作
确保你的项目结构如下：
```
├── public/           # 所有静态文件
│   ├── img/         # 图片资源
│   ├── index.html   # 主页面
│   ├── index.css    # 样式
│   └── index.js     # JavaScript 代码
├── package.json     # 项目配置
└── vercel.json      # Vercel 配置
```

### 2. 部署方法

#### 方法一：Vercel CLI（推荐）
```bash
# 安装 Vercel CLI
npm install -g vercel

# 在项目根目录运行
vercel

# 按照提示完成配置
```

#### 方法二：GitHub 集成
1. 将代码推送到 GitHub
2. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
3. 点击 "New Project"
4. 选择你的 GitHub 仓库
5. Vercel 会自动检测配置并部署

#### 方法三：拖拽部署
1. 访问 [Vercel 部署页面](https://vercel.com/new)
2. 将项目文件夹拖拽到页面上
3. 等待自动部署完成

### 3. 验证部署
部署完成后，你会得到一个类似 `https://your-project.vercel.app` 的 URL。
访问这个 URL 确认 3D 地球正常显示和交互。

### 4. 自定义域名（可选）
在 Vercel Dashboard 中可以配置自定义域名。

## 故障排除

### 常见问题
1. **资源加载失败**：确保所有文件都在 `public` 目录中
2. **Three.js 加载错误**：检查网络连接，CDN 资源需要正常访问
3. **图片不显示**：确认图片路径正确，相对于 `public` 目录

### 本地测试
```bash
# 安装依赖
npm install

# 启动本地服务器
npm run dev

# 访问 http://localhost:3000
```