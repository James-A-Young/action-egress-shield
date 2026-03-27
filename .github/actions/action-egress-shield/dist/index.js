import * as core from "@actions/core";
import { execSync, spawn } from "child_process";
import fs from "fs";

function startBackground(command) {
  const child = spawn("bash", ["-c", command], {
    detached: true,
    stdio: "ignore"
  });

  child.unref();
}

async function run() {
  try {
    const allowedDomains = core.getInput("allowed_domains") || "";
    const allowedIps = core.getInput("allowed_ips") || "";
    const block = core.getInput("block") || "false";

    fs.mkdirSync("egress-logs", { recursive: true });

    execSync("pip install mitmproxy", { stdio: "inherit" });
    execSync("sudo apt-get update", { stdio: "inherit" });
    execSync("sudo apt-get install -y dnsutils", { stdio: "inherit" });
    
    console.log("doing dns capture");
    startBackground("while true; do cat /proc/net/udp > egress-logs/dns.log; sleep 2; done");

    console.log("doing socket capture");
    startBackground("while true; do ss -tupn >> egress-logs/sockets.log; sleep 2; done");

    process.env.ALLOWED_DOMAINS = allowedDomains;
    process.env.ALLOWED_IPS = allowedIps;
    process.env.BLOCK = block;

    execSync(
      "nohup mitmdump -s $GITHUB_ACTION_PATH/proxy.py --listen-port 8080 > egress-logs/proxy.log 2>&1 &"
    );

    // Wait until mitmproxy is accepting connections on port 8080 (up to 30s)
    const maxWaitMs = 30_000;
    const pollMs = 500;
    const startTime = Date.now();
    core.info("Waiting for mitmproxy to start on port 8080...");
    while (true) {
      try {
        execSync("nc -z localhost 8080", { stdio: "ignore" });
        core.info("mitmproxy is ready.");
        break;
      } catch {
        if (Date.now() - startTime >= maxWaitMs) {
          throw new Error("mitmproxy did not start within 30 seconds");
        }
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        core.info(`Waiting for mitmproxy to start on port 8080... (${elapsed}s elapsed)`);
        await new Promise(r => setTimeout(r, pollMs));
      }
    }

    fs.appendFileSync(
      process.env.GITHUB_ENV,
      "HTTP_PROXY=http://localhost:8080\n"
    );
    fs.appendFileSync(
      process.env.GITHUB_ENV,
      "HTTPS_PROXY=http://localhost:8080\n"
    );
  
    core.exportVariable("NODE_OPTIONS", "--require /path/to/shim.js");
  } catch (err) {
    core.setFailed(err.message);
  }
}

run();

