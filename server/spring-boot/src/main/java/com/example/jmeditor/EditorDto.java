package com.example.jmeditor;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

/** 요청/응답 DTO 모음 — 클라이언트 JmEditorApi 규약과 필드명을 맞춘다 */
public final class EditorDto {
    private EditorDto() {}

    /** 등록/수정 요청 */
    public record SaveRequest(
            @Size(max = 200) String title,
            @NotBlank String content
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
    public record FormatResponse(Long id, String name, String description, String html) {
        public static FormatResponse from(EditorFormat f) {
            return new FormatResponse(f.getId(), f.getName(), f.getDescription(), f.getHtml());
        }
    }

    /** 오류 응답 (JmEditorApi 는 message 필드를 읽어 Error 메시지로 사용) */
    public record ErrorResponse(String message) {}
}
