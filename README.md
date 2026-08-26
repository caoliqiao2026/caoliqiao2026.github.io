# 曹丽翘 · 个人在线简历

> 数据科学与大数据技术 · 嘉应学院

## 在线访问
- GitHub Pages：`https://caoliqiao2026.github.io`
- 自定义域名：`https://caoliqiao.online`（DNS 配置中）

## 项目简介
纯 HTML / CSS / JavaScript 构建的个人主页，**无需任何框架或构建工具**，直接用浏览器打开 `index.html` 即可运行。

设计风格采用 **蓝 `#225DAB` / 绿 `#7BA372` / 棕 `#CBAF98`** 的浅色简历风，主要包含：

- 个人简介、信念区、成长曲线时间线
- 荣誉证书 / AI 证书弹窗展示（点击可看原图）
- 拼豆神器作品截图
- 云端留言板（所有人可留言、所有人可见，博主可管理）
- 独立管理后台 `admin.html`

## 目录结构
```
index.html            主页
admin.html            留言板管理后台
css/style.css         样式
js/
  config.js           云端后端配置（Supabase）
  main.js             页面交互与动效
  guestbook.js        留言板逻辑
  admin.js            管理后台逻辑
  game.js / particles.js  趣味模块
assets/               头像、证书、作品截图
supabase-setup.sql    一键建表 SQL
SUPABASE_SETUP.md     Supabase 配置指南
```

## 留言板（云端功能）
留言板默认使用浏览器本地存储（localStorage），仅本机可见。
若要启用「所有人可留言、所有人可见、博主可管理」，需配置 Supabase 云数据库：

1. 阅读 `SUPABASE_SETUP.md` 完成注册与建表
2. 在 `js/config.js` 填入 `SUPABASE_URL` 与 `SUPABASE_KEY`
3. 在 Supabase 的 `admin_settings` 表中设置你的管理密码

## 管理后台
访问 `admin.html`，输入管理密码即可登录，支持：留言统计、删除、导出 JSON/CSV、本机旧数据一键迁移到云端。

---
课程作业 · 个人在线简历（HTML 格式）
