# JmEditor

contenteditable 위에 직접 올린 WYSIWYG 웹에디터입니다. 외부 라이브러리를 쓰지 않고, Thymeleaf나 JSP처럼 서버에서 렌더링하는 페이지에 `<script type="module">` 하나로 붙이는 걸 목표로 만들었습니다. React 쪽은 같은 코어를 감싸는 얇은 래퍼로 붙입니다.

[데모 페이지](examples/demo/index.html)를 브라우저에서 열면 바로 눌러볼 수 있습니다. (src/ 코드를 한 파일로 합친 단독 버전이라 서버 없이 열립니다.)

## 되는 것

- 굵게 / 기울임 / 밑줄 / 취소선, 글자색 / 배경색 (견본 + HSV 팔레트 + HEX 입력 + 스포이드)
- 제목 H1~H3, 인용, 순서 / 비순서 목록, 링크
- 이미지 삽입 (버튼, 드래그 앤 드롭, 붙여넣기)
- 표 — 툴바에서 N×M 격자로 크기를 고르고, 표 위에서 우클릭하면 행 / 열 추가·삭제, 셀 / 행 배경색 메뉴
- 이미지 갤러리 블록 — 이미지만 넣는 블록. 드롭하면 줄을 채우며 자동 배치되고 헤더에서 선택 삭제 / 전체 삭제 / 열 수를 바꿉니다. 제목은 선택 사항
- 서식(템플릿) 삽입 — 서버에서 받아온 HTML 조각을 골라 본문에 넣습니다. 서식 관리는 별도 화면에서
- Editor / HTML / 미리보기 모드 전환
- undo / redo, 한글 IME 조합 처리, 외부 글 붙여넣기 시 허용 태그만 남김
- 조회 / 등록 / 수정 / 이미지 업로드 / 서식 목록 API 연동 (`JmEditorApi`)

셀 병합, 열 너비 조절, 동시편집은 아직 없습니다.

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

허용 태그는 p, br, strong, em, u, s, h1~h3, ul, ol, li, blockquote, a, img, table 계열, span, 그리고 갤러리용 `div[data-type="gallery"]` 입니다. style 은 `color` 와 `background-color` 만 남습니다.

표 레이어, 갤러리 헤더, 선택 표시 같은 편집용 UI 는 `getHTML()` 에서 전부 제거되고 순수 HTML 만 나옵니다. 조회 페이지에서는 본문 컨테이너에 `class="jm-content"` 를 주고 `jm-editor.css` 를 포함하면 미리보기와 같은 모습으로 보입니다.

갤러리 블록은 이렇게 저장됩니다.

```html
<div data-type="gallery" data-cols="3" data-auto="1">
  <p data-role="title">현장 사진</p>
  <img src="..."><img src="..."><img src="...">
</div>
```

## 구조

```
src/
  core/      JmEditor.js(진입점), Commands.js, SelectionUtil.js, History.js, Sanitizer.js
  plugins/   table/, gallery/   — 블록형 기능. 편집 중에만 쓰는 레이어를 씌우고 저장 시 벗김
  ui/        JmToolbarEditor.js(툴바), ColorPicker, TableGridPicker, FormatPicker, ContextMenu
  api/       JmEditorApi.js
  styles/    jm-editor.css
examples/    demo(단독 HTML), thymeleaf, react
server/      spring-boot
```

코어는 DOM 이 곧 문서 모델입니다. `execCommand` 는 쓰지 않고 Range 를 직접 다룹니다. 브라우저마다 contenteditable 동작이 조금씩 달라서, 특히 Backspace 로 블록을 합칠 때는 루트 바로 아래에 텍스트가 남지 않게 `p` 로 다시 감싸는 정도만 보정하고 있습니다.

## 라이선스

MIT
