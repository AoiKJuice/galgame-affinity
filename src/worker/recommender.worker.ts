/// <reference lib="webworker" />

import type { CatalogEntry, LibraryEntry, Recommendation, WorkerPackage, WorkerRequest, WorkerResponse } from "../model/types";

interface DenseVectors {
  ids: Uint32Array;
  scales: Float32Array;
  values: Int8Array;
  dimensions: number;
  index: Map<number, number>;
}

interface MfVectors extends DenseVectors {
  calibration: number;
}

interface ExplicitIndex {
  itemIds: Uint32Array;
  itemMap: Map<number, number>;
  userOffsets: Uint32Array;
  userItems: Uint32Array;
  userValues: Float32Array;
  itemOffsets: Uint32Array;
  itemUsers: Uint32Array;
  itemValues: Float32Array;
  iuf: Float32Array;
  surprise: Float32Array;
}

interface DemoExplicit {
  users: Array<{ ratings: Record<string, number> }>;
}

const state: {
  catalog: CatalogEntry[];
  catalogMap: Map<number, CatalogEntry>;
  explicit: ExplicitIndex | null;
  explicitMf: MfVectors | null;
  demoExplicit: DemoExplicit | null;
  implicit: DenseVectors | null;
  content: DenseVectors | null;
} = {
  catalog: [],
  catalogMap: new Map(),
  explicit: null,
  explicitMf: null,
  demoExplicit: null,
  implicit: null,
  content: null,
};

const textDecoder = new TextDecoder();

function parseJson<T>(buffer: ArrayBuffer): T {
  return JSON.parse(textDecoder.decode(buffer)) as T;
}

function expectMagic(view: DataView, expected: string): void {
  const actual = textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset, 8));
  if (actual !== expected) throw new Error(`模型文件标识错误: ${actual}`);
}

function parseExplicit(buffer: ArrayBuffer): ExplicitIndex {
  const view = new DataView(buffer);
  expectMagic(view, "GALAFF01");
  let offset = 8;
  const version = view.getUint32(offset, true); offset += 4;
  if (version !== 1) throw new Error("显式模型版本不受支持");
  const users = view.getUint32(offset, true); offset += 4;
  const items = view.getUint32(offset, true); offset += 4;
  const ratings = view.getUint32(offset, true); offset += 4;
  const take = <T extends Uint32Array | Float32Array>(ctor: { new(buffer: ArrayBuffer, byteOffset: number, length: number): T }, length: number): T => {
    const value = new ctor(buffer, offset, length);
    offset += length * 4;
    return value;
  };
  const itemIds = take(Uint32Array, items);
  const index: ExplicitIndex = {
    itemIds,
    itemMap: new Map(Array.from(itemIds, (id, itemIndex) => [id, itemIndex])),
    userOffsets: take(Uint32Array, users + 1),
    userItems: take(Uint32Array, ratings),
    userValues: take(Float32Array, ratings),
    itemOffsets: take(Uint32Array, items + 1),
    itemUsers: take(Uint32Array, ratings),
    itemValues: take(Float32Array, ratings),
    iuf: take(Float32Array, items),
    surprise: take(Float32Array, items * 3),
  };
  return index;
}

function parseVectors(buffer: ArrayBuffer, magic: string): DenseVectors {
  const view = new DataView(buffer);
  expectMagic(view, magic);
  const version = view.getUint32(8, true);
  if (version !== 1) throw new Error("向量模型版本不受支持");
  const count = view.getUint32(12, true);
  const dimensions = view.getUint32(16, true);
  const ids = new Uint32Array(buffer, 20, count);
  const scales = new Float32Array(buffer, 20 + count * 4, count);
  const values = new Int8Array(buffer, 20 + count * 8, count * dimensions);
  return { ids, scales, values, dimensions, index: new Map(Array.from(ids, (id, index) => [id, index])) };
}

function parseMfVectors(buffer: ArrayBuffer): MfVectors {
  const view = new DataView(buffer);
  expectMagic(view, "GALMFX01");
  const version = view.getUint32(8, true);
  if (version !== 1) throw new Error("显式 MF 模型版本不受支持");
  const count = view.getUint32(12, true);
  const dimensions = view.getUint32(16, true);
  const calibration = view.getFloat32(20, true);
  const ids = new Uint32Array(buffer, 24, count);
  const scales = new Float32Array(buffer, 24 + count * 4, count);
  const values = new Int8Array(buffer, 24 + count * 8, count * dimensions);
  return { ids, scales, values, dimensions, calibration, index: new Map(Array.from(ids, (id, index) => [id, index])) };
}

function parseJsonVectors(buffer: ArrayBuffer): DenseVectors {
  const payload = parseJson<{ vectors: Record<string, number[]> }>(buffer);
  const entries = Object.entries(payload.vectors);
  const dimensions = entries[0]?.[1].length || 0;
  const ids = new Uint32Array(entries.map(([id]) => Number(id)));
  const scales = new Float32Array(entries.length);
  const values = new Int8Array(entries.length * dimensions);
  entries.forEach(([, vector], index) => {
    const scale = Math.max(...vector.map((value) => Math.abs(value)), 1e-8) / 127;
    scales[index] = scale;
    vector.forEach((value, dimension) => { values[index * dimensions + dimension] = Math.round(value / scale); });
  });
  return { ids, scales, values, dimensions, index: new Map(Array.from(ids, (id, index) => [id, index])) };
}

function vectorAt(model: DenseVectors, index: number): Float32Array {
  const vector = new Float32Array(model.dimensions);
  const start = index * model.dimensions;
  for (let dimension = 0; dimension < model.dimensions; dimension += 1) {
    vector[dimension] = model.values[start + dimension] * model.scales[index];
  }
  return vector;
}

function cosine(left: Float32Array, right: Float32Array): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return dot / Math.max(Math.sqrt(leftNorm * rightNorm), 1e-8);
}

function profileVector(model: DenseVectors, ratings: LibraryEntry[], hidden: Set<number>): Float32Array | null {
  const result = new Float32Array(model.dimensions);
  let weightSum = 0;
  for (const entry of ratings) {
    if (entry.score === null) continue;
    const index = model.index.get(entry.vndbId);
    if (index === undefined) continue;
    const weight = Math.max(entry.score - 5.5, 0);
    if (weight <= 0) continue;
    const vector = vectorAt(model, index);
    for (let dimension = 0; dimension < result.length; dimension += 1) result[dimension] += vector[dimension] * weight;
    weightSum += weight;
  }
  for (const id of hidden) {
    const index = model.index.get(id);
    if (index === undefined) continue;
    const vector = vectorAt(model, index);
    const weight = 2.5;
    for (let dimension = 0; dimension < result.length; dimension += 1) result[dimension] -= vector[dimension] * weight;
    weightSum += weight;
  }
  if (!weightSum) return null;
  for (let dimension = 0; dimension < result.length; dimension += 1) result[dimension] /= weightSum;
  return result;
}

function explicitFromDemo(ratings: LibraryEntry[], hidden: Set<number>): Map<number, { prediction: number; support: number }> {
  const valid = ratings.filter((entry) => entry.score !== null);
  const seen = new Set(ratings.map((entry) => entry.vndbId));
  if (valid.length < 2 || !state.demoExplicit) return new Map();
  const mean = valid.reduce((sum, entry) => sum + (entry.score || 0), 0) / valid.length;
  const scale = Math.max(Math.sqrt(valid.reduce((sum, entry) => sum + ((entry.score || 0) - mean) ** 2, 0) / valid.length), 0.5);
  const target = new Map(valid.map((entry) => [entry.vndbId, ((entry.score || 0) - mean) / scale]));
  const neighbors: Array<{ similarity: number; ratings: Record<string, number>; mean: number; scale: number }> = [];
  for (const user of state.demoExplicit.users) {
    const values = Object.values(user.ratings);
    const userMean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
    const userScale = Math.max(Math.sqrt(values.reduce((sum, value) => sum + (value - userMean) ** 2, 0) / Math.max(values.length, 1)), 0.5);
    let dot = 0;
    let left = 0;
    let right = 0;
    let overlap = 0;
    for (const [id, residual] of target) {
      const score = user.ratings[String(id)];
      if (score === undefined) continue;
      const other = (score - userMean) / userScale;
      dot += residual * other;
      left += residual ** 2;
      right += other ** 2;
      overlap += 1;
    }
    if (overlap < 2) continue;
    const similarity = dot / Math.max(Math.sqrt(left * right), 1e-8) * overlap / (overlap + 3);
    if (similarity > 0) neighbors.push({ similarity, ratings: user.ratings, mean: userMean, scale: userScale });
  }
  neighbors.sort((a, b) => b.similarity - a.similarity);
  const scores = new Map<number, { weighted: number; total: number; support: number }>();
  for (const neighbor of neighbors.slice(0, 50)) {
    for (const [rawId, score] of Object.entries(neighbor.ratings)) {
      const id = Number(rawId);
      if (seen.has(id) || hidden.has(id)) continue;
      const current = scores.get(id) || { weighted: 0, total: 0, support: 0 };
      current.weighted += neighbor.similarity * ((score - neighbor.mean) / neighbor.scale);
      current.total += neighbor.similarity;
      current.support += 1;
      scores.set(id, current);
    }
  }
  return new Map(Array.from(scores, ([id, value]) => [id, { prediction: value.weighted / Math.max(value.total, 1e-8), support: value.support }]));
}

function explicitFromBinary(ratings: LibraryEntry[], hidden: Set<number>): Map<number, { prediction: number; support: number }> {
  const model = state.explicit;
  if (!model) return new Map();
  const valid = ratings.filter((entry) => entry.score !== null && model.itemMap.has(entry.vndbId));
  if (valid.length < 3) return new Map();
  const mean = valid.reduce((sum, entry) => sum + (entry.score || 0), 0) / valid.length;
  const scale = Math.max(Math.sqrt(valid.reduce((sum, entry) => sum + ((entry.score || 0) - mean) ** 2, 0) / valid.length), 0.5);
  const userStats = new Map<number, { dot: number; left: number; right: number; overlap: number }>();
  for (const entry of valid) {
    const item = model.itemMap.get(entry.vndbId) as number;
    const targetResidual = ((entry.score || 0) - mean) / scale;
    const targetBucket = targetResidual <= -0.75 ? 0 : targetResidual >= 0.75 ? 2 : 1;
    for (let position = model.itemOffsets[item]; position < model.itemOffsets[item + 1]; position += 1) {
      const user = model.itemUsers[position];
      const other = model.itemValues[position];
      const otherBucket = other <= -0.75 ? 0 : other >= 0.75 ? 2 : 1;
      // Arrays are kept in the artifact for reproducible experiments. The current
      // model card selects mean-centered UserKNN, so event rarity is disabled.
      const rare = 1 + 0 * (model.iuf[item] + model.surprise[item * 3 + targetBucket] + model.surprise[item * 3 + otherBucket]);
      const current = userStats.get(user) || { dot: 0, left: 0, right: 0, overlap: 0 };
      current.dot += rare * targetResidual * other;
      current.left += rare * targetResidual ** 2;
      current.right += rare * other ** 2;
      current.overlap += 1;
      userStats.set(user, current);
    }
  }
  const neighbors = Array.from(userStats, ([user, value]) => ({
    user,
    similarity: value.dot / Math.max(Math.sqrt(value.left * value.right), 1e-8) * value.overlap / (value.overlap + 10),
  })).filter((value) => value.similarity > 0).sort((a, b) => b.similarity - a.similarity).slice(0, 100);

  const seen = new Set(ratings.map((entry) => entry.vndbId));
  const candidates = new Map<number, { weighted: number; total: number; support: number }>();
  for (const neighbor of neighbors) {
    for (let position = model.userOffsets[neighbor.user]; position < model.userOffsets[neighbor.user + 1]; position += 1) {
      const itemIndex = model.userItems[position];
      const id = model.itemIds[itemIndex];
      if (seen.has(id) || hidden.has(id)) continue;
      const current = candidates.get(id) || { weighted: 0, total: 0, support: 0 };
      current.weighted += neighbor.similarity * model.userValues[position];
      current.total += Math.abs(neighbor.similarity);
      current.support += 1;
      candidates.set(id, current);
    }
  }
  return new Map(Array.from(candidates, ([id, value]) => [id, { prediction: value.weighted / Math.max(value.total, 1e-8), support: value.support }]));
}

function matchedTags(item: CatalogEntry, ratings: LibraryEntry[]): string[] {
  const liked = ratings.filter((entry) => (entry.score || 0) >= 8).map((entry) => state.catalogMap.get(entry.vndbId)).filter(Boolean) as CatalogEntry[];
  const counts = new Map<string, number>();
  for (const source of liked) for (const tag of source.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  return (item.tags || []).filter((tag) => counts.has(tag)).sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0)).slice(0, 3);
}

function vectorScores(model: DenseVectors | null, ratings: LibraryEntry[], hidden: Set<number>, excluded: Set<number>): Map<number, number> {
  if (!model) return new Map();
  const profile = profileVector(model, ratings, hidden);
  if (!profile) return new Map();
  const result = new Map<number, number>();
  for (let index = 0; index < model.ids.length; index += 1) {
    const id = model.ids[index];
    if (excluded.has(id)) continue;
    result.set(id, cosine(profile, vectorAt(model, index)));
  }
  return result;
}

function mfScores(model: MfVectors | null, ratings: LibraryEntry[], excluded: Set<number>): Map<number, number> {
  if (!model) return new Map();
  const valid = ratings.filter((entry) => entry.score !== null && model.index.has(entry.vndbId));
  if (valid.length < 5) return new Map();
  const mean = valid.reduce((sum, entry) => sum + (entry.score || 0), 0) / valid.length;
  const scale = Math.max(Math.sqrt(valid.reduce((sum, entry) => sum + ((entry.score || 0) - mean) ** 2, 0) / valid.length), 0.5);
  const profile = new Float32Array(model.dimensions);
  for (const entry of valid) {
    const vector = vectorAt(model, model.index.get(entry.vndbId) as number);
    const residual = ((entry.score || 0) - mean) / scale;
    for (let dimension = 0; dimension < profile.length; dimension += 1) profile[dimension] += vector[dimension] * residual;
  }
  const result = new Map<number, number>();
  for (let index = 0; index < model.ids.length; index += 1) {
    const id = model.ids[index];
    if (excluded.has(id)) continue;
    const vector = vectorAt(model, index);
    let score = 0;
    for (let dimension = 0; dimension < profile.length; dimension += 1) score += profile[dimension] * vector[dimension];
    result.set(id, score * model.calibration);
  }
  return result;
}

function recommend(ratings: LibraryEntry[], hiddenIds: number[], limit: number): Recommendation[] {
  const hidden = new Set(hiddenIds);
  const excluded = new Set([...hiddenIds, ...ratings.map((entry) => entry.vndbId)]);
  const finished = new Set(ratings.filter((entry) => entry.status === "finished").map((entry) => entry.vndbId));
  const explicit = state.explicit ? explicitFromBinary(ratings, hidden) : explicitFromDemo(ratings, hidden);
  const mf = mfScores(state.explicitMf, ratings, excluded);
  const implicit = vectorScores(state.implicit, ratings, hidden, excluded);
  const content = vectorScores(state.content, ratings, hidden, excluded);
  const candidateIds = new Set([...explicit.keys(), ...mf.keys(), ...implicit.keys(), ...content.keys()]);
  const results: Recommendation[] = [];
  for (const id of candidateIds) {
    const item = state.catalogMap.get(id);
    if (!item || excluded.has(id)) continue;
    if (item.relations.some((relation) => relation.official && relation.type === "preq" && !finished.has(relation.target))) continue;
    const evidence = explicit.get(id);
    const explore = 0.65 * (implicit.get(id) || 0) + 0.35 * (content.get(id) || 0);
    const mfPrediction = mf.get(id);
    const hasAffinity = Boolean(evidence && evidence.support >= 5);
    const calibratedPreference = mfPrediction ?? evidence?.prediction ?? 0;
    const affinity = hasAffinity ? Math.round(Math.max(0, Math.min(100, 50 + calibratedPreference * 15))) : null;
    const support = evidence?.support || 0;
    results.push({
      item,
      affinity,
      confidence: hasAffinity ? (support >= 20 ? "high" : support >= 8 ? "medium" : "low") : "explore",
      support,
      score: hasAffinity ? (mfPrediction ?? evidence?.prediction ?? 0) + explore * 0.05 : explore + (mfPrediction || 0) * 0.1,
      matchedTags: matchedTags(item, ratings),
      source: hasAffinity ? "explicit" : "explore",
    });
  }
  const formal = results.filter((value) => value.source === "explicit").sort((left, right) => right.score - left.score);
  const exploration = results.filter((value) => value.source === "explore").sort((left, right) => right.score - left.score);
  const explorationSlots = Math.min(8, exploration.length, Math.max(0, limit - Math.min(formal.length, limit)) || 8);
  const formalSlots = Math.max(0, limit - explorationSlots);
  return [...formal.slice(0, formalSlots), ...exploration.slice(0, explorationSlots)];
}

function initialize(packages: WorkerPackage[]): void {
  for (const pkg of packages) {
    if (pkg.id === "catalog") {
      state.catalog = parseJson<CatalogEntry[]>(pkg.data);
      state.catalogMap = new Map(state.catalog.map((item) => [item.id, item]));
    } else if (pkg.id === "content-tags") {
      const tags = parseJson<Record<string, string[]>>(pkg.data);
      for (const item of state.catalog) item.tags = tags[String(item.id)] || item.tags || [];
    } else if (pkg.id === "explicit-knn") {
      if (pkg.format === "binary") state.explicit = parseExplicit(pkg.data);
      else state.demoExplicit = parseJson<DemoExplicit>(pkg.data);
    } else if (pkg.id === "explicit-mf") {
      state.explicitMf = parseMfVectors(pkg.data);
    } else if (pkg.id === "implicit-recall") {
      state.implicit = pkg.format === "binary" ? parseVectors(pkg.data, "GALIMP01") : parseJsonVectors(pkg.data);
    } else if (pkg.id === "content-graph") {
      state.content = pkg.format === "binary" ? parseVectors(pkg.data, "GALCON01") : parseJsonVectors(pkg.data);
    }
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  try {
    const message = event.data;
    if (message.type === "init") {
      initialize(message.packages);
      self.postMessage({ type: "ready", catalog: state.catalog } satisfies WorkerResponse);
    } else {
      const results = recommend(message.ratings, message.hidden, message.limit);
      self.postMessage({ type: "recommendations", requestId: message.requestId, results } satisfies WorkerResponse);
    }
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : "推荐计算失败" } satisfies WorkerResponse);
  }
};
