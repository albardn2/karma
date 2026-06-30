import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// Environment validation and setup
const NODE_ENV = process.env.NODE_ENV || "development";
const SESSION_SECRET = process.env.SESSION_SECRET || "default-dev-secret-key-change-in-production";
const PORT = process.env.PORT || 5000;

console.log(`[ENV] NODE_ENV: ${NODE_ENV}`);
console.log(`[ENV] PORT: ${PORT}`);
console.log(`[ENV] SESSION_SECRET: ${SESSION_SECRET ? 'SET' : 'NOT SET'}`);

// Validate required environment variables for production
if (NODE_ENV === "production") {
  console.log("[ENV] Production mode enabled");
  if (!process.env.SESSION_SECRET) {
    console.warn("[ENV] WARNING: SESSION_SECRET not set in production environment. Using default value.");
  }
  if (process.env.ALLOWED_ORIGINS) {
    console.log(`[ENV] ALLOWED_ORIGINS: ${process.env.ALLOWED_ORIGINS}`);
  } else {
    console.log("[ENV] ALLOWED_ORIGINS not set - CORS will be restricted");
  }
  console.log("[ENV] INFO: Frontend interface - no database connection required");
} else {
  console.log("[ENV] Development mode enabled");
}

console.log(`Starting server in ${NODE_ENV} mode on port ${PORT}`);

// Process-level error handling for deployment
process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION] Uncaught Exception:', error);
  console.error('[UNCAUGHT EXCEPTION] Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[SHUTDOWN] SIGINT received, shutting down gracefully');
  process.exit(0);
});

const app = express();
app.set("env", NODE_ENV);

// Comprehensive health check endpoint for deployment debugging
app.get('/health', (_req, res) => {
  const healthData = {
    status: 'healthy', 
    environment: NODE_ENV,
    port: PORT,
    host: "0.0.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    versions: process.versions,
    cwd: process.cwd(),
    dirname: import.meta.dirname,
    session_secret_set: !!process.env.SESSION_SECRET,
    allowed_origins: process.env.ALLOWED_ORIGINS || 'not_set'
  };

  // In production, check if static files exist
  if (NODE_ENV === "production") {
    try {
      const fs = require('fs');
      const path = require('path');
      const distPath = path.resolve(import.meta.dirname, "public");
      const indexPath = path.resolve(distPath, "index.html");
      
      healthData.static_files = {
        dist_path_exists: fs.existsSync(distPath),
        index_html_exists: fs.existsSync(indexPath),
        dist_path: distPath,
        index_path: indexPath
      };
    } catch (error) {
      healthData.static_files = {
        error: error.message
      };
    }
  }

  res.status(200).json(healthData);
});

// Enable CORS for all routes with environment-specific configuration
const corsOrigin = NODE_ENV === "production" 
  ? process.env.ALLOWED_ORIGINS?.split(',') || false 
  : true; // Allow all origins in development

app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  optionsSuccessStatus: 200
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log(`[STARTUP] Initializing server...`);
    const server = await registerRoutes(app);
    console.log(`[STARTUP] Routes registered successfully`);

    app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      // Enhanced error logging for deployment debugging
      console.error(`[ERROR] ${req.method} ${req.path} - Status: ${status}`);
      console.error(`[ERROR] Message: ${message}`);
      if (NODE_ENV === "development") {
        console.error(`[ERROR] Stack: ${err.stack}`);
      }

      res.status(status).json({ message });
      
      // Don't throw in production to prevent server crashes
      if (NODE_ENV === "development") {
        throw err;
      }
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      console.log(`[STARTUP] Setting up Vite for development...`);
      await setupVite(app, server);
      console.log(`[STARTUP] Vite setup completed`);
    } else {
      console.log(`[STARTUP] Setting up static file serving for production...`);
      try {
        serveStatic(app);
        console.log(`[STARTUP] Static file serving setup completed`);
      } catch (error) {
        console.error(`[STARTUP ERROR] Failed to setup static file serving:`, error.message);
        // In production, we should fail gracefully and provide a helpful message
        app.use("*", (_req, res) => {
          res.status(503).json({ 
            error: "Service temporarily unavailable", 
            message: "Static files not found. Please ensure the application was built correctly.",
            build_command: "npm run build"
          });
        });
        console.log(`[STARTUP] Fallback error handler configured for missing static files`);
      }
    }

    // Server configuration for Cloud Run compatibility
    const host = "0.0.0.0"; // Required for Cloud Run
    
    console.log(`[STARTUP] Attempting to start server...`);
    console.log(`[STARTUP] Host: ${host}`);
    console.log(`[STARTUP] Port: ${PORT}`);
    console.log(`[STARTUP] Environment: ${NODE_ENV}`);
    console.log(`[STARTUP] Process CWD: ${process.cwd()}`);
    console.log(`[STARTUP] __dirname equivalent: ${import.meta.dirname}`);
    
    server.listen({
      port: PORT,
      host,
      reusePort: true,
    }, () => {
      console.log(`[STARTUP] ✅ Server successfully started`);
      console.log(`[STARTUP] ✅ Environment: ${NODE_ENV}`);
      console.log(`[STARTUP] ✅ Port: ${PORT}`);
      console.log(`[STARTUP] ✅ Host: ${host}`);
      console.log(`[STARTUP] ✅ CORS Origin: ${corsOrigin}`);
      console.log(`[STARTUP] ✅ Health check available at: http://${host}:${PORT}/health`);
      if (NODE_ENV === "production") {
        console.log(`[STARTUP] ✅ Static files served from production build`);
      } else {
        console.log(`[STARTUP] ✅ Vite development server enabled`);
      }
      log(`serving on port ${PORT}`);
    });

    // Handle server listen errors
    server.on('error', (error) => {
      console.error(`[STARTUP ERROR] Server listen failed:`, error);
      if (error.code === 'EADDRINUSE') {
        console.error(`[STARTUP ERROR] Port ${PORT} is already in use`);
      } else if (error.code === 'EACCES') {
        console.error(`[STARTUP ERROR] Permission denied for port ${PORT}`);
      }
      process.exit(1);
    });

  } catch (error) {
    console.error(`[STARTUP ERROR] Failed to initialize server:`);
    console.error(`[STARTUP ERROR] ${error.message}`);
    if (NODE_ENV === "development") {
      console.error(`[STARTUP ERROR] Stack: ${error.stack}`);
    }
    
    // Exit gracefully on startup errors
    console.error(`[STARTUP ERROR] Server initialization failed. Exiting...`);
    process.exit(1);
  }
})().catch((error) => {
  // Additional catch block for unhandled promise rejections
  console.error(`[UNHANDLED ERROR] Unhandled promise rejection during startup:`);
  console.error(`[UNHANDLED ERROR] ${error.message}`);
  if (NODE_ENV === "development") {
    console.error(`[UNHANDLED ERROR] Stack: ${error.stack}`);
  }
  process.exit(1);
});
