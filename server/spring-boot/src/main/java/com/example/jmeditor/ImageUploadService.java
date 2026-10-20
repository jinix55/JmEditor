package com.example.jmeditor;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

/** 에디터 이미지 업로드 — 날짜별 폴더에 UUID 파일명으로 저장하고 접근 URL 을 반환 */
@Service
public class ImageUploadService {

    private static final Set<String> ALLOWED_TYPES = Set.of("image/jpeg", "image/png", "image/gif", "image/webp");

    @Value("${jm-editor.upload-dir}")
    private String uploadDir;

    @Value("${jm-editor.upload-url-prefix}")
    private String urlPrefix;

    /**
     * @return 저장된 이미지의 공개 URL (예: /uploads/editor/2026/10/20/uuid.png)
     */
    public String save(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) throw new IllegalArgumentException("파일이 비어 있습니다");
        if (!ALLOWED_TYPES.contains(file.getContentType())) throw new IllegalArgumentException("이미지 파일만 업로드할 수 있습니다");

        String ext = extensionOf(file.getOriginalFilename());
        LocalDate today = LocalDate.now();
        String sub = String.format("%d/%02d/%02d", today.getYear(), today.getMonthValue(), today.getDayOfMonth());
        Path dir = Paths.get(uploadDir, sub);
        Files.createDirectories(dir);

        String name = UUID.randomUUID() + ext;
        Files.copy(file.getInputStream(), dir.resolve(name));
        return urlPrefix + "/" + sub + "/" + name;
    }

    /** 확장자만 안전하게 추출 (없으면 빈 문자열) */
    private static String extensionOf(String filename) {
        if (filename == null) return "";
        int i = filename.lastIndexOf('.');
        if (i < 0) return "";
        String ext = filename.substring(i).toLowerCase();
        return ext.matches("\\.[a-z0-9]{1,5}") ? ext : "";
    }
}
