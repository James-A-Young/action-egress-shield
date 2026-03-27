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

    // Configurable timeout: action input takes precedence, then env var, then default 60s
    const timeoutInput =
      parseInt(process.env.EGRESS_SHIELD_STARTUP_TIMEOUT || "", 10) ||
      parseInt(core.getInput("startup_timeout") || "", 10) ||
      60;
    const maxWaitSecs = timeoutInput > 0 ? timeoutInput : 60;
    const maxWaitMs = maxWaitSecs * 1000;
    const pollMs = 500;
    const startTime = Date.now();
    core.info(`Waiting for mitmproxy to start on port 8080... (timeout: ${maxWaitSecs}s)`);
    while (true) {
      // Use bash /dev/tcp pseudo-device — works without nc being installed
      const ready = (() => {
        try {
          execSync("bash -c 'echo > /dev/tcp/localhost/8080'", { stdio: "ignore" });
          return true;
        } catch {
          return false;
        }
      })();
      if (ready) {
        core.info("mitmproxy is ready.");
        break;
      }
      if (Date.now() - startTime >= maxWaitMs) {
        // ── Diagnostics ──────────────────────────────────────────────────────
        core.info("=== mitmproxy startup diagnostics ===");

        // Is nc available?
        try {
          const ncPath = execSync("which nc 2>/dev/null || echo 'not found'", { encoding: "utf8" }).trim();
          core.info(`nc: ${ncPath}`);
        } catch {
          core.info("nc: not found");
        }

        // Is mitmdump running?
        try {
          const procs = execSync("pgrep -af mitmdump 2>/dev/null || echo 'no mitmdump process found'", { encoding: "utf8" }).trim();
          core.info(`mitmdump processes: ${procs}`);
        } catch {
          core.info("mitmdump processes: (pgrep not available)");
        }

        // What is listening on port 8080?
        try {
          const listeners = execSync("ss -ltnp 2>/dev/null | grep ':8080' || echo 'nothing listening on :8080'", { encoding: "utf8" }).trim();
          core.info(`port 8080 listeners: ${listeners}`);
        } catch {
          core.info("port 8080 listeners: (ss not available)");
        }

        // Last ~200 lines of proxy.log
        if (fs.existsSync("egress-logs/proxy.log")) {
          try {
            const tail = execSync("tail -200 egress-logs/proxy.log", { encoding: "utf8" });
            core.info("=== Last 200 lines of egress-logs/proxy.log ===");
            core.info(tail);
          } catch {
            core.info("egress-logs/proxy.log: could not read");
          }
        } else {
          core.info("egress-logs/proxy.log: file does not exist");
        }

        core.info("=== end diagnostics ===");
        throw new Error(`mitmproxy did not start within ${maxWaitSecs} seconds`);
      }
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      core.info(`Waiting for mitmproxy to start on port 8080... (${elapsed}s elapsed)`);
      await new Promise(r => setTimeout(r, pollMs));
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

