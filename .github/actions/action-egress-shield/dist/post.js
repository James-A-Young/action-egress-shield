import * as core from "@actions/core";
import { DefaultArtifactClient } from "@actions/artifact";
import { execSync, spawnSync } from "child_process";
import fs from "fs";

function clearProxyEnv() {
  const keys = [
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
    "http_proxy", "https_proxy", "all_proxy", "no_proxy",
  ];
  for (const k of keys) delete process.env[k];
}

function safePkill(pattern) {
  const res = spawnSync("pkill", ["-f", pattern], { stdio: "ignore" });

  // 0 = killed, 1 = no match (both fine)
  if (res.status === 0 || res.status === 1) return;

  if (res.error && res.error.code === "ENOENT") {
    core.info(`pkill not found on runner, skipping cleanup for: ${pattern}`);
    return;
  }

  core.warning(`pkill failed for pattern "${pattern}" (exit: ${res.status ?? "unknown"})`);
}

function buildArtifactName() {
  const runId = String(process.env.GITHUB_RUN_ID || "0");
  const attempt = String(process.env.GITHUB_RUN_ATTEMPT || "1");
  const ts = String(Date.now());
  // ultra-safe: lowercase + digits + underscore
  return `egresslogs_${runId}_${attempt}_${ts}`.slice(0, 80);
}

async function run() {
  try {
    if (!fs.existsSync("egress-logs")) {
      core.warning("egress-logs directory not found, skipping artifact upload");
      return;
    }

    execSync("zip -r egress-logs.zip egress-logs", { stdio: "inherit" });
    clearProxyEnv();

    const client = new DefaultArtifactClient();
    const artifactName = buildArtifactName();
    core.info(`Uploading artifact as: ${JSON.stringify(artifactName)}`);

    await client.uploadArtifact(artifactName, ["egress-logs.zip"], ".");
  } catch (err) {
    core.warning(`Artifact upload failed: ${err.message}`);
  } finally {
    safePkill("mitmdump");
    safePkill("tcpdump");
    safePkill("\\bss\\b");
  }
}

run();