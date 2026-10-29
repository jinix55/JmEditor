/*
 * JmEditor 설정 견본 — 전체 항목과 기본값. (빌드 없이 적용)
 *
 * 자기 서버에 복사해 값을 고치고, 에디터를 만들기 전에 불러옵니다.
 * 이 파일 없이 페이지에서 window.JmEditorConfig 를 직접 지정해도 됩니다 (CDN 사용 시).
 * CDN 의 이 견본을 그대로 불러오면 기본값과 같아서 의미가 없습니다.
 *
 * 빠진 항목은 기본값을 씁니다. 에디터 생성 옵션(galleryLimits)으로 넘긴 값이 이 설정보다 우선합니다.
 * 클라이언트 제한은 우회할 수 있으므로 서버에서도 같은 값으로 검사하세요.
 */
window.JmEditorConfig = {
  // 이미지 갤러리 업로드 제한 (크기 단위 MB, 길이 단위 px)
  gallery: {
    types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], // 올릴 수 있는 형식
    maxFileSizeMB: 10,      // 파일당 (원본)
    maxFilesPerAdd: 10,     // 한 번에 올리는 장수
    maxImagesPerPost: 50,   // 글당 장수
    maxTotalSizeMB: 100,    // 글당 용량 (축소 후)
    maxDimension: 2000,     // 긴 변 상한, 넘으면 축소 (GIF 제외)
  },
  // 이미지 도구 막대
  image: {
    mobileMedia: '(max-width: 767px)', // 「모바일 추가」가 source 에 넣는 media (200자 이하)
  },
  // 퍼블리싱 구조(class·section·dl 등) 보존 — 기본 켜짐. 서버 HtmlSanitizer(jm-editor.structure.enabled)도 같은 값이어야 저장 때 지워지지 않음
  structure: {
    enabled: true,      // false 면 예전 규칙(class 제거, div→p)
    tags: ['section', 'article', 'aside', 'div', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'caption', 'header', 'footer', 'nav', 'h4', 'h5', 'h6', 'small', 'sub', 'sup'], // 허용할 구조 태그
    classPattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$', // class 이름 형식
    classAllow: null,  // null 이면 형식만 검사. ['tit-*', 'box-gray'] 처럼 주면 그 이름·접두어(xxx-*)만
    classDeny: [],     // 막을 이름·접두어 (에디터 예약 이름 jm-* 등은 항상 제거)
    idPattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$', // id 이름 형식 (id 는 구조 모드에서만 남음)
    idDeny: [],        // 막을 id 이름·접두어(xxx-*). 사이트 스크립트 전역·레이아웃 id(header, gnb 등)를 넣을 것. jm-*·예약 전역(JmEditorConfig 등)은 항상 제거
  },
};
