import fs from "fs";
import path from "path";

const htmlPath = "c:/Users/AmineKallel/Desktop/Senbioys/Velia-Ring-Sizing-prototype.html";
const out = path.resolve("public/velia");
fs.mkdirSync(out, { recursive: true });

const html = fs.readFileSync(htmlPath, "utf8");
const re = /data:image\/(png|jpeg|jpg|svg\+xml);base64,([A-Za-z0-9+/=]+)/g;
const urls = [];
let match;
while ((match = re.exec(html)) !== null) {
  urls.push({ mime: match[1], b64: match[2], len: match[0].length });
}

function save(name, u) {
  const ext = u.mime === "svg+xml" ? "svg" : u.mime === "jpeg" ? "jpg" : u.mime;
  const file = path.join(out, `${name}.${ext}`);
  fs.writeFileSync(file, Buffer.from(u.b64, "base64"));
  console.log("wrote", path.basename(file), fs.statSync(file).size);
}

// Known order from prototype scan
save("hero", urls[0]);
save("logo", urls[1]);
save("icon-user", urls[2]);
save("icon-bag", urls[3]);
save("stack-banner", urls[4]);
save("stack-ring-1", urls[5]);
save("stack-ring-2", urls[6]);
save("stack-ring-3", urls[7]);
save("icon-close", urls[8]);
save("icon-arrow", urls[9]);
save("icon-check", urls[10]);
save("icon-info-blue", urls[11]);
save("icon-info", urls[12]);
save("icon-amber", urls[13]);
save("ring-circle", urls[14]);
save("why-ring", urls[15]);
save("kit", urls[16]);

console.log("done", urls.length);
