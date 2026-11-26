Run the local models on your computer right inside DSH. llama.cpp starts when DSH opens and quits when DSH does. Pick a model and it loads automatically. No internet, no keys.

## Get started

1. Install llama.cpp, then reopen DSH.
   - **macOS**: `curl -LsSf https://llama.app/install.sh | sh`
   - **Windows** (PowerShell): `irm https://llama.app/install.ps1 | iex`
2. Go to Settings > Models > Add model provider, and choose **llama.cpp** under Third-party model provider.
3. Click Fetch available models, then click Save.

To tune a model, edit llama.cpp's `models.user.ini`; changes apply automatically.

Environment variables, troubleshooting and more: [GitHub](https://github.com/sparkwj/dsh-llama-cpp-provider#readme)
