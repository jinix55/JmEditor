-- JmEditor 서식(editor_format) 샘플 데이터 (MariaDB 10.3+ / MySQL 8+)
-- 클라이언트 기본 서식(src/ui/FormatPicker.js 의 SAMPLE_FORMATS) 14건과 같은 내용 (이미지 + 글 5건, 지도 1건 포함).
-- PostgreSQL 판(sample-formats-postgresql.sql)과 같은 데이터다.
-- schema-mariadb.sql 로 테이블을 만든 뒤 실행한다. 같은 이름의 서식이 이미 있으면 건너뛰므로 여러 번 실행해도 된다.
SET NAMES utf8mb4;
INSERT INTO editor_format (name, category, description, html, sort_order)
SELECT v.name, v.category, v.description, v.html, v.sort_order
FROM (
    SELECT '안내 박스' AS name, '텍스트' AS category, '배경색 있는 1칸 표로 강조 안내' AS description,
           '<table><tbody><tr><td style="background-color: #e8f1fb"><p><strong>📌 안내</strong></p><p>안내 내용을 입력하세요.</p></td></tr></tbody></table>' AS html, 1 AS sort_order
    UNION ALL SELECT '주의 문구', '텍스트', '빨간 제목 + 인용 블록',
           '<h3><span style="color: #d32f2f">⚠ 주의사항</span></h3><blockquote>주의 내용을 입력하세요.</blockquote>', 2
    UNION ALL SELECT '회의록', '문서', '일시·장소·참석자·안건 표',
           '<h2>회의록</h2><table><tbody><tr><th style="background-color: #f2f4f7">일시</th><td>YYYY-MM-DD 00:00</td><th style="background-color: #f2f4f7">장소</th><td>회의실</td></tr><tr><th style="background-color: #f2f4f7">참석자</th><td colspan="3">참석자 입력</td></tr></tbody></table><h3>안건</h3><ol><li>안건 1</li><li>안건 2</li></ol><h3>결정 사항</h3><ul><li>결정 사항 입력</li></ul>', 3
    UNION ALL SELECT '체크리스트', '텍스트', '확인 항목 목록',
           '<h3>확인 사항</h3><ul><li>☐ 항목 1</li><li>☐ 항목 2</li><li>☐ 항목 3</li></ul>', 4
    UNION ALL SELECT '이미지 슬라이드', '미디어', '이미지가 자동으로 넘어가는 블록. 간격·비율 선택, 썸네일로 순서 변경',
           '<div data-type="slider" data-interval="3000" data-ratio="16:9"></div>', 5
    UNION ALL SELECT '버튼', '블록', '버튼 묶음 블록. 추가·주소·모양·순서·정렬을 헤더에서 조정',
           '<div data-type="buttons" data-align="center"><a href="https://example.com" data-role="button" data-style="primary">자세히 보기</a><a href="https://example.com" data-role="button" data-style="outline">신청하기</a></div>', 6
    UNION ALL SELECT '이미지 갤러리', '미디어', '이미지만 넣는 블록. 비율을 유지하며 줄을 채워 자동 배치, 순서 변경·교체·삭제',
           '<div data-type="gallery" data-layout="justify"></div>', 7
    UNION ALL SELECT '구분 메모', '텍스트', '배경색 띠 한 줄',
           '<p><span style="background-color: #fff9c4">　메모: 내용을 입력하세요　</span></p>', 8
    UNION ALL SELECT '이미지 + 글 (감싸기)', '이미지 + 글', '이미지 옆으로 글이 흐르고 아래로 이어짐. 이미지를 클릭해 교체·방향·크기 조절',
           '<p><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNjAwIiB2aWV3Qm94PSIwIDAgODAwIDYwMCI+PHJlY3Qgd2lkdGg9IjgwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiNlZWYyZjciLz48cmVjdCB4PSIxMiIgeT0iMTIiIHdpZHRoPSI3NzYiIGhlaWdodD0iNTc2IiBmaWxsPSJub25lIiBzdHJva2U9IiNiNGMwZDAiIHN0cm9rZS13aWR0aD0iNiIgc3Ryb2tlLWRhc2hhcnJheT0iMTggMTIiIHJ4PSIxMiIvPjx0ZXh0IHg9IjQwMCIgeT0iMjkwIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSI0NCIgZmlsbD0iIzY2NzA4NSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+7J2066+47KeA66W8IOuEo+ycvOyEuOyalDwvdGV4dD48dGV4dCB4PSI0MDAiIHk9IjM1MCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjgiIGZpbGw9IiM5OGEyYjMiIHRleHQtYW5jaG9yPSJtaWRkbGUiPuydtOuvuOyngCDtgbTrpq0g4oaSIOq1kOyytDwvdGV4dD48L3N2Zz4=" width="800" height="600" data-float="left" style="width: 40%"></p><p>이미지 오른쪽부터 글이 채워지고, 이미지 높이를 넘으면 아래 전체 폭으로 이어집니다.</p><p>이미지를 클릭하면 위에 도구 막대가 나옵니다. 「교체」로 실제 이미지를 넣고, 왼쪽·오른쪽 감싸기와 폭을 고르거나 모서리 손잡이를 끌어 크기를 바꿀 수 있습니다.</p>', 9
    UNION ALL SELECT '이미지 | 글', '이미지 + 글', '2칸. 헤더에서 이미지 왼쪽/오른쪽, 가운데 경계를 끌어 폭 조절',
           '<div data-type="layout" data-preset="side" data-variant="left"><div data-cell="image"></div><div data-cell="text"><p>이미지 옆에 들어갈 글을 입력하세요.</p></div></div>', 10
    UNION ALL SELECT '이미지 1장 + 글', '이미지 + 글', '4분할. 이미지 옆 작은 글 칸 + 반대쪽 줄 전체 글 칸. 헤더에서 이미지 위치 4곳',
           '<div data-type="layout" data-preset="one" data-variant="tl"><div data-cell="image"></div><div data-cell="text"><p>이미지 옆 글</p></div><div data-cell="text"><p>아래 전체 폭 글</p></div></div>', 11
    UNION ALL SELECT '대각선 이미지 2장 + 글', '이미지 + 글', '4분할. 이미지가 대각선, 나머지 두 칸은 글. 헤더에서 방향 선택',
           '<div data-type="layout" data-preset="diagonal" data-variant="tl-br"><div data-cell="image"></div><div data-cell="text"><p>위쪽 글</p></div><div data-cell="text"><p>아래쪽 글</p></div><div data-cell="image"></div></div>', 12
    UNION ALL SELECT '이미지 2장 나란히 + 글', '이미지 + 글', '이미지 2장과 각각의 글. 헤더에서 이미지 위/아래',
           '<div data-type="layout" data-preset="pair" data-variant="top"><div data-cell="image"></div><div data-cell="text"><p>왼쪽 이미지 설명</p></div><div data-cell="image"></div><div data-cell="text"><p>오른쪽 이미지 설명</p></div></div>', 13
    UNION ALL SELECT '오시는 길', '지도', '카카오 지도 블록 (앱 키 불필요). 헤더나 본문에 카카오맵 「지도 퍼가기」 코드를 붙여 넣으면 장소 변경',
           '<div data-type="map" data-provider="kakao-roughmap" data-timestamp="1792762389634" data-key="3rt3v4p5vvx" data-height="400" data-title="경기 성남시 분당구 운중로 227"></div>', 14
) AS v
WHERE NOT EXISTS (SELECT 1 FROM editor_format f WHERE f.name = v.name);
