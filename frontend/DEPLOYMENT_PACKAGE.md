# Manufacturing CRM - Complete Deployment Package

## 🚀 Quick Deployment Guide

### Option 1: Automated Setup (Recommended)

```bash
# 1. On your server, run the setup script
wget https://raw.githubusercontent.com/your-repo/manufacturing-crm/main/server-setup.sh
chmod +x server-setup.sh
./server-setup.sh your-domain.com your-email@example.com

# 2. Clone/copy your project files
git clone your-repo.git ~/manufacturing-crm
cd ~/manufacturing-crm

# 3. Configure and deploy
./deploy.sh prod https://api.your-domain.com your-domain.com
docker-compose up -d
```

### Option 2: Manual Setup

Follow the detailed instructions in `deploy-to-domain.md`

## 📦 Package Contents

### Core Application Files
- `Dockerfile` - Container configuration
- `docker-compose.yml` - Multi-service orchestration
- `docker-compose.dev.yml` - Development overrides
- `nginx.conf` - Web server configuration with SSL
- `.env.production` - Production environment template

### Deployment Scripts
- `deploy.sh` - Main deployment script with domain configuration
- `server-setup.sh` - Automated server setup for Ubuntu
- `deploy-to-domain.md` - Complete deployment guide

### Configuration Templates
- `.env.example` - Environment variables template
- `deployment.md` - Environment configuration guide

## 🌐 Domain Configuration

### For Development
```bash
./deploy.sh dev https://api-dev.karma-grp.com dev.karma-grp.com
```

### For Production
```bash
./deploy.sh prod https://api-prod.karma-grp.com karma-grp.com
```

## 🔧 Environment Variables

Set these in your deployment environment:

```bash
# Required
VITE_PROD_API_BASE_URL=https://api-prod.karma-grp.com
VITE_DEV_API_BASE_URL=https://api-dev.karma-grp.com
POSTGRES_PASSWORD=your-secure-password

# Optional
JWT_SECRET=your-jwt-secret
SESSION_SECRET=your-session-secret
```

## 📋 Deployment Checklist

- [ ] Server setup complete (Ubuntu with Docker)
- [ ] Domain DNS pointing to server IP
- [ ] SSL certificate generated
- [ ] Environment variables configured
- [ ] Application built and deployed
- [ ] Database initialized
- [ ] HTTPS redirect working
- [ ] API endpoints accessible

## 🛡️ Security Features

- SSL/TLS encryption with Let's Encrypt
- Rate limiting on API endpoints
- Security headers (HSTS, XSS protection, etc.)
- Firewall configuration
- Non-root container execution
- Database isolation

## 📊 Monitoring

After deployment, monitor:
- Application logs: `docker-compose logs app`
- Web server logs: `docker-compose logs nginx`
- Database logs: `docker-compose logs postgres`
- System resources: `docker stats`

## 🔄 Maintenance

### SSL Certificate Renewal
Automatic renewal is configured via cron job.

### Application Updates
```bash
git pull origin main
./deploy.sh prod https://api.your-domain.com your-domain.com
docker-compose down && docker-compose up -d --build
```

### Database Backup
```bash
docker-compose exec postgres pg_dump -U admin manufacturing_crm > backup.sql
```

## 🆘 Support

1. Check application logs for errors
2. Verify domain DNS configuration
3. Test SSL certificate validity
4. Ensure all environment variables are set
5. Check firewall and port accessibility

Your Manufacturing CRM application is now ready for production deployment on your own domain!