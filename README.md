# GAL鉴赏

浏览器本地运行的 Galgame 评分推荐系统。

## 本地启动

```powershell
npm install
npm run dev
```

## 训练

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -e ".[test]"
.venv\Scripts\python -m galrec.cli audit --archive .data\vndb-db-latest.tar.zst --votes .data\vndb-votes-latest.gz
.venv\Scripts\python -m galrec.cli build-all --archive .data\vndb-db-latest.tar.zst --votes .data\vndb-votes-latest.gz --connector .data\vndb-id-connector.json --output artifacts\full
```

