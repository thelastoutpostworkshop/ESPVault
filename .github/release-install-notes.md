## Install ESP Board Vault

Download the installer for your operating system. The `.blockmap`, `latest*.yml`, and `builder-debug.yml` files are release metadata and are not needed for a manual install.

### Windows

1. Download the [Windows x64 installer](https://github.com/{{REPOSITORY}}/releases/download/{{TAG_NAME}}/ESP.Board.Vault-{{VERSION}}-windows-x64.exe).
2. Run the installer and follow the prompts.
3. If Windows SmartScreen warns that the app is unrecognized, choose **More info** and then **Run anyway** if you trust this release.

Portable option: download the [Windows x64 portable zip](https://github.com/{{REPOSITORY}}/releases/download/{{TAG_NAME}}/ESP.Board.Vault-{{VERSION}}-windows-x64.zip), extract it, and run the app from the extracted folder.

### macOS

1. Download the [Apple Silicon DMG](https://github.com/{{REPOSITORY}}/releases/download/{{TAG_NAME}}/ESP.Board.Vault-{{VERSION}}-macos-arm64.dmg), or the [Intel Mac DMG](https://github.com/{{REPOSITORY}}/releases/download/{{TAG_NAME}}/ESP.Board.Vault-{{VERSION}}-macos-x64.dmg).
2. Open the `.dmg` file.
3. Drag **ESP Board Vault** into **Applications**.
4. Open the app from **Applications**.

If macOS blocks the app because it is not notarized, Control-click the app, choose **Open**, and confirm. You can also allow it from **System Settings > Privacy & Security**.

Portable option: download the [Apple Silicon zip](https://github.com/{{REPOSITORY}}/releases/download/{{TAG_NAME}}/ESP.Board.Vault-{{VERSION}}-macos-arm64.zip), or the [Intel Mac zip](https://github.com/{{REPOSITORY}}/releases/download/{{TAG_NAME}}/ESP.Board.Vault-{{VERSION}}-macos-x64.zip).

### Linux

Ubuntu or Debian:

1. Download the [Ubuntu/Debian package](https://github.com/{{REPOSITORY}}/releases/download/{{TAG_NAME}}/ESP.Board.Vault-{{VERSION}}-linux-amd64.deb).
2. Install it with your software installer, or run:

   ```bash
   sudo apt install ./ESP.Board.Vault-{{VERSION}}-linux-amd64.deb
   ```

Most Linux distributions:

1. Download the [Linux AppImage](https://github.com/{{REPOSITORY}}/releases/download/{{TAG_NAME}}/ESP.Board.Vault-{{VERSION}}-linux-x86_64.AppImage).
2. Make it executable and run it:

   ```bash
   chmod +x ESP.Board.Vault-{{VERSION}}-linux-x86_64.AppImage
   ./ESP.Board.Vault-{{VERSION}}-linux-x86_64.AppImage
   ```

Portable archive option: download the [Linux x64 tarball](https://github.com/{{REPOSITORY}}/releases/download/{{TAG_NAME}}/ESP.Board.Vault-{{VERSION}}-linux-x64.tar.gz), extract it, and run the app from the extracted folder.

### Source Code

The automatically generated **Source code (zip)** and **Source code (tar.gz)** downloads contain the project source for developers. They are not prebuilt desktop app installers.
