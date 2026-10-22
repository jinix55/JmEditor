# JmEditor Spring Boot 연동 가이드 (샘플)

클라이언트 `src/api/JmEditorApi.js` 의 기본 규약과 1:1 로 맞춘 서버 측 CRUD/업로드/서식 API 샘플입니다.
그대로 실행하는 프로젝트가 아니라, 기존 서버에 옮겨 넣을 때 참고하는 파일 모음입니다.
패키지 `com.example.jmeditor` 는 프로젝트에 맞게 바꿔서 사용하세요.

| Method | URL | 설명 |
|---|---|---|
| GET  | /api/editor/contents/{id} | 조회 |
| POST | /api/editor/contents | 등록 `{title, content}` |
| PUT  | /api/editor/contents/{id} | 수정 `{title, content}` |
| POST | /api/editor/upload/image | 이미지 업로드(multipart `file`) → `{url}` |
| GET  | /api/editor/formats | 서식 목록 (use_yn='Y', sort_order 순) |

오류 응답은 `{ "message": "..." }` 형태로 내려주면 클라이언트가 그 문구를 그대로 띄웁니다.

## 서버에서 꼭 처리할 것

1. **저장 전 sanitize** — 등록·수정 본문은 반드시 `HtmlSanitizer.clean()` 을 거쳐 저장합니다. 클라이언트 Sanitizer 는 편의용이라 우회할 수 있습니다. 서식(`editor_format.html`)도 내려줄 때 같은 sanitize 를 거칩니다.
2. **상대 경로 보존** — jsoup 은 `baseUri` 로 절대 주소를 만든 뒤 프로토콜을 검사합니다. `Jsoup.clean(html, "", ...)` 처럼 빈 `baseUri` 를 넘기면 `/uploads/editor/...` 같은 상대 경로 `src`/`href` 가 모두 지워져 업로드한 이미지가 사라집니다. 샘플은 검사용 가상 주소(`http://jm-editor.local/`)와 `preserveRelativeLinks(true)` 를 함께 써서, 저장값은 원래 상대 경로로 둡니다.
3. **업로드 확장자는 MIME 으로 결정** — 원본 파일명의 확장자를 쓰면 `Content-Type: image/png` 로 위장한 `.html`·`.svg` 가 같은 출처에서 그대로 서빙되어 저장형 XSS 가 됩니다. 샘플은 MIME → 확장자 표로만 정하고, 그 밖의 MIME 은 거부합니다.

   | MIME | 저장 확장자 |
   |---|---|
   | image/jpeg | .jpg |
   | image/png | .png |
   | image/gif | .gif |
   | image/webp | .webp |

   파일명은 UUID, 경로는 `upload-dir/yyyy/MM/dd/` 입니다. Content-Type 은 클라이언트가 보내는 값이므로, 더 엄격하게 하려면 파일 앞부분(매직바이트) 검사를 추가하세요.
4. **권한** — 샘플에는 인증·권한 처리가 없습니다. 등록·수정·업로드 API 는 각 서비스의 보안 설정 안에 두세요(작성자 검증, CSRF — 클라이언트는 `api.headers` 옵션으로 토큰 전달, 업로드 횟수 제한).
6. **업로드 파일 응답 헤더** — 업로드 폴더를 정적 리소스로 서빙할 때 `X-Content-Type-Options: nosniff` 와 `Content-Security-Policy: …; sandbox` 를 붙입니다(`UploadConfig.UploadHeaderInterceptor`). 이미지로 위장한 파일을 브라우저가 HTML 등으로 추측해 실행하지 않게 하고, 문서로 열려도 스크립트가 돌지 않게 합니다. 가능하면 업로드 파일은 쿠키가 없는 별도 도메인에서 서빙하세요.
7. **본문 크기 제한** — `EditorDto.MAX_CONTENT_LENGTH`(기본 200만 자)를 넘는 본문은 400 으로 거부합니다. base64 이미지를 본문에 넣어 업로드 크기 제한을 우회하거나 DB 를 부풀리는 것을 막습니다. 이미지 `data:` 주소는 이미지 형식(png·jpeg·gif·webp·svg)의 base64 만 남깁니다.
8. **오류 응답** — 입력 오류는 안내 문구를, 파일 입출력 오류는 서버 경로 같은 내부 정보가 담길 수 있으므로 로그에만 남기고 일반 문구(500)를 내려줍니다.
5. **갤러리 업로드 제한** — 에디터는 설정값(`window.JmEditorConfig` 또는 생성 옵션 `galleryLimits`)으로 업로드 전에 막지만 우회할 수 있으므로, 서버에서도 같은 값으로 검사합니다.

   | 항목 | 기본값 | 서버에서 검사하는 곳 |
   |---|---|---|
   | 형식 | jpg·png·gif·webp | 업로드 API — 샘플 `ImageUploadService` 의 MIME 표 |
   | 파일당 크기 | 10MB | 업로드 API — `spring.servlet.multipart.max-file-size` |
   | 1회 장수 | 10장 | 에디터는 한 장씩 업로드하므로 서버 검사 불필요 |
   | 글당 장수 | 50장 | 등록·수정 API — 저장할 본문의 `div[data-type=gallery] > img` 개수 (샘플에는 없음) |
   | 글당 용량 | 100MB | 등록·수정 API — 본문 이미지들의 저장 파일 크기 합 (샘플에는 없음) |
   | 긴 변 축소 | 2000px (GIF 제외) | 에디터가 업로드 전에 줄임. 서버에서 강제하려면 업로드 시 크기 확인 후 축소·거부 |

   제한 값을 바꾸면 설정 파일과 서버 설정을 함께 바꿔야 합니다.

## 의존성 (build.gradle)
```groovy
implementation 'org.springframework.boot:spring-boot-starter-web'
implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
implementation 'org.springframework.boot:spring-boot-starter-validation'
implementation 'org.jsoup:jsoup:1.18.1'   // 서버 측 HTML sanitize (필수)
```

## application.yml
```yaml
jm-editor:
  upload-dir: /var/app/uploads/editor   # 이미지 저장 경로
  upload-url-prefix: /uploads/editor    # 정적 리소스로 노출되는 URL 접두사
spring:
  servlet:
    multipart:
      max-file-size: 10MB
```
`upload-url-prefix` 를 `upload-dir` 로 매핑하는 `WebMvcConfigurer.addResourceHandlers` 는 `UploadConfig` 참고.

## DB

| 파일 | 내용 |
|---|---|
| `schema-postgresql.sql` | `editor_content`(본문), `editor_format`(서식) 테이블 — PostgreSQL |
| `sample-formats-postgresql.sql` | 서식 샘플 데이터 13건 (클라이언트 기본 서식 `SAMPLE_FORMATS` 와 같은 내용) — PostgreSQL |
| `schema-mariadb.sql` | 같은 테이블 — MariaDB 10.3+ / MySQL 8+ (utf8mb4, 본문·서식 HTML 은 `MEDIUMTEXT`) |
| `sample-formats-mariadb.sql` | 같은 서식 샘플 13건 — MariaDB / MySQL |

```bash
# PostgreSQL
psql -d <DB> -f schema-postgresql.sql
psql -d <DB> -f sample-formats-postgresql.sql

# MariaDB / MySQL
mariadb --default-character-set=utf8mb4 <DB> < schema-mariadb.sql
mariadb --default-character-set=utf8mb4 <DB> < sample-formats-mariadb.sql
```

MariaDB 의 `TEXT` 는 64KB 까지라 본문(최대 200만 자)이 잘릴 수 있어 `MEDIUMTEXT` 로 만듭니다. JPA `ddl-auto` 로 테이블을 만들면 엔티티의 `columnDefinition = "TEXT"` 대로 생성되므로, MariaDB 에서는 위 스키마 파일로 만들거나 엔티티를 `MEDIUMTEXT` 로 바꿔 쓰세요.

`api` 옵션을 쓰면 서식 목록을 `/api/editor/formats`, 즉 `editor_format` 테이블에서 받습니다. 테이블이 비어 있으면 서식 목록도 비어 보이므로 샘플 데이터를 넣거나 서식 관리 화면에서 등록하세요. 샘플 쿼리는 같은 이름의 서식이 있으면 건너뛰어서 여러 번 실행해도 됩니다.

## 서버 sanitize 규칙 (`HtmlSanitizer`)

### 태그·속성

| 태그 | 허용 속성 |
|---|---|
| p | style, data-role (갤러리·슬라이드 제목에서만 유지) |
| h1, h2, h3, li, ul, span | style |
| blockquote | style, data-style(box·quote 만 — 세로선은 기본값이라 속성 없음) |
| ol | style, start |
| br, strong, em, u, s, tbody, thead | — |
| a | href, target, rel, data-role, data-style, data-size, data-color, data-tone, data-icon, data-icon-pos, style(버튼의 `--jm-btn: #hex` 만) — 버튼 속성은 `data-role="button"` 일 때만 남음 |
| img | src, alt, width, height, data-float(left·right), style(`width: N%` 10~100 만 — 글 감싸기) |
| table | style, data-border |
| colgroup | — |
| col, tr | style |
| td, th | style, colspan, rowspan |
| div | 아래 블록(`data-type`)일 때만 |
| iframe | 유튜브 블록 안에서만 |

- 그 밖의 태그는 제거하고 안의 텍스트만 남깁니다 (`script`·`style` 은 내용까지 제거). `data-type` 이 없거나 모르는 값인 `div` 는 속성을 모두 지우고 `p` 로 바꿉니다.
- `style` 이 모두 걸러진 `span` 은 풀어서(unwrap) 안의 내용만 남깁니다.
- `p[data-role]` 은 부모가 `gallery` 또는 `slider` 블록일 때만 남습니다.

### URL

| 대상 | 허용 |
|---|---|
| a[href] | http, https, mailto, 상대 경로(`/…`, `#…`) |
| img[src] | http, https, 상대 경로, `data:image/(png·jpeg·gif·webp·svg+xml);base64,` |
| iframe[src] | 유튜브 embed 주소만 (아래 참고) |

`javascript:` 등 그 밖의 프로토콜은 속성째 제거합니다. 모든 링크에는 `target="_blank"`, `rel="noopener noreferrer"` 가 강제로 붙습니다.

### style

허용 속성 외의 선언은 버리고, 값 형식도 검사합니다.

| 속성 | 허용 값 |
|---|---|
| color, background-color | `#hex`(3~8자리), `rgb()`/`rgba()`, 색 이름 |
| text-align | left, center, right, justify |
| vertical-align | top, middle, bottom |
| width | 숫자 + `px`/`%`, `auto` |
| height | 숫자 + `px` |
| font-size | 8~96 `px` (정수) |
| list-style-type | disc, circle, square, decimal, decimal-leading-zero, lower-alpha, upper-alpha, lower-roman, upper-roman, hangul, hangul-consonant, none |

### 블록 (`div[data-type]`)

| 블록 | 자식 | 속성 (허용 값 밖이면 기본값) |
|---|---|---|
| gallery | 제목 `p[data-role=title]`, `img` | data-layout justify/cover. 예전 저장분 호환용: data-cols 는 있을 때만 1~6 으로 맞춤(숫자가 아니면 제거), data-auto `1`, data-align center/right — 허용 값이 아니면 해당 속성 제거 |
| slider | 제목 `p[data-role=title]`, `img` | data-interval 0~60000 (기본 3000), data-ratio 16:9/4:3/1:1/21:9, data-indicator dots/numbers/bars/none, data-indicator-pos bottom-center/bottom-left/bottom-right, data-width 100/75/50, data-align left/center/right (기본 center) |
| buttons | `a` 만 (`data-role="button"` 강제) | data-align left/center/right (기본 center). 버튼 `data-style` primary/outline/soft/gray (기본 primary), `data-size` sm/lg, `data-color` green/red/orange/purple/gray/black (blue 는 기본값이라 제거), `data-icon` 16종(arrow·external·download·phone·mail·calendar·pin·search·play·check·info·heart·star·plus·chat·file), `data-icon-pos` right(아이콘이 있을 때만). 직접 색은 `style` 의 `--jm-btn: #rgb/#rrggbb` 만 남기고(테마 색보다 우선) 밝기로 `data-tone="light"` 를 다시 계산. 버튼이 없으면 블록 제거 |
| youtube | `iframe` 하나 | data-width 100/75/50, data-align left/center/right (기본 center). 바로 아래 `iframe` 이 없으면 블록 제거 |
| layout | `div[data-cell=image]`(img 1장만), `div[data-cell=text]`(문단·제목·목록·인용·인라인만 — 표·이미지·iframe·블록 제거) | data-preset side/one/diagonal/pair (기본 side), data-variant 는 preset 별 허용 값(기본 첫 배치), data-split 20~80 의 5 배수만. 칸은 variant 의 저장 순서대로 다시 세우고 모자라면 빈 칸을 채우며 넘치면 버림 |

- 제목은 내용이 비어 있으면 제거하고, 블록 바로 아래의 텍스트 노드도 제거합니다.
- 배치 블록의 preset·variant 별 칸 저장 순서(`LAYOUT_CELLS`)는 클라이언트 `src/plugins/layout/layout-presets.js` 와 같아야 합니다.
- 유튜브 `iframe` 은 `https://www.youtube.com/embed/{11자 id}` 또는 `youtube-nocookie.com` 주소일 때만 남깁니다. 남길 때 속성을 모두 지우고 `src=https://www.youtube-nocookie.com/embed/{id}`, `title`, `allow`, `allowfullscreen` 을 새로 씁니다. iframe 안의 내용은 비웁니다(남기면 저장할 때마다 escape 가 겹쳐 늘어남). 유튜브 블록 밖의 `iframe` 은 제거합니다.

### 클라이언트 Sanitizer 와 다른 점

| 항목 | 클라이언트 (`core/Sanitizer.js`) | 서버 (`HtmlSanitizer`) |
|---|---|---|
| `ol[start]` | 1~4자리 숫자만 | 값 검사 없음 |
| `a[href]` | http(s)·mailto·tel·`#`·`/` 경로만 (`//…`, `/\…` 같은 외부 주소 우회 차단). 사용자가 입력한 링크는 도메인만 쓰면 `https://` 를 붙이고 `javascript:` 등은 거부 | http·https·mailto 와 상대 경로(`//…` 포함) |
| 출력 형식 | 공백 없이 | 블록 사이에 줄바꿈·들여쓰기가 들어감 (`body().html()` pretty print) |
