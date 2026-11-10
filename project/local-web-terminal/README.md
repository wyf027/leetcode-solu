# 本地网页版终端

浏览器和本地终端接入同一个 `tmux` 会话。任一端都能输入命令，两端实时显示输出，并共享当前目录和正在运行的程序。

## 安装依赖

macOS 使用 Homebrew：

```sh
brew install tmux ttyd
```

Windows 使用 WSL 2，在 Ubuntu 24.04 的终端里安装：

```sh
sudo apt update
sudo apt install tmux ttyd
```

Windows 上的共享会话运行在 WSL 内。用 Windows Terminal 打开同一个 Ubuntu 发行版，并在 Windows 浏览器中通过本机地址访问网页。 [WSL 网络说明](https://learn.microsoft.com/windows/wsl/networking)

## 使用

在仓库根目录启动服务，保持这个终端窗口运行：

```sh
./project/local-web-terminal/terminal.sh serve
```

打开 [本地网页版终端](http://127.0.0.1:7681/)，然后在另一个终端窗口运行：

```sh
./project/local-web-terminal/terminal.sh attach
```

第一次连接时，共享会话从启动方的当前目录创建。关闭网页，或在本地终端按 `Ctrl+B` 再按 `D`，都可以稍后接回正在运行的会话。用 `Ctrl+C` 停止运行 `serve` 的进程后，也可以重新启动网页服务并接回仍在运行的会话。

网页服务只监听 `127.0.0.1`。如果默认端口已被占用，设置 `WEB_TERMINAL_PORT` 后启动，并在浏览器中使用对应端口：

```sh
WEB_TERMINAL_PORT=17681 ./project/local-web-terminal/terminal.sh serve
```
