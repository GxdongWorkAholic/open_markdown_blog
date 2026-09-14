open markdown blog —— 部署包
============================================================

这个包的结构与服务器上的部署布局一一对应（见仓库根的 env_config.md）：

    api/lastest/   →  /srv/open-markdown-blog/api/lastest
    www/lastest/   →  /srv/open-markdown-blog/www/lastest

所以按改动的是什么传对应的那一条：

    rsync -av --delete pkg/www/lastest/ user@server:/srv/open-markdown-blog/www/lastest/
    rsync -av --delete pkg/api/lastest/ user@server:/srv/open-markdown-blog/api/lastest/

⚠️ 别对 pkg/ 整体用 --delete：pkg/ 里没有 file/，那样会把服务器上的
   file/（H2 库 + 上传的图片）一并删掉。上面两条把删除范围收在各自目录里。

内容
------------------------------------------------------------
  api/lastest/blog-api.jar   后端：自带 H2 与全部依赖，并同时托管前端
  api/lastest/run.sh         服务器端一键启动 / 停止
  api/lastest/README.txt     本文件
  api/lastest/BUILD.txt      打包时间与版本（用来区分是哪一次打的包）
  www/lastest/               前端静态产物（index.html + assets/）

服务器上要装什么
------------------------------------------------------------
  只要一个 JRE 17+（java -version 能跑就行）。
  不需要 Node，不需要数据库，不需要 nginx，不需要 Tomcat，不需要构建，也不需要出网。

运行时会自动创建三个目录（不在这个包里）
------------------------------------------------------------
  <部署根>/file/db/h2        H2 的库文件（blog.mv.db）与它自己的 trace 日志
  <部署根>/file/img          上传的图片（磁盘文件，不是数据库 BLOB）
  <jar 同目录>/logs/<日期>/  日志（api.log + 滚动出来的 .gz 归档）

  前两个要你提前建好并授权；logs/ 由应用自己建，不用管。

步骤
------------------------------------------------------------
  1) 传上去（连同你要浏览的 markdown 目录）

       rsync -av --delete pkg/api/lastest/ user@server:/srv/open-markdown-blog/api/lastest/
       rsync -av --delete pkg/www/lastest/ user@server:/srv/open-markdown-blog/www/lastest/
       rsync -av "你的md目录/" user@server:/srv/blog/

     只改了前端的话，第二条就够了（见仓库根的 README.md 里 make-package.bat web）。

  2) 把两个数据目录建好并授权

       sudo mkdir -p /srv/open-markdown-blog/file/db/h2 \
                     /srv/open-markdown-blog/file/img
       sudo chown -R $(id -un):$(id -gn) /srv/open-markdown-blog/file

     建漏了也不会静默出问题：启动时会做可写自检并打印中文指引。

  3) 启动 / 停止

       cd /srv/open-markdown-blog/api/lastest
       sh run.sh          # 后台启动。脚本自己 nohup，可以直接关终端
       sh run.sh stop     # 停止（按 pid 文件杀，最多等 30 秒让它把库关干净）
       sh run.sh fg       # 前台启动，报错直接打在终端上 —— 起不来又查不出原因时用这个

     必须在 api/lastest/ 目录下执行：静态目录是按「我在哪」推导的。
     重复执行 sh run.sh 会被拒绝并提示先 stop —— 两个进程会抢同一个 H2 库文件。

  4) 看日志

       cd /srv/open-markdown-blog/api/lastest
       tail -f logs/$(date +%F)/api.log

     日志是**应用自己写**的（logback-spring.xml），与怎么启动无关；
     10MB 或跨天滚动一次，旧的自动 gzip 压缩，留 30 天、总量压到 1GB 以内。
     所以 run.sh 里 nohup 的输出是丢进 /dev/null 的 ——
     文件日志已经由应用独占，控制台那份再写进同一个文件会让每行重复两遍。
     代价是：进程若在日志系统初始化之前就退出（java 不在 PATH、端口被占、库文件被锁），
     日志里一个字都不会有 —— 那种情况用 `sh run.sh fg` 前台起一次就能看到真实报错。
     开头的横幅里有实际的「数据目录」「图片目录」「日志目录」，对一下就知道配对了没。

  5) 打开 http://127.0.0.1:8090/      ← 注意是 127.0.0.1，不是服务器 IP

     接口默认**只听本机**（run.sh 里的 SERVER_ADDRESS，默认 127.0.0.1）。
     在服务器本机上：游客态直接能看；带密钥是 http://127.0.0.1:8090/?key=ihateblog
     从自己电脑访问，二选一：
       * ssh 隧道（什么都不用装）：
           ssh -L 8090:127.0.0.1:8090 用户@服务器
         然后在本机浏览器开 http://127.0.0.1:8090/
       * 服务器上挂 Caddy（推荐，单文件、证书自动签发）：把仓库根的 Caddyfile 放到
         /etc/caddy/Caddyfile，改掉域名即可 —— 它会把 /api 反代到 127.0.0.1:8090、
         静态文件指向 www/lastest。nginx 也行，规则一样。
     要让端口自己直接对外（不推荐，除非前面有 TLS）：
       SERVER_ADDRESS=0.0.0.0 sh run.sh

     然后 设置页 → 把访问密钥从默认的 ihateblog 改掉
                → 新增工作区，路径填**服务器上**的真实目录（如 /srv/blog/mymajor）

run.sh 是怎么找到前端的
------------------------------------------------------------
  它按「自己在 …/api/lastest/」推出部署根，再指到 ../../www/lastest。
  所以这两个目录必须都在、且是兄弟关系（就是上面那个布局）。
  前端要另放：APP_STATIC_DIR=/别的路径 sh run.sh 覆盖。
  （日志目录不看这些 —— 它按 jar 自己的位置推导，从哪个目录启动都一样。）

可调环境变量
------------------------------------------------------------
  SPRING_PROFILES_ACTIVE  默认 prod —— 两个数据目录由它决定
  APP_DATA_DIR    H2 库文件目录   默认 <部署根>/file/db/h2
  APP_IMG_DIR     上传图片目录     默认 <部署根>/file/img
  APP_STATIC_DIR  前端产物目录     默认 <部署根>/www/lastest（run.sh 里设）
  APP_LOG_DIR     日志目录         默认 <jar 同目录>/logs
  SERVER_PORT     端口            默认 8090
  SERVER_ADDRESS  监听地址        默认 127.0.0.1（只对本机）；0.0.0.0 = 直接对外
  APP_TZ          时区            默认 Asia/Shanghai

备份
------------------------------------------------------------
  要备份的是「整个 file/ 目录」：
    file/db/h2/blog.mv.db   全部设置、工作区、访问密钥校验值
    file/img/               上传的图片
  拷走这一份，换台机器放回同样位置即可。logs/ 是日志，不用备份。

注意
------------------------------------------------------------
  * 接口默认只听 127.0.0.1，「从外面连 8090 连不上」是预期的、不是没起来 ——
    按上面第 5 步走 ssh 隧道或反代。要直接放开再用 SERVER_ADDRESS=0.0.0.0，
    那时公网务必在前面挂 HTTPS：访问密钥走请求头明文传输，HTTP 下会被嗅探。
    最省事是装个 Caddy（单文件），把仓库根的 Caddyfile 放到 /etc/caddy/ 并改掉域名 ——
    证书它会自动申请续期。不想装东西的话，nginx 的规则也一样：/api 反代到 127.0.0.1:8090。
  * 想要后台常驻：把 run.sh 里 nohup 那条的 java 命令抄进 systemd 的 ExecStart
    （去掉 nohup 与末尾的 &，进程交给 systemd 管），环境变量用 Environment= 写，
    再加 Restart=always。注意 systemd 里没有 $PWD，APP_STATIC_DIR 要写成绝对路径。
