const core = require("@actions/core");
const { execSync } = require("child_process");
const fs = require("fs");

async function run() {
  try {
    const allowedDomains = core.getInput("allowed_domains") || "";
    const allowedIps = core.getInput("allowed_ips") || "";
    const block = core.getInput("block") || "false";

    fs.mkdirSync("egress-logs", { recursive: true });

    execSync("pip install mitmproxy", { stdio: "inherit" });
    execSync("sudo apt-get update", { stdio: "inherit" });
    execSync("sudo apt-get install -y dnsutils", { stdio: "inherit" });

    execSync(
      "nohup bash -c 'while true; do cat /proc/net/udp > egress-logs/dns.log; sleep 2; done' &"
    );

    execSync(
      "nohup bash -c 'while true; do ss -tupn >> egress-logs/sockets.log; sleep 2; done' &"
    );

    process.env.ALLOWED_DOMAINS = allowedDomains;
    process.env.ALLOWED_IPS = allowedIps;
    process.env.BLOCK = block;

    execSync(
      "nohup mitmdump -s $GITHUB_ACTION_PATH/proxy.py --listen-port 8080 > egress-logs/proxy.log 2>&1 &"
    );

    fs.appendFileSync(
      process.env.GITHUB_ENV,
      "HTTP_PROXY=http://localhost:8080\n"
    );
    fs.appendFileSync(
      process.env.GITHUB_ENV,
      "HTTPS_PROXY=http://localhost:8080\n"
    );
    fs.appendFileSync(
      process.env.GITHUB_ENV,
      `NODE_OPTIONS=--require ${process.env.GITHUB_ACTION_PATH}/node-shim.js\n`
    );
  } catch (err) {
    core.setFailed(err.message);
  }
}

run();
