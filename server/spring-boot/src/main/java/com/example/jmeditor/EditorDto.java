package com.example.jmeditor;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

/** 요청/응답 DTO 모음 — 클라이언트 JmEditorApi 규약과 필드명을 맞춘다 */
public final class EditorDto {
    private EditorDto() {}

    /**
     * 본문 최대 길이(문자 수). 이미지는 업로드 API 로 올려 주소만 넣는 것을 전제로 한 값 —
     * base64 이미지를 본문에 넣는 방식으로 업로드 크기 제한을 우회하거나 DB 를 부풀리는 것을 막는다. 서비스에 맞게 조정.
     */
    public static final int MAX_CONTENT_LENGTH = 2_000_000;

    /** 등록/수정 요청 */
    public record SaveRequest(
            @Size(max = 200, message = "제목은 200자까지 입력할 수 있습니다") String title,
            @NotBlank(message = "본문이 비어 있습니다")
            @Size(max = MAX_CONTENT_LENGTH, message = "본문이 너무 큽니다. 이미지는 파일로 올려 주세요") String content
    ) {}

    /** 콘텐츠 응답 */
    public record ContentResponse(Long id, String title, String content,
                                  LocalDateTime createdAt, LocalDateTime updatedAt) {
        public static ContentResponse from(EditorContent e) {
            return new ContentResponse(e.getId(), e.getTitle(), e.getContent(), e.getCreatedAt(), e.getUpdatedAt());
        }
    }

    /** 이미지 업로드 응답 */
    public record UploadResponse(String url) {}

    /** 서식 목록 응답 */
    public record FormatResponse(Long id, String name, String category, String description, String html) {
        public static FormatResponse from(EditorFormat f) {
            return new FormatResponse(f.getId(), f.getName(), f.getCategory(), f.getDescription(), f.getHtml());
        }
    }

    /** 오류 응답 (JmEditorApi 는 message 필드를 읽어 Error 메시지로 사용) */
    public record ErrorResponse(String message) {}
}
