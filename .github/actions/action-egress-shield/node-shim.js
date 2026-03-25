const net = require("net");
const tls = require("tls");
const fs = require("fs");

function log(msg) {
  fs.appendFileSync("egress-logs/node-sockets.log", msg + "\n");
}

const origNetConnect = net.connect;
net.connect = function (...args) {
  log("net.connect: " + JSON.stringify(args));
  return origNetConnect.apply(this, args);
};

const origTlsConnect = tls.connect;
tls.connect = function (...args) {
  log("tls.connect: " + JSON.stringify(args));
  return origTlsConnect.apply(this, args);
};
