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
  // 퍼블리싱 구조(class·section·dl 등) 보존 — 켜면 서버 HtmlSanitizer 도 같은 값으로 켜야 저장 때 지워지지 않음
  structure: {
    enabled: false,
    tags: ['section', 'article', 'aside', 'div', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'caption'], // 허용할 구조 태그
    classPattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$', // class 이름 형식
    classAllow: null,  // null 이면 형식만 검사. ['tit-*', 'box-gray'] 처럼 주면 그 이름·접두어(xxx-*)만
    classDeny: [],     // 막을 이름·접두어 (에디터 예약 이름 jm-* 등은 항상 제거)
  },
};
