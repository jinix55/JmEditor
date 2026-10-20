# JmEditor

contenteditable 위에 직접 올린 WYSIWYG 웹에디터입니다. 외부 라이브러리를 쓰지 않고, Thymeleaf나 JSP처럼 서버에서 렌더링하는 페이지에 `<script type="module">` 하나로 붙이는 걸 목표로 만들었습니다. React 쪽은 같은 코어를 감싸는 얇은 래퍼로 붙입니다.

데모: https://jinix55.github.io/JmEditor/ (저장소를 받아서 [examples/demo/index.html](examples/demo/index.html) 을 열어도 됩니다.) (src/ 코드를 한 파일로 합친 단독 버전이라 서버 없이 열립니다.)

## 되는 것

- 굵게 / 기울임 / 밑줄 / 취소선, 글자 크기(10~48px), 글자색 / 배경색 (견본 + HSV 팔레트 + HEX 입력 + 스포이드)
- 제목 H1~H3, 인용, 순서 / 비순서 목록(● ○ ■, 1. 01. a. A. i. I. 가.), 링크, 버튼 그룹 블록(서식 — 이름·주소 입력으로 추가, 모양·크기, 그립 드래그로 순서, 정렬)
- 이미지 삽입 (버튼, 드래그 앤 드롭, 붙여넣기)
- 이미지 슬라이드 — 이미지가 자동으로 넘어가는 블록(서식). 간격(수동/2~8초)·비율·인디케이터(점/숫자/막대/없음)·폭·정렬, 썸네일로 선택·순서 변경. 뷰어에는 `slider-runtime.js` 필요
- 유튜브 — 주소를 넣으면 16:9 영상 블록이 들어갑니다. 폭(100 / 75 / 50%)과 정렬 선택, ⠿ 핸들로 이동
- 표 — 툴바에서 N×M 격자로 크기를 골라 삽입. 셀을 드래그(또는 Shift+클릭)하면 범위 선택. 우클릭 메뉴에서 행 / 열 추가·삭제·이동, 머리글 행·열 전환, 셀 병합·분할, 가로·세로 정렬, 셀·행 배경색, 표 폭·테두리. 셀 경계를 끌면 열 너비·행 높이 조절. 왼쪽 위 ⠿ 핸들을 끌어 위치 이동
- 이미지 갤러리 블록 — 이미지만 넣는 블록. 드롭하면 원본 비율을 유지한 채 줄마다 가로를 꽉 채우도록 배치되고(세로 사진이 섞여도 줄 높이가 같습니다), 헤더에서 선택 삭제 / 전체 삭제 / 열 수 / 배치 방식(비율 유지·잘라 채움) / 정렬(왼쪽·중앙·오른쪽)을 바꿉니다. 사진은 드래그해서 순서를 바꾸고, 헤더의 ⠿ 핸들을 끌면 블록 자체가 다른 위치로 이동합니다. 제목은 선택 사항
- 서식(템플릿) 삽입 — 서버에서 받아온 HTML 조각을 골라 본문에 넣습니다. 서식 관리는 별도 화면에서
- Editor / HTML / 미리보기 모드 전환
- undo / redo, 한글 IME 조합 처리, 외부 글 붙여넣기 시 허용 태그만 남김
- 조회 / 등록 / 수정 / 이미지 업로드 / 서식 목록 API 연동 (`JmEditorApi`)

동시편집은 아직 없습니다.

## 쓰는 법

### Thymeleaf / JSP

`src/` 를 정적 리소스로 서빙하고(예: `static/js/jm-editor/`), 컨테이너 하나를 둡니다.

```html
<link rel="stylesheet" href="/css/jm-editor.css">
<div id="editor"></div>

<script type="module">
  import { JmToolbarEditor } from '/js/jm-editor/ui/JmToolbarEditor.js';

  const editor = new JmToolbarEditor(document.getElementById('editor'), {
    placeholder: '내용을 입력하세요',
    api: { baseUrl: '', headers: () => ({ 'X-CSRF-TOKEN': token }) },
    contentId,          // 수정 화면이면 id. 생성 직후 자동 조회
  });

  // 저장: contentId 가 없으면 등록, 있으면 수정
  await editor.save({ title: '제목' });
</script>
```

전체 예시는 [examples/thymeleaf/notice-form.html](examples/thymeleaf/notice-form.html)에 있습니다. JSP도 템플릿 문법만 다르고 같습니다.

API 없이 폼으로만 보낼 거면 `api` 옵션을 빼고 submit 직전에 `editor.getHTML()` 을 hidden input 에 넣으면 됩니다.

### React / Next.js

[examples/react/JmEditor.jsx](examples/react/JmEditor.jsx) 가 코어를 감싼 컴포넌트입니다. Next.js App Router 에서는 `'use client'` 가 필요합니다.

```jsx
<JmEditor value={html} onChange={setHtml} uploadImage={uploadFn} />
```

### 코어만 쓰기

툴바 없이 편집 영역만 필요하면 `src/core/JmEditor.js` 를 직접 씁니다.

```js
import { JmEditor } from '/js/jm-editor/core/JmEditor.js';
const ed = new JmEditor(el, { onChange: html => {} });
ed.exec('bold');  ed.exec('table', { rows: 3, cols: 3 });  ed.getHTML();
```

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

[server/spring-boot](server/spring-boot) 에 Spring Boot(JPA + jsoup) 구현을 넣어 뒀습니다. 위 다섯 개 엔드포인트, 이미지 업로드 저장, `editor_content` / `editor_format` 스키마(PostgreSQL)가 들어 있습니다.

클라이언트 Sanitizer 는 편의용입니다. 저장 전에 서버에서 한 번 더 걸러야 하고, `HtmlSanitizer.java` 가 클라이언트와 같은 규칙으로 처리합니다.

## 저장되는 HTML

허용 태그는 p, br, strong, em, u, s, h1~h3, ul, ol, li, blockquote, a, img, table 계열(colgroup, col 포함), span, 갤러리용 `div[data-type="gallery"]`, 유튜브용 `div[data-type="youtube"] > iframe` (src 는 youtube-nocookie.com/embed/ 만), 버튼용 `div[data-type="buttons"] > a[data-role="button"]` 입니다. style 은 `color`, `background-color`, `text-align`, `vertical-align`, `width`, `height`, `font-size`, `list-style-type` 만 남고 값 형식도 검사합니다.

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
<div data-type="gallery" data-cols="3" data-auto="1" data-layout="justify">
  <p data-role="title">현장 사진</p>
  <img src="..." width="1600" height="1200"><img src="..." width="900" height="1600">
</div>
```

`width` / `height` 는 원본 크기이고 비율 계산에 씁니다. `data-layout="justify"` 갤러리는 조회 페이지에서도 배치 스크립트가 필요합니다.

```js
import { observeGalleries } from '/js/jm-editor/plugins/gallery/gallery-layout.js';
observeGalleries(document.querySelector('.jm-content'));
```

`data-layout="cover"` 는 CSS 만으로 동작합니다.

슬라이드 블록도 조회 페이지에서 런타임을 한 번 초기화해야 돌아갑니다.

```js
import { initSliders } from '/js/jm-editor/plugins/slider/slider-runtime.js';
initSliders(document.querySelector('.jm-content'));
```

## 구조

```
src/
  core/      JmEditor.js(진입점), Commands.js, SelectionUtil.js, History.js, Sanitizer.js
  plugins/   table/, gallery/, embed/(유튜브), buttons/, slider/(SliderCommands, slider-runtime) — 블록형 기능. 편집 중에만 쓰는 레이어를 씌우고 저장 시 벗김
  ui/        JmToolbarEditor.js(툴바), ColorPicker, TableGridPicker, FormatPicker, ContextMenu
  api/       JmEditorApi.js
  styles/    jm-editor.css
examples/    demo(단독 HTML), thymeleaf, react
server/      spring-boot
```

코어는 DOM 이 곧 문서 모델입니다. `execCommand` 는 쓰지 않고 Range 를 직접 다룹니다. 브라우저마다 contenteditable 동작이 조금씩 달라서, 특히 Backspace 로 블록을 합칠 때는 루트 바로 아래에 텍스트가 남지 않게 `p` 로 다시 감싸는 정도만 보정하고 있습니다.

## 라이선스

MIT
