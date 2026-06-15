# Tiny reverse-proxy for 微信云托管 (WeChat CloudRun): forwards mini-program
# callContainer requests to the existing Azure backend, so the client needs no
# ICP-备案 domain. Listens on 80 (set this as the service port in the 云托管 console).
#
# Adds a shared-secret header (X-Proxy-Token) on every forwarded request so the Azure backend can
# reject direct-from-internet hits to /cloudpet/api (which could otherwise forge identity headers).
# The secret is injected at start from the PROXY_TOKEN env var (set in the 云托管 console) — never
# baked into the image or committed.
FROM nginx:1.27-alpine
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
ENTRYPOINT ["/docker-entrypoint.sh"]
