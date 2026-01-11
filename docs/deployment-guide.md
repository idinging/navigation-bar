# 部署指南

本指南将帮你快速部署个人导航网站到Cloudflare Worker。

## 🚀 快速开始

### 1. 准备工作

确保你有以下账号和工具：

- [Cloudflare账号](https://dash.cloudflare.com/sign-up)
- [Node.js](https://nodejs.org/) (版本18+)
- Git

### 2. 克隆并进入项目

```bash
git clone <你的仓库地址>
cd navigation
```

### 3. 安装依赖

```bash
npm install
```

### 4. 登录Cloudflare

```bash
npx wrangler login
```

这会打开浏览器，让你登录Cloudflare账号并授权。

### 5. 部署到Cloudflare Worker

```bash
npm run deploy
```

首次部署时，Wrangler会自动为你创建Worker。

## 🔧 本地开发

### 启动开发服务器

```bash
npm run dev
```

这会启动本地开发服务器，通常在 `http://localhost:8787`

### 测试API接口

开发服务器启动后，你可以测试以下接口：

- `http://localhost:8787/` - 主页
- `http://localhost:8787/api/navigation` - 获取导航数据
- `http://localhost:8787/api/search?q=github` - 搜索功能
- `http://localhost:8787/api/stats` - 统计信息

## 🗄️ 可选：配置KV存储

如果需要存储用户自定义数据，可以配置KV存储：

### 创建KV命名空间

```bash
# 生产环境
npx wrangler kv:namespace create "NAVIGATION_KV"

# 预览环境  
npx wrangler kv:namespace create "NAVIGATION_KV" --preview
```

### 更新配置

将返回的ID更新到 `wrangler.toml` 文件中：

```toml
[[kv_namespaces]]
binding = "NAVIGATION_KV"
id = "你的KV命名空间ID"
preview_id = "你的预览KV命名空间ID"
```

### 重新部署

```bash
npm run deploy
```

## 🌐 配置自定义域名

### 1. 在Cloudflare添加域名

在Cloudflare Dashboard中添加你的域名。

### 2. 配置Worker路由

有两种方式：

**方式一：通过Dashboard**
1. 进入Worker管理页面
2. 点击"Triggers"标签
3. 添加自定义域名

**方式二：通过命令行**

```bash
npx wrangler route add your-domain.com/*
```

### 3. 更新DNS

确保域名的DNS指向Cloudflare。

## 📊 监控和调试

### 查看实时日志

```bash
npm run tail
```

### 查看部署状态

```bash
npx wrangler deployments list
```

### 测试远程Worker

```bash
npm run preview
```

## 🔒 环境变量配置

如需添加环境变量，在 `wrangler.toml` 中配置：

```toml
[vars]
API_KEY = "your-api-key"
ENVIRONMENT = "production"
```

或使用secrets存储敏感信息：

```bash
npx wrangler secret put API_KEY
```

## 🎨 自定义导航内容

### 修改导航数据

编辑 `src/server.js` 中的 `navigationData` 对象：

```javascript
const navigationData = {
  profile: {
    name: "你的名字",
    subtitle: "你的导航网站",
    // ...
  },
  categories: [
    {
      id: "custom-category",
      title: "自定义分类",
      icon: "🎯",
      sites: [
        {
          title: "网站名称",
          description: "网站描述",
          url: "https://example.com",
          icon: "🌐",
          tags: ["标签1", "标签2"]
        }
      ]
    }
  ]
};
```

### 修改页面样式

编辑 `public/index.html` 中的CSS部分，或添加新的样式规则。

### 重新部署

```bash
npm run deploy
```

## 🐛 常见问题

### 部署失败

**问题**: `Error: Unknown account`
**解决**: 运行 `npx wrangler whoami` 确认登录状态

**问题**: `Error: Code: 10021`
**解决**: 检查Worker名称是否已存在，修改 `wrangler.toml` 中的 `name`

### API无法访问

**问题**: 404错误
**解决**: 确认Worker已成功部署，检查API路径

**问题**: CORS错误
**解决**: 已在代码中配置CORS，如仍有问题检查请求头

### 样式丢失

**问题**: 页面无样式
**解决**: 确认静态资源配置正确，检查 `[assets]` 配置

## 📈 性能优化

### 启用缓存

在Worker中添加缓存头：

```javascript
return new Response(html, {
  headers: {
    'Content-Type': 'text/html',
    'Cache-Control': 'public, max-age=3600'
  }
});
```

### 压缩资源

Cloudflare自动提供Gzip/Brotli压缩。

### CDN优化

静态资源自动通过Cloudflare CDN分发。

## 🔄 版本管理

### 更新代码

```bash
git pull origin main
npm run deploy
```

### 回滚版本

```bash
npx wrangler rollback
```

## 📞 获取帮助

- [Cloudflare Workers文档](https://developers.cloudflare.com/workers/)
- [Wrangler CLI文档](https://developers.cloudflare.com/workers/wrangler/)
- [项目Issue](https://github.com/your-username/personal-navigation/issues)

---

🎉 恭喜！你的个人导航网站已经成功部署！
