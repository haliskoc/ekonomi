import { execSync } from "node:child_process";
import https from "node:https";

const credRaw = execSync('printf "protocol=https\\nhost=github.com\\n\\n" | git credential fill', { encoding: "utf8" });
const username = credRaw.split("\n").find((x) => x.startsWith("username="))?.split("=")[1]?.trim();
const token = credRaw.split("\n").find((x) => x.startsWith("password="))?.split("=")[1]?.trim();

if (!username || !token) {
  console.error("missing-github-credentials");
  process.exit(1);
}

const payload = JSON.stringify({
  name: "ekonomi",
  private: false,
  description: "Ekonomi market and RSS analysis app",
});

const req = https.request(
  {
    hostname: "api.github.com",
    path: "/user/repos",
    method: "POST",
    headers: {
      "User-Agent": "ekonomi-deploy-script",
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
  },
  (res) => {
    let data = "";
    res.on("data", (chunk) => {
      data += chunk;
    });
    res.on("end", () => {
      if (res.statusCode === 201 || res.statusCode === 422) {
        console.log(`repo-ready:${res.statusCode}`);
        process.exit(0);
      }

      console.error(`repo-create-failed:${res.statusCode}`);
      process.exit(1);
    });
  }
);

req.on("error", (err) => {
  console.error(`repo-create-error:${err.message}`);
  process.exit(1);
});

req.write(payload);
req.end();
