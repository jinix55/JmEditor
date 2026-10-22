package com.example.jmeditor;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/** 에디터 이미지 업로드 — 날짜별 폴더에 UUID 파일명으로 저장하고 접근 URL 을 반환 */
@Service
public class ImageUploadService {

    /**
     * 허용 MIME → 저장 확장자.
     * 확장자를 원본 파일명에서 가져오면 image/png 로 위장한 .html/.svg 가 같은 출처에서 그대로 서빙되므로 MIME 으로만 정한다.
     */
    private static final Map<String, String> EXTENSIONS = Map.of(
            "image/jpeg", ".jpg",
            "image/png", ".png",
            "image/gif", ".gif",
            "image/webp", ".webp");

    @Value("${jm-editor.upload-dir}")
    private String uploadDir;

    @Value("${jm-editor.upload-url-prefix}")
    private String urlPrefix;

    /**
     * @return 저장된 이미지의 공개 URL (예: /uploads/editor/2026/10/20/uuid.png)
     */
    public String save(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) throw new IllegalArgumentException("파일이 비어 있습니다");
        String ext = file.getContentType() == null ? null : EXTENSIONS.get(file.getContentType());
        if (ext == null) throw new IllegalArgumentException("이미지 파일만 업로드할 수 있습니다");

        LocalDate today = LocalDate.now();
        String sub = String.format("%d/%02d/%02d", today.getYear(), today.getMonthValue(), today.getDayOfMonth());
        Path dir = Paths.get(uploadDir, sub);
        Files.createDirectories(dir);

        String name = UUID.randomUUID() + ext;
        Files.copy(file.getInputStream(), dir.resolve(name));
        return urlPrefix + "/" + sub + "/" + name;
    }
}
