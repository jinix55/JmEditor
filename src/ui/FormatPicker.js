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
    description: '이미지만 넣는 블록. 드롭/추가 시 자동 균등 배치, 헤더에서 선택·전체 삭제',
    html: `<div data-type="gallery" data-cols="3" data-auto="1"></div>`,
  },
  {
    id: 'divider-note',
    category: '텍스트',
    name: '구분 메모',
    description: '배경색 띠 한 줄',
    html: `<p><span style="background-color: #fff9c4">　메모: 내용을 입력하세요　</span></p>`,
  },
];
