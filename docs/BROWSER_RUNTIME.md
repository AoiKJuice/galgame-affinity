# 浏览器本地运行

模型清单把 `catalog`、`explicit-mf`、`explicit-knn`、`implicit-recall` 和 `content-graph` 分别发布。每个文件按 12 MiB 分块，清单记录分块 SHA-256、完整文件 SHA-256、压缩后大小和解压后大小。

浏览器安装过程：

1. 下载 `manifest.json`。
2. 逐块下载并校验 SHA-256。
3. JSON 包使用原生 `DecompressionStream` 解压。
4. 完整文件再次校验。
5. 写入 IndexedDB。
6. 全部成功后更新活动模型版本。

推荐计算在独立 Web Worker 内完成。显式模型二进制数组直接映射为 TypedArray，主线程只接收最终推荐列表。用户资料、评分、想玩和不感兴趣记录保存在 IndexedDB，不发送到模型托管站点。不感兴趣作品同时作为内容向量负反馈参与下一次候选计算。

作品搜索使用本地完整目录立即返回结果，同时由浏览器直连 VNDB Kana API 补充别名结果。作品详情、厂商和封面更新同样由浏览器直接读取 VNDB；应用服务器只提供前端静态文件，不代理这些请求，也不保存响应。

当前计算核心是 TypedArray JavaScript Web Worker，并非 WebAssembly。50 条评分、完整模型的本机 Chrome 实测为 821 ms；WASM 优化尚未实现。

浏览器存储可能被用户清理。正式发布前需要增加资料导出与导入，并在安装完整模型前调用 `navigator.storage.estimate()` 检查剩余空间。
