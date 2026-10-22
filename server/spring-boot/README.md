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
4. **권한** — 샘플에는 인증·권한 처리가 없습니다. 등록·수정·업로드 API 는 각 서비스의 보안 설정 안에 두세요.

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

## 서버 sanitize 규칙 (`HtmlSanitizer`)

### 태그·속성

| 태그 | 허용 속성 |
|---|---|
| p | style, data-role (갤러리·슬라이드 제목에서만 유지) |
| h1, h2, h3, li, blockquote, ul, span | style |
| ol | style, start |
| br, strong, em, u, s, tbody, thead | — |
| a | href, target, rel, data-role, data-style, data-size |
| img | src, alt, width, height |
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
| img[src] | http, https, data, 상대 경로 |
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
| gallery | 제목 `p[data-role=title]`, `img` | data-cols 1~6 (범위 밖은 1·6 으로 맞춤, 숫자가 아니면 3), data-auto `1`, data-layout justify/cover, data-align center/right — 허용 값이 아니면 해당 속성 제거 |
| slider | 제목 `p[data-role=title]`, `img` | data-interval 0~60000 (기본 3000), data-ratio 16:9/4:3/1:1/21:9, data-indicator dots/numbers/bars/none, data-indicator-pos bottom-center/bottom-left/bottom-right, data-width 100/75/50, data-align left/center/right (기본 center) |
| buttons | `a` 만 (`data-role="button"` 강제) | data-align left/center/right (기본 center). 버튼 `data-style` primary/outline/gray (기본 primary), `data-size` sm/lg (그 밖이면 제거). 버튼이 없으면 블록 제거 |
| youtube | `iframe` 하나 | data-width 100/75/50, data-align left/center/right (기본 center). 바로 아래 `iframe` 이 없으면 블록 제거 |

- 제목은 내용이 비어 있으면 제거하고, 블록 바로 아래의 텍스트 노드도 제거합니다.
- 유튜브 `iframe` 은 `https://www.youtube.com/embed/{11자 id}` 또는 `youtube-nocookie.com` 주소일 때만 남깁니다. 남길 때 속성을 모두 지우고 `src=https://www.youtube-nocookie.com/embed/{id}`, `title`, `allow`, `allowfullscreen` 을 새로 씁니다. 유튜브 블록 밖의 `iframe` 은 제거합니다.

### 클라이언트 Sanitizer 와 다른 점

| 항목 | 클라이언트 (`core/Sanitizer.js`) | 서버 (`HtmlSanitizer`) |
|---|---|---|
| `ol[start]` | 1~4자리 숫자만 | 값 검사 없음 |
| `img[src]` 의 data | `data:image/` 만 | `data:` 전체 |
| `a[href]` 의 data | `data:image/` 허용 | 허용 안 함 |
| 출력 형식 | 공백 없이 | 블록 사이에 줄바꿈·들여쓰기가 들어감 (`body().html()` pretty print) |
