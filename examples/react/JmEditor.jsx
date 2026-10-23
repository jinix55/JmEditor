/**
 * React / Next.js 예시 — 편집 컴포넌트(JmEditor)와 조회 컴포넌트(JmContent)
 * - 편집: 바닐라와 같은 JmToolbarEditor(툴바·서식·갤러리·버튼·표·HTML 보기 등 전체 기능)를 그대로 감싼다.
 * - 조회: 저장된 HTML 을 .jm-content 에 출력하고 뷰어 런타임(갤러리 배치·슬라이드·카카오 지도)을 초기화한다.
 * - Next.js App Router 에서는 'use client' 필요 (window/document 사용).
 * - 설치: npm i github:jinix55/JmEditor
 */
'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { JmToolbarEditor } from 'jm-editor';
import { initViewer } from 'jm-editor/viewer';
import 'jm-editor/css';

/**
 * 편집 컴포넌트. ref 로 getHTML / setHTML / save / reset 을 쓸 수 있다.
 * @param {object} props
 * @param {string} [props.value] 초기 HTML (api 를 쓰면 contentId 로 조회하므로 생략)
 * @param {(html: string) => void} [props.onChange] 내용이 바뀔 때
 * @param {object} [props.api] JmEditorApi 생성 옵션 { baseUrl, headers, endpoints } — 지정 시 조회·저장·업로드·서식을 API 로
 * @param {string|number} [props.contentId] 수정 화면이면 글 id (api 필요)
 * @param {(file: File) => Promise<string>} [props.uploadImage] api 없이 이미지 업로드만 직접 처리할 때
 * @param {() => Promise<Array>} [props.loadFormats] 서식 목록 공급 함수 (없으면 api → 기본 서식)
 * @param {(rec: object) => void} [props.onLoaded] 조회 완료
 * @param {(rec: object) => void} [props.onSaved] 저장 완료
 * @param {string} [props.placeholder]
 */
export const JmEditor = forwardRef(function JmEditor(
  { value = '', onChange, api, contentId, uploadImage, loadFormats, onLoaded, onSaved, placeholder },
  ref,
) {
  const boxRef = useRef(null);
  const editorRef = useRef(null);
  // 콜백은 최신 것을 쓰도록 ref 에 둔다 (에디터는 마운트 때 한 번만 만든다)
  const cb = useRef({});
  cb.current = { onChange, onLoaded, onSaved };

  // 에디터 생성/해제 (마운트 1회)
  useEffect(() => {
    const editor = new JmToolbarEditor(boxRef.current, {
      placeholder,
      api,
      contentId,
      uploadImage,
      loadFormats,
      initialHTML: value,
      onChange: (html) => cb.current.onChange?.(html),
      onLoaded: (rec) => cb.current.onLoaded?.(rec),
      onSaved: (rec) => cb.current.onSaved?.(rec),
    });
    editorRef.current = editor;
    return () => editor.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 외부에서 value 가 바뀐 경우 반영 (api 없이 수정 화면 데이터를 직접 넣을 때)
  useEffect(() => {
    const ed = editorRef.current;
    if (ed && !api && ed.getHTML() !== value) ed.setHTML(value);
  }, [value, api]);

  // 부모에서 쓸 메서드
  useImperativeHandle(ref, () => ({
    getHTML: () => editorRef.current?.getHTML() ?? '',
    setHTML: (html) => editorRef.current?.setHTML(html),
    save: (extra) => editorRef.current?.save(extra), // api 필요. contentId 유무로 등록/수정
    reset: () => editorRef.current?.reset(),
    get dirty() { return !!editorRef.current?.dirty; },
  }), []);

  return <div ref={boxRef} />;
});

/**
 * 조회 컴포넌트. 서버에서 sanitize 된 HTML 만 넘길 것.
 * @param {object} props
 * @param {string} props.html 저장된 본문 HTML
 */
export function JmContent({ html }) {
  const ref = useRef(null);
  // 본문이 바뀔 때마다 뷰어 런타임 다시 초기화 (갤러리 배치·슬라이드 전환·카카오 지도)
  useEffect(() => initViewer(ref.current), [html]);
  return <div ref={ref} className="jm-content" dangerouslySetInnerHTML={{ __html: html }} />;
}

/*
 * 사용 예
 *
 * // 등록·수정 화면
 * const editorRef = useRef(null);
 * <JmEditor ref={editorRef} api={{ baseUrl: '' }} contentId={id} onLoaded={(rec) => setTitle(rec.title)} />
 * <button onClick={() => editorRef.current.save({ title })}>저장</button>
 *
 * // 조회 화면
 * <JmContent html={record.content} />
 */
