fetch("http://localhost:3000/api/rss/fetch?url=https://www.hurriyet.com.tr/rss/ekonomi")
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data).substring(0,200)))
  .catch(console.error);
