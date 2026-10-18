# Unprivileged nginx: runs as non-root on port 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine
ENV API_UPSTREAM=http://linkly-api:8080
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY index.html /usr/share/nginx/html/index.html
EXPOSE 8080
