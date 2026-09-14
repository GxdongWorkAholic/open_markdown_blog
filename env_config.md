# 环境配置

## 1，git仓库

| 仓库名 | 地址                                                   |
| ------ | ------------------------------------------------------ |
| github | git@github.com:GxdongWorkAholic/open_markdown_blog.git |
| gitee  | git@gitee.com:gxdongworkaholic/open_markdown_blog.git  |
| gitea  | git@gitea.com:gxdong_work/open_markdown_blog.git       |

## 2，部署

| 部署工具   | 部署路径                                        |
| ---------- | ----------------------------------------------- |
| vue3       | /srv/open-markdown-blog/www/lastest |
| springboot | /srv/open-markdown-blog/api/lastest |

运行期两个需要**可写**的目录（不在部署包里，第一次启动前建好并授权）：

| 用途                    | 路径                                             | 内容                                                  |
| ----------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| H2 数据库               | /srv/open-markdown-blog/file/db/h2   | `blog.mv.db`（设置 / 工作区 / 密钥校验值）+ `blog.trace.db`（出错时才生成） |
| 上传的图片              | /srv/open-markdown-blog/file/img     | 设置页上传的背景图                                    |

```bash
sudo mkdir -p /srv/open-markdown-blog/file/db/h2 \
              /srv/open-markdown-blog/file/img
sudo chown -R $(id -un):$(id -gn) /srv/open-markdown-blog/file
```

两者由 `SPRING_PROFILES_ACTIVE=prod` 的 profile（`api/src/main/resources/application-prod.yml`）指定，
可用 `APP_DATA_DIR` / `APP_IMG_DIR` 覆盖。**备份就是拷整个 `file/`。**

启动 / 停止（接口默认只听本机，端口 **8090**）：

```bash
cd /srv/open-markdown-blog/api/lastest
sh run.sh          # 后台启动 —— 脚本自己 nohup，可以直接关终端
sh run.sh stop     # 停止
sh run.sh fg       # 前台启动，报错打在终端上（排障用）
```

日志在 **jar 同目录**下、由应用自己写（与怎么启动无关；满 10MB 或跨天滚动，旧的 gzip 压缩留 30 天）：

```bash
tail -f /srv/open-markdown-blog/api/lastest/logs/$(date +%F)/api.log
```

> 所以 `file/db/h2` 那边现在只剩 H2 自己的库文件与 trace 日志，应用日志不在那里。
> **备份仍然是拷整个 `file/`**，日志不用备份。
