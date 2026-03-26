const core = require("@actions/core");
const artifact = require("@actions/artifact");
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");

function clearProxyEnv() {
  const keys = [
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
    "http_proxy", "https_proxy", "all_proxy", "no_proxy",
  ];
  for (const k of keys) delete process.env[k];
}

function safePkill(pattern) {
  try {
    const res = spawnSync("pkill", ["-f", pattern], { stdio: "ignore" });

    // 0 = killed at least one process, 1 = no process matched (both are fine)
    if (res.status === 0 || res.status === 1) return;

    if (res.error && res.error.code === "ENOENT") {
      core.info("pkill not found on runner, skipping cleanup for: " + pattern);
      return;
    }
  }
  catch (err) {
    core.warning(`pkill failed for pattern "${pattern}": ${err.message}`);
    return;
  }
  core.warning(`pkill failed for pattern "${pattern}" (exit: ${res.status ?? "unknown"})`);
}

async function run() {
  try {
    if (!fs.existsSync("egress-logs")) {
      core.warning("egress-logs directory not found, skipping artifact upload");
    } else {
      execSync("zip -r egress-logs.zip egress-logs", { stdio: "inherit" });

      // Prevent artifact client from trying to tunnel via stale local proxy
      clearProxyEnv();

      const client = artifact.create();
      await client.uploadArtifact("egress-logs", ["egress-logs.zip"], ".", {
        continueOnError: true
      });
    }
  } catch (err) {
    core.warning(`Artifact upload failed: ${err.message}`);
  } finally {
    // Cleanup after upload attempt
    safePkill("mitmdump");
    safePkill("tcpdump");
    safePkill("\\bss\\b");
  }
}

run();
