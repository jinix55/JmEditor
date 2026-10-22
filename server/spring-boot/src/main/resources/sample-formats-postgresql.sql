-- JmEditor 서식(editor_format) 샘플 데이터 (PostgreSQL)
-- 클라이언트 기본 서식(src/ui/FormatPicker.js 의 SAMPLE_FORMATS) 8건과 같은 내용.
-- schema-postgresql.sql 로 테이블을 만든 뒤 실행한다. 같은 이름의 서식이 이미 있으면 건너뛰므로 여러 번 실행해도 된다.
INSERT INTO editor_format (name, category, description, html, sort_order)
SELECT v.name, v.category, v.description, v.html, v.sort_order
FROM (VALUES
    ('안내 박스', '텍스트', '배경색 있는 1칸 표로 강조 안내',
     '<table><tbody><tr><td style="background-color: #e8f1fb"><p><strong>📌 안내</strong></p><p>안내 내용을 입력하세요.</p></td></tr></tbody></table>', 1),
    ('주의 문구', '텍스트', '빨간 제목 + 인용 블록',
     '<h3><span style="color: #d32f2f">⚠ 주의사항</span></h3><blockquote>주의 내용을 입력하세요.</blockquote>', 2),
    ('회의록', '문서', '일시·장소·참석자·안건 표',
     '<h2>회의록</h2><table><tbody><tr><th style="background-color: #f2f4f7">일시</th><td>YYYY-MM-DD 00:00</td><th style="background-color: #f2f4f7">장소</th><td>회의실</td></tr><tr><th style="background-color: #f2f4f7">참석자</th><td colspan="3">참석자 입력</td></tr></tbody></table><h3>안건</h3><ol><li>안건 1</li><li>안건 2</li></ol><h3>결정 사항</h3><ul><li>결정 사항 입력</li></ul>', 3),
    ('체크리스트', '텍스트', '확인 항목 목록',
     '<h3>확인 사항</h3><ul><li>☐ 항목 1</li><li>☐ 항목 2</li><li>☐ 항목 3</li></ul>', 4),
    ('이미지 슬라이드', '미디어', '이미지가 자동으로 넘어가는 블록. 간격·비율 선택, 썸네일로 순서 변경',
     '<div data-type="slider" data-interval="3000" data-ratio="16:9"></div>', 5),
    ('버튼', '블록', '버튼 묶음 블록. 추가·주소·모양·순서·정렬을 헤더에서 조정',
     '<div data-type="buttons" data-align="center"><a href="https://example.com" data-role="button" data-style="primary">자세히 보기</a><a href="https://example.com" data-role="button" data-style="outline">신청하기</a></div>', 6),
    ('이미지 갤러리', '미디어', '이미지만 넣는 블록. 드롭/추가 시 자동 균등 배치, 헤더에서 선택·전체 삭제',
     '<div data-type="gallery" data-cols="3" data-auto="1"></div>', 7),
    ('구분 메모', '텍스트', '배경색 띠 한 줄',
     '<p><span style="background-color: #fff9c4">　메모: 내용을 입력하세요　</span></p>', 8)
) AS v(name, category, description, html, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM editor_format f WHERE f.name = v.name);
