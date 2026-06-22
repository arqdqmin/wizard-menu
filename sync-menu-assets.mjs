import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoPath = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(repoPath, "index.html");
const mediaRoot = path.join(repoPath, "assets", "menu-media");
const snapshotPath = path.join(repoPath, "assets", "menu-data.json");
const manifestPath = path.join(mediaRoot, "manifest.json");

const html = await readFile(indexPath, "utf8");
const supabaseUrl = html.match(/const SUPABASE_URL = "([^"]+)"/)?.[1];
const supabaseKey = html.match(/const SUPABASE_KEY = "([^"]+)"/)?.[1];

if (!supabaseUrl || !supabaseKey) {
  throw new Error("No se encontro la configuracion de Supabase en index.html.");
}

const headers = {
  apikey: supabaseKey,
  Authorization: `Bearer ${supabaseKey}`,
};

async function getRows(endpoint) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${endpoint}`, { headers });
  if (!response.ok) throw new Error(`Supabase respondio ${response.status}`);
  return response.json();
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function syncImage(item, kind) {
  if (!item.img_url) return null;

  const fileName = decodeURIComponent(new URL(item.img_url).pathname.split("/").pop());
  const folder = path.join(mediaRoot, kind);
  const destination = path.join(folder, fileName);
  await mkdir(folder, { recursive: true });

  if (!(await fileExists(destination))) {
    const response = await fetch(item.img_url);
    if (!response.ok) throw new Error(`No se pudo descargar ${item.img_url}`);
    await writeFile(destination, new Uint8Array(await response.arrayBuffer()));
  }

  const bytes = (await stat(destination)).size;
  return {
    item: { ...item, img_url: `assets/menu-media/${kind}/${fileName}` },
    file: { kind, id: String(item.id), file: fileName, bytes },
  };
}

const [categories, productRows, bannerRows] = await Promise.all([
  getRows("categories?select=*&order=position"),
  getRows("products?select=*&order=position"),
  getRows("banners?select=*&order=position"),
]);

const productResults = [];
for (const product of productRows) productResults.push(await syncImage(product, "products"));

const bannerResults = [];
for (const banner of bannerRows) bannerResults.push(await syncImage(banner, "banners"));

const generatedAt = new Date().toISOString();
const products = productResults.map((result, index) => result?.item ?? productRows[index]);
const banners = bannerResults.map((result, index) => result?.item ?? bannerRows[index]);
const files = [...productResults, ...bannerResults].filter(Boolean).map((result) => result.file);

await writeFile(snapshotPath, `${JSON.stringify({ generated_at: generatedAt, categories, products, banners }, null, 2)}\n`, "utf8");
await writeFile(manifestPath, `${JSON.stringify({ generated_at: generatedAt, files }, null, 2)}\n`, "utf8");

const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
console.log(`Menu sincronizado: ${products.length} productos, ${banners.length} banners, ${(totalBytes / 1048576).toFixed(2)} MB.`);
