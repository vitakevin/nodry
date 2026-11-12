# 别太干巴了 · Stay Hydrated

一款本地运行的喝水提醒桌面应用，面向 macOS 和 Windows。

干巴值越高，提醒越频繁。半透明土色从右下角随分数平滑铺开，1分起可见；不规则土块之间的裂缝随分数升高逐渐张开，分数越高变化越快。喝水降分后，裂缝合拢、土色退回右下角。

**已验证打包成功：Mac Apple Silicon DMG、Mac Intel DMG、Windows x64 EXE。** 旧构建记录（历史身份已清理，请以当前构建为准）。

想让AI帮你打包？打开 [自行打包指南](docs/BUILDING.md)，复制其中的完整提示词即可。指南包含环境检查、本机打包和Fork后使用GitHub Actions构建的步骤。

## 怎么使用

1. 打开应用，填写体重（斤）、上班时间和下班时间，点击「保存并开始」。
2. 喝水后输入实际水量（mL），点击「已喝水」。
3. 关闭窗口后，应用继续在菜单栏／系统托盘运行。点击水滴图标重新打开。Mac也可点击Dock图标，或在“应用程序”中再次打开应用。主窗口右上角齿轮可修改体重和上下班时间。
4. 需要停止运行时，在托盘菜单选择「退出并停止提醒」。

提醒只在当天有效工作时段进行，最晚截止19:00。0分时暂停，低于50分每60分钟、50至不足100分每30分钟、100分每15分钟。工作时段内裂纹持续跟随当前干巴值，不受通知倒计时或每日次数限制；20、50、80分只改变延伸与增宽的速度，长度和宽度都连续变化。土块围成闭合的裂缝网络，土地色层保持半透明。喝水降分后裂缝平滑合拢、覆盖范围退回右下角，0分完全消失。可以在设置中关闭特效、选择登录启动。

体重、配置和饮水记录只保存在本机，不登录、不上传、不调用大模型。干巴值是产品提醒分数，不是身体脱水程度测量。

## 安装包

构建流程输出 Apple Silicon `.dmg`、Intel `.dmg` 和 Windows x64 `Setup.exe`。

当前发行阶段为测试构建：Mac使用临时签名，尚未完成Developer ID签名与公证；Windows尚未配置发行签名。系统可能限制直接打开。正式签名状态及实际验证范围见 [验证记录](docs/VERIFICATION.md)。

Windows安装程序在缺少WebView2时需要联网补装运行环境。系统通知由系统设置控制；未收到提醒时，请核对应用通知权限和系统勿扰设置。

## 开发

需要 Node.js 22、Rust stable，以及对应系统的原生编译环境（Mac需Xcode；Windows需Microsoft C++构建工具）。

```sh
npm ci
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
npm run tauri dev
```

开发演示：运行 `npm run dev`，访问 `http://127.0.0.1:1420/?demo=1`。此入口有独立存储、可控时钟，不发送桌面提醒。

Mac打包：

```sh
npm run tauri build -- --bundles dmg
```

Windows打包（在Windows运行）：

```sh
npm run tauri build -- --bundles nsis
```

原生隔离测试构建（独立应用标识和数据目录）：

```sh
npm run tauri build -- --debug --features qa --config src-tauri/tauri.qa.conf.json --bundles app
```

GitHub Actions自动执行前端与Rust测试并生成三个架构的安装包，构建产物保留14天，不自动发布公共Release。

完整业务规则和验收项目见 [开发规格](docs/DEVELOPMENT.md)。

详细打包步骤和可直接交给AI的提示词见 [自行打包指南](docs/BUILDING.md)。
