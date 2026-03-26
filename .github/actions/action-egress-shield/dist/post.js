const core = require("@actions/core");
const artifact = require("@actions/artifact");
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");

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

  safePkill("mitmdump");
  safePkill("tcpdump");
  safePkill("\\bss\\b");

  execSync("zip -r egress-logs.zip egress-logs");
  const client = artifact.create();
    await client.uploadArtifact("egress-logs", ["egress-logs.zip"], ".", {
      continueOnError: false
    });
}

run();
