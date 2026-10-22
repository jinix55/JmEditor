/**
 * FormatPicker
 * - 툴바 「서식」 버튼 아래에 서식(템플릿) 목록 드롭다운을 띄우고, 선택하면 onPick(format) 호출.
 * - 목록은 loadFormats() 로 외부에서 공급한다 (서버 API / 정적 배열). 결과는 캐시하며 refresh() 로 다시 받는다.
 * - 서식 데이터 규격: { id, name, description?, html, category? }  category 로 묶어 보여준다 (없으면 '기타')
 *   → 별도 서식 관리 화면/DB 테이블(예: format_template: id, name, description, html, sort_order, use_yn)에서 관리.
 */
export class FormatPicker {
  /**
   * @param {object} options
   * @param {() => Promise<Array<{id: string|number, name: string, description?: string, html: string}>>} options.loadFormats
   * @param {(format: object) => void} options.onPick
   */
  constructor({ loadFormats, onPick }) {
    this.loadFormats = loadFormats;
    this.onPick = onPick;
    this.formats = null; // 캐시

    this.el = document.createElement('div');
    this.el.className = 'jm-formatpicker';
    this.el.hidden = true;
    this.el.setAttribute('role', 'listbox');
    document.body.appendChild(this.el);
    // 목록 끝에서 휠을 더 굴려도 본문으로 스크롤이 넘어가지 않게 (overscroll-behavior 가 안 먹는 환경 대비)
    this.el.addEventListener('wheel', (e) => {
      const el = this.el;
      const atTop = el.scrollTop <= 0 && e.deltaY < 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && e.deltaY > 0;
      if (atTop || atBottom) e.preventDefault();
    }, { passive: false });

    this.anchor = null; // 팝업을 연 버튼 — 그 버튼 클릭은 '바깥 클릭'으로 보지 않음 (토글 동작)
    this.onDocDown = (e) => { if (!this.el.contains(e.target) && !this.anchor?.contains(e.target)) this.close(); };
    this.onKey = (e) => { if (e.key === 'Escape') this.close(); };
  }

  /** 버튼 아래에 열기. 목록이 없으면 불러온 뒤 그린다 */
  async openAt(anchorEl) {
    this.anchor = anchorEl;
    const r = anchorEl.getBoundingClientRect();
    this.el.hidden = false;
    this.el.style.left = `${Math.min(r.left, window.innerWidth - 280)}px`;
    this.el.style.top = `${r.bottom + 4}px`;
    document.addEventListener('mousedown', this.onDocDown, true);
    document.addEventListener('keydown', this.onKey, true);

    if (!this.formats) {
      this.#renderMessage('불러오는 중…');
      try {
        this.formats = await this.loadFormats();
      } catch (err) {
        this.#renderMessage('서식을 불러오지 못했습니다');
        return;
      }
    }
    this.#renderList();
  }

  toggle(anchorEl) {
    this.el.hidden ? this.openAt(anchorEl) : this.close();
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    document.removeEventListener('mousedown', this.onDocDown, true);
    document.removeEventListener('keydown', this.onKey, true);
  }

  /** 서식 관리에서 변경된 뒤 다시 받도록 캐시 비움 */
  refresh() { this.formats = null; }

  destroy() { this.close(); this.el.remove(); }

  #renderMessage(text) {
    this.el.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'jm-formatpicker-msg';
    d.textContent = text;
    this.el.appendChild(d);
  }

  /** 서식 목록: 카테고리 헤더 + 카드(이름 + 설명 + 축소 미리보기) */
  #renderList() {
    this.el.innerHTML = '';
    if (!this.formats?.length) { this.#renderMessage('등록된 서식이 없습니다'); return; }

    // 카테고리별 묶기 (등장 순서 유지)
    const groups = new Map();
    this.formats.forEach((f) => { const k = f.category || '기타'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); });
    groups.forEach((list, cat) => {
      const head = document.createElement('div');
      head.className = 'jm-formatpicker-cat';
      head.textContent = cat;
      this.el.appendChild(head);
      list.forEach((f) => this.#renderItem(f));
    });
  }

  #renderItem(f) {
    {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'jm-formatpicker-item';
      item.setAttribute('role', 'option');
      item.addEventListener('mousedown', (e) => e.preventDefault()); // 에디터 선택 유지
      item.addEventListener('click', () => { this.close(); this.onPick?.(f); });

      const name = document.createElement('div');
      name.className = 'jm-formatpicker-name';
      name.textContent = f.name;

      const desc = document.createElement('div');
      desc.className = 'jm-formatpicker-desc';
      desc.textContent = f.description || '';

      // 미리보기: 실제 HTML 을 축소 렌더 (편집 불가, 클릭은 항목 선택으로)
      const preview = document.createElement('div');
      preview.className = 'jm-formatpicker-preview jm-editor';
      preview.contentEditable = 'false';
      preview.innerHTML = f.html;

      item.append(name, desc, preview);
      this.el.appendChild(item);
    }
  }
}

/** 「이미지 + 글 (감싸기)」 서식의 이미지 자리 표시 (800×600 SVG). 이미지를 클릭해 「교체」로 바꾼다 */
export const IMAGE_PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNjAwIiB2aWV3Qm94PSIwIDAgODAwIDYwMCI+PHJlY3Qgd2lkdGg9IjgwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiNlZWYyZjciLz48cmVjdCB4PSIxMiIgeT0iMTIiIHdpZHRoPSI3NzYiIGhlaWdodD0iNTc2IiBmaWxsPSJub25lIiBzdHJva2U9IiNiNGMwZDAiIHN0cm9rZS13aWR0aD0iNiIgc3Ryb2tlLWRhc2hhcnJheT0iMTggMTIiIHJ4PSIxMiIvPjx0ZXh0IHg9IjQwMCIgeT0iMjkwIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSI0NCIgZmlsbD0iIzY2NzA4NSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+7J2066+47KeA66W8IOuEo+ycvOyEuOyalDwvdGV4dD48dGV4dCB4PSI0MDAiIHk9IjM1MCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjgiIGZpbGw9IiM5OGEyYjMiIHRleHQtYW5jaG9yPSJtaWRkbGUiPuydtOuvuOyngCDtgbTrpq0g4oaSIOq1kOyytDwvdGV4dD48L3N2Zz4=';

/**
 * 테스트용 샘플 서식 — 실제 운영에서는 서식 관리 API 로 대체
 * (허용 태그: p, h1~h3, strong/em/u/s, span[style color|background-color], ul/ol, blockquote, table, a, img)
 */
export const SAMPLE_FORMATS = [
  {
    id: 'notice-box',
    category: '텍스트',
    name: '안내 박스',
    description: '배경색 있는 1칸 표로 강조 안내',
    html: `<table><tbody><tr><td style="background-color: #e8f1fb"><p><strong>📌 안내</strong></p><p>안내 내용을 입력하세요.</p></td></tr></tbody></table>`,
  },
  {
    id: 'warning',
    category: '텍스트',
    name: '주의 문구',
    description: '빨간 제목 + 인용 블록',
    html: `<h3><span style="color: #d32f2f">⚠ 주의사항</span></h3><blockquote>주의 내용을 입력하세요.</blockquote>`,
  },
  {
    id: 'meeting-minutes',
    category: '문서',
    name: '회의록',
    description: '일시·장소·참석자·안건 표',
    html: `<h2>회의록</h2><table><tbody>
<tr><th style="background-color: #f2f4f7">일시</th><td>YYYY-MM-DD 00:00</td><th style="background-color: #f2f4f7">장소</th><td>회의실</td></tr>
<tr><th style="background-color: #f2f4f7">참석자</th><td colspan="3">참석자 입력</td></tr>
</tbody></table><h3>안건</h3><ol><li>안건 1</li><li>안건 2</li></ol><h3>결정 사항</h3><ul><li>결정 사항 입력</li></ul>`,
  },
  {
    id: 'checklist',
    category: '텍스트',
    name: '체크리스트',
    description: '확인 항목 목록',
    html: `<h3>확인 사항</h3><ul><li>☐ 항목 1</li><li>☐ 항목 2</li><li>☐ 항목 3</li></ul>`,
  },
  {
    id: 'slider',
    category: '미디어',
    name: '이미지 슬라이드',
    description: '이미지가 자동으로 넘어가는 블록. 간격·비율 선택, 썸네일로 순서 변경',
    html: `<div data-type="slider" data-interval="3000" data-ratio="16:9"></div>`,
  },
  {
    id: 'buttons',
    category: '블록',
    name: '버튼',
    description: '버튼 묶음 블록. 추가·주소·모양·순서·정렬을 헤더에서 조정',
    html: `<div data-type="buttons" data-align="center"><a href="https://example.com" data-role="button" data-style="primary">자세히 보기</a><a href="https://example.com" data-role="button" data-style="outline">신청하기</a></div>`,
  },
  {
    id: 'image-gallery',
    category: '미디어',
    name: '이미지 갤러리',
    description: '이미지만 넣는 블록. 비율을 유지하며 줄을 채워 자동 배치, 순서 변경·교체·삭제',
    html: `<div data-type="gallery" data-layout="justify"></div>`,
  },
  {
    id: 'divider-note',
    category: '텍스트',
    name: '구분 메모',
    description: '배경색 띠 한 줄',
    html: `<p><span style="background-color: #fff9c4">　메모: 내용을 입력하세요　</span></p>`,
  },
  {
    id: 'image-wrap',
    category: '이미지 + 글',
    name: '이미지 + 글 (감싸기)',
    description: '이미지 옆으로 글이 흐르고 아래로 이어짐. 이미지를 클릭해 교체·방향·크기 조절',
    html: `<p><img src="${IMAGE_PLACEHOLDER}" width="800" height="600" data-float="left" style="width: 40%"></p><p>이미지 오른쪽부터 글이 채워지고, 이미지 높이를 넘으면 아래 전체 폭으로 이어집니다.</p><p>이미지를 클릭하면 위에 도구 막대가 나옵니다. 「교체」로 실제 이미지를 넣고, 왼쪽·오른쪽 감싸기와 폭을 고르거나 모서리 손잡이를 끌어 크기를 바꿀 수 있습니다.</p>`,
  },
  {
    id: 'layout-side',
    category: '이미지 + 글',
    name: '이미지 | 글',
    description: '2칸. 헤더에서 이미지 왼쪽/오른쪽, 가운데 경계를 끌어 폭 조절',
    html: `<div data-type="layout" data-preset="side" data-variant="left"><div data-cell="image"></div><div data-cell="text"><p>이미지 옆에 들어갈 글을 입력하세요.</p></div></div>`,
  },
  {
    id: 'layout-one',
    category: '이미지 + 글',
    name: '이미지 1장 + 글',
    description: '4분할. 이미지 옆 작은 글 칸 + 반대쪽 줄 전체 글 칸. 헤더에서 이미지 위치 4곳',
    html: `<div data-type="layout" data-preset="one" data-variant="tl"><div data-cell="image"></div><div data-cell="text"><p>이미지 옆 글</p></div><div data-cell="text"><p>아래 전체 폭 글</p></div></div>`,
  },
  {
    id: 'layout-diagonal',
    category: '이미지 + 글',
    name: '대각선 이미지 2장 + 글',
    description: '4분할. 이미지가 대각선, 나머지 두 칸은 글. 헤더에서 방향 선택',
    html: `<div data-type="layout" data-preset="diagonal" data-variant="tl-br"><div data-cell="image"></div><div data-cell="text"><p>위쪽 글</p></div><div data-cell="text"><p>아래쪽 글</p></div><div data-cell="image"></div></div>`,
  },
  {
    id: 'layout-pair',
    category: '이미지 + 글',
    name: '이미지 2장 나란히 + 글',
    description: '이미지 2장과 각각의 글. 헤더에서 이미지 위/아래',
    html: `<div data-type="layout" data-preset="pair" data-variant="top"><div data-cell="image"></div><div data-cell="text"><p>왼쪽 이미지 설명</p></div><div data-cell="image"></div><div data-cell="text"><p>오른쪽 이미지 설명</p></div></div>`,
  },
];
