async page => {
  const rows = [
    [4, 9.5], [5, 4], [11, 9], [12, 8], [13, 10], [24, 8.8], [34, 7], [67, 9], [68, 9.3], [97, 7],
    [382, 6.9], [430, 7], [515, 9.5], [548, 10], [562, 10], [777, 8], [810, 8.5], [914, 8.8], [2002, 9.3], [2016, 10],
    [2153, 9.3], [3144, 10], [4060, 6], [4707, 7], [5691, 6], [5922, 9.3], [6540, 8], [7771, 10], [9047, 6.5], [12402, 8.5],
    [14267, 8.5], [15395, 9], [15538, 4], [16493, 9], [16743, 4], [17012, 10], [17102, 7.6], [17763, 5], [17909, 9], [18152, 9],
    [18397, 7.5], [18713, 2], [19151, 7], [19545, 9.3], [20431, 10], [21667, 9.5], [21905, 1], [22020, 5], [23407, 7], [27747, 5],
  ];
  await page.evaluate(async (source) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("youjian-local", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const profiles = await new Promise((resolve, reject) => {
      const request = db.transaction("profiles").objectStore("profiles").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const profileId = profiles[0].id;
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("ratings", "readwrite");
      const store = transaction.objectStore("ratings");
      for (const [vndbId, score] of source) {
        const entry = { vndbId, title: `v${vndbId}`, score, status: "finished", source: "manual", updatedAt: new Date().toISOString() };
        store.put({ key: `${profileId}:${vndbId}`, profileId, entry });
      }
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, rows);
  await page.reload();
  await page.getByRole("button", { name: "推荐", exact: true }).click();
  const button = page.getByRole("button", { name: "重新生成" });
  const started = Date.now();
  await button.click();
  await page.getByRole("button", { name: "重新生成" }).waitFor();
  return { elapsedMs: Date.now() - started, cards: await page.locator(".recommendation-card").count() };
}
