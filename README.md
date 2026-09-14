# open markdown blog

把本地 markdown 目录变成**可浏览的知识博客**：全屏打字诗首页 + 工作区分区 + 目录树 + 阅读器 + 设置页。

**前后端分离**：前端 Vue 3 + Vite，后端 Spring Boot 3.5 + 内嵌 H2（不需要外部数据库）。
部署时后端一个 jar 同时托管前端，**服务器上只要一个 JRE**。

```
vue3/   前端（Vue 3 + Vite）
api/    后端（Spring Boot 3.5.3 + H2，Gradle 构建）
```

> 原型在 `ui_protype/`（纯静态单文件）。更早的版本是一个 Node 零依赖服务（`vue3/server/index.mjs`），
> 已由 `api/` 取代 —— 见文末「相对旧 Node 后端的破坏性变更」。

## 特性

- **实时读本地目录** —— 浏览器读不了磁盘，由后端代读：目录树 / md 正文 / 引用图片都按真实文件走，无快照、无同步步骤。
- **访问门禁** —— 密钥经 PBKDF2 派生后由**服务端校验**；密钥本身从不落盘，只保留随机盐与派生值。写接口（改设置 / 上传 / 改密钥）都要密钥。
- **游客模式** —— 没带 key 也能正常浏览，只是不显示「外观与设置」入口。
- **设置持久化** —— 外观、诗句、工作区存后端 H2，上传的图片存后端磁盘目录，换浏览器 / 清缓存都不丢。
- **深色模式** —— 首页右上角一键切换；按**北京时间**默认（6–18 点白天，其余深色）；不持久化。
- **图片上传 / 删除** —— 上传自动重命名为 `年月日时分秒-16位随机串.扩展名`，字节落到后端的图片目录（磁盘文件，不是数据库 BLOB）。
- **工作区拖拽排序** —— 卡片式管理，SortableJS 平滑重排，鼠标与触屏都支持。
- **移动端适配** —— 桌面布局不变，小屏单独优化。

## 架构

```
浏览器（Vue SPA）
   │  目录：GET  /api/ws?ws=<工作区id>          扫目录树（只列文档）
   │        GET  /api/doc?ws=&rel=              读文档正文
   │        GET  /api/img?ws=&rel=              读 md 引用的图片
   │  设置：GET  /api/config                    读设置
   │        POST /api/config                    写设置（需密钥）
   │        POST /api/config/reset              恢复默认（需密钥）
   │  上传：POST   /api/upload?name=x.png       上传图片（需密钥）
   │        GET    /api/uploads                 已上传列表
   │        GET    /api/uploads/<名>            取图
   │        DELETE /api/uploads/<名>            删除（需密钥）
   │  门禁：GET  /api/auth/status               是否需要解锁
   │        POST /api/auth/verify               校验密钥
   │        POST /api/auth/key                  修改密钥（需密钥）
   ▼
Spring Boot（api/）—— 同时是唯一的凭据持有者
   ▼
H2（文件模式，一个 .mv.db 文件）
```

**参数是「工作区 id」而不是绝对路径**，根目录由后端从库里查。
这是刻意的：客户端指定绝对路径的话，`/api/doc?root=/etc&rel=hosts.txt` 就能读服务器上任何文件。

## 运行

### 本地开发：一键启动（Windows）

双击仓库根的 **`start-dev.bat`**，或在任意目录执行它。它会：

1. 构建后端 jar，然后在**后台**启动前后端（不额外开窗口）。后端日志由**应用自己**写到
   `api\build\libs\logs\<日期>\api.log`（**jar 所在目录**下，见下面「日志」一节）；
   前端日志是 npm 的输出，与后端无关，仍在 `file\db\h2\web.log`（与 H2 库文件同一个目录）
2. 等后端就绪后，打印三个入口：

   | | 地址 |
   |---|---|
   | 前端（带热更新） | http://127.0.0.1:5173/ |
   | 后端接口 | http://127.0.0.1:8090/ |
   | 数据库 Web UI（H2 控制台） | http://127.0.0.1:8090/h2-console/ —— **连接串已自动预填**，打开直接点 Connect（用户 `sa`，口令留空） |

3. 保持**当前窗口作为唯一控制窗口** —— **关掉它，前后端一起停**（子进程附着在这个控制台上）。
   按任意键则是正常退出，也会停掉两个服务。另有 `start-dev.bat stop` 兜底。

脚本会设 `SPRING_PROFILES_ACTIVE=dev`，两个数据目录因此来自 `application-dev.yml`（`./file/db/h2` 与
`./file/img`，都落在仓库的 `file/` 下，方便整个删掉重建）。

> **H2 控制台为什么要「预填」**：控制台登录框默认填的是 H2 自己的 `jdbc:h2:~/test`，
> 而 Spring Boot 没法替它改 —— 本项目的 DataSource 是手写的，Boot 那套自动预填用不上。
> 用户若不替换就点 Connect，会得到很难懂的
> `Database "C:/Users/xxx/test" not found ... allow remote database creation ... [90149-232]`。
> 所以后端在启动时会（仅当开了控制台）把本应用的连接串写进
> `~/.h2.server.properties` 的「Generic H2 (Embedded)」条目 —— 等价于在控制台里点一次 Save，
> 每次启动校正一遍。内容一致就不写文件、不碰 mtime；写不进去也只是退回「手动粘贴」，不影响启动。

> **脚本里三处刻意的写法，改动前请先看文件头部的注释**：必须保持 CRLF 行尾（否则 `call :label` 找不到标签）；
> 必须是纯 ASCII（cmd 用 GBK 代码页读 .bat，UTF-8 中文会把换行吞掉、把两行拼成一条错误命令）；
> 后端用 `java -jar` 而不是 `gradlew bootRun`（bootRun 把应用交给脱离控制台的 Gradle 守护进程，
> 关窗口就管不到它了）。这几条都是实测踩出来的。

### 本地开发（两个终端，手动）

```bash
# 后端 → http://127.0.0.1:8090
cd api && ./gradlew bootRun

# 前端 → http://127.0.0.1:5173
cd vue3 && npm install && npm run dev
```

Vite 默认把 `/api` 代理到 `127.0.0.1:8090`（Spring）。要指到别的后端：
`API_TARGET=http://127.0.0.1:9000 npm run dev`。

> 后端默认端口是 **8090**（8080 太容易被别的服务先占掉）。换端口用 `SERVER_PORT=xxxx`，
> 同时要改的是：前端 `API_TARGET`、以及反向代理里指向后端的那个地址。

> 本机 Gradle 是 9.7.1，而项目用 wrapper 锁在 **8.14** —— Spring Boot 3.5.x 的插件官方支持线是
> 7.6.4 / 8.x，Gradle 9 会报 `incompatible with Gradle 9.0`。**请用 `./gradlew`，别直接 `gradle`。**
> 首次运行 wrapper 会从腾讯镜像下载 Gradle 8.14（约 130MB）。

### 服务器部署（一个 jar 起全站）

在开发机上一键打包，拷到服务器，**只要一个 JRE** 就能跑（不装 Node、不装 nginx、不装 Tomcat、不构建）：

```bat
make-package.bat            :: 完整打包：后端 jar + 前端 → pkg\
make-package.bat web        :: 只重建前端 → 刷新 pkg\www\lastest\（jar 原样不动）
```

日常改的多数是前端（文案、样式、页脚那种）。那种情况走 `web` 模式：跳过 40MB 的 jar 重建，
`pkg\api\lastest\` 一个字节都不碰，传完**不用重启后端**。Java 或配置动了才需要完整打包。

`pkg\` 的结构与 `env_config.md` 里记录的部署路径**一一对应**：

```
pkg\
  api\lastest\   →  /srv/open-markdown-blog/api/lastest
     blog-api.jar    后端，40MB，自带 H2 与全部依赖
     run.sh          服务器端一键启动 / 停止（自己 nohup，写 api.pid）
     README.txt      包内说明：服务器上做什么、可调哪些环境变量
     BUILD.txt       打包时间、java/node 版本、jar 大小（用来区分是哪次打的包）
  www\lastest\   →  /srv/open-markdown-blog/www/lastest
     index.html + assets\   前端静态产物
```

因为结构对应，按改动的是什么传对应的那一条就行：

```bash
# 只改了前端（常见情况）—— 传完不用重启
rsync -av --delete pkg/www/lastest/ user@server:/srv/open-markdown-blog/www/lastest/

# 后端也变了
rsync -av --delete pkg/api/lastest/ user@server:/srv/open-markdown-blog/api/lastest/
#   服务器上再： sudo systemctl restart open-markdown-blog

rsync -av "你的md目录/" user@server:/srv/blog/                    # 要浏览的笔记

# 服务器上（详见包内 api/lastest/README.txt）
sudo mkdir -p /srv/open-markdown-blog/file/db/h2 \
              /srv/open-markdown-blog/file/img
sudo chown -R $(id -un):$(id -gn) /srv/open-markdown-blog/file

cd /srv/open-markdown-blog/api/lastest
sh run.sh                                        # 后台启动；可以直接关终端
sh run.sh stop                                   # 停止
sh run.sh fg                                     # 前台启动，报错打在终端上（排障用）

# 本机：http://127.0.0.1:8090/ 就是全站（前端与接口同一个端口）
# 看日志：tail -f /srv/open-markdown-blog/api/lastest/logs/$(date +%F)/api.log
```

> ⚠️ **别对 `pkg/` 整体用 `--delete`。** `pkg/` 里没有 `file/`，那样会把服务器上的
> `file/`（H2 库 + 上传的图片）一并删掉。上面两条把删除范围收在各自目录里，所以安全。
> 不带 `--delete` 的整目录 rsync 不会删东西，但也清不掉前端遗留的旧 assets 文件。

`run.sh` **自己就 nohup**：它把 java 放到后台、写一份 `api.pid`，然后立刻返回 ——
不用再写 `&`，也不用再套一层 `nohup ... &`。重复执行会被拒绝（两个进程会抢同一个 H2 库文件），
要重启先 `sh run.sh stop`（按 pid 杀，最多等 30 秒让它把库关干净）。

**`run.sh` 默认让接口只监听 `127.0.0.1`** —— 所以在服务器外面**打不开** `http://<服务器IP>:8090/`。
对外有两条路，任选其一：

- **同机 Caddy**（推荐）：仓库根的 `Caddyfile` 放到 `/etc/caddy/Caddyfile`、改个域名即可 ——
  `/api` 反代到 `127.0.0.1:8090`、静态文件指向 `www/lastest`、证书自动签发续期，三件事一份配置搞定；
- **ssh 隧道**（什么都不用装）：`ssh -L 8090:127.0.0.1:8090 user@server`，然后开 `http://127.0.0.1:8090/`。

要让端口自己直接对外，用 `SERVER_ADDRESS=0.0.0.0 sh run.sh` —— 但那时**必须**自己在前面挂 TLS，
因为访问密钥是明文走请求头的。

`run.sh` 按「自己在 `api/lastest/`」推出部署根、把 `APP_STATIC_DIR` 指到 `../../www/lastest`，
后端因此**一并托管前端**并做 SPA history fallback（`/settings` 这类前端路由能直接访问）。
前端要另放就 `APP_STATIC_DIR=/别的路径 sh run.sh`。

> ⚠️ 公网一定要在前面挂 HTTPS：访问密钥是在请求头里明文传的（`X-Access-Key`）。
> 仓库根的 `Caddyfile` 已经把 TLS 交给 Caddy 自动处理（前提是域名已解析、80/443 已放行）；
> 不想装 Caddy 的话，nginx 规则完全一样，只是证书要自己用 certbot 签、自己管续期。

### 日志

**位置：运行中的 jar 所在目录下的 `logs/<日期>/api.log`。**

| 环境 | jar 实际路径 | 日志落点 |
|------|-------------|---------|
| 本地开发（`start-dev.bat`） | `api\build\libs\blog-api.jar` | `api\build\libs\logs\<日期>\api.log` |
| 服务器（`api/lastest/run.sh`） | `…/api/lastest/blog-api.jar` | `…/api/lastest/logs/<日期>/api.log` |

目录由 `com.gxdong.blog.config.LogDir` 在启动时算出、写进系统属性 `app.log.dir`，
`logback-spring.xml` 读它。**不是**按「当前工作目录」推 —— CWD 会随「谁在哪敲的 `java -jar`」而变
（这正是 `application-dev.yml` 那两条相对路径要专门盯一段注释的原因）。要挪地方：
`APP_LOG_DIR=/别的/路径` 或 `-Dapp.log.dir=/别的/路径`。启动横幅里会打印实际用的目录，不用猜。

滚动与保留（`api/src/main/resources/logback-spring.xml`）：满 10MB 或跨天滚动一次；
旧文件自动 **gzip 压缩**成 `api.<日期>.<序号>.log.gz`，与当前日志放在**同一个日期目录**里；
保留 **30 天**、总量压到 **1GB** 以内，超出自动删。文件写死 UTF-8，服务器 `LANG` 是 POSIX 也不会乱码。

> 因为文件日志由 logback **独占**，`run.sh` 里 nohup 的输出是丢进 `/dev/null` 的 ——
> 别再把它重定向回 `api.log`，那样每行都会被写两遍。
>
> 代价是：进程若在 logback 初始化**之前**就退出（java 不在 PATH、端口被占、库文件被锁），
> 日志里一个字都不会有。那种时候用 `sh run.sh fg` 前台起一次，真实报错就在终端上。

> ⚠️ 开发态的日志在 `api\build\libs\logs\` 下，`gradlew clean` 会连它一起删掉。
> 想留在仓库根不被波及，在 `start-dev.bat` 里设 `APP_LOG_DIR` 指过去即可。

## 数据目录与权限

需要**可写**的是**两个平级目录**，分别由 `app.data-dir` 与 `app.img-dir` 指定。
**开发与部署刻意用不同路径**，写在两个 Spring profile 里（`api/src/main/resources/`）：

| 环境 | profile | `app.data-dir`（H2 库 + 它自己的 trace 日志） | `app.img-dir`（上传的图片） |
|------|---------|---------------------------------------------|---------------------------|
| 本地开发 | `application-dev.yml` | `./file/db/h2` | `./file/img` |
| **服务器部署** | `application-prod.yml` | **`/srv/open-markdown-blog/file/db/h2`** | **`/srv/open-markdown-blog/file/img`** |
| 不加 profile（兜底） | `application.yml` | `${user.home}/.open-markdown-blog` | `…/.open-markdown-blog/img` |

激活方式：`SPRING_PROFILES_ACTIVE=dev`（`start-dev.bat` 自动设）或 `=prod`（`tools/pkg/run.sh` 里设）。

库文件**直接**放在 `data-dir` 下（`blog.mv.db`），不再套一层 `db/` —— 各环境配的 `data-dir`
本身已经是 `…/file/db/h2` 这种专放数据库的路径。

> ⚠️ **dev 那两条是相对路径，相对于「启动 java 时的当前目录」。** 所以启动器是从**仓库根**启动 java 的
> （不再 `pushd api`）。谁要是给那行加回 `pushd api`，两个目录会静默跑到 `api\file\...` 去 —— 不报错，只是换个地方。

覆盖优先级：**命令行 > 环境变量 > profile 文件 > `application.yml` 的兜底**。

```bash
APP_DATA_DIR=/srv/db APP_IMG_DIR=/srv/img java -jar blog-api.jar   # 环境变量
java -jar blog-api.jar --app.img-dir=/srv/img                      # 命令行
SPRING_PROFILES_ACTIVE=prod java -jar blog-api.jar                 # 切到部署那一套
APP_LOG_DIR=/srv/logs java -jar blog-api.jar                       # 日志另放（默认跟着 jar 走）
```

**上传的图片是磁盘文件**（不是数据库 BLOB）。好处：能用任何工具直接看、备份就是拷目录、
库文件不会被图片撑大；代价是多一个要授权的目录。

**启动时会真写一个探针文件验证这两个目录可写**（不是 `Files.isWritable()` —— 那在只读挂载 + root 下会撒谎）。
不可写就**启动失败**并打印中文指引，而不是启动后悄悄失败（那会表现成「设置能改但一重启就回滚」）。

> **备份就备份整个 `file/` 目录**：`db/h2/blog.mv.db`（设置、工作区、密钥校验值）+ `img/`（上传的图片）。
>
> **要浏览的笔记目录是第三处、与上面两个无关**：它就是服务器上的普通目录（如 `/srv/blog/mymajor`），
> 后端只读它、从不写它。授权给跑 `run.sh` 的那个用户即可。

## 配置项

全部可用环境变量、命令行参数或 `application.yml` 覆盖（Spring 的 relaxed binding）。

| 键 | 环境变量 | 默认 | 说明 |
|----|----------|------|------|
| `app.data-dir` | `APP_DATA_DIR` | 见上一节（各 profile 文件指定；`application.yml` 里只是兜底） | 两个需要可写的目录之一：H2 库文件 + 它自己的 trace 日志 |
| `app.img-dir` | `APP_IMG_DIR` | 同上 | 两个需要可写的目录之二：上传的图片（磁盘文件，不是 BLOB） |
| `spring.profiles.active` | `SPRING_PROFILES_ACTIVE` | 无 | `dev` = 本地开发（`./file/db/h2` + `./file/img`）；`prod` = 服务器部署（`/srv/open-markdown-blog/file/…`） |
| `app.data-check` | `APP_DATA_CHECK` | `true` | 启动时的可写自检；`false` 仅用于只读排障 |
| `app.upload-max-bytes` | `APP_UPLOAD_MAX_BYTES` | `20971520` | 上传上限（20MB），与前端 nginx 的 `client_max_body_size` 对齐 |
| `app.static-dir` | `APP_STATIC_DIR` | 空 | 指向前端 `dist/` 时，后端**一并托管前端**（含 SPA fallback）。`run.sh` 会指向 `www/lastest` |
| `app.auth-protect-reads` | `APP_AUTH_PROTECT_READS` | `false` | `true` = 连读接口也要密钥（博客变私有） |
| `app.auth-reset-to-default` | `APP_AUTH_RESET` | `false` | 忘记密钥时的恢复开关，见下 |
| `app.cors-allowed-origins` | `APP_CORS_ORIGINS` | 空 | 空 = 同源部署（默认）。真跨源才需要 |
| `app.db-auto-server` | `APP_DB_AUTO_SERVER` | `false` | 让 H2 开 AUTO_SERVER，供 DBeaver 在应用运行时连库（见下） |
| `app.log.dir` | `APP_LOG_DIR` | `<jar目录>/logs` | 日志目录，见「日志」一节。由 `LogDir` 在启动时推导，`-Dapp.log.dir=…` 或环境变量覆盖 |
| `server.port` | `SERVER_PORT` | `8090` | 监听端口 |
| `server.address` | `SERVER_ADDRESS` | `127.0.0.1` | 只听本机（对外走反代）。要让端口直接对外设 `0.0.0.0`，那时务必自行加 TLS |

## 访问门禁

- **默认密钥 `ihateblog`** —— 首次运行自动生成校验值；**请到设置页改成自己的**。
- **无 key** → 游客：博客正常浏览，但**不显示「外观与设置」按钮**，也进不了设置页。
- **正确 key**（`?key=<密钥>`）→ 解锁：出现设置按钮，可进设置页。
- **密钥错了** → 重定向到不含 key 的干净地址。
- **后端没起来** → 既不算解锁也不算密钥错误：页面照常打开并提示「无法校验访问密钥」，
  **地址栏的 `?key=` 会保留**，后端恢复后刷新即可正常解锁。
- 设置页「访问密钥」可**修改密钥**：**8–256 位，仅大小写字母与数字**。

原理：密钥经 PBKDF2（SHA-256，210000 次）派生后与库里的加盐校验值做定长比较。
服务端**只保存随机盐与派生值，不保存密钥本身**；密钥在客户端只存在于内存与地址栏，
每次请求经 `X-Access-Key` 请求头传递（不落 localStorage，天然免疫 CSRF）。

> **忘记密钥**：用 `--app.auth-reset-to-default=true`（或 `APP_AUTH_RESET=true`）启动一次，
> 凭据会重置为 `ihateblog` 并打印醒目告警。这个开关**只认启动参数/环境变量，绝不暴露成 HTTP 接口**
> —— 那等于一个无鉴权后门。

> **`app.auth-protect-reads`**：默认 `false`，即读接口公开（游客能看博客，见 `App.vue` 的既定行为）。
> 打开后 `/api/ws|doc|img|uploads` 也要密钥，博客变私有。此时前端会自动带上密钥头。
> 注意：跨源部署下 `<img src>` 带不了自定义请求头，图片会失效 —— 同源（默认的 nginx 反代形态）没有这个问题。

## 部署到公网

部署形态只有一种：**服务器上一个 jar**（见上面「服务器部署」）。对外的差别只在前面挂什么：

```
浏览器 ──HTTPS──> Caddy（443 / 80，仓库根的 Caddyfile）
                     ├── /api/*  ──反代──> 127.0.0.1:8090（这个 jar，只听本机）
                     └── 其余    ──静态──> www/lastest（前端产物）
```

Caddy 是宿主机上的**单个进程**，所以后端可以继续只听回环 —— 不会出现「反代跑在容器里、
容器里的 127.0.0.1 够不着宿主」那类问题。把 `Caddyfile` 放到 `/etc/caddy/Caddyfile`、
改掉里面的域名，证书它就自己去 Let's Encrypt 申领并续期了（前提：域名已解析到这台机器、
80/443 已放行且没被别的 web 服务占着）。

```bash
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
journalctl -u caddy -f                       # 看日志 / 看证书签没签下来
```

不想装 Caddy 就用 nginx，规则完全一样（`/api` 反代到 `127.0.0.1:8090`、静态指向 `www/lastest`、
`try_files` 兜 SPA 路由），只是证书得自己用 certbot 签、自己管续期。

内网自用的话，前面什么都不挂也行 —— `sh run.sh` 起在 8090，同网段直接开 `http://内网IP:8090/`
（这个 jar 自己就能托管前端），只是别拿它直接暴露到公网。

**关于 HTTPS**：改造后门禁走服务端校验，不再用浏览器的 `crypto.subtle`，
所以「必须 HTTPS 否则永远解不开锁」这条限制**已经没有了** —— 局域网 IP + HTTP 现在可用。
但密钥是在请求头里明文传输的，**公网部署仍应上 TLS**。

### 安全提示

- `/api/*` 的读接口是公开的（除非打开 `protect-reads`），而且能读到**后端进程有权限读的**、
  且**在设置页里被配置为工作区**的那些目录。这是产品设计（游客可浏览），不是漏洞 ——
  但不该把工作区指向 `/etc` 之类的目录。
- 客户端**无法**指定任意绝对路径：`ws` 是工作区 id，根目录由后端查库决定，
  相对路径还会经过 `normalize()` 前缀校验与 `toRealPath()` 二次校验（堵符号链接逃逸）。
- 上传上限 20MB，前后端都会拦；nginx 的 413 响应统一是 JSON，不会让前端拿到 HTML 解析报错。
- **H2 默认不监听任何端口。** 它是以嵌入式方式跑在应用进程里的（一个 jar、一个数据文件，
  没有独立服务、没有端口）。可选的 `app.db-auto-server` 会让它额外起一个 TCP 监听供
  DBeaver 连库 —— 但实测那个端口默认绑在 `0.0.0.0`，而库用户是 `sa` / 空口令，
  等于把配置与门禁校验值暴露给同网段。**所以默认关闭**；打开时会强制 `h2.bindAddress=127.0.0.1`。
  不用它也能看库：停掉应用，再用文件模式打开即可。

## 相对旧 Node 后端的破坏性变更

如果外部有脚本直接调 API，这些会影响到你：

| 变更 | 旧 | 新 |
|------|----|----|
| 读接口参数 | `/api/ws?root=<绝对路径>` | `/api/ws?ws=<工作区 id>` |
| 写接口鉴权 | `POST /api/config`、`POST /api/config/reset`、`POST /api/key` **完全无鉴权** | 一律需要 `X-Access-Key` 请求头 |
| 门禁端点 | `GET /api/secure` 把密文发给匿名客户端 | 换成 `GET /api/auth/status` + `POST /api/auth/verify`，不再吐密文 |
| 改密钥端点 | `POST /api/key` | `POST /api/auth/key`（且需要当前密钥） |
| 上传上限 | 后端无限制（只有 nginx 拦） | 后端也拦，超过返回 `413 {"error":"文件超过 20MB 上限"}` |
| 配置存储 | `data/config.json` | H2 数据库 |
| 上传图片存储 | `data/uploads/` 目录 | 磁盘目录（`app.img-dir`，默认 `<仓库>/file/img`） |
| `prefs.bgUrl` 的取值 | `/api/uploads/x.jpg` | `x.jpg`（裸文件名；历史值读取时自动归一化） |

**刻意保持不变**的部分（已逐端点对拍验证）：错误文案、`mt` 时间格式、
目录排序（中文按 ICU 的 zh 规则）、上传文件命名规则、`/api/uploads/<名>` 的长缓存头、
图片与正文的字节内容、SPA 的 history fallback 行为。

## 目录结构

```
api/                          Spring Boot 后端（Gradle）
  src/main/java/com/gxdong/blog/
    config/                   配置绑定、DataSource、鉴权拦截器、异常处理、日志目录推导（LogDir）
    model/                    数据载体（TreeNode / Workspace / Credential …）
    repo/                     JdbcTemplate 仓储（3 张表）
    service/                  业务：目录扫描、配置、鉴权、上传
    web/                      Controller
  src/main/resources/
    application.yml           配置项与默认值
    logback-spring.xml        日志：<jar目录>/logs/<日期>/api.log，滚动 + gzip 压缩
    schema.sql                建表（IF NOT EXISTS，幂等）
    default-prefs.json        出厂默认设置（与旧后端逐字一致）
  build/libs/logs/            开发态日志（跟着 jar 走；gradlew clean 会删，见「日志」一节）

vue3/                         前端（Vue 3 + Vite）
  src/store/useStore.js       全局状态 + API 调用
  src/store/http.js           统一请求层（API_BASE、密钥头、错误分类）
  src/access/useAccessGate.js 门禁（服务端校验）
  src/markdown/mdToHtml.js    markdown 渲染
  src/components/             首页、目录树、阅读器
  src/views/                  首页、设置页

file/                         运行期数据（已 gitignore，整个删掉即回到出厂状态）
  db/h2/blog.mv.db            H2：设置、工作区、密钥校验值（+ 出错时的 blog.trace.db）
  img/                        上传的图片

make-package.bat              一键打包：后端 jar + 前端 dist → pkg\（服务器部署用）
start-dev.bat                 本地开发一键启动（Windows）
Caddyfile                     服务器上反向代理的现成配置（反代 /api + 托管前端 + 自动 TLS）
env_config.md                 仓库地址与服务器部署路径的备忘
tools/pkg/                    run.sh 与包内 README.txt（make-package.bat 把它们拷进包里）
tools/verify/                 验收脚本（对这些 HTTP 契约逐项断言）
ui_protype/                   最早的原型（纯静态单文件）
  workspace-blog.html         2.3MB —— 里面**内嵌了原型作者的笔记正文快照**（123 篇）
                              与当时的本机路径，不是模板数据。介意的话把它删掉即可，
                              它不参与构建、也不被任何代码引用。
  settings.html               设置页原型
```

## 开发约定

- 后端：Java 21、Spring Boot 3.5.3、Gradle wrapper 8.14、JdbcTemplate（不使用 JPA）、
  HandlerInterceptor 做鉴权（不引入 Spring Security）。
- 前端：Vue 3、Vite 6、无 TypeScript、无额外 UI 库。
- 注释与用户可见文案一律中文。

## 测试

没有引入单元测试框架；验收方式是**对这些 HTTP 契约逐项断言**，共 4 个套件 75 项：

```bash
bash tools/verify/run-all.sh
```

它会重建前后端，用三种配置各起一个后端实例，依次跑完配置、服务端鉴权、前端契约回放。
细节见 `tools/verify/README.md`。

改造过程中还额外做过两轮验证（脚本已随旧后端一并清理）：

- **与旧 Node 后端逐端点对拍**：同一份 fixture，比对目录树（含**中文排序**）、正文、图片字节、
  上传全流程与错误文案。其中中文排序暴露出一处真实差异 —— JDK 自带的 `Collator` 不应用
  CLDR 的 zh 的 `[reorder Hani]`（汉字提前），且默认把标点当可忽略元素；最终改用 ICU4J
  并显式对齐 ECMAScript 的默认选项，才做到逐位一致。
- **旧密文的兼容性 spike**：先用纯 JDK 证明能解开旧 `secure.json`，再动手写代码 ——
  「用户现有密钥继续可用」这条需求就靠它成立。
