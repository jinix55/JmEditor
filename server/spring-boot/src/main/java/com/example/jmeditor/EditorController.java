package com.example.jmeditor;

import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

/**
 * JmEditor API — 클라이언트 JmEditorApi.js 의 기본 엔드포인트와 1:1
 *  GET  /api/editor/contents/{id}   조회
 *  POST /api/editor/contents        등록
 *  PUT  /api/editor/contents/{id}   수정
 *  POST /api/editor/upload/image    이미지 업로드
 *  GET  /api/editor/formats         서식 목록
 */
@RestController
@RequestMapping("/api/editor")
@RequiredArgsConstructor
public class EditorController {

    private final EditorService editorService;
    private final ImageUploadService imageUploadService;

    @GetMapping("/contents/{id}")
    public EditorDto.ContentResponse get(@PathVariable Long id) {
        return editorService.get(id);
    }

    @PostMapping("/contents")
    @ResponseStatus(HttpStatus.CREATED)
    public EditorDto.ContentResponse create(@Valid @RequestBody EditorDto.SaveRequest req) {
        return editorService.create(req);
    }

    @PutMapping("/contents/{id}")
    public EditorDto.ContentResponse update(@PathVariable Long id, @Valid @RequestBody EditorDto.SaveRequest req) {
        return editorService.update(id, req);
    }

    @PostMapping("/upload/image")
    public EditorDto.UploadResponse upload(@RequestParam("file") MultipartFile file) throws IOException {
        return new EditorDto.UploadResponse(imageUploadService.save(file));
    }

    @GetMapping("/formats")
    public List<EditorDto.FormatResponse> formats() {
        return editorService.formats();
    }

    // ───── 오류 응답: JmEditorApi 가 message 를 읽어 사용자에게 표시 ─────

    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<EditorDto.ErrorResponse> notFound(EntityNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new EditorDto.ErrorResponse(e.getMessage()));
    }

    @ExceptionHandler({IllegalArgumentException.class, IOException.class})
    public ResponseEntity<EditorDto.ErrorResponse> badRequest(Exception e) {
        return ResponseEntity.badRequest().body(new EditorDto.ErrorResponse(e.getMessage()));
    }
}
