![DSH 中的 llama.cpp](preview.png)

## 在 DeepSeek Harness 里，直接用你电脑上的模型。

llama.cpp 让本地模型像其他模型一样，在 DSH 中随选随用。打开 DSH，它就已经就绪；关掉 DSH，它也随之退出。选中一个模型，它会自动加载。模型无需手动管理。无需联网，无需密钥，你的对话只留在这台电脑上。

## 开始之前

先安装 llama.cpp。

- **macOS**：打开「终端」，运行
  `curl -LsSf https://llama.app/install.sh | sh`
- **Windows**：打开 PowerShell，运行
  `irm https://llama.app/install.ps1 | iex`

安装完成后，重新打开 DSH。

## 添加 llama.cpp

1. 前往「设置」>「模型」，点按「添加模型供应商」。
2. 在「第三方模型供应商」中选择 **llama.cpp**。
3. 点按「获取可用模型」，然后点按「保存」。

就这么简单。现在，在任意会话的模型列表里选择 llama.cpp 下的模型，即可开始对话。

## 小提示

- 添加或编辑 llama.cpp 时，卡片上会告诉你 llama.cpp 是否已就绪。如果还没安装，这里也会告诉你该怎么做。
- 想调整模型参数？编辑 llama.cpp 的 `models.user.ini` 文件即可，llama.cpp 会自动读取。
- 插件会自动查找系统中已安装的 llama.cpp。想用别的 `llama-server`（或 `llama`），把环境变量 `LLAMA_SERVER_PATH` 设为它的完整路径，再重新打开 DSH。卡片上会显示当前用的是哪个文件。
- 模型放在别的文件夹？把环境变量 `LLAMA_ARG_MODELS_DIR` 设为这个文件夹，再重新打开 DSH。里面的模型会和已下载的模型一起显示。
- 想用别的模型预设文件？把环境变量 `LLAMA_ARG_MODELS_PRESET` 设为它的完整路径，再重新打开 DSH。插件会改用它，不再读取 `models.user.ini`。
- 安装插件后，如果在「第三方模型供应商」里找不到 llama.cpp，请重新打开 DSH。
- 想让 llama.cpp 卡片旁亮起绿点？在卡片上随便填一个 API 密钥即可。本地模型并不需要密钥，填不填都能正常使用。
