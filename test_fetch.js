const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
fetch("https://www.ntv.com.tr/ekonomi.rss", {
  headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*", "Accept-Language": "en-US,en;q=0.9,tr;q=0.8" },
  redirect: "follow",
})
.then(res => res.text())
.then(data => console.log("Status: ", data.substring(0, 100)))
.catch(console.error);
