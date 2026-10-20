package com.example.jmeditor;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 에디터 콘텐츠 CRUD + 서식 목록 */
@Service
@RequiredArgsConstructor
public class EditorService {

    private final EditorContentRepository contentRepository;
    private final EditorFormatRepository formatRepository;
    private final HtmlSanitizer sanitizer;

    /** 조회 */
    @Transactional(readOnly = true)
    public EditorDto.ContentResponse get(Long id) {
        return EditorDto.ContentResponse.from(find(id));
    }

    /** 등록 — 본문은 서버 sanitize 후 저장 */
    @Transactional
    public EditorDto.ContentResponse create(EditorDto.SaveRequest req) {
        EditorContent e = new EditorContent();
        e.setTitle(req.title());
        e.setContent(sanitizer.clean(req.content()));
        return EditorDto.ContentResponse.from(contentRepository.save(e));
    }

    /** 수정 */
    @Transactional
    public EditorDto.ContentResponse update(Long id, EditorDto.SaveRequest req) {
        EditorContent e = find(id);
        e.setTitle(req.title());
        e.setContent(sanitizer.clean(req.content()));
        return EditorDto.ContentResponse.from(e);
    }

    /** 서식 목록 (사용 중인 것만, 정렬 순) — 서식 HTML 도 sanitize 해서 내려줌 */
    @Transactional(readOnly = true)
    public List<EditorDto.FormatResponse> formats() {
        return formatRepository.findByUseYnOrderBySortOrderAscIdAsc("Y").stream()
                .map(f -> new EditorDto.FormatResponse(f.getId(), f.getName(), f.getCategory(), f.getDescription(), sanitizer.clean(f.getHtml())))
                .toList();
    }

    private EditorContent find(Long id) {
        return contentRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("콘텐츠를 찾을 수 없습니다: " + id));
    }
}
