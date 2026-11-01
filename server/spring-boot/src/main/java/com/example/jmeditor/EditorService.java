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
        e.setContent(cleanContent(req.content()));
        return EditorDto.ContentResponse.from(contentRepository.save(e));
    }

    /** 수정 */
    @Transactional
    public EditorDto.ContentResponse update(Long id, EditorDto.SaveRequest req) {
        EditorContent e = find(id);
        e.setTitle(req.title());
        e.setContent(cleanContent(req.content()));
        return EditorDto.ContentResponse.from(e);
    }

    /** 서식 목록 (사용 중인 것만, 정렬 순) — 서식 HTML 도 sanitize 해서 내려줌 */
    @Transactional(readOnly = true)
    public List<EditorDto.FormatResponse> formats() {
        return formatRepository.findByUseYnOrderBySortOrderAscIdAsc("Y").stream()
                .map(f -> new EditorDto.FormatResponse(f.getId(), f.getName(), f.getCategory(), f.getDescription(), sanitizer.clean(f.getHtml())))
                .toList();
    }

    /**
     * 본문 정제. 정제하면서 커지는 입력(예: 짧은 a 태그의 target·rel 추가)이 있어 정제 후 길이도 상한을 검사한다.
     * @param content 요청 본문
     * @return 정제한 본문
     * @throws IllegalArgumentException 정제 후 {@link EditorDto#MAX_CONTENT_LENGTH} 를 넘을 때 (컨트롤러가 400 으로 응답)
     */
    private String cleanContent(String content) {
        String cleaned = sanitizer.clean(content);
        if (cleaned.length() > EditorDto.MAX_CONTENT_LENGTH) throw new IllegalArgumentException("본문이 너무 큽니다. 이미지는 파일로 올려 주세요");
        return cleaned;
    }

    private EditorContent find(Long id) {
        return contentRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("콘텐츠를 찾을 수 없습니다: " + id));
    }
}
