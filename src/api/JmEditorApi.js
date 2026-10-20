/**
 * JmEditorApi — 에디터 기본 API 클라이언트
 * - 콘텐츠 조회/등록/수정, 이미지 업로드, 서식 목록 조회를 한 곳에서 처리한다.
 * - 엔드포인트·헤더(CSRF 등)·fetch 구현을 옵션으로 바꿀 수 있고, 응답 형태는 아래 규약을 따른다.
 *
 * 서버 규약 (기본값, Spring Boot 참조 구현 server/ 과 일치):
 *   GET    /api/editor/contents/{id}        → { id, title, content, createdAt, updatedAt }
 *   POST   /api/editor/contents             ← { title, content }   → { id, ... }
 *   PUT    /api/editor/contents/{id}        ← { title, content }   → { id, ... }
 *   POST   /api/editor/upload/image         ← multipart file       → { url }
 *   GET    /api/editor/formats              → [{ id, name, description, html }]
 */
export class JmEditorApi {
  /**
   * @param {object} [options]
   * @param {string} [options.baseUrl='']  컨텍스트 경로 등 접두사
   * @param {object} [options.endpoints]   엔드포인트 재정의 (문자열 또는 (id) => string)
   * @param {() => Record<string,string>} [options.headers] 요청마다 붙일 헤더 (CSRF 토큰 등)
   * @param {typeof fetch} [options.fetch]  fetch 구현 교체(테스트용)
   */
  constructor({ baseUrl = '', endpoints = {}, headers = () => ({}), fetch: fetchImpl } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.headers = headers;
    this.fetch = fetchImpl || ((...a) => window.fetch(...a));
    this.endpoints = {
      get: (id) => `/api/editor/contents/${id}`,
      create: '/api/editor/contents',
      update: (id) => `/api/editor/contents/${id}`,
      uploadImage: '/api/editor/upload/image',
      formats: '/api/editor/formats',
      ...endpoints,
    };
  }

  /** 엔드포인트 값이 함수면 id 를 넘겨 호출 */
  #url(key, id) {
    const ep = this.endpoints[key];
    return this.baseUrl + (typeof ep === 'function' ? ep(id) : ep);
  }

  /** 공통 요청: JSON 응답 파싱, 실패 시 메시지 포함 Error */
  async #request(url, { method = 'GET', body, json = true } = {}) {
    const headers = { ...this.headers() };
    if (json && body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await this.fetch(url, {
      method,
      headers,
      body: json && body !== undefined ? JSON.stringify(body) : body,
      credentials: 'same-origin',
    });
    if (!res.ok) {
      let msg = `${method} ${url} 실패 (${res.status})`;
      try { const e = await res.json(); if (e?.message) msg = e.message; } catch { /* 본문 없음 */ }
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  /** 콘텐츠 조회 */
  get(id) { return this.#request(this.#url('get', id)); }

  /** 콘텐츠 등록 → 생성된 레코드(id 포함) */
  create(data) { return this.#request(this.#url('create'), { method: 'POST', body: data }); }

  /** 콘텐츠 수정 */
  update(id, data) { return this.#request(this.#url('update', id), { method: 'PUT', body: data }); }

  /** 이미지 업로드 → url (JmEditor 의 uploadImage 옵션에 그대로 연결) */
  async uploadImage(file) {
    const fd = new FormData();
    fd.append('file', file);
    const { url } = await this.#request(this.#url('uploadImage'), { method: 'POST', body: fd, json: false });
    return url;
  }

  /** 서식 목록 (FormatPicker 의 loadFormats 에 그대로 연결) */
  formats() { return this.#request(this.#url('formats')); }
}
