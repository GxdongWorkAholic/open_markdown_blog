#!/bin/sh
# ============================================================================
#  open markdown blog —— 服务器端启动脚本（只要一个 JRE 就能跑）
#
#  落点：/srv/open-markdown-blog/api/lastest/run.sh
#        前端产物在 ../../www/lastest/，数据与图片在 ../../file/
#
#  用法：  sh run.sh                  后台启动（脚本自己 nohup，可以直接关终端）
#          sh run.sh stop             停掉它
#          sh run.sh fg               前台启动，输出直接打在终端上（排障用）
#          SERVER_PORT=9000 sh run.sh 换端口
#          APP_DATA_DIR=/srv/db APP_IMG_DIR=/srv/img sh run.sh   换数据/图片目录
#          SERVER_ADDRESS=0.0.0.0 sh run.sh                      直接对外（见下）
#
#  日志：<本目录>/logs/<日期>/api.log —— 应用自己写（logback-spring.xml），
#        与怎么启动无关。10MB 或跨天滚动一次，旧的自动 gzip 压缩，留 30 天。
#        所以看日志是：  tail -f logs/$(date +%F)/api.log
#
#        ⚠️ 下面 nohup 的输出是**故意丢进 /dev/null** 的，别「顺手」改成 > api.log：
#           文件日志已经由 logback 独占，控制台那份再写进同一个文件，每行都会出现两遍。
#           nohup 在这里的作用是「脱离终端」（终端关掉也不收 SIGHUP），输出丢掉即可。
#           代价是：万一进程在 logback 初始化**之前**就死了（java 不在 PATH、端口被占、
#           库文件被锁），日志里一个字都不会有。那种时候用 `sh run.sh fg` 前台起一次，
#           真实报错就打在终端上了。
#
#  必须在 api/lastest/ 目录下执行：静态目录是按「我在哪」推导的。
#  （日志目录不受影响 —— 它按 jar 自己的位置推导，不认当前目录。）
#
#  它做三件事：
#    SPRING_PROFILES_ACTIVE=prod    两个目录取自 application-prod.yml：
#                                    …/file/db/h2（H2 库）与 …/file/img（上传的图片）
#    APP_STATIC_DIR                 指向 ../../www/lastest —— 让这个 jar 一并托管前端
#    --server.address               默认 **127.0.0.1**：接口只对本机开放，
#                                    由同机的 Caddy（或 nginx）反代（或 ssh 隧道）对外。
#                                    要让端口直接对外，用
#                                    SERVER_ADDRESS=0.0.0.0 sh run.sh
#                                    —— 端口直接暴露时，访问密钥是明文走请求头的，
#                                    务必自己确认前面有 TLS。
#
#  ⚠️ 第一次用之前要把两个目录建好并授权：
#       sudo mkdir -p /srv/open-markdown-blog/file/db/h2 \
#                     /srv/open-markdown-blog/file/img
#       sudo chown -R $(id -un):$(id -gn) /srv/open-markdown-blog/file
#     建漏了也不会静默出问题：启动时会做可写自检并打印中文指引。
#
#  想换成常驻服务：把下面 nohup 那条里的 java 命令抄进 systemd 的 ExecStart
#  （去掉 nohup 与末尾的 &，进程交给 systemd 管），环境变量用 Environment= 写
#  （注意 systemd 里没有 $PWD，APP_STATIC_DIR 要写绝对路径），再加 Restart=always。
# ============================================================================
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"          # …/open_markdown_blog/api/lastest
DEPLOY_ROOT="$(cd "$HERE/../.." && pwd)"       # …/open_markdown_blog
PID_FILE="$HERE/api.pid"

# ── 停止 ────────────────────────────────────────────────────────────────────
if [ "$1" = "stop" ]; then
  if [ ! -f "$PID_FILE" ]; then
    echo "[stop] 没有 $PID_FILE —— 它没在跑，或者不是本脚本启动的。" >&2
    exit 1
  fi
  PID="$(cat "$PID_FILE")"
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "[stop] pid $PID 已经不存在了，清掉这个陈旧的 pid 文件。"
    rm -f "$PID_FILE"
    exit 0
  fi
  echo "[stop] 停止 pid $PID ..."
  kill "$PID"
  # 最多等 30 秒，让 H2 把库文件正常关掉
  i=0
  while [ "$i" -lt 30 ] && kill -0 "$PID" 2>/dev/null; do
    sleep 1
    i=$((i + 1))
  done
  if kill -0 "$PID" 2>/dev/null; then
    echo "[stop] 等了 30 秒还没退出，改用 kill -9。" >&2
    kill -9 "$PID"
  fi
  rm -f "$PID_FILE"
  echo "[stop] 已停止。"
  exit 0
fi

# ── 预检 ────────────────────────────────────────────────────────────────────
# fg = 前台跑。存在的理由只有一个：后台模式下子进程的输出是丢掉的，
# 万一它在 logback 初始化之前就退出，日志里什么都看不到，只能前台重现一次。
FOREGROUND=
if [ "$1" = "fg" ]; then
  FOREGROUND=1
fi

# 这里的每一条都必须自己检查：进程是 nohup 起的、输出丢了，
# 否则出问题时终端上一片空白，只能靠猜。
if ! command -v java >/dev/null 2>&1; then
  echo "[run] 找不到 java —— 本服务只要一个 JRE 17+，装好再试。" >&2
  exit 1
fi

if [ ! -f "$HERE/blog-api.jar" ]; then
  echo "[run] 找不到 blog-api.jar —— 请在解包出来的 api/lastest/ 目录里执行本脚本" >&2
  exit 1
fi

# 别重复起：两个进程会抢同一个 H2 库文件，后起的那个只会报 Database may be already in use
if [ -f "$PID_FILE" ]; then
  OLD="$(cat "$PID_FILE")"
  if kill -0 "$OLD" 2>/dev/null; then
    echo "[run] 已经在跑（pid $OLD）。要重启就先： sh run.sh stop" >&2
    exit 1
  fi
  rm -f "$PID_FILE"
fi

export SPRING_PROFILES_ACTIVE="${SPRING_PROFILES_ACTIVE:-prod}"
export APP_STATIC_DIR="${APP_STATIC_DIR:-$DEPLOY_ROOT/www/lastest}"
# 两个数据目录按「这个包放在哪」算出来，配置里不写死绝对路径 ——
# 所以换个部署位置、或者目录换个名字，都不用改 application-prod.yml。
# 环境变量优先级高于 profile 文件，传给 java 的进程即可。
export APP_DATA_DIR="${APP_DATA_DIR:-$DEPLOY_ROOT/file/db/h2}"
export APP_IMG_DIR="${APP_IMG_DIR:-$DEPLOY_ROOT/file/img}"
PORT="${SERVER_PORT:-8090}"
# 只听本机：接口不直接对外，前面挂反代（或走 ssh 隧道）。要直接对外见文件头。
ADDR="${SERVER_ADDRESS:-127.0.0.1}"
# 页面上的文件时间按这个时区显示。服务器时区不对的话（比如 UTC），所有时间会偏。
TZ_OPT="-Duser.timezone=${APP_TZ:-Asia/Shanghai}"

if [ ! -d "$APP_STATIC_DIR" ]; then
  echo "[run] 前端产物目录不存在：$APP_STATIC_DIR" >&2
  echo "[run]   —— www/lastest 没传全？没有它 /api 之外都会 404。" >&2
  exit 1
fi

echo "[run] 部署根      ：$DEPLOY_ROOT"
echo "[run] 前端静态目录：$APP_STATIC_DIR"
echo "[run] 监听        ：$ADDR:$PORT"
if [ "$ADDR" = "127.0.0.1" ]; then
  echo "[run]               只对本机开放 —— 对外要么前面挂反代，要么从本机开 ssh 隧道："
  echo "[run]               ssh -L $PORT:127.0.0.1:$PORT 用户@本机"
fi
echo "[run] 时区        ：${APP_TZ:-Asia/Shanghai}"
echo "[run] 数据/图片目录：取自 $SPRING_PROFILES_ACTIVE profile，下面启动日志里会打印"
echo

if [ -n "$FOREGROUND" ]; then
  echo "[run] 前台运行：Ctrl-C 结束。日志同样写进 $HERE/logs/$(date +%F)/api.log，"
  echo "[run] 但控制台这份也直接打在终端上（包括 logback 初始化之前的报错）。"
  echo
  exec java $TZ_OPT -jar "$HERE/blog-api.jar" \
    --server.address="$ADDR" --server.port="$PORT"
fi

nohup java $TZ_OPT -jar "$HERE/blog-api.jar" \
  --server.address="$ADDR" --server.port="$PORT" \
  >/dev/null 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"

# 起没起来，看这两秒。失败时日志那头通常也已经写了原因，所以把路径一起打出来；
# 日志里要是没有新内容，就是它在 logback 初始化前就死了 —— 提示走前台模式。
LOG_FILE="$HERE/logs/$(date +%F)/api.log"
sleep 2
if ! kill -0 "$PID" 2>/dev/null; then
  rm -f "$PID_FILE"
  echo "[run] 启动失败：进程刚起就退出了。" >&2
  echo "[run]   先看日志：$LOG_FILE" >&2
  echo "[run]   日志里没有新内容的话，换成前台起一次看真实报错：" >&2
  echo "[run]     sh run.sh fg" >&2
  exit 1
fi

echo "[run] 已后台启动：pid $PID（关掉终端也不会停）"
echo "[run] 日志        ：$LOG_FILE"
echo "[run]               监听地址、数据目录、健康检查 URL 都在开头的横幅里"
echo "[run]               看：  tail -f $LOG_FILE"
echo "[run] 停止        ：sh run.sh stop"
