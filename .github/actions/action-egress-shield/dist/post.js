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
  const res = spawnSync("pkill", ["-f", pattern], { stdio: "ignore" });

  // 0 = killed, 1 = no match (both fine)
  if (res.status === 0 || res.status === 1) return;

  if (res.error && res.error.code === "ENOENT") {
    core.info(`pkill not found on runner, skipping cleanup for: ${pattern}`);
    return;
  }

  core.warning(`pkill failed for pattern "${pattern}" (exit: ${res.status ?? "unknown"})`);
}

function buildArtifactName(base) {
  const runId = process.env.GITHUB_RUN_ID || "local";
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT || "1";
  const job = (process.env.GITHUB_JOB || "job").replace(/[^a-zA-Z0-9._-]/g, "-");
  const ts = Date.now();
  return `${base}-${job}-${runId}-${runAttempt}-${ts}`.slice(0, 255);
}

async function run() {
  try {
    if (!fs.existsSync("egress-logs")) {
      core.warning("egress-logs directory not found, skipping artifact upload");
      return;
    }

    execSync("zip -r egress-logs.zip egress-logs", { stdio: "inherit" });
    clearProxyEnv();

    const client = artifact.create();
    const artifactName = buildArtifactName("egress-logs");
    core.info(`Uploading artifact as: ${artifactName}`);

    await client.uploadArtifact(artifactName, ["egress-logs.zip"], ".", {
      continueOnError: true
    });
  } catch (err) {
    core.warning(`Artifact upload failed: ${err.message}`);
  } finally {
    safePkill("mitmdump");
    safePkill("tcpdump");
    safePkill("\\bss\\b");
  }
}

run();