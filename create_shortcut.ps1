$ws      = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$nodePath = (Get-Command node).Source

# 1. 动态生成带有 node.exe 和 start.cjs 绝对路径的 launch.vbs，解决 PATH 环境变量缺失问题
$vbsPath = "e:\create\gemini\launch.vbs"
$vbsContent = @"
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "e:\create\gemini"
sh.Run """$nodePath"" ""e:\create\gemini\start.cjs""", 0, False
"@
[System.IO.File]::WriteAllText($vbsPath, $vbsContent)

# 2. 创建桌面快捷方式，使用 wscript.exe 静默启动
$lnk = $ws.CreateShortcut("$desktop\Gemini Float.lnk")
$lnk.TargetPath       = "C:\Windows\System32\wscript.exe"
$lnk.Arguments        = "`"e:\create\gemini\launch.vbs`""
$lnk.WorkingDirectory = 'e:\create\gemini'
$lnk.IconLocation     = 'e:\create\gemini\icon.ico'
$lnk.Description      = 'Gemini Float'
$lnk.Save()
Write-Host "Rebuilt shortcut successfully (silent mode)"
