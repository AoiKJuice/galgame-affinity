@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv py -3.12 -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install -e .
galrec download --output .data
galrec build-all --archive .data\vndb-db-latest.tar.zst --votes .data\vndb-votes-latest.gz --connector .data\vndb-id-connector.json --output artifacts\full --tier full --implicit svd
pause
