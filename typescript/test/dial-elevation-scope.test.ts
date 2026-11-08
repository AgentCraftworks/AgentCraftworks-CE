import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { ApiPrincipal } from "../src/middleware/api-principal.js";
import { authorizeApiRequest } from "../src/middleware/api-principal.js";
import dialRouter from "../src/handlers/autonomy-dial-routes.js";
import {
  clearAllDials,
  getDialLevel,
  setDialLevel,
} from "../src/services/autonomy-dial.js";

const principal: ApiPrincipal = {
  name: "writer",
  scopes: ["dial:write"],
  repos: ["*/*"],
};
const app = express();
app.use(express.json());
app.use(
  "/api/dial",
  (_req, res, next) => {
    res.locals["apiPrincipal"] = principal;
    next();
  },
  authorizeApiRequest,
  dialRouter,
);

let server: http.Server;
let baseUrl: string;

const serverReady = new Promise<void>((resolve) => {
  server = app.listen(0, () => {
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    resolve();
  });
});

async function setDial(dialLevel: number): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  await serverReady;
  const response = await fetch(`${baseUrl}/api/dial/org/repo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dialLevel }),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

beforeEach(() => {
  clearAllDials();
});

after(async () => {
  await serverReady;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("dial elevation scope", () => {
  it("denies raising the dial to level 4 without dial:elevate", async () => {
    setDialLevel("org", "repo", 3, "setup");

    const response = await setDial(4);

    assert.equal(response.status, 403);
    assert.equal(response.body["code"], "insufficient_scope");
    assert.equal(response.body["requiredScope"], "dial:elevate");
    assert.equal(getDialLevel("org", "repo").dialLevel, 3);
  });

  it("allows lowering the dial with dial:write alone", async () => {
    setDialLevel("org", "repo", 5, "setup");

    const response = await setDial(3);

    assert.equal(response.status, 200);
    assert.equal(response.body["dialLevel"], 3);
    assert.equal(response.body["updatedBy"], "writer");
  });
});
