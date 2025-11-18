import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { existsSync } from "fs";

// ---------------------------------------------------
// Puppeteer Setup (Replit vs Localhost)
// ---------------------------------------------------
const replitChromiumPath = '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium-browser';
const isReplit = process.env.REPL_ID || existsSync(replitChromiumPath);

if (isReplit) {
  process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
  process.env.PUPPETEER_EXECUTABLE_PATH = replitChromiumPath;
  console.log('✅ Puppeteer configured for Replit (Nix Chromium)');
} else {
  console.log('✅ Puppeteer configured for localhost (system Chrome/Chromium)');
}

// ---------------------------------------------------
// Express Setup
// ---------------------------------------------------
const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ limit: '50mb', extended: false }));

// ---------------------------------------------------
// Request Logging (API only)
// ---------------------------------------------------
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJson: any;

  const originalJson = res.json.bind(res);

  res.json = (body: any) => {
    capturedJson = body;
    return originalJson(body);
  };
  

  res.on("finish", () => {
    if (path.startsWith("/api")) {
      const duration = Date.now() - start;
      let line = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      if (capturedJson) line += ` :: ${JSON.stringify(capturedJson)}`;
      if (line.length > 120) line = line.slice(0, 119) + "…";

      log(line);
    }
  });

  next();
});

// ---------------------------------------------------
// App Bootstrapping
// ---------------------------------------------------
(async () => {
  const server = await registerRoutes(app);

  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  // Vite in development
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ---------------------------------------------------
  // Windows-Safe Server Listener
  // ---------------------------------------------------
  const port = parseInt(process.env.PORT || "3000", 10);

  server.listen(port, "0.0.0.0", () => {
    log(`🚀 Server running on http://localhost:${port}`);
  });
})();
