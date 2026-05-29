$env:HTTP_PROXY = "http://127.0.0.1:7897"
$env:HTTPS_PROXY = "http://127.0.0.1:7897"

# 第一步：正常构建（生成安装器但不含 PATH）
npm run tauri build

# 第二步：注入 PATH 逻辑并重新打包
npm run tauri:build:path