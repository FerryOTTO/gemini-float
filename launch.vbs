Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "e:\create\gemini"
sh.Run """C:\Program Files\nodejs\node.exe"" ""e:\create\gemini\start.cjs""", 0, False