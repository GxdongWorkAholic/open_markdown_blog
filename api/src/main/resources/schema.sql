-- H2 schema。全部 IF NOT EXISTS → 每次启动幂等执行，不需要 Flyway。
-- 列名刻意避开 H2 2.x 的关键字坑（KEY / VALUE / SIZE / NAME 等）。

-- 站点配置：单行表（id 恒为 1）。
-- prefs 是一袋异质键值（string / number / bool / string[]），按 JSON 原样存 ——
-- 这样未知键自动保留、数字的文本形式原样回写，与旧 config.json 逐字节一致。
CREATE TABLE IF NOT EXISTS app_config (
  id          INT       PRIMARY KEY,
  prefs_json  CLOB      NOT NULL,
  active_ws   VARCHAR(128),
  active_path VARCHAR(1024),
  updated_at  TIMESTAMP NOT NULL
);

-- 工作区：必须成行。服务端每个 /api/ws|doc|img 请求都要按 id 反查 root_path，
-- 这是「客户端不能指定任意绝对路径」这条安全边界的落点。
CREATE TABLE IF NOT EXISTS workspace (
  id         VARCHAR(128)  PRIMARY KEY,
  sort_no    INT           NOT NULL,
  name       VARCHAR(256)  NOT NULL,
  os         VARCHAR(16)   NOT NULL,
  root_path  VARCHAR(1024) NOT NULL,
  extra_json CLOB,
  updated_at TIMESTAMP     NOT NULL
);

-- 访问凭据：单行表。明文密钥永不落盘。
-- 常态只存 hash_b64（PBKDF2 派生值的哈希）。
-- 从旧 secure.json 迁移过来时先留着 iv_b64/ct_b64，首次验钥成功后清空（一次性升级）。
CREATE TABLE IF NOT EXISTS access_credential (
  id              INT          PRIMARY KEY,
  algo            VARCHAR(32)  NOT NULL,
  iterations      INT          NOT NULL,
  salt_b64        VARCHAR(64)  NOT NULL,
  iv_b64          VARCHAR(64),
  ct_b64          VARCHAR(2048),
  hash_salt_b64   VARCHAR(64),
  hash_b64        VARCHAR(128),
  hash_iterations INT,
  updated_at      TIMESTAMP    NOT NULL
);

-- 上传图片**不再进数据库**：改成磁盘文件，目录由 app.img-dir 指定（见 UploadStore）。
-- 所以这里没有 upload 表。老库里可能还留着这个表，不再使用，可以自行 DROP。
