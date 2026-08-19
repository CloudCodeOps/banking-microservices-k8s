FROM nginx:1.27-alpine

COPY src/ /usr/share/nginx/html/

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget -q --spider http://localhost/ || exit 1

EXPOSE 80
