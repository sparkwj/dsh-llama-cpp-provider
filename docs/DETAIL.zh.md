在 DSH 里直接用你电脑上的本地模型。打开 DSH 时 llama.cpp 自动启动，关掉 DSH 时一起退出。选中模型就会自动加载，无需联网，无需密钥。

## 开始使用

1. 安装 llama.cpp，然后重新打开 DSH。
   - **macOS**：`curl -LsSf https://llama.app/install.sh | sh`
   - **Windows**（PowerShell）：`irm https://llama.app/install.ps1 | iex`
2. 前往「设置」>「模型」>「添加模型供应商」，在「第三方模型供应商」中选择 **llama.cpp**。
3. 点按「获取可用模型」，然后点按「保存」。

想调整模型参数，编辑 llama.cpp 的 `models.user.ini`，改完自动生效。

环境变量、常见问题等更多说明：[GitHub](https://github.com/sparkwj/dsh-llama-cpp-provider#readme)
