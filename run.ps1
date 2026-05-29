# 按进程名查找
Get-Process -Name "llm-wiki"

# 或使用 tasklist 过滤
tasklist | findstr llm-wiki

# 查看更详细信息（PID、内存占用等）
Get-Process -Name "llm-wiki" | Format-Table Id, ProcessName, CPU, WorkingSet64, StartTime

# 在管理员终端中终止进程
taskkill /F /IM llm-wiki.exe

# 正常启动（不设置 LLM_WIKI_HEADLESS）
.\llm-wiki.exe

# LLM_WIKI_HEADLESS启动（设置 LLM_WIKI_HEADLESS）
# $env:LLM_WIKI_HEADLESS = "1"
# .\llm-wiki.exe
# # 显示窗口
# curl.exe -X POST http://127.0.0.1:19828/api/v1/window/show
# # 隐藏窗口
# curl.exe -X POST http://127.0.0.1:19828/api/v1/window/hide

# 查看监听端口
netstat -ano | Select-String "LISTENING" | Select-String "19827|19828|1420|5002|9010|9011|9012"