import { loadRepoEnv } from "@filmbench/shared/load-env";
import { createServer } from "node:http";

import { logJson } from "./log.js";
import { handleRequest } from "./router.js";

loadRepoEnv();

const port = Number(process.env.API_PORT ?? "4000");
const host = process.env.API_HOST ?? "0.0.0.0";

const server = createServer((req, res) => {
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
    node_env: process.env.NODE_ENV ?? "development",
    app_env: process.env.APP_ENV ?? "development",
  });
});
