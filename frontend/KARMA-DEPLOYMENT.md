# Karma Group Manufacturing CRM Deployment Guide

## 🚀 Quick Deployment

### Production Deployment (karma-grp.com)
```bash
# Deploy to production
./deploy-karma.sh prod

# Or with custom deployment script
./deploy.sh prod https://api-prod.karma-grp.com karma-grp.com
```

### Development Deployment (dev.karma-grp.com)
```bash
# Deploy to development
./deploy-karma.sh dev

# Or with custom deployment script
./deploy.sh dev https://api-dev.karma-grp.com dev.karma-grp.com
```

## 📋 Configuration Summary

### Domain Configuration
- **Production**: `karma-grp.com` (with www.karma-grp.com)
- **Development**: `dev.karma-grp.com`

### Backend API Configuration
- **Production**: `https://api-prod.karma-grp.com`
- **Development**: `https://api-dev.karma-grp.com`

### SSL Certificate Setup
```bash
# For production (karma-grp.com)
sudo certbot certonly --standalone -d karma-grp.com -d www.karma-grp.com

# For development (dev.karma-grp.com)
sudo certbot certonly --standalone -d dev.karma-grp.com
```

## 🛠️ Server Setup

### Initial Server Setup
```bash
# Run server setup for production
./server-setup.sh karma-grp.com admin@karma-grp.com

# Run server setup for development
./server-setup.sh dev.karma-grp.com admin@karma-grp.com
```

### Manual DNS Configuration
Point your domains to your server:
- `karma-grp.com` → Your production server IP
- `www.karma-grp.com` → Your production server IP  
- `dev.karma-grp.com` → Your development server IP

## 🔧 Environment Files

### Production (.env.production)
```bash
NODE_ENV=production
VITE_PROD_API_BASE_URL=https://api-prod.karma-grp.com
POSTGRES_PASSWORD=your-secure-production-password
```

### Development (.env.development)
```bash
NODE_ENV=development
VITE_DEV_API_BASE_URL=https://api-dev.karma-grp.com
POSTGRES_PASSWORD=your-dev-password
```

## 🐳 Docker Deployment

### Production Stack
```bash
docker-compose up -d
```

### Development Stack
```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

## 🌐 Final URLs

After deployment, your application will be available at:

### Production
- **Frontend**: `https://karma-grp.com`
- **Frontend (www)**: `https://www.karma-grp.com`
- **Backend API**: `https://api-prod.karma-grp.com`

### Development
- **Frontend**: `https://dev.karma-grp.com`
- **Backend API**: `https://api-dev.karma-grp.com`

## 📊 Monitoring Commands

```bash
# Check deployment status
docker-compose ps

# View logs
docker-compose logs -f

# Check specific service logs
docker-compose logs app
docker-compose logs nginx
docker-compose logs postgres

# Monitor resources
docker stats
```

## 🔄 Updates and Maintenance

### Update Application
```bash
git pull origin main
./deploy-karma.sh prod  # or dev
```

### SSL Certificate Renewal
Automatic renewal is configured via cron job:
```bash
0 3 * * * certbot renew --quiet && cd ~/manufacturing-crm && docker-compose restart nginx
```

### Database Backup
```bash
# Create backup
docker-compose exec postgres pg_dump -U admin manufacturing_crm > backup_$(date +%Y%m%d).sql

# Restore backup
docker-compose exec -T postgres psql -U admin manufacturing_crm < backup_20250112.sql
```

Your Manufacturing CRM is now configured for Karma Group's specific domain structure!