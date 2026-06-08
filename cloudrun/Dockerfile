# Tiny reverse-proxy for 微信云托管 (WeChat CloudRun): forwards mini-program
# callContainer requests to the existing Azure backend, so the client needs no
# ICP-备案 domain. Listens on 80 (set this as the service port in the 云托管 console).
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
