# 游鉴

浏览器本地运行的 Galgame 评分推荐系统。公开模型使用 VNDB 显式评分、公开收藏状态和完整作品关系构建；用户资料只保存在当前设备。

## 本地启动

```powershell
npm install
npm run dev
```

打开 `http://localhost:5173`。仓库内附带小型演示模型，完整模型由训练工具构建后发布为独立分块文件。Windows 也可双击 `启动游鉴.cmd`。

应用内“本地模型”页面可直接从 GitHub Releases 安装手机标准包或桌面完整包，无需手动解压。首次进入先安装仓库自带的演示包。

## 训练

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -e ".[test]"
.venv\Scripts\python -m galrec.cli audit --archive .data\vndb-db-latest.tar.zst --votes .data\vndb-votes-latest.gz
.venv\Scripts\python -m galrec.cli build-all --archive .data\vndb-db-latest.tar.zst --votes .data\vndb-votes-latest.gz --connector .data\vndb-id-connector.json --output artifacts\full
```

详细说明见 `docs/DATA.md`、`docs/MODEL_CARD.md`、`docs/evaluation-2000.json` 和 `docs/BROWSER_RUNTIME.md`。

完整浏览器模型性能复测可在安装完整模型并建立资料后执行：

```powershell
playwright-cli run-code --filename scripts/measure_full_browser.js
```

## 数据边界

- VNDB 数据库及转换产物遵循 ODbL 1.0 和 DbCL。
- 不分发 VNDB 简介和封面文件，浏览器按需读取远程封面。
- Bangumi 用户收藏只在用户设备上导入，不进入公共模型。
- Steam 与 ErogameScape 暂不进入公共模型。
- 应用不收集用户评分。
