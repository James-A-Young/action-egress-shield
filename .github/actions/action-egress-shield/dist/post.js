const core = require("@actions/core");
const artifact = require("@actions/artifact");
const { execSync } = require("child_process");
const fs = require("fs");

async function run() {
  try {
    execSync("pkill -f mitmdump || true");
    execSync("pkill -f tcpdump || true");
    execSync("pkill -f ss || true");

    execSync("zip -r egress-logs.zip egress-logs");

    const client = artifact.create();
    await client.uploadArtifact("egress-logs", ["egress-logs.zip"], ".", {
      continueOnError: false
    });
  } catch (err) {
    core.warning("Post step failed: " + err.message);
  }
}

run();
