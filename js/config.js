/* ============================================================
   config.js · 站点云端配置
   ------------------------------------------------------------
   留言板的云端后端基于 Supabase（免费）。
   配置步骤见 SUPABASE_SETUP.md，大致为：
   1. 注册 https://supabase.com （GitHub 一键登录）
   2. 新建项目（区域选 Singapore 或 Northeast Asia）
   3. SQL Editor 里运行 supabase-setup.sql
   4. 把下面两个值替换成你项目的值：
      - Settings → API → Project URL   → SUPABASE_URL
      - Settings → API → anon public   → SUPABASE_KEY
   注意：anon key 本来就是设计为公开的（配合数据库行级
   安全策略使用），放到前端没有安全问题；管理密码存在
   数据库里，绝不要写进这个文件。
   两个值留空时，留言板自动降级为本地模式（localStorage），
   仅本机可见。
   ============================================================ */
window.SITE_CONFIG = {
  SUPABASE_URL: "", // 例如 "https://abcd1234.supabase.co"
  SUPABASE_KEY: ""  // anon public key（"eyJhbGciOi..." 开头）
};
