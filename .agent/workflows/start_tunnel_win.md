---
description: Start Cloudflare Tunnel for Public Access
---

This workflow starts a Cloudflare Quick Tunnel to expose the local development server (port 3000) to the public internet securely (HTTPS).

1. Check if `bin/cloudflared.exe` exists. If not, refer to the conversation history to download it.

2. Run the tunnel command:
// turbo
   ```powershell
   .\bin\cloudflared.exe tunnel --url http://localhost:3000
   ```

3. Look for the `trycloudflare.com` URL in the output.
