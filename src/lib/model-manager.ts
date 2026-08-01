import { activateModel, deleteModelShard, getActiveModel, getModelPackage, getModelShard, saveModelPackage, saveModelShard } from "./storage";
import type { CatalogEntry, ModelManifest, ModelPackage, WorkerPackage } from "../model/types";

export interface InstallProgress {
  packageId: string;
  received: number;
  total: number;
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function joinBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const length = buffers.reduce((sum, value) => sum + value.byteLength, 0);
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const buffer of buffers) {
    joined.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  return joined.buffer;
}

async function decompress(buffer: ArrayBuffer, compression: ModelPackage["compression"]): Promise<ArrayBuffer> {
  if (compression === "none") return buffer;
  if (!("DecompressionStream" in globalThis)) throw new Error("当前浏览器不支持 gzip 模型解压");
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

function parseCatalog(buffer: ArrayBuffer): CatalogEntry[] {
  return JSON.parse(new TextDecoder().decode(buffer)) as CatalogEntry[];
}

export async function loadSearchCatalog(manifestUrl: string): Promise<CatalogEntry[]> {
  const response = await fetch(manifestUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`作品目录下载失败 (${response.status})`);
  const manifest = (await response.json()) as ModelManifest;
  if (manifest.schemaVersion !== 1) throw new Error("作品目录格式版本不受支持");
  const catalogPackage = manifest.packages.find((pkg) => pkg.id === "catalog");
  if (!catalogPackage) throw new Error("模型清单缺少作品目录");

  const cached = await getModelPackage(manifest.modelVersion, "search-catalog");
  if (cached && cached.byteLength === catalogPackage.uncompressedSize && (await sha256(cached)) === catalogPackage.sha256) {
    return parseCatalog(cached);
  }

  const base = new URL(".", new URL(manifestUrl, window.location.href));
  const parts: ArrayBuffer[] = [];
  for (const shard of catalogPackage.shards) {
    const shardResponse = await fetch(new URL(shard.url, base), { cache: "no-store" });
    if (!shardResponse.ok) throw new Error(`作品目录下载失败 (${shardResponse.status})`);
    const bytes = await shardResponse.arrayBuffer();
    if (bytes.byteLength !== shard.size || (await sha256(bytes)) !== shard.sha256) throw new Error("作品目录分块校验失败");
    parts.push(bytes);
  }
  const unpacked = await decompress(joinBuffers(parts), catalogPackage.compression);
  if (unpacked.byteLength !== catalogPackage.uncompressedSize || (await sha256(unpacked)) !== catalogPackage.sha256) {
    throw new Error("作品目录完整性校验失败");
  }
  await saveModelPackage(manifest.modelVersion, "search-catalog", unpacked);
  return parseCatalog(unpacked);
}

export async function installModel(manifestUrl: string, onProgress?: (progress: InstallProgress) => void): Promise<ModelManifest> {
  const response = await fetch(manifestUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`模型清单下载失败 (${response.status})`);
  const manifest = (await response.json()) as ModelManifest;
  if (manifest.schemaVersion !== 1) throw new Error("模型格式版本不受支持");
  const base = new URL(".", new URL(manifestUrl, window.location.href));
  const total = manifest.packages.reduce((sum, value) => sum + value.compressedSize, 0);
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    const remaining = (estimate.quota || 0) - (estimate.usage || 0);
    if (estimate.quota && remaining < total * 1.35) throw new Error("浏览器剩余存储空间不足");
  }
  let received = 0;

  for (const pkg of manifest.packages) {
    const parts: ArrayBuffer[] = [];
    for (let shardIndex = 0; shardIndex < pkg.shards.length; shardIndex += 1) {
      const shard = pkg.shards[shardIndex];
      let bytes = await getModelShard(manifest.modelVersion, pkg.id, shardIndex);
      if (!bytes || bytes.byteLength !== shard.size || (await sha256(bytes)) !== shard.sha256) {
        const shardResponse = await fetch(new URL(shard.url, base), { cache: "no-store" });
        if (!shardResponse.ok) throw new Error(`${pkg.id} 下载失败 (${shardResponse.status})`);
        bytes = await shardResponse.arrayBuffer();
        if (bytes.byteLength !== shard.size || (await sha256(bytes)) !== shard.sha256) {
          throw new Error(`${pkg.id} 分块校验失败`);
        }
        await saveModelShard(manifest.modelVersion, pkg.id, shardIndex, bytes);
      }
      parts.push(bytes);
      received += bytes.byteLength;
      onProgress?.({ packageId: pkg.id, received, total });
    }
    const unpacked = await decompress(joinBuffers(parts), pkg.compression);
    if (unpacked.byteLength !== pkg.uncompressedSize || (await sha256(unpacked)) !== pkg.sha256) {
      throw new Error(`${pkg.id} 完整性校验失败`);
    }
    await saveModelPackage(manifest.modelVersion, pkg.id, unpacked);
    await Promise.all(pkg.shards.map((_, index) => deleteModelShard(manifest.modelVersion, pkg.id, index)));
  }
  await activateModel(manifest);
  return manifest;
}

export async function loadActivePackages(): Promise<{ manifest: ModelManifest; packages: WorkerPackage[] } | null> {
  const active = await getActiveModel();
  if (!active) return null;
  const packages: WorkerPackage[] = [];
  for (const pkg of active.manifest.packages) {
    const data = await getModelPackage(active.manifest.modelVersion, pkg.id);
    if (!data) throw new Error(`模型文件缺失: ${pkg.id}`);
    packages.push({ id: pkg.id, format: pkg.format, data });
  }
  return { manifest: active.manifest, packages };
}
