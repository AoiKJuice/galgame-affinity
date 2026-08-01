import tagTranslations from "../data/tag-zh.json";

const translations = tagTranslations as Record<string, string>;
const hiddenTags = new Set([
  "Japanese Production", "Chinese Production", "English Production", "Korean Production",
  "Sexual Content", "No Sexual Content", "ADV", "NVL", "Ren'Py", "Unity",
]);

export function localizeTag(tag: string): string | null {
  if (hiddenTags.has(tag)) return null;
  const decade = /^(\d{4})s$/.exec(tag);
  if (decade) return `${decade[1]}年代`;
  if (/\p{Script=Han}/u.test(tag)) return tag;
  const translated = translations[tag];
  if (!translated || /[A-Za-z]{3}/.test(translated)) return null;
  return translated;
}

export function localizeTags(tags: string[], limit = 8): string[] {
  const output: string[] = [];
  for (const tag of tags) {
    const translated = localizeTag(tag);
    if (translated && !output.includes(translated)) output.push(translated);
    if (output.length >= limit) break;
  }
  return output;
}
