from mitmproxy import http, ctx
import os

allowed_domains = os.getenv("ALLOWED_DOMAINS", "").split()
allowed_ips = os.getenv("ALLOWED_IPS", "").split()
block = os.getenv("BLOCK", "false").lower() == "true"

def request(flow: http.HTTPFlow):
    host = flow.request.host
    ip = flow.server_conn.ip_address

    allowed = False

    if any(host.endswith(d) for d in allowed_domains):
        allowed = True
    if ip and ip[0] in allowed_ips:
        allowed = True

    log = f"{flow.request.method} {flow.request.pretty_url} host={host} ip={ip} allowed={allowed}"
    ctx.log.info(log)

    with open("egress-logs/http.log", "a") as f:
        f.write(log + "\n")

    if block and not allowed:
        flow.response = http.Response.make(
            403,
            b"Blocked by egress shield",
            {"Content-Type": "text/plain"}
        )
