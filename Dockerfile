# Use official lightweight Alpine-based Nginx image
FROM nginx:alpine

# Metadata labels
LABEL maintainer="Smart Queue DevOps Team"
LABEL description="Smart Queue Token Management System containerized with Nginx"
LABEL version="1.0.0"

# Remove default Nginx welcome site
RUN rm -rf /usr/share/nginx/html/*

# Copy static assets to Nginx html root
COPY index.html styles.css app.js /usr/share/nginx/html/

# Copy customized Nginx server configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

# Health check to ensure Nginx is responding
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Launch Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
