const n = 10;
const url = "http://localhost:8000/";

async function run() {
  const requests = Array.from({ length: n }, (_, i) =>
    fetch(url).then(res => console.log(`Request #${i + 1}: ${res.status}`))
  );

  await Promise.all(requests);
  console.log("All done!");
}

run();