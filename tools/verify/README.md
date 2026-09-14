# 验收脚本

项目没有引入单元测试框架（后端刻意不加 `spring-boot-starter-test`），
验收方式是**对这些 HTTP 契约逐项断言**：

| 套件 | 断言数 | 覆盖 |
|------|--------|------|
| `config-test.mjs` | 27 | `/api/config` 的读、写、reset、错误路径；默认值合并语义；未知键与数字格式的保真 |
| `auth-test.mjs` | 18 | 服务端鉴权：验钥、出错文案、写接口的 401、改密钥全链路、恢复成原密钥 |
| `frontend-contract.mjs` | 25 | 按前端真实会发的请求逐个回放，断言它读取的每个字段都在（含从 md 正文解析图片地址那条路径） |
| `proxy-idle-test.mjs` | 5 | 经 Vite 代理，在 0/5/22/45/70 秒空闲后各请求一次，验证空闲连接复用不会 RST（需要前端 dev server 在跑，不参与 run-all.sh） |

## 跑全部

```bash
bash tools/verify/run-all.sh
```

它会：重建前后端 → 起三个后端实例（配置用 / 鉴权用 / 契约回放用）→ 依次跑前三个套件。
临时数据库与日志落在 `tools/verify/.run/`（已 gitignore）。

三个实例都是**空库**。契约回放需要真实工作区才能验目录树、正文与正文引用的图片，
所以在它那个实例起来之后用 `POST /api/config` 建 —— 内容来自 **`seed-config.json`**，
里面指向本机的笔记目录。那个文件**不进仓库**（各人机器上的路径不一样），
第一次跑之前从模板复制一份出来、把路径改成你自己的：

```bash
cp tools/verify/seed-config.example.json tools/verify/seed-config.json
# 然后编辑 seed-config.json 里的 workspaces[].root
```

不改的话契约回放会因为目录不存在而失败。

## 环境

脚本是在 **Windows + Git Bash** 下写的，用了两处平台相关的东西：

- `pwd -W` 取 Windows 风格路径 —— 必须，否则 `$PWD` 给的 `/e/...` 会被 Java 当成 `E:\e\...`；
- `taskkill` 停端口占用。

在 Linux/macOS 上跑需要把 `kill_port` 里的 `taskkill` 换成 `kill`，
并把 `seed-config.json` 里的路径换成该机器上的笔记目录。

## 单独跑某一个

```bash
cd api && ./gradlew bootRun --args='--app.data-dir=../tools/verify/.run/demo --app.img-dir=../tools/verify/.run/demo-img'
node tools/verify/frontend-contract.mjs http://127.0.0.1:8090
```
