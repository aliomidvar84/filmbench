import { loadRepoEnv } from "@filmbench/shared/load-env";
import { createServer } from "node:http";
import { logJson } from "./log.js";
import { handleRequest } from "./router.js";

loadRepoEnv();

const port = Number(process.env.PORT ?? "4000");
const host = process.env.HOST ?? "0.0.0.0";

const allowedOrigins = [
  "https://film-ebon.vercel.app",
  "http://localhost:3000",
];

const server = createServer((req, res) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  void handleRequest(req, res).catch((err) => {
    logJson("error", "request_handler_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.statusCode = 500;
    res.end("internal_error");
  });
});

server.listen(port, host, () => {
  logJson("info", "api_listening", {
    host,
    port,
    node_env: process.env.NODE_ENV,
    app_env: process.env.APP_ENV,
  });
});