# 留言板云端配置指南（Supabase）

> 目标：让**所有人**都能在你的留言板留言、且所有人都能看到；你本人通过
> `admin.html` + 管理密码删除 / 导出留言。
> 全程约 5 分钟，完全免费。

---

## 第 0 步 · 你会拿到什么

配置完成后：

| 角色 | 能做什么 |
|---|---|
| 任何访客 | 在 `index.html` 留言板留言（匿名可留，最多 200 字），看到所有人的留言 |
| 你（管理员） | 打开 `admin.html`，输入管理密码后：查看统计、删除任意留言、导出 JSON/CSV、把本机旧留言一键迁移上云 |

数据库层面（RLS 行级安全）：匿名访客**只能**新增和读取留言，
**不能**修改或删除任何数据——即使他们拿到前端代码也无法绕过。

---

## 第 1 步 · 注册 Supabase（免费）

1. 打开 https://supabase.com
2. 点 `Start your project` → 用 **GitHub** 或邮箱注册登录（免费版即可，无需信用卡）

## 第 2 步 · 新建项目

1. 点 `New project`
2. 名称随意（如 `caoliqiao-homepage`），数据库密码随机生成后**不用记**（那是另一层密码，本项目用不到）
3. Region 选 **Northeast Asia (Tokyo)** 或 **Southeast Asia (Singapore)**——离中国近，访问快
4. 点 `Create new project`，等 1~2 分钟初始化

## 第 3 步 · 运行一键 SQL（建表 + 权限 + 管理函数）

1. **先打开项目根目录的 `supabase-setup.sql`**
2. 找到最后一节的 `REPLACE_WITH_YOUR_PASSWORD`，替换成**你自己想好的管理密码**
   （建议 8 位以上；别用 QQ / 微信 / 邮箱常用密码；这个密码只用于 admin.html 登录）
3. 回到 Supabase 网页：左侧菜单 → **SQL Editor** → **New query**
4. 把改好密码的 SQL 全部粘贴进去 → 点 **RUN**
5. 显示 `Success. No rows returned` 即成功

> 改密码以后，把 SQL 里密码换掉重跑一遍即可（脚本是幂等的）。

## 第 4 步 · 把两个值填进 js/config.js

1. Supabase 左侧菜单 → 齿轮 **Project Settings** → **API**
2. 复制两个值：
   - **Project URL**（形如 `https://abcd1234.supabase.co`）→ 填 `SUPABASE_URL`
   - **anon public**（`eyJhbGciOi...` 开头的长串）→ 填 `SUPABASE_KEY`
3. 打开 `js/config.js`，填入：

```js
window.SITE_CONFIG = {
  SUPABASE_URL: "https://abcd1234.supabase.co",
  SUPABASE_KEY: "eyJhbGciOi...你的anon key"
};
```

> anon key 本来就是设计为公开的（配合数据库行级安全策略使用），放前端没有安全问题。
> 你的管理密码**只存在数据库里**（且是 SHA-256 哈希），绝不要写进 config.js 或告诉任何人。

## 第 5 步 · 验证

1. 用本地服务器或部署后的地址打开 `index.html`（留言板区右上角应显示绿色
   `CLOUD_SYNC · 公共留言` 徽章，不再是棕色的 LOCAL_MODE）
2. 留一条言，换浏览器 / 手机（或无痕窗口）打开——能看到这条留言即成功 ✅
3. 打开 `admin.html` → 输入管理密码 → 能看到统计和留言列表，试删一条

---

## 常见问题

**Q：为什么提示「当前环境不支持加密」？**
A：管理登录用了浏览器 Web Crypto（SHA-256），要求页面通过 `http://localhost`、
`https://` 访问。直接双击 HTML 文件（file:// 协议）打开会不支持——用本地服务器或部署后的网址即可。

**Q：想换管理密码？**
A：改 `supabase-setup.sql` 里的密码占位符，去 SQL Editor 重跑一遍。

**Q：旧的本地留言（LOCAL_MODE 时期的）会丢吗？**
A：不会。登录 `admin.html` 后，如果检测到本机存有旧留言，会出现
「迁移本机旧留言」按钮，一键搬上云（保留原时间）。

**Q：有人恶意刷屏怎么办？**
A：单条留言限 200 字、昵称限 20 字；你在 admin.html 可以随时删除。
若要更严的防护（验证码 / 限流），以后可以再加。

**Q：免费额度够用吗？**
A：Supabase 免费版 500MB 数据库 + 5 万月活请求，个人主页留言板绰绰有余。
项目 90 天无活动会暂停（到时登录一次控制台点恢复即可）。
