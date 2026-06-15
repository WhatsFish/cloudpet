# cloudrun — 微信云托管 反代 (免备案入口)

A minimal nginx reverse-proxy deployed to **微信云托管 (WeChat CloudRun)** so the
mini program can reach the backend **without an ICP-备案 domain**. The mini program
calls `wx.cloud.callContainer({ path: "/pet", ... })`; this container forwards
`/<path>` → `https://ai-native.japaneast.cloudapp.azure.com/cloudpet/api/<path>`.
The Next.js backend + Postgres on the Azure VM are unchanged.

## Deploy (云托管 console)
1. 云托管 → 选环境 → 服务管理 → 新建服务（名字记下，给客户端用）。
2. **环境变量**：先加 `PROXY_TOKEN` = 共享密钥（取自 Azure 上 `~/.config/cloudpet.env` 的
   `PROXY_TOKEN` 值）。**容器没有它会启动失败（fail-fast）**，务必先设好再部署。
3. 该服务 → 新建版本 → **上传代码（本地代码）** → 选这个 `cloudrun/` 文件夹。
4. 监听端口 **80**；规格最小 (0.25核0.5G)；最小实例数 1（或 0 缩容省钱，首请求会冷启动）。
5. 部署完成后，客户端用 `环境ID + 服务名` 通过 callContainer 调用。

## Auth hardening (shared-secret gate)
- `docker-entrypoint.sh` renders `nginx.conf` from `nginx.conf.template`, substituting **only**
  `${PROXY_TOKEN}` (other `$vars` stay as nginx runtime vars). Every forwarded request then carries
  `X-Proxy-Token: <secret>`.
- The Azure backend's nginx (`/etc/nginx/snippets/cloudpet.conf`) rejects any `/cloudpet/api`
  request **lacking the correct token → 403**, so the public internet can't reach the API directly
  and forge `X-WX-OPENID` / `X-User-Id`. The landing page `/cloudpet` stays open.
- The secret lives ONLY in this env var + the Azure root-owned nginx snippet — never in the repo.
- **Ordering matters**: redeploy this cloudrun (with `PROXY_TOKEN`) FIRST, THEN enable the
  Azure-side gate. Enabling the gate while the old token-less image still runs would 403 real
  traffic.

## Notes
- `nginx.conf.template` resolves the Azure host at runtime via public DNS (119.29.29.29 /
  114.114.114.114) and proxies over HTTPS with SNI.
- `/healthz` is the 云托管 health probe.
- callContainer auto-injects `X-WX-OPENID` (the caller's openid); the gate above makes that header
  trustworthy end-to-end (it can only arrive via this gateway now).
