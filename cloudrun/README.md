# cloudrun — 微信云托管 反代 (免备案入口)

A minimal nginx reverse-proxy deployed to **微信云托管 (WeChat CloudRun)** so the
mini program can reach the backend **without an ICP-备案 domain**. The mini program
calls `wx.cloud.callContainer({ path: "/pet", ... })`; this container forwards
`/<path>` → `https://ai-native.japaneast.cloudapp.azure.com/cloudpet/api/<path>`.
The Next.js backend + Postgres on the Azure VM are unchanged.

## Deploy (云托管 console)
1. 云托管 → 选环境 → 服务管理 → 新建服务（名字记下，给客户端用）。
2. 该服务 → 新建版本 → **上传代码（本地代码）** → 选这个 `cloudrun/` 文件夹。
3. 监听端口 **80**；规格最小 (0.25核0.5G)；最小实例数 1（或 0 缩容省钱，首请求会冷启动）。
4. 部署完成后，客户端用 `环境ID + 服务名` 通过 callContainer 调用。

## Notes
- `nginx.conf` resolves the Azure host at runtime via public DNS (119.29.29.29 /
  114.114.114.114) and proxies over HTTPS with SNI.
- `/healthz` is the 云托管 health probe.
- callContainer auto-injects `X-WX-OPENID` headers (the caller's openid) — a future
  enhancement can map that to the app's user id instead of the client-set `x-user-id`,
  giving real WeChat identity without AppSecret/jscode2session.
