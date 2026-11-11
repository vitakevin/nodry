# 自行打包

本项目已实际生成 macOS Apple Silicon、macOS Intel 的DMG，以及Windows x64的EXE安装程序。旧构建记录（历史身份已清理，请以当前构建为准）。

不需要AI API Key，不需要后端服务。默认生成测试安装包，Mac使用临时签名，Windows不配置发行签名。本地打包不要求购买开发者证书。

## 直接交给AI

把下面整段发送给能访问本地终端的AI开发工具：

```text
请将 https://github.com/vitakevin/stay-hydrated.git 克隆到本地，并根据当前电脑的操作系统生成“别太干巴了”的安装包。

先阅读仓库的 AGENTS.md、docs/BUILDING.md 和 docs/VERIFICATION.md。
检查当前电脑的操作系统与处理器架构，以及 Node.js 22、Rust stable 和平台原生编译环境。
补齐缺少的依赖后，用锁定依赖执行 npm ci、npm test、npm run build，以及 cargo test --manifest-path src-tauri/Cargo.toml --lib --locked。
在 macOS 生成当前架构的 DMG；在 Windows 生成 x64 NSIS EXE。
使用正式应用配置，不启用 qa 功能，不把网页演示当作桌面应用。
只处理安装和构建所需问题，不扩展功能，不添加登录、云同步、AI API或后端服务。
没有发行签名证书时，先按仓库默认配置生成测试安装包，并说明签名状态。
结束时给出实际安装包的完整本地路径、文件大小、测试结果和简明安装步骤。
```

## 1. 准备环境

所有平台需要：

- Node.js 22和npm。
- Rust stable，包括cargo和rustc。
- Git。

检查命令：

```sh
node --version
npm --version
rustc --version
cargo --version
git --version
```

macOS还需要Xcode或Xcode Command Line Tools，检查 `xcode-select -p`。Windows还需要Visual Studio C++构建工具的“使用C++的桌面开发”组件、MSVC和Windows SDK；本地运行应用需要WebView2。

环境安装以 [Tauri官方前置条件](https://v2.tauri.app/start/prerequisites/) 为准。

## 2. 获取代码与验证

```sh
git clone https://github.com/vitakevin/stay-hydrated.git
cd stay-hydrated
npm ci
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
```

如果npm源不可访问，使用当前网络能访问的正规源重试，例如 `npm ci --registry=https://registry.npmjs.org`。保留锁文件，不通过删除锁文件或强制忽略依赖冲突解决网络问题。

## 3. macOS打包

在Mac上运行：

```sh
npm run tauri build -- --bundles dmg
```

这会为当前Mac的架构生成安装包。Apple Silicon对应`aarch64`，Intel对应`x86_64`。

默认输出目录：

```text
src-tauri/target/release/bundle/dmg/
```

如需指定另一种Mac架构：

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target aarch64-apple-darwin --bundles dmg
# 或：
npm run tauri build -- --target x86_64-apple-darwin --bundles dmg
```

指定target后的输出目录是 `src-tauri/target/<target>/release/bundle/dmg/`。打开DMG，将应用拖入“应用程序”。

## 4. Windows打包

在Windows上运行：

```sh
rustup target add x86_64-pc-windows-msvc
npm run tauri build -- --target x86_64-pc-windows-msvc --bundles nsis
```

输出目录：

```text
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/
```

双击其中的`-setup.exe`安装程序。缺少WebView2时，安装程序需要联网补装。

## 5. 使用GitHub Actions构建

没有两种系统的电脑，也可以让GitHub分别构建：

1. Fork本仓库到自己的GitHub账号。
2. 在Fork仓库启用Actions。
3. 打开 `Actions → Desktop installers → Run workflow`。
4. 等待三个任务完成，在该次运行页面底部的Artifacts下载对应压缩包。
5. 解压后找到DMG或EXE，按系统安装。

工作流文件是 `.github/workflows/build.yml`，产物保留14天。过期后可重新运行，不依赖原作者长期提供下载。

## 签名与验证范围

仓库默认提供Mac临时签名和Windows未签名测试构建，未完成Mac发行签名、公证或Windows发行签名。公开分发正式签名安装包时，再配置对应证书。

已通过的构建与测试、尚未实机验证的系统行为，统一记录在 `docs/VERIFICATION.md`。
