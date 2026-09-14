#!/usr/bin/env bash
# 全量回归：清空重建两端，然后按几种后端配置各跑一遍验收脚本。
set -uo pipefail
# 脚本在 tools/verify/ 下，仓库根在上两层
cd "$(dirname "$0")/../.."

# 必须用 pwd -W 拿 Windows 风格路径（E:/...）。
# 直接 $PWD 在 Git Bash 里是 MSYS 风格 /e/...，而下面设了 MSYS_NO_PATHCONV=1，
# Java 会把 /e/myworkspace/... 当成「当前盘的 \e\myworkspace\...」→ 目录不存在。
ROOT="$(pwd -W 2>/dev/null || pwd)"
DATA="$ROOT/tools/verify/.run"
PASS=0; FAIL=0

kill_port() {
  local p
  p=$(netstat -ano | grep ":$1 " | grep LISTENING | awk '{print $5}' | head -1)
  [ -n "$p" ] && taskkill //F //PID "$p" >/dev/null 2>&1
  sleep 2
}
start_api() {   # start_api <端口> <数据目录名> [额外的 java 参数...]
  local port="$1" dir="$2"; shift 2
  kill_port "$port"
  rm -rf "$DATA/$dir" "$DATA/$dir-img"
  # 两个目录都要显式指定：验收不启用 profile，只给 data-dir 的话 img-dir 会回落到
  # application.yml 的默认值 ${user.home}/.open-markdown-blog/img —— 契约回放里那次
  # POST /api/upload 就会往用户主目录写文件，跑一次留一个目录。
  ( cd api && MSYS_NO_PATHCONV=1 java -jar build/libs/blog-api.jar \
      --server.port="$port" --app.data-dir="$DATA/$dir" --app.img-dir="$DATA/$dir-img" "$@" \
      > "$DATA/$dir.log" 2>&1 & )
  for _ in $(seq 1 40); do
    sleep 1
    curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$port/api/health" && return 0
  done
  echo "  ✗ :$port 起不来，日志尾部："; tail -5 "$DATA/$dir.log"; return 1
}
run() {  # run <标签> <脚本> <端口> [额外参数...]
  local label="$1" script="$2" port="$3"; shift 3
  echo
  echo "──────── $label ────────"
  if node "tools/verify/$script" "http://127.0.0.1:$port" "$@"; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi
}
# 契约回放需要真实工作区才能验目录树/正文/正文引用的图片。
# 以前靠「首启导入 legacy/」拿到，那条能力已按需求移除 —— 改成起服务后用 API 建，
# 内容取自 seed-config.json（里面指向本机的笔记目录，换路径时同步改那个文件）。
seed_workspaces() {
  local port="$1" code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$port/api/config" \
    -H 'X-Access-Key: ihateblog' -H 'Content-Type: application/json' \
    --data-binary "@tools/verify/seed-config.json")
  echo "  seed :$port -> HTTP $code"
}

mkdir -p "$DATA"
echo "════ 1/4 重建前端 ════"
( cd vue3 && npm run build >/dev/null 2>&1 ) && echo "  ✓ npm run build" || { echo "  ✗ 前端构建失败"; exit 1; }

echo "════ 2/4 重建后端 ════"
( cd api && ./gradlew clean bootJar -q >/dev/null 2>&1 ) && echo "  ✓ gradlew clean bootJar" || { echo "  ✗ 后端构建失败"; exit 1; }
ls -lh api/build/libs/blog-api.jar | awk '{print "  jar: " $5}'

echo "════ 3/4 启动三个后端实例 ════"
start_api 8081 empty    && echo "  ✓ :8081 空库（配置端点用）"
start_api 8082 auth     && echo "  ✓ :8082 空库（鉴权套件用）"
# 契约回放单独一个实例：鉴权套件会 POST /api/config 把工作区清空，
# 两者共用一个实例会互相污染状态。
start_api 8083 contract && echo "  ✓ :8083 空库 + 待建工作区（契约回放用，独占）"
seed_workspaces 8083

echo
echo "════ 4/4 跑验收 ════"
run "配置端点（空库）"            config-test.mjs       8081
run "服务端鉴权"                  auth-test.mjs         8082
run "前端契约回放（真实内容）"      frontend-contract.mjs 8083

for p in 8081 8082 8083; do kill_port "$p"; done

echo
echo "════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then echo "全部通过（$PASS 个套件）"; else echo "有失败：$FAIL / $((PASS+FAIL)) 个套件"; fi
exit "$FAIL"
