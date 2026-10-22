-- JmEditor 콘텐츠 / 서식 테이블 (MariaDB 10.3+ / MySQL 8+)
-- 이모지 등 4바이트 문자를 담도록 utf8mb4 로 만든다.
-- 본문은 최대 200만 자(EditorDto.MAX_CONTENT_LENGTH)까지 받으므로 TEXT(64KB) 대신 MEDIUMTEXT(16MB)를 쓴다.
CREATE TABLE IF NOT EXISTS editor_content (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title       VARCHAR(200),
    content     MEDIUMTEXT   NOT NULL,                      -- sanitize 된 HTML
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 서식 관리 (별도 관리 화면에서 등록/수정)
CREATE TABLE IF NOT EXISTS editor_format (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    category    VARCHAR(50),                                -- 서식 목록에서 묶어 보여줄 분류
    description VARCHAR(300),
    html        MEDIUMTEXT   NOT NULL,                      -- 에디터 허용 태그 범위로 작성
    sort_order  INT          NOT NULL DEFAULT 0,
    use_yn      CHAR(1)      NOT NULL DEFAULT 'Y',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_editor_format_use (use_yn, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
