-- JmEditor 콘텐츠 / 서식 테이블 (PostgreSQL)
CREATE TABLE IF NOT EXISTS editor_content (
    id          BIGSERIAL PRIMARY KEY,
    title       VARCHAR(200),
    content     TEXT        NOT NULL,                       -- sanitize 된 HTML
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 서식 관리 (별도 관리 화면에서 등록/수정)
CREATE TABLE IF NOT EXISTS editor_format (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(300),
    html        TEXT         NOT NULL,                      -- 에디터 허용 태그 범위로 작성
    sort_order  INT          NOT NULL DEFAULT 0,
    use_yn      CHAR(1)      NOT NULL DEFAULT 'Y',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_editor_format_use ON editor_format (use_yn, sort_order);
