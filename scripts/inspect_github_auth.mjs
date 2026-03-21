import { execSync } from "node:child_process";
import https from "node:https";

const credRaw = execSync('printf "protocol=https\\nhost=github.com\\n\\n" | git credential fill', { encoding: "utf8" });
const token = credRaw.split("\n").find((x) => x.startsWith("password="))?.split("=")[1]?.trim();

const request = (path) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.github.com",
        path,
        method: "GET",
        headers: {
          "User-Agent": "ekonomi-deploy-script",
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if ((res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`status:${res.statusCode}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });

const user = await request("/user");
const repos = await request("/user/repos?per_page=100&sort=created");
const ekonomi = repos.find((r) => r.name === "ekonomi");
console.log(`login:${user.login}`);
console.log(`repo:${ekonomi ? ekonomi.html_url : "not-found"}`);
