/**
 * React 래퍼 (차후 React/Next.js 전환용)
 * - 코어 JmEditor 를 그대로 사용한다. 툴바만 React 로 그린다.
 * - Next.js App Router 에서는 'use client' 필요 (window/document 사용).
 */
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { JmEditor as JmEditorCore } from '../../src/core/JmEditor.js';

/** 툴바 버튼 정의 (vanilla 와 동일 규격) */
const BUTTONS = [
  ['bold', 'B', (s) => s.strong],
  ['italic', 'I', (s) => s.em],
  ['underline', 'U', (s) => s.u],
  ['strike', 'S', (s) => s.s],
  ['h1', 'H1', (s) => s.block === 'h1'],
  ['h2', 'H2', (s) => s.block === 'h2'],
  ['h3', 'H3', (s) => s.block === 'h3'],
  ['quote', '❝', (s) => s.block === 'blockquote'],
  ['ul', '• 목록', (s) => s.list === 'ul'],
  ['ol', '1. 목록', (s) => s.list === 'ol'],
  ['link', '링크', (s) => s.a],
  ['image', '이미지', () => false],
  ['undo', '↶', () => false],
  ['redo', '↷', () => false],
];

/**
 * @param {object} props
 * @param {string} [props.value] 초기 HTML
 * @param {(html: string) => void} [props.onChange]
 * @param {(file: File) => Promise<string>} [props.uploadImage]
 * @param {string} [props.placeholder]
 */
export default function JmEditor({ value = '', onChange, uploadImage, placeholder }) {
  const areaRef = useRef(null);
  const editorRef = useRef(null);
  const fileRef = useRef(null);
  const [state, setState] = useState({});

  // 에디터 생성/해제 (마운트 1회)
  useEffect(() => {
    const editor = new JmEditorCore(areaRef.current, {
      placeholder,
      uploadImage,
      onChange,
      onSelectionChange: () => setState(editor.getState()),
    });
    editor.setHTML(value);
    editorRef.current = editor;
    return () => editor.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 외부에서 value 가 바뀐 경우 반영 (수정 화면 데이터 로드 등)
  useEffect(() => {
    const ed = editorRef.current;
    if (ed && ed.getHTML() !== value) ed.setHTML(value);
  }, [value]);

  const run = useCallback((cmd) => {
    const ed = editorRef.current;
    if (!ed) return;
    if (cmd === 'link') {
      if (ed.getState().a) { ed.exec('unlink'); return; }
      const url = window.prompt('링크 URL 을 입력하세요', 'https://');
      if (url) ed.exec('link', url);
      return;
    }
    if (cmd === 'image') { fileRef.current?.click(); return; }
    ed.exec(cmd);
  }, []);

  return (
    <div className="jm-container">
      <div className="jm-toolbar">
        {BUTTONS.map(([cmd, label, isActive]) => (
          <button
            key={cmd}
            type="button"
            className={`jm-btn ${isActive(state) ? 'is-active' : ''}`}
            onMouseDown={(e) => e.preventDefault()} // 선택 영역 유지
            onClick={() => run(cmd)}
          >
            {label}
          </button>
        ))}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            editorRef.current?.insertImageFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      <div ref={areaRef} />
    </div>
  );
}
