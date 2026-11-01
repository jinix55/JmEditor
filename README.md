# JmEditor

contenteditable 위에 직접 올린 WYSIWYG 웹에디터입니다. 외부 라이브러리를 쓰지 않고, Thymeleaf나 JSP처럼 서버에서 렌더링하는 페이지에 `<script type="module">` 하나로 붙이는 걸 목표로 만들었습니다. React 쪽은 같은 코어를 감싸는 얇은 래퍼로 붙입니다.

데모: https://jinix55.github.io/JmEditor/ (저장소를 받아서 [examples/demo/index.html](examples/demo/index.html) 을 열어도 됩니다.) (src/ 코드를 한 파일로 합친 단독 버전이라 서버 없이 열립니다.)

## 기능

- 굵게 / 기울임 / 밑줄 / 취소선, 글자 크기(10~48px), 글꼴(설정 목록), 글자색 / 배경색 (견본 + HSV 팔레트 + HEX 입력 + 스포이드)
- 제목(본문·제목 1~6 목록), 인용(세로선·박스·따옴표 — 인용 버튼 목록에서 선택·해제), 가로 정렬(왼쪽/가운데/오른쪽)·세로 정렬(표 셀) 드롭다운, 순서 / 비순서 목록(● ○ ■, 1. 01. a. A. i. I. 가.), 링크(입력줄의 「새 창」 체크 — 기본은 외부 주소·/ 경로 켬, #·tel:·mailto: 는 새 창 없음), 버튼 그룹 블록(서식 — 이름·주소 입력으로 추가, 모양(채움·외곽선·연한색)·색(테마 7색 또는 직접 선택 — 고른 색 하나로 테두리·오버·연한 배경·글자색 자동)·크기·아이콘 16종(글자 앞/뒤), 그립 드래그로 순서, 정렬)
- 가로줄(`<hr>`) — 툴바 버튼으로 커서 블록 뒤에 넣고 다음 문단으로 커서 이동. Backspace·Delete 는 선만 지웁니다
- 위·아래 첨자 — 툴바 버튼(서로 배타), 커서면 이후 입력에 적용
- 줄 간격 — 툴바 선택(1·1.2·1.5·1.8·2, 지정 안 했을 때의 실제 값 표시), 선택한 p·제목·li·인용(직접 글이 있는 표 칸, 구조 모드의 글만 있는 div 포함) 전체에, 블록 안 span 의 줄 간격은 지웁니다. 지정 안 했을 때의 값을 고르면 해제
- 찾기·바꾸기 — 툴바 버튼, 편집 영역에서 Ctrl/Cmd+F·H. 본문·표 칸·제목·갤러리/슬라이드 제목을 글자 그대로 찾고(대소문자 선택, 태그에 걸친 글자 포함) 바꾸면 첫 글자의 서식을 따릅니다. 모두 바꾸기는 되돌리기 한 번. 일치 표시는 1만 개까지이고(「N개 이상」) 모두 바꾸기는 전부 바꿉니다. 빈 말로 바꿔 내용이 전혀 없어진 버튼은 그 항목을 지웁니다. 강조는 CSS Custom Highlight API 라 저장 HTML 에 흔적이 없고, 미지원 브라우저는 현재 일치만 선택 표시. HTML·미리보기 모드에서는 꺼집니다
- 글자 수 — 옵션 `charCount` ([편집 화면](#편집-화면))
- 들여쓰기·내어쓰기 — (표 칸에서는 버튼이 꺼지고 칸 안 목록에서만 켜집니다) 문단·제목·인용은 왼쪽 여백 40px 단위(최대 200px), 목록은 중첩·해제(Tab·Shift+Tab)
- 서식 지우기 — 선택 범위(커서면 그 블록)의 굵게·기울임·밑줄·취소선·위/아래 첨자·글자색·배경색·크기·글꼴·자간과 글자 단위(span) 줄 간격을 지웁니다. 블록의 줄 간격·정렬·들여쓰기와 링크·이미지·표·제목은 그대로
- 이미지 삽입 (버튼, 드래그 앤 드롭, 붙여넣기)
- 글 감싸기 — 본문 이미지를 클릭하면 도구 막대가 뜹니다. 왼쪽·오른쪽 감싸기(이미지 옆으로 글이 흐르고 아래로 이어짐), 폭 30·40·50·100% 또는 모서리 손잡이로 본문 폭 대비 % 조절, 교체·삭제, 대체 글(alt) 입력, ⠿ 로 다른 문단 앞뒤로 이동. 휴대폰 폭(640px 이하)에서는 감싸기를 풀고 꽉 차게
- 이미지 + 글 배치 블록(서식) — 이미지 | 글(2칸), 이미지 1장 + 글(4분할: 이미지 옆 작은 칸 + 반대쪽 줄 전체), 대각선 이미지 2장 + 글, 이미지 2장 나란히 + 각각 글. 헤더 아이콘으로 이미지 위치를 바꾸면 글은 같은 역할 칸으로 따라가고, 가운데 경계를 끌어 좌우 폭(20~80%) 조절. 이미지 칸은 클릭·파일 놓기로 넣고 교체·삭제. 휴대폰 폭에서는 세로로 쌓임
- 이미지 슬라이드 — 이미지가 자동으로 넘어가는 블록(서식). 간격(수동/2~8초)·비율·인디케이터(점/숫자/막대/없음, 하단 좌/중/우)·폭·정렬, 썸네일로 선택·순서 변경. 뷰어에는 `slider-runtime.js` 필요
- 유튜브 — 주소를 넣으면 16:9 영상 블록이 들어갑니다. 폭(100 / 75 / 50%)과 정렬 선택, ⠿ 핸들로 이동
- 카카오 지도 — 카카오맵 「지도 퍼가기」 코드를 블록 헤더나 본문에 붙여 넣으면 지도가 들어갑니다. 앱 키·도메인 등록이 필요 없고, 높이(300 / 400 / 500) 선택, 장소명은 자동으로 채워집니다. 서식 「오시는 길」([사용법](#카카오-지도))
- 퍼블리싱 구조 보존(기본 켜짐) — `section`·`div`·`dl` 같은 구조와 class 가 그대로 남고, 그 안의 글을 일반 본문처럼 고칩니다([사용법](#퍼블리싱-구조-보존-classsection-등))
- 표 — 툴바에서 N×M 격자로 크기를 골라 삽입. 셀을 드래그(또는 Shift+클릭)하면 범위 선택. 우클릭 메뉴에서 행 / 열 추가·삭제·이동, 머리글 행·열 전환, 셀 병합·분할, 가로·세로 정렬, 셀·행 배경색, 표 폭·테두리. 셀 경계를 끌면 열 너비·행 높이 조절. 왼쪽 위 ⠿ 핸들을 끌어 위치 이동
- 이미지 갤러리 블록 — 사진을 여러 장 올리면 원본 비율을 유지한 채 줄 전체를 채우도록 자동 배치합니다(세로 사진이 섞여도 줄 높이가 같고, 마지막 줄은 늘리지 않고 왼쪽 정렬). 사진은 드래그로 순서 변경, 선택 후 교체·삭제. 줄 높이·간격은 CSS 변수로 디자인에서 정합니다. 업로드 제한(jpg·png·gif·webp, 파일당 10MB, 1회 10장, 글당 50장 또는 100MB)과 긴 변 2000px 초과 시 축소(GIF 제외)는 설정 파일로 바꿉니다. 헤더의 ⠿ 핸들로 블록 이동, 제목은 선택 사항, 사진별 캡션은 없음
- 서식(템플릿) 삽입 — 서버에서 받아온 HTML 조각을 골라 본문에 넣습니다. 서식 관리는 별도 화면에서
- Editor / HTML / 미리보기 모드 전환
- undo / redo, 한글 IME 조합 처리, 외부 글 붙여넣기 시 허용 태그만 남김. 에디터 안 복사·잘라내기는 저장 형태 HTML 로 클립보드에 넣어 다시 붙여도 글꼴·폭이 그대로. 클립보드 HTML 의 / 경로는 절대 주소로 나가고 같은 출처에 붙이면 되돌아옵니다. 글자는 블록·br·li·tr 줄바꿈, 칸 사이 탭. 표 칸 범위도 복사·잘라내기(칸 비우기)·Delete·붙여넣기(첫 칸, 표는 표 뒤)가 됩니다
- 조회 / 등록 / 수정 / 이미지 업로드 / 서식 목록 API 연동 (`JmEditorApi`)

동시편집은 아직 없습니다.

## 사용법

필요한 건 `dist/` 의 파일들입니다. 빌드할 필요 없이 그대로 복사해서 씁니다.

| 파일 | 용도 |
|---|---|
| `dist/jm-editor.css` | 편집 화면·조회 화면 공통 스타일 |
| `dist/jm-editor.min.js` | 에디터 전체 (전역 `JmEditor.*`). ES Module 이 필요하면 `jm-editor.esm.js` |
| `dist/jm-viewer.min.js` | 조회 화면용 런타임 (갤러리 배치·슬라이드 전환·카카오 지도). ESM 은 `jm-viewer.esm.js` |
| `dist/jm-editor.config.js` | 설정 견본 (업로드 제한 등). 선택 사항 — 아래 [설정](#설정) 참고 |

복사하지 않고 CDN(jsDelivr)으로 불러와도 됩니다. 주소의 `@v0.0.5` 은 릴리스 태그로, 내용이 고정됩니다. 그 태그 뒤에 추가된 최신 기능(가로줄·들여쓰기·서식 지우기·대체 글·줄 간격·글자 수·링크 새 창·첨자·찾기 바꾸기)은 그 버전에 없습니다.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/jinix55/JmEditor@v0.0.5/dist/jm-editor.css">
<script src="https://cdn.jsdelivr.net/gh/jinix55/JmEditor@v0.0.5/dist/jm-editor.min.js"></script>   <!-- 편집 화면 -->
<script src="https://cdn.jsdelivr.net/gh/jinix55/JmEditor@v0.0.5/dist/jm-viewer.min.js"></script>   <!-- 조회 화면 -->
```

항상 그 범위의 최신 릴리스를 받으려면 `@0.0`(0.0.x 최신)처럼 범위로 쓸 수 있습니다(새 릴리스 반영까지 최대 약 12시간).

ES Module 은 `…@v0.0.5/dist/jm-editor.esm.js` 를 import 합니다. 설정은 CDN 의 `jm-editor.config.js` 대신 페이지에서 `window.JmEditorConfig` 로 지정하세요([설정](#설정)).

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

`JmEditorApi` 를 쓸 때의 콜백 옵션:

| 옵션 | 설명 |
|---|---|
| `onLoaded(record)` | 조회 완료 |
| `onSaved(record)` | 저장 완료 |
| `onError(error)` | 조회(`contentId` 자동 조회·`load()`) 실패. 없으면 `notify` 로 안내하고, `load()` 는 `undefined` 를 돌려줍니다 |

글자 수 옵션:

| 옵션 | 설명 |
|---|---|
| `charCount: true` | 편집 영역 아래 글자 수 표시 (기본 꺼짐) |
| `charCount: { max: 1000 }` | 위 + 상한. 넘으면 경고 색만 바뀌고 입력은 막지 않습니다 |

공백을 포함하고, ZWSP·블록 사이 줄바꿈·플러그인 헤더 글자는 뺍니다. 표·제목 글자는 포함합니다. 이모지 하나는 1자(코드 포인트)입니다. HTML 모드에서는 소스를 정제한 결과로 셉니다. 값은 `editor.getTextLength()` 로도 읽습니다.

링크 새 창은 `editor.editor.exec('link', url, { newWindow: false })` 로도 고릅니다. 생략하면 주소 종류에 따른 기본 규칙입니다.

명령은 `editor.editor.exec(이름, 값)` 으로 부릅니다.

| 명령 | 값 | 동작 |
|---|---|---|
| `hr` | — | 커서 블록 뒤에 가로줄 |
| `indent` · `outdent` | — | 문단·제목·인용 왼쪽 여백 40px 단위(최대 200px), 목록은 중첩·해제 |
| `clearFormat` | — | 글자 서식 지우기 |
| `lineHeight` | `'1.5'` 등, `null` 이면 해제 | 글 블록 줄 간격. 규칙에 맞지 않는 값이면 `false` |
| `sub` · `sup` | — | 아래·위 첨자 (서로 배타) |
| `link` · `unlink` | 주소, 셋째 인자 `{ newWindow }` | 링크 적용·해제. 선택이 링크 밖으로 이어지면 선택 전체에 적용, 해제는 선택에 걸친 링크 전부 |

| 찾기·바꾸기 | 동작 |
|---|---|
| `editor.openFind(replace)` · `editor.closeFind()` | 입력줄 열기·닫기 |
| `editor.editor.find` | `search(말, { caseSensitive })`, `next()`, `prev()`, `replace(글)`, `replaceAll(글)`, `clear()` |

이미지 대체 글은 도구 막대의 입력란에서 고칩니다.

`destroy()` 는 툴바와 함께 편집 영역도 제거하므로 내용이 필요하면 먼저 `getHTML()` 로 받으세요.

저장 중에 `save()` 를 다시 부르면 새 요청 없이 진행 중인 Promise 를 돌려줍니다. 저장 실패는 `save()` 의 거부로 받습니다.

Thymeleaf, JSP 모두 이 형태 그대로입니다. 전체 예시는 [examples/thymeleaf/notice-form.html](examples/thymeleaf/notice-form.html)(등록·수정), [notice-view.html](examples/thymeleaf/notice-view.html)(조회).

API 없이 폼으로만 보낼 거면 `api` 옵션을 빼고 submit 직전에 `editor.getHTML()` 을 hidden input 에 넣으면 됩니다.

### 설정

업로드 제한 같은 값은 빌드 없이 페이지에서 바꿉니다. 에디터는 생성(`new JmToolbarEditor(...)`)할 때 설정을 읽으므로 CDN 으로 불러와도 그대로 적용됩니다. 바꿀 항목만 적으면 되고, 빠진 항목은 기본값을 씁니다. 크기 단위는 MB, 길이 단위는 px 입니다.

**1. 페이지 전체에 적용** — `window.JmEditorConfig` 를 에디터 생성 전에 지정합니다. 에디터 스크립트를 불러온 뒤여도 생성 전이면 됩니다.

```html
<script src="https://cdn.jsdelivr.net/gh/jinix55/JmEditor@v0.0.5/dist/jm-editor.min.js"></script>
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
  image: {
    mobileMedia: '(max-width: 767px)', // 이미지 도구 막대「모바일 추가」가 source 에 쓰는 media (200자 이하)
  },
  font: {
    families: ['맑은 고딕', 'Noto Sans KR', 'Noto Sans', 'Roboto', '굴림', '돋움', '바탕', '궁서', '함초롬바탕', '함초롬돋움', '한컴바탕', 'HY헤드라인M', 'Apple SD Gothic Neo', 'Arial', 'Helvetica Neue', 'Times New Roman'], // 글꼴 도구 목록이자 허용 목록
  },
  structure: {
    enabled: true,
    tags: ['section', 'article', 'aside', 'div', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'caption', 'header', 'footer', 'nav', 'h4', 'h5', 'h6', 'small', 'sub', 'sup'],
    classPattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$',
    classAllow: null,
    classDeny: [],
    idPattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$',
    idDeny: [],
  },
};
```

| 영역 | 생성 옵션 (우선) | 항목 |
|---|---|---|
| `gallery` | `galleryLimits` | `types`, `maxFileSizeMB`, `maxFilesPerAdd`, `maxImagesPerPost`, `maxTotalSizeMB`, `maxDimension` |
| `image` | `image` | `mobileMedia` |
| `font` | `font` | `families` |
| `structure` | `structure` | `enabled`, `tags`, `classPattern`(class 이름 형식), `classAllow`(`null` 이면 형식만, `tit-*` 접두어 가능), `classDeny`, `idPattern`, `idDeny` |

우선순위는 생성 옵션 > `window.JmEditorConfig` > 기본값입니다. 제한에 걸리면 `notify` 옵션으로 넘긴 함수에 안내 문구를 주고, 없으면 `alert` 로 띄웁니다. 글당 용량은 이번 편집에서 올린 사진만 셉니다(불러온 기존 사진은 크기를 알 수 없음). 클라이언트 제한은 우회할 수 있으므로 서버에서도 같은 값으로 검사하세요 ([서버 연동 가이드](server/spring-boot/README.md)).

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

표·버튼·유튜브·글 감싸기·이미지 + 글 배치는 CSS 만으로 보이고, 갤러리 비율 배치·슬라이드 전환·카카오 지도가 런타임을 씁니다.

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

`src/` 를 그대로 서빙해 `src/ui/JmToolbarEditor.js` 를 import 해도 됩니다(JS 36개·CSS 1개). 배포본을 다시 만들려면 `npm install && npm run build` (esbuild).

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

허용 태그는 p, br, hr(속성 없음), strong, em, u, s, sub, sup, h1~h6, ul, ol, li, blockquote, a, img, table 계열(colgroup, col 포함), span, 갤러리용 `div[data-type="gallery"]`, 유튜브용 `div[data-type="youtube"] > iframe` (src 는 youtube-nocookie.com/embed/ 만), 버튼용 `div[data-type="buttons"] > a[data-role="button"]`(모양 `data-style`, 테마 색 `data-color`, 직접 색 `style="--jm-btn: #rrggbb"`+`data-tone`, 아이콘 `data-icon`·`data-icon-pos` — 테마 실제 색은 `:root { --jm-btn-green: … }` 처럼 사이트에서 바꿀 수 있음), 이미지 + 글 배치용 `div[data-type="layout"] > div[data-cell]`, 카카오 지도용 `div[data-type="map"]`(속성 `data-timestamp`·`data-key`·`data-height`·`data-title` 만, 안의 내용은 버림) 입니다. 이미지에는 글 감싸기용 `data-float`(left·right)와 `style="width: N%"`(10~100), `loading`(lazy·eager)만 더 남고, 모바일 이미지용 `picture > source + img` 도 남습니다(아래 「퍼블리싱 구조 보존」 참고). 인용은 `blockquote` 기본(세로선)에 `data-style="box"`(박스)·`data-style="quote"`(글 처음·끝에 따옴표)가 있습니다.

| 요소·속성 | 규칙 |
|---|---|
| `hr` | 속성 없음. 문단·제목·글자 서식 안이면 그 요소를 나눠 밖으로(`<strong>a<hr>b</strong>` → `<strong>a</strong><hr><strong>b</strong>`), 플러그인 블록 안은 지움. 나눌 조상이 8단계를 넘거나 한 입력에서 복제가 1만 개를 넘으면 hr 만 버림(글은 유지) |
| `sub` · `sup` | `style`. 구조 모드와 상관없이 허용 |
| `a[target]` | `_self` 는 같은 창(rel 없음), 그 밖은 `_blank` + `rel="noopener noreferrer"`. `#`·`tel:`·`mailto:` 는 target·rel 을 지움 |
| `ol[start]` | 숫자 1~4자리만 |
| `col[span]` | 1~1000 정수만 |
| `img[style]` | `width: N%`(10~100)만. 같은 속성이 여러 번이면 마지막 값으로 판단 |

`style` 은 아래 속성만 남고 값 형식도 검사합니다. 저장 HTML 의 `style` 은 정제 표기로 맞춰 끝에 `;` 가 없고, 빈 `class`·`style` 은 남지 않습니다.

| 속성 | 대상 | 값 |
|---|---|---|
| `color`, `background-color` | 모두 | `#hex`(3~8자리), `rgb()`·`rgba()`, 색 이름 |
| `background` | 표 요소·`span` | 색만 `background-color` 로 (주소 등은 버림, 색이 없으면 지움) |
| `text-align` | 모두 | left, center, right, justify |
| `vertical-align` | 모두 | top, middle, bottom |
| `width` | 모두 | 숫자 + `px`·`%`, `auto`. 표 요소는 `pt`·`mm`·`cm` → 정수 `px` |
| `height` | 모두 | 숫자 + `px`. 표 요소는 `pt`·`mm`·`cm` → 정수 `px` |
| `list-style-type` | 모두 | disc, circle, square, decimal, decimal-leading-zero, lower-alpha, upper-alpha, lower-roman, upper-roman, hangul, hangul-consonant, none |
| `font-size` | 모두 | `px`·`pt`·`mm`·`cm`·`rem`(1rem=16px) → 정수 `px`, 8~96 안으로 맞춤. `em`·`%` 는 지움 |
| `font-family` | 모두 | 허용 목록의 첫 이름만 `"맑은 고딕"` 꼴로, 없으면 지움 |
| `line-height` | 모두 | 단위 없는 수 0.5~5, 50~500%, `px`·`pt` → `px`(8~200). `normal` 등은 지움 |
| `letter-spacing` | 모두 | `px`·`pt` → `px`(소수 둘째 자리, -10~20), `em`(-1~2). `normal`·`0` 은 지움 |
| `margin-left` | p·h1~h6·li·blockquote | `px`·`pt`·`mm`·`cm` → 정수 `px`, 0~400. 음수·`%`·`em` 은 지움 |
| `margin-left`, `margin-right` | table | `auto` 만 |
| `text-indent` | p·h1~h6·li·blockquote | `px`·`pt`·`mm`·`cm` → 정수 `px`, -400~400(음수는 내어쓰기) |
| `border`, `border-top`·`right`·`bottom`·`left`, `border-*-width`·`style`·`color` | td·th | 폭 0~20(`px`·`pt`·`mm`·`cm`·thin·medium·thick), 스타일 none·solid·dashed·dotted·double, 색 |
| `border-collapse` | table | collapse, separate |
| `--jm-btn` | 버튼 `a` | `#rgb`·`#rrggbb` |

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

### 옛 글 이관·붙여넣기

`setHTML`·붙여넣기·서버 저장에서 옛 형식을 지금 형식으로 바꿉니다 (구조 모드 켬·끔 모두, 서버 `HtmlSanitizer` 도 같은 결과).

| 입력 | 저장 |
|---|---|
| `<font color size face>` | `span style` — size 1~7 은 10·13·16·18·24·32·48px, 남는 값이 없으면 벗김 |
| 블록·표를 감싼 `font`·`span` | 벗기고 글자색·크기·글꼴·배경을 안쪽 글자의 `span` 으로 내려줌 (블록이 직접 지정한 항목은 블록 우선, class·id 는 사라짐) |
| `font-weight: bold·bolder·700~900` | 내용을 `strong` 으로. `normal` 등은 지움. `th` 는 원래 굵어서 감싸지 않음. 바로 아래 자식이 굵기를 해제하면 strong 밖에 둠. 버튼·플러그인 블록은 건드리지 않음 |
| 표 `bgcolor`·`align`·`valign`·`width`·`height` 속성 | `style` (style 에 같은 항목이 있으면 style 우선) |
| `table align=center` | `margin-left·right: auto` (표 위치, left·right 는 지움) |
| `table border=0` | `data-border="0"` |
| `p`·`div`·제목 `align` | `text-align` |
| 구조 모드를 끈 `caption` | 표 앞 `p` |
| td·th `border`, `border-top` 등, `border-*-width·style·color`, table `border-collapse` | 값 검사 후 `1px solid windowtext` 꼴로 정규화 (폭 0~20px·pt·mm·cm·thin·medium·thick, 소수 둘째 자리까지 실제 값 유지 — `0.50pt` → `0.67px`, 토큰 순서 무관, 스타일 none·solid·dashed·dotted·double, 색. 소수 둘째 자리까지 유지(0.01 미만은 0.01px)) |
| `mso-*` 등 그 밖의 속성 | 지움 |
| `<pre>` (붙여넣기만) | 줄마다 `br` 인 문단으로, 줄 앞·연속 공백은 nbsp 로 (허용 태그는 아님) |
| 다른 페이지의 계산 스타일 (붙여넣기만) | style 에 `orphans`·`widows`·`-webkit-text-stroke-width` 흔적이 있으면 글꼴·자간·낱말 간격·줄 간격·첫 줄 들여쓰기, 흰색·투명 배경을 뺌. 글자색·크기는 2종 이상이면 가장 많은 값만, 1종이면 글자색은 무채색만·크기는 16px·medium 만 뺌. 배경이 남는 요소의 글자색은 유지. 오피스 원본·흔적 없는 style 은 그대로 |
| `font-style: italic·oblique`, `text-decoration: underline·line-through` | 내용을 `em`·`u`·`s` 로 (a 자신의 밑줄·버튼·플러그인 블록 제외, 블록·표·목록은 안쪽 글자에). 서버도 같음 |
| `<object>` | 태그만 벗기고 안의 대체 내용은 정제해 남김 |

엑셀·파워포인트는 표·글과 함께 그림 미리보기도 클립보드에 넣으므로, `text/html`·`text/plain` 이 있으면 그림은 무시하고 파일만 있을 때 이미지로 넣습니다. 오피스 문서를 붙여 넣으면 문서 머리 `<style>` 의 class 규칙(`.xl65{…}`)을 표 칸·`font` 의 `style` 로 옮겨 테두리·배경·정렬을 살립니다 (붙여넣기 전용, 칸에 직접 쓴 값 우선, 값 검사는 정제가 그대로 함). `td{…}` 같은 태그 규칙과 표 밖 문단 규칙은 옮기지 않습니다.

**글꼴** — 허용 목록은 `font.families` 입니다 (생성 옵션 `font` > `window.JmEditorConfig.font` > 기본값). 툴바 글꼴 목록과 정제가 같이 씁니다. 서버는 `jm-editor.font.families` 로 같은 값을 주세요. 대소문자는 무시하고 `Malgun Gothic`·`HCR Batang`·`Gulim`·`Dotum`·`Batang` 은 한글 이름으로 바꿉니다.

툴바의 크기·글꼴 도구에는 "기본" 항목이 없고 지금 실제로 적용되는 값(예: `16px`, `맑은 고딕`)이 선택되어 보입니다. 편집 영역은 페이지의 값을 물려받으므로 사이트 CSS 에 따라 달라지고, 이 컴퓨터에 없는 글꼴은 건너뜁니다(알 수 없으면 `브라우저 글꼴`). **지정 안 했을 때의 값을 고르면 지정을 해제**하므로 기본값은 저장 내용에 들어가지 않습니다.

웹폰트는 번들에 넣지 않습니다. 없는 글꼴은 사이트 CSS 에서 대체할 수 있습니다. 라이선스는 사이트에서 확인하세요.

```css
/* 함초롬바탕 → Noto Serif KR (글꼴 파일은 사이트에 둠) */
@font-face { font-family: "함초롬바탕"; src: local("함초롬바탕"), local("HCR Batang"), url("/fonts/NotoSerifKR-Regular.woff2") format("woff2"); }
/* 한컴바탕 → Noto Serif KR */
@font-face { font-family: "한컴바탕"; src: local("한컴바탕"), url("/fonts/NotoSerifKR-Regular.woff2") format("woff2"); }
/* HY헤드라인M → Noto Sans KR 700 (보통 굵기로 등록해 제목처럼 보이게) */
@font-face { font-family: "HY헤드라인M"; font-weight: 400; src: local("HY헤드라인M"), url("/fonts/NotoSansKR-Bold.woff2") format("woff2"); }
```

### 색 테마

에디터 화면의 색은 CSS 변수로 바꿉니다. [데모](https://jinix55.github.io/JmEditor/)의 「색 테마」 막대에서 미리 정한 테마를 고르거나 주요 색을 직접 바꿔 보고, 「CSS 보기」로 그 값을 복사할 수 있습니다. 메뉴·색 선택·서식 목록 같은 팝업은 페이지(body)에 붙으므로 **`:root` 에서** 덮어쓰세요. 기본값은 지금 색 그대로입니다.

| 변수 | 쓰는 곳 | 기본 |
|---|---|---|
| `--jm-bg` · `--jm-text` | 에디터·팝업·블록 바탕, 기본 글자 | `#fff` · `#222` |
| `--jm-text-soft` · `--jm-strong` · `--jm-muted` · `--jm-subtle` | 보조 글자(진한 → 흐린) | `#475467` · `#344054` · `#667085` · `#98a2b3` |
| `--jm-border` · `--jm-border-soft` | 테두리, 연한 구분선 | `#d0d5dd` · `#e4e7ec` |
| `--jm-head` · `--jm-hover` | 툴바 상단·블록 헤더 바탕, 마우스 올림 | `#f8fafc` · `#f2f4f7` |
| `--jm-accent` · `--jm-accent-line` · `--jm-active` | 선택·링크·고른 항목, 눌린 버튼 테두리·바탕 | `#1d4ed8` · `#a9c4ff` · `#e6efff` |
| `--jm-accent-faint` · `--jm-selected` | 끌어다 놓기 바탕, 표 셀 범위 선택 | `#f0f5ff` · `#dbe7ff` |
| `--jm-quote-bg` · `--jm-quote-hover` · `--jm-quote-text` | 박스 인용 | `#eef0f4` · `#e2e6ec` · `#1d2939` |
| `--jm-danger` · `--jm-danger-line` · `--jm-danger-soft` | 삭제 버튼, 잘못된 입력 | `#b42318` · `#d92d20` · `#fef3f2` |

버튼 서식의 테마 색은 따로 `--jm-btn-blue`·`--jm-btn-green`·`--jm-btn-red`·`--jm-btn-orange`·`--jm-btn-purple`·`--jm-btn-gray`·`--jm-btn-black` 7가지입니다(같이 `:root` 에서). 이미지 위에 뜨는 흰 컨트롤(슬라이드 점·화살표, 크기 손잡이)과 그림자는 바꾸지 않습니다.

다크 모드 예시:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --jm-bg: #1d2124; --jm-text: #e6e8e3; --jm-text-soft: #c3c9c4; --jm-strong: #e6e8e3; --jm-muted: #9aa19b; --jm-subtle: #6f7672;
    --jm-border: #3a413d; --jm-border-soft: #2d3330; --jm-head: #23282b; --jm-hover: #2a3033;
    --jm-accent: #7cc39b; --jm-accent-line: #4f8a68; --jm-active: #213128; --jm-accent-faint: #1f2a24; --jm-selected: #27402f;
    --jm-quote-bg: #262c2f; --jm-quote-hover: #2e3538; --jm-quote-text: #e6e8e3;
    --jm-danger: #f97066; --jm-danger-line: #f04438; --jm-danger-soft: #3a1f1d;
  }
}
```

### 퍼블리싱 구조 보존 (class·section 등)

구조 모드는 **기본으로 켜져 있습니다**. 퍼블리싱 구조(`section`·`div`·`dl` 등)와 class 가 그대로 남습니다. 끄면(`enabled: false`) 예전 규칙대로 `class` 를 지우고 `div` 를 `p` 로 바꾸며 구조 태그를 벗깁니다. **클라이언트와 서버는 같은 값이어야** 합니다 — 한쪽만 끄면 저장할 때 구조가 사라집니다.

| 어디서 | 방법 |
|---|---|
| 페이지 전체 | `window.JmEditorConfig = { structure: { enabled: false } }` (`jm-editor.config.js` 또는 페이지 스크립트) |
| 에디터별 (우선) | `new JmToolbarEditor(el, { structure: { enabled: false } })` |
| 서버 | `application.yml` → `jm-editor.structure.enabled: false` (생략하면 켜짐) |

세부 범위 설정:

```js
window.JmEditorConfig = {
  structure: {
    enabled: true,      // 기본값
    tags: ['section', 'article', 'aside', 'div', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'caption', 'header', 'footer', 'nav', 'h4', 'h5', 'h6', 'small', 'sub', 'sup'], // 허용할 구조 태그
    classAllow: ['tit-*', 'box-gray'], // 생략하면 이름 형식만 검사 (운영 사이트는 목록으로 좁히기를 권장)
    classDeny: ['btn-admin*'],
    idPattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$', // id 이름 형식
    idDeny: ['header', 'gnb', 'site-*'],        // 막을 id 이름·접두어 (사이트 스크립트 전역·레이아웃 id)
  },
};
// 또는 에디터별: new JmToolbarEditor(el, { structure: { classAllow: [...] } })
```

> **운영 전 확인** — 코드 기본값은 그대로이므로 사이트에서 직접 정하세요.
> - 사이트 CSS 가 있으면 `classAllow` 로 쓸 class 를 좁히세요. 비워 두면 형식만 맞는 class 가 모두 남아, 글에 넣은 class 가 사이트 스타일을 타고 화면을 덮을 수 있습니다.
> - 사이트 전역·레이아웃 id(`header`·`gnb`·`site-*` 등)는 `idDeny` 에 넣으세요.

- 구조 태그와 모든 허용 태그의 `class`(이름 형식·목록 검사를 통과한 것만), `th[scope]`, `caption` 이 남습니다. `on*`·임의 `data-*`·script 는 열리지 않습니다.
- **id** (구조 모드만): 형식 `^[A-Za-z][A-Za-z0-9_-]{0,63}$` 를 지키고 `jm-` 로 시작하지 않으며 예약 전역(`JmEditorConfig`·`JmEditor`·`JmViewer`·`JM`·`kakao`·`daum`·`EyeDropper`, 설정으로 못 바꿈)과 `idDeny` 에 없는 것만 남습니다. 같은 id 가 두 번 나오면 첫 번째만 남습니다. `aria-labelledby`·`aria-describedby`(위 형식의 id 를 공백으로 구분, 최대 8개), `aria-label`(200자 이하), `aria-hidden="true"` 도 남습니다. 끄면 id·aria 는 전부 지워집니다.
- **사이트 전역·레이아웃 id 는 `idDeny` 에 넣으세요.** 본문 id 는 `window.<id>` 로 접근되므로 사이트 스크립트가 읽는 전역 이름이나 `header`·`gnb` 같은 레이아웃 id 가 본문에 들어오면 사이트가 깨질 수 있습니다. 라이브러리는 사이트의 전역을 알 수 없으므로 `idDeny`(`xxx-*` 접두어 지원)로 막는 것은 사이트 몫입니다.
- 편집 중과 「미리보기」에서는 id 가 `data-jm-id` 로 숨겨집니다. 그래서 편집 화면·미리보기 안에서는 퍼블 CSS 의 `#id`·`:target`·`#앵커` 이동이 동작하지 않고, 저장·조회 화면에서는 정상입니다. 같은 에디터 안에서 잘라내기 → 붙여넣기로 옮기면 id 는 사라집니다(중복 방지).
- 빈 아이콘 `<i class="…"></i>`(글자 없음)는 구조 모드에서 그대로 남습니다(`class` 와 `aria-hidden="true"` 만, id·다른 aria 는 지움). 글자가 있는 `<i>` 는 `<em>` 으로 바뀌고, 구조 모드를 끄면 모두 `<em>` 입니다.
- 이미 DB 에서 id·아이콘 등이 빠진 글은 열어도 돌아오지 않습니다. 「HTML 보기」에서 원본 HTML 을 다시 넣고 저장하세요.
- 에디터가 쓰는 이름(`jm-*`, `is-selected` 등)은 항상 지웁니다. 블록 기능(갤러리·슬라이드·버튼·유튜브·이미지 + 글·지도) 안은 지금 규칙 그대로입니다.
- 서버는 `application.yml` 의 `jm-editor.structure.*` 로 같은 값을 줍니다([서버 연동 가이드](server/spring-boot/README.md)).
- 데모에서 바로 볼 수 있습니다: 「퍼블 샘플 불러오기」에서 화면을 고르세요. 끈 상태와 비교하려면 주소 뒤에 `?structure=0`.

편집할 때의 규칙 (구조 모드가 켜져 있을 때 — 끄면 예전 동작):

| 동작 | 규칙 |
|---|---|
| 글자 서식·색·크기·링크 | `dt`·`dd`·캡션·글만 있는 `div` 안, 블록과 섞인 직접 글에서도 됩니다 |
| 제목·인용·목록 바꾸기 | `p`·`h1~h6`·`blockquote` 만 바뀌고 class·정렬은 그대로. `dt`·`dd` 같은 구조 블록과 안에 블록이 있는 `li` 는 바꾸지 않습니다 |
| Enter | `p`·제목·목록은 지금처럼. `dt`·`dd`·`figcaption`·`caption`·글만 있는 `div` 는 줄바꿈(`<br>`) |
| Backspace·Delete | 같은 구조 안의 문단끼리는 합치고, 다른 구조나 `dt`/`dd` 경계는 넘지 않습니다 |
| 여러 구조에 걸친 선택 | 지우기·입력·잘라내기·붙여넣기 모두 글자만 지우고 구조는 남깁니다 |
| 표·서식 넣기 | 가장 바깥 구조 바로 뒤에. 이미지·붙여넣은 문단은 그 자리(같은 구조 안)에 |
| 구조 자체 바꾸기 | HTML 보기에서 |

**모바일 이미지 (`picture`·`source`)** — 기본·구조 모드 모두 남습니다. `<picture>` 는 `<source>` 0~4개 다음 `<img>` 1개만 허용하고(img 가 없으면 통째로 버림, source 가 0개면 picture 를 벗겨 img 만 남김), 갤러리·슬라이드 같은 블록 안에서는 img 로 줄입니다. `source` 는 `srcset`(후보 1~4개, `data:` 는 1개만)·`media`(200자 이하, `url(` 금지)·`type`(png·jpeg·gif·webp·avif·svg+xml 만)만 남고, `picture` 는 구조 모드에서 `class`·`id`·aria(위 id·aria 규칙)가 남습니다. `img[loading]` 은 `lazy`·`eager` 만 남습니다(에디터가 새로 붙이지는 않습니다).

이미지를 클릭하면 뜨는 도구 막대 오른쪽에서 모바일 이미지를 다룹니다.

| 버튼 | 동작 |
|---|---|
| 모바일 추가 | 파일을 올려 `<picture><source media="(max-width: 767px)" srcset="…"><img></picture>` 로 감쌈. media 는 설정 `image.mobileMedia`(규칙에 어긋나면 기본값 + 콘솔 경고). 업로드 주소의 공백·쉼표는 %인코딩하고, 그래도 쓸 수 없는 주소(상대 경로 등)면 알림(`notify`)만 띄우고 바꾸지 않음 |
| 모바일 교체 · 삭제 | 첫 번째 source 의 srcset 을 바꾸거나 지움. 삭제로 source 가 다 없어지면 picture 를 벗기고 picture 의 class·id 는 버림. 두 번째 이후 source 는 그대로 보존 |
| 교체 (PC 이미지) | img 만 바꾸고 모바일 이미지는 유지 |
| 삭제 (이미지) | picture 통째로 삭제 |

**링크**: href 가 `#`·`tel:`·`mailto:` 로 시작하면 `target`·`rel` 을 붙이지 않고(들어온 target 도 지움), 그 밖(`http(s)://`, `/…`)은 `target="_blank" rel="noopener noreferrer"` 가 붙습니다. 버튼 링크도 같습니다.

**대체 글**: 이미지 도구 막대의 「대체 글」 칸에서 `alt` 를 고칩니다(`picture` 의 img 포함). **달라진 점** — 파일로 넣거나 교체한 본문 이미지의 `alt` 에 파일명을 넣지 않고 빈 값으로 둡니다. 갤러리·슬라이드·배치 블록 이미지는 지금처럼 파일명입니다.

**이미지 주소**: `src`·`srcset` 은 `http(s)://`, `/` 로 시작하는 내부 경로, 이미지 `data:` 만 남습니다. 프로토콜 상대 주소(`//cdn…`)·상대 경로(`a.png`)는 지워지니 `https://` 를 붙여 주세요.

**기존 글 이관**: `//…` 주소와 상대 주소(`a.png`, `foo/bar`)는 저장할 때 지워집니다(링크 `href` 의 `//…` 포함). 이관 전에 `https://…` 또는 `/` 로 시작하는 절대 경로로 바꿔 두세요.

**이전 버전과 달라진 점** (퍼블 HTML 보존 2차)

1. `#`·`tel:`·`mailto:` 링크에 새 창 속성이 더 이상 붙지 않습니다.
2. 구조 모드 기본 태그에 `header`·`footer`·`nav`·`h4`~`h6`·`small`·`sub`·`sup` 가 추가됐습니다(기본 19개). `small`·`sub`·`sup` 은 편집할 때 블록이 아니라 굵게처럼 글자 서식으로 다룹니다(Enter·정렬은 바깥 문단 기준).
3. `picture`/`source`·`img[loading]` 이 남습니다.
4. 구조 모드에서 id·`aria-*`(labelledby·describedby·label·hidden)·빈 아이콘 `<i>` 가 남습니다.

알려진 제약: 여러 구조에 걸친 선택 위에서 한글 조합 입력을 시작하면 브라우저가 그 입력을 막지 못합니다(구조가 바뀔 수 있음). 안드로이드 키보드의 범위 입력은 확인하지 못했습니다.

### 카카오 지도

카카오맵 웹의 「지도 퍼가기」(약도)를 씁니다. 앱 키나 도메인 등록이 필요 없습니다.

1. [map.kakao.com](https://map.kakao.com/) 에서 장소를 검색하고, 장소 정보 창의 **공유 → HTML 태그 복사 → 소스 생성하기** 로 코드를 복사합니다.
2. 에디터 서식 「오시는 길」을 넣고 헤더 입력란에 코드를 붙여 넣습니다(샘플 지도가 새 장소로 바뀜). 본문에 코드를 그대로 붙여 넣어도 지도 블록이 됩니다.
3. 장소명은 지도 데이터에서 자동으로 채워집니다. 높이는 헤더에서 300 / 400 / 500 중에 고릅니다.

저장되는 것은 스크립트가 아니라 값뿐입니다.

```html
<div data-type="map" data-provider="kakao-roughmap" data-timestamp="1792762389634" data-key="3rt3v4p5vvx" data-height="400" data-title="경기 성남시 분당구 운중로 227"></div>
```

조회 화면에서는 `JmViewer.initViewer` 가 카카오 약도 스크립트(`t1.kakaocdn.net`)를 불러와 지도를 그립니다. 불러오지 못하면 장소명과 「카카오맵에서 보기」 링크 카드를 대신 보여 줍니다. 편집 화면의 지도 위에는 커버를 덮어 두어, 지도 이동·확대는 미리보기와 조회 화면에서 됩니다. 페이지에 CSP 를 쓴다면 `script-src` 에 `t1.kakaocdn.net` 과 카카오 지도 도메인(`*.kakao.com`, `*.daumcdn.net`)을 허용하세요. 「지도 퍼가기」는 카카오맵 웹 기능이라(개발자 지도 API 가 아님) 카카오 쪽 방식이 바뀌면 영향을 받을 수 있습니다.

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
  core/      JmEditor.js(진입점), Commands.js, SelectionUtil.js, History.js, BlockDrag.js, FindReplace.js(찾기·바꾸기), Sanitizer.js, legacy-format.js(옛 형식 변환), font-policy.js(글꼴 허용 목록), structure-policy.js(구조 보존 정책)
  plugins/   table/, gallery/, embed/(유튜브), buttons/, slider/(SliderCommands, slider-runtime), layout/(이미지 + 글 배치), map/(MapCommands, map-runtime — 카카오 지도) — 블록형 기능. 편집 중에만 쓰는 레이어를 씌우고 저장 시 벗김
             image/(본문 이미지 글 감싸기·크기 조절 도구)
  ui/        JmToolbarEditor.js(툴바), ColorPicker, TableGridPicker, FormatPicker, ContextMenu, FindBar
  api/       JmEditorApi.js
  styles/    jm-editor.css
examples/    demo(단독 HTML), thymeleaf, react
server/      spring-boot
```

코어는 DOM 이 곧 문서 모델입니다. `execCommand` 는 쓰지 않고 Range 를 직접 다룹니다. 브라우저마다 contenteditable 동작이 조금씩 달라서, 특히 Backspace 로 블록을 합칠 때는 루트 바로 아래에 텍스트가 남지 않게 `p` 로 다시 감싸는 정도만 보정하고 있습니다.

## 테스트

실제 브라우저(Chromium·WebKit)에서 편집 동작을 확인하는 회귀 테스트입니다. `src/` 를 그대로 불러오는 하네스(`test/e2e/harness.html`)를 씁니다.

```bash
npm install
npx playwright install chromium webkit
npm run test:e2e
```

`test/e2e/` 에 기본 기능 회귀 테스트와 퍼블 구조 모드 테스트(정리 규칙·편집·키 입력)가 있고, 같은 테스트를 구조 모드를 끈 채로도 돌립니다(`chromium-off`). `test/fixtures/publisher/` 의 기대 결과(`expected/`)와 `test/fixtures/legacy/cases.txt` 의 정제 사례는 서버 `HtmlSanitizer` 테스트도 같은 파일로 비교합니다.

서버 테스트는 이 저장소에 없습니다. `server/spring-boot` 는 연동 가이드용 소스만 담고, 실행·테스트는 저장소 밖의 서버 프로젝트(`JmEditor-server`, 이 저장소와 나란한 폴더)에서 `./gradlew test` 로 합니다.

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
| [Big Buck Bunny](https://peach.blender.org/) © Blender Foundation | 데모 예시 본문의 유튜브 영상 | CC BY 3.0 |

에디터 자체는 실행 시 외부 라이브러리에 의존하지 않습니다. 유튜브 삽입은 `youtube-nocookie.com` 의 iframe 을 그대로 쓰므로, 영상 재생에는 YouTube 이용약관이 적용됩니다.
