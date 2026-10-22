package com.example.jmeditor;

import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
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

    private static final Logger log = LoggerFactory.getLogger(EditorController.class);

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

    /** 입력값 오류: 서비스에서 직접 만든 안내 문구라 그대로 내려준다 */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<EditorDto.ErrorResponse> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(new EditorDto.ErrorResponse(e.getMessage()));
    }

    /** 요청 검증 실패(@Valid): 첫 번째 필드 오류의 안내 문구 */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<EditorDto.ErrorResponse> invalid(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream().findFirst()
                .map(org.springframework.validation.FieldError::getDefaultMessage).orElse("입력값을 확인해 주세요");
        return ResponseEntity.badRequest().body(new EditorDto.ErrorResponse(msg));
    }

    /** 업로드 크기 초과 (spring.servlet.multipart.max-file-size) */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<EditorDto.ErrorResponse> tooLarge(MaxUploadSizeExceededException e) {
        return ResponseEntity.badRequest().body(new EditorDto.ErrorResponse("파일이 너무 큽니다"));
    }

    /** 입출력 오류: 서버 경로 등 내부 정보가 담길 수 있으므로 로그에만 남기고 일반 문구로 응답 */
    @ExceptionHandler(IOException.class)
    public ResponseEntity<EditorDto.ErrorResponse> ioError(IOException e) {
        log.error("에디터 파일 처리 실패", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new EditorDto.ErrorResponse("파일을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요"));
    }
}
