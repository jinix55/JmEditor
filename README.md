# JmEditor

contenteditable 위에 직접 올린 WYSIWYG 웹에디터입니다. 외부 라이브러리를 쓰지 않고, Thymeleaf나 JSP처럼 서버에서 렌더링하는 페이지에 `<script type="module">` 하나로 붙이는 걸 목표로 만들었습니다. React 쪽은 같은 코어를 감싸는 얇은 래퍼로 붙입니다.

데모: https://jinix55.github.io/JmEditor/ (저장소를 받아서 [examples/demo/index.html](examples/demo/index.html) 을 열어도 됩니다.) (src/ 코드를 한 파일로 합친 단독 버전이라 서버 없이 열립니다.)

## 기능

- 굵게 / 기울임 / 밑줄 / 취소선, 글자 크기(10~48px), 글자색 / 배경색 (견본 + HSV 팔레트 + HEX 입력 + 스포이드)
- 제목(본문·제목 1~3 셀렉트), 인용(세로선·박스·따옴표 — 인용 버튼 목록에서 선택·해제), 가로 정렬(왼쪽/가운데/오른쪽)·세로 정렬(표 셀) 드롭다운, 순서 / 비순서 목록(● ○ ■, 1. 01. a. A. i. I. 가.), 링크, 버튼 그룹 블록(서식 — 이름·주소 입력으로 추가, 모양(채움·외곽선·연한색)·색(테마 7색 또는 직접 선택 — 고른 색 하나로 테두리·오버·연한 배경·글자색 자동)·크기·아이콘 16종(글자 앞/뒤), 그립 드래그로 순서, 정렬)
- 이미지 삽입 (버튼, 드래그 앤 드롭, 붙여넣기)
- 글 감싸기 — 본문 이미지를 클릭하면 도구 막대가 뜹니다. 왼쪽·오른쪽 감싸기(이미지 옆으로 글이 흐르고 아래로 이어짐), 폭 30·40·50·100% 또는 모서리 손잡이로 본문 폭 대비 % 조절, 교체·삭제, ⠿ 로 다른 문단 앞뒤로 이동. 휴대폰 폭(640px 이하)에서는 감싸기를 풀고 꽉 차게
- 이미지 + 글 배치 블록(서식) — 이미지 | 글(2칸), 이미지 1장 + 글(4분할: 이미지 옆 작은 칸 + 반대쪽 줄 전체), 대각선 이미지 2장 + 글, 이미지 2장 나란히 + 각각 글. 헤더 아이콘으로 이미지 위치를 바꾸면 글은 같은 역할 칸으로 따라가고, 가운데 경계를 끌어 좌우 폭(20~80%) 조절. 이미지 칸은 클릭·파일 놓기로 넣고 교체·삭제. 휴대폰 폭에서는 세로로 쌓임
- 이미지 슬라이드 — 이미지가 자동으로 넘어가는 블록(서식). 간격(수동/2~8초)·비율·인디케이터(점/숫자/막대/없음, 하단 좌/중/우)·폭·정렬, 썸네일로 선택·순서 변경. 뷰어에는 `slider-runtime.js` 필요
- 유튜브 — 주소를 넣으면 16:9 영상 블록이 들어갑니다. 폭(100 / 75 / 50%)과 정렬 선택, ⠿ 핸들로 이동
- 표 — 툴바에서 N×M 격자로 크기를 골라 삽입. 셀을 드래그(또는 Shift+클릭)하면 범위 선택. 우클릭 메뉴에서 행 / 열 추가·삭제·이동, 머리글 행·열 전환, 셀 병합·분할, 가로·세로 정렬, 셀·행 배경색, 표 폭·테두리. 셀 경계를 끌면 열 너비·행 높이 조절. 왼쪽 위 ⠿ 핸들을 끌어 위치 이동
- 이미지 갤러리 블록 — 사진을 여러 장 올리면 원본 비율을 유지한 채 줄 전체를 채우도록 자동 배치합니다(세로 사진이 섞여도 줄 높이가 같고, 마지막 줄은 늘리지 않고 왼쪽 정렬). 사진은 드래그로 순서 변경, 선택 후 교체·삭제. 줄 높이·간격은 CSS 변수로 디자인에서 정합니다. 업로드 제한(jpg·png·gif·webp, 파일당 10MB, 1회 10장, 글당 50장 또는 100MB)과 긴 변 2000px 초과 시 축소(GIF 제외)는 설정 파일로 바꿉니다. 헤더의 ⠿ 핸들로 블록 이동, 제목은 선택 사항, 사진별 캡션은 없음
- 서식(템플릿) 삽입 — 서버에서 받아온 HTML 조각을 골라 본문에 넣습니다. 서식 관리는 별도 화면에서
- Editor / HTML / 미리보기 모드 전환
- undo / redo, 한글 IME 조합 처리, 외부 글 붙여넣기 시 허용 태그만 남김
- 조회 / 등록 / 수정 / 이미지 업로드 / 서식 목록 API 연동 (`JmEditorApi`)

동시편집은 아직 없습니다.

## 사용법

필요한 건 `dist/` 의 파일들입니다. 빌드할 필요 없이 그대로 복사해서 씁니다.

| 파일 | 용도 |
|---|---|
| `dist/jm-editor.css` | 편집 화면·조회 화면 공통 스타일 |
| `dist/jm-editor.min.js` | 에디터 전체 (전역 `JmEditor.*`). ES Module 이 필요하면 `jm-editor.esm.js` |
| `dist/jm-viewer.min.js` | 조회 화면용 런타임 (갤러리 배치·슬라이드 전환). ESM 은 `jm-viewer.esm.js` |
| `dist/jm-editor.config.js` | 설정 견본 (업로드 제한 등). 선택 사항 — 아래 [설정](#설정) 참고 |

복사하지 않고 CDN(jsDelivr)으로 불러와도 됩니다. 주소의 `@v0.0.2` 은 릴리스 태그로, 내용이 고정됩니다.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/jinix55/JmEditor@v0.0.2/dist/jm-editor.css">
<script src="https://cdn.jsdelivr.net/gh/jinix55/JmEditor@v0.0.2/dist/jm-editor.min.js"></script>   <!-- 편집 화면 -->
<script src="https://cdn.jsdelivr.net/gh/jinix55/JmEditor@v0.0.2/dist/jm-viewer.min.js"></script>   <!-- 조회 화면 -->
```

항상 그 범위의 최신 릴리스를 받으려면 `@0.0`(0.0.x 최신)처럼 범위로 쓸 수 있습니다(새 릴리스 반영까지 최대 약 12시간).

ES Module 은 `…@v0.0.2/dist/jm-editor.esm.js` 를 import 합니다. 설정은 CDN 의 `jm-editor.config.js` 대신 페이지에서 `window.JmEditorConfig` 로 지정하세요([설정](#설정)).

### 편집 화면

```html
<link rel="stylesheet" href="/css/jm-editor.css">
<div id="editor"></div>
<script src="/js/jm-editor.min.js"></script>
<script>
  const editor = new JmEditor.JmToolbarEditor(document.getElementById('editor'), {
    placeholder: '내용을 입력하세요',
    api: { baseUrl: '', headers: () => ({ 'X-CSRF-TOKEN': token }) },
    contentId,   // 수정 화면이면 id, 등록이면 null
  });

  // 저장: contentId 가 없으면 등록, 있으면 수정
  saveButton.onclick = () => editor.save({ title: titleInput.value });
</script>
```

Thymeleaf, JSP 모두 이 형태 그대로입니다. 전체 예시는 [examples/thymeleaf/notice-form.html](examples/thymeleaf/notice-form.html)(등록·수정), [notice-view.html](examples/thymeleaf/notice-view.html)(조회).

API 없이 폼으로만 보낼 거면 `api` 옵션을 빼고 submit 직전에 `editor.getHTML()` 을 hidden input 에 넣으면 됩니다.

### 설정

업로드 제한 같은 값은 빌드 없이 페이지에서 바꿉니다. 에디터는 생성(`new JmToolbarEditor(...)`)할 때 설정을 읽으므로 CDN 으로 불러와도 그대로 적용됩니다. 바꿀 항목만 적으면 되고, 빠진 항목은 기본값을 씁니다. 크기 단위는 MB, 길이 단위는 px 입니다.

**1. 페이지 전체에 적용** — `window.JmEditorConfig` 를 에디터 생성 전에 지정합니다. 에디터 스크립트를 불러온 뒤여도 생성 전이면 됩니다.

```html
<script src="https://cdn.jsdelivr.net/gh/jinix55/JmEditor@v0.0.2/dist/jm-editor.min.js"></script>
<script>
  window.JmEditorConfig = { gallery: { maxFileSizeMB: 20, maxImagesPerPost: 30 } };
  const editor = new JmEditor.JmToolbarEditor(el, { /* ... */ });
</script>
```

**2. 에디터마다 적용** — 생성 옵션 `galleryLimits` 로 넘깁니다(키는 같음). 1번보다 우선합니다.

```js
new JmEditor.JmToolbarEditor(el, { galleryLimits: { maxFilesPerAdd: 5 } });
```

여러 화면에서 같은 값을 쓰려면 `dist/jm-editor.config.js` 견본을 자기 서버에 복사해 값을 고치고 에디터 생성 전에 불러와도 됩니다. CDN 의 견본을 그대로 불러오면 기본값과 같아서 의미가 없습니다. 전체 항목과 기본값:

```js
window.JmEditorConfig = {
  gallery: {
    types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], // 올릴 수 있는 형식
    maxFileSizeMB: 10,      // 파일당 (원본)
    maxFilesPerAdd: 10,     // 한 번에 올리는 장수
    maxImagesPerPost: 50,   // 글당 장수
    maxTotalSizeMB: 100,    // 글당 용량 (축소 후)
    maxDimension: 2000,     // 긴 변 상한, 넘으면 축소 (GIF 제외)
  },
};
```

우선순위는 생성 옵션 `galleryLimits` > `window.JmEditorConfig` > 기본값입니다. 제한에 걸리면 `notify` 옵션으로 넘긴 함수에 안내 문구를 주고, 없으면 `alert` 로 띄웁니다. 글당 용량은 이번 편집에서 올린 사진만 셉니다(불러온 기존 사진은 크기를 알 수 없음). 클라이언트 제한은 우회할 수 있으므로 서버에서도 같은 값으로 검사하세요 ([서버 연동 가이드](server/spring-boot/README.md)).

갤러리 줄 높이·간격·한 줄 장수는 CSS 변수로 정합니다.

```css
.jm-content div[data-type="gallery"], .jm-editor div[data-type="gallery"] {
  --jm-gallery-row-height: 240px;  /* 목표 줄 높이 (기본 200px) */
  --jm-gallery-gap: 12px;          /* 이미지 간격 (기본 8px) */
  --jm-gallery-max-per-row: 5;     /* 한 줄 최대 장수, 대략 (기본 4) */
}
```

줄 높이는 「목표 줄 높이」와 「4:3 사진이 한 줄 최대 장수만큼 들어가는 높이」 중 큰 값입니다. 그래서 좁은 화면에서는 목표 줄 높이대로, 넓은 화면에서는 줄 높이가 커져 한 줄에 사진이 너무 많이 들어가지 않습니다. 세로 사진은 같은 줄 높이에 폭이 좁게, 가로 사진은 넓게 들어가 각 줄이 폭을 꽉 채웁니다. 2:3 보다 길쭉한 세로 사진(폭/높이 0.67 이하)은 두 줄 높이를 차지하고 옆에 다음 사진들이 두 줄로 쌓입니다(옆에 4:3 사진 1.5장이 들어갈 폭이 없는 좁은 화면에서는 일반 줄). 사진은 배치 스크립트가 좌표로 놓으므로 조회 화면에도 `JmViewer.initViewer` 가 필요하고, 스크립트가 없으면 줄 단위로 보입니다.

ES Module 로 쓰려면:

```html
<script type="module">
  import { JmToolbarEditor } from '/js/jm-editor.esm.js';
</script>
```

### 조회 화면

저장된 HTML 을 `.jm-content` 안에 그대로 출력하고 뷰어 런타임을 한 번 초기화합니다.

```html
<link rel="stylesheet" href="/css/jm-editor.css">
<div class="jm-content" th:utext="${content}"></div>
<script src="/js/jm-viewer.min.js"></script>
<script>JmViewer.initViewer(document.querySelector('.jm-content'));</script>
```

표·버튼·유튜브·글 감싸기·이미지 + 글 배치는 CSS 만으로 보이고, 갤러리 비율 배치와 슬라이드 전환이 런타임을 씁니다.

### React / Next.js

`npm i github:jinix55/JmEditor` 후 `import { JmToolbarEditor } from 'jm-editor'`, 뷰어는 `jm-editor/viewer`, CSS 는 `jm-editor/css` 입니다. 툴바까지 그대로 쓰는 편집 컴포넌트(`JmEditor`)와 조회 컴포넌트(`JmContent`) 예시는 [examples/react/JmEditor.jsx](examples/react/JmEditor.jsx). Next.js App Router 에서는 `'use client'` 가 필요합니다.

```jsx
const editorRef = useRef(null);
<JmEditor ref={editorRef} api={{ baseUrl: '' }} contentId={id} />   // 등록·수정
<button onClick={() => editorRef.current.save({ title })}>저장</button>
<JmContent html={record.content} />                                // 조회
```

### 서버

[server/spring-boot](server/spring-boot) 의 Spring Boot 구현(조회·등록·수정·이미지 업로드·서식 목록)을 패키지에 맞춰 넣고, `schema-postgresql.sql`(MariaDB 는 `schema-mariadb.sql`)로 테이블을 만듭니다. 저장 전 `HtmlSanitizer` 를 반드시 거칩니다.

### 소스로 쓰기 / 직접 빌드

`src/` 를 그대로 서빙해 `src/ui/JmToolbarEditor.js` 를 import 해도 됩니다(15개 파일). 배포본을 다시 만들려면 `npm install && npm run build` (esbuild).

## API 규약

`JmEditorApi` 기본 엔드포인트입니다. `endpoints` 옵션으로 하나씩 바꿀 수 있고 `baseUrl` 로 접두사를 붙입니다.

| | | |
|---|---|---|
| GET | `/api/editor/contents/{id}` | `{ id, title, content }` |
| POST | `/api/editor/contents` | 등록 → `{ id, ... }` |
| PUT | `/api/editor/contents/{id}` | 수정 |
| POST | `/api/editor/upload/image` | multipart `file` → `{ url }` |
| GET | `/api/editor/formats` | `[{ id, name, description, html }]` |

```js
api: {
  baseUrl: 'https://api.example.com',
  endpoints: { get: id => `/v2/notices/${id}`, create: '/v2/notices' },
  headers: () => ({ Authorization: 'Bearer ' + token }),
}
```

응답 형태만 맞추면 기존 API 에 그대로 붙습니다. 오류 응답에 `message` 가 있으면 그 문구를 그대로 띄웁니다.

## 서버

[server/spring-boot](server/spring-boot) 에 Spring Boot(JPA + jsoup) 구현을 넣어 뒀습니다. 위 다섯 개 엔드포인트, 이미지 업로드 저장, `editor_content` / `editor_format` 스키마·서식 샘플(PostgreSQL, MariaDB)이 들어 있습니다.

클라이언트 Sanitizer 는 편의용입니다. 저장 전에 서버에서 한 번 더 걸러야 하고, `HtmlSanitizer.java` 가 클라이언트와 같은 규칙으로 처리합니다.

## 저장되는 HTML

허용 태그는 p, br, strong, em, u, s, h1~h3, ul, ol, li, blockquote, a, img, table 계열(colgroup, col 포함), span, 갤러리용 `div[data-type="gallery"]`, 유튜브용 `div[data-type="youtube"] > iframe` (src 는 youtube-nocookie.com/embed/ 만), 버튼용 `div[data-type="buttons"] > a[data-role="button"]`(모양 `data-style`, 테마 색 `data-color`, 직접 색 `style="--jm-btn: #rrggbb"`+`data-tone`, 아이콘 `data-icon`·`data-icon-pos` — 테마 실제 색은 `:root { --jm-btn-green: … }` 처럼 사이트에서 바꿀 수 있음), 이미지 + 글 배치용 `div[data-type="layout"] > div[data-cell]` 입니다. 이미지에는 글 감싸기용 `data-float`(left·right)와 `style="width: N%"`(10~100)만 더 남습니다. 인용은 `blockquote` 기본(세로선)에 `data-style="box"`(박스)·`data-style="quote"`(글 처음·끝에 따옴표)가 있습니다. style 은 `color`, `background-color`, `text-align`, `vertical-align`, `width`, `height`, `font-size`, `list-style-type` 만 남고 값 형식도 검사합니다.

표는 이렇게 저장됩니다. 열 너비는 `colgroup`, 행 높이는 `tr`, 병합은 `colspan` / `rowspan`, 테두리 숨김은 `data-border="0"` 입니다.

```html
<table style="width: auto" data-border="0">
  <colgroup><col style="width: 120px"><col style="width: 240px"></colgroup>
  <tbody><tr style="height: 40px"><th colspan="2" style="text-align: center">제목</th></tr></tbody>
</table>
```

표 레이어, 갤러리 헤더, 선택 표시 같은 편집용 UI 는 `getHTML()` 에서 전부 제거되고 순수 HTML 만 나옵니다. 조회 페이지에서는 본문 컨테이너에 `class="jm-content"` 를 주고 `jm-editor.css` 를 포함하면 미리보기와 같은 모습으로 보입니다.

갤러리 블록은 이렇게 저장됩니다.

```html
<div data-type="gallery" data-layout="justify">
  <p data-role="title">현장 사진</p>
  <img src="..." width="1600" height="1200"><img src="..." width="900" height="1600">
</div>
```

`width` / `height` 는 원본 크기(축소했다면 축소 후 크기)이고 비율 계산에 씁니다. 갤러리 배치는 조회 페이지에서도 배치 스크립트가 필요합니다 (`JmViewer.initViewer` 에 포함).

```js
import { observeGalleries } from '/js/jm-editor/plugins/gallery/gallery-layout.js';
observeGalleries(document.querySelector('.jm-content'));
```

예전 버전에서 저장된 `data-layout="cover"`·`data-cols`·`data-align` 갤러리도 조회 화면에서는 그대로 보이고, 에디터에서 열어 저장하면 위 형식으로 바뀝니다.

슬라이드 블록도 조회 페이지에서 런타임을 한 번 초기화해야 돌아갑니다.

```js
import { initSliders } from '/js/jm-editor/plugins/slider/slider-runtime.js';
initSliders(document.querySelector('.jm-content'));
```

글 감싸기 이미지는 이렇게 저장됩니다. 이미지 문단 뒤에 오는 문단들이 이미지를 둘러 흐릅니다.

```html
<p><img src="..." width="1600" height="1200" data-float="left" style="width: 40%"></p>
<p>이미지 오른쪽부터 흐르는 글…</p>
```

이미지 + 글 배치 블록은 이렇게 저장됩니다.

```html
<div data-type="layout" data-preset="one" data-variant="tl" data-split="40">
  <div data-cell="image"><img src="..." width="1600" height="1200"></div>
  <div data-cell="text"><p>이미지 옆 글</p></div>
  <div data-cell="text"><p>아래 전체 폭 글</p></div>
</div>
```

| data-preset | data-variant (칸 저장 순서) |
|---|---|
| `side` 이미지 \| 글 | `left`(이미지, 글) · `right`(글, 이미지) |
| `one` 이미지 1장 + 글 | `tl`(이미지, 옆 글, 아래 전체 글) · `tr`(옆 글, 이미지, 아래 전체 글) · `bl`(위 전체 글, 이미지, 옆 글) · `br`(위 전체 글, 옆 글, 이미지) |
| `diagonal` 대각선 2장 | `tl-br`(이미지, 위 글, 아래 글, 이미지) · `tr-bl`(위 글, 이미지, 이미지, 아래 글) |
| `pair` 이미지 2장 나란히 | `top`(이미지, 글, 이미지, 글 — 같은 열끼리) · `bottom`(글, 이미지, 글, 이미지) |

칸 저장 순서가 곧 휴대폰에서 세로로 쌓이는 순서입니다. `data-split` 은 왼쪽 열 폭(%)으로 20~80 의 5 단위, 없으면 50 입니다. 칸 간격은 CSS 변수 `--jm-layout-gap`(기본 16px)으로 바꿉니다.

## 구조

```
src/
  core/      JmEditor.js(진입점), Commands.js, SelectionUtil.js, History.js, Sanitizer.js
  plugins/   table/, gallery/, embed/(유튜브), buttons/, slider/(SliderCommands, slider-runtime), layout/(이미지 + 글 배치) — 블록형 기능. 편집 중에만 쓰는 레이어를 씌우고 저장 시 벗김
             image/(본문 이미지 글 감싸기·크기 조절 도구)
  ui/        JmToolbarEditor.js(툴바), ColorPicker, TableGridPicker, FormatPicker, ContextMenu
  api/       JmEditorApi.js
  styles/    jm-editor.css
examples/    demo(단독 HTML), thymeleaf, react
server/      spring-boot
```

코어는 DOM 이 곧 문서 모델입니다. `execCommand` 는 쓰지 않고 Range 를 직접 다룹니다. 브라우저마다 contenteditable 동작이 조금씩 달라서, 특히 Backspace 로 블록을 합칠 때는 루트 바로 아래에 텍스트가 남지 않게 `p` 로 다시 감싸는 정도만 보정하고 있습니다.

## 라이선스

[MIT License](LICENSE) © 2026 jinix55

- **할 수 있는 것**: 개인·회사·상용 서비스에 무료로 쓰고, 고치고, 다시 배포하거나 판매하는 제품에 넣을 수 있습니다. 소스 공개 의무는 없습니다.
- **지켜야 할 것**: 코드를 복사하거나 다시 배포할 때 저작권 표시와 라이선스 문구([LICENSE](LICENSE))를 함께 남겨 주세요. 빌드 파일(`dist/*.js`) 맨 앞의 주석 `/* JmEditor | MIT License | (c) 2026 jinix55 … */` 을 지우지 않으면 됩니다.
- **보증 없음**: 있는 그대로 제공되며, 사용으로 생긴 문제에 대해 작성자는 책임지지 않습니다. 운영에 쓸 때는 서버 측 sanitize([server/spring-boot](server/spring-boot))를 꼭 함께 적용하세요.

### 사용한 외부 요소

| 항목 | 쓰는 곳 | 라이선스 |
|---|---|---|
| 에디터·뷰어 코드, 툴바·버튼 아이콘(SVG) | `src/`, `dist/` | 직접 작성 — MIT (위와 같음) |
| [esbuild](https://github.com/evanw/esbuild) | 빌드 도구 (배포 파일에 포함되지 않음) | MIT |
| [jsoup](https://jsoup.org/) | 서버 연동 샘플의 HTML sanitize (직접 추가하는 의존성) | MIT |

에디터 자체는 실행 시 외부 라이브러리에 의존하지 않습니다. 유튜브 삽입은 `youtube-nocookie.com` 의 iframe 을 그대로 쓰므로, 영상 재생에는 YouTube 이용약관이 적용됩니다.
