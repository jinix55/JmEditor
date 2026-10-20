# JmEditor Spring Boot 참조 구현

클라이언트 `src/api/JmEditorApi.js` 의 기본 규약과 1:1 로 맞춘 서버 측 CRUD/업로드/서식 API.
패키지 `com.example.jmeditor` 는 프로젝트에 맞게 바꿔서 사용.

| Method | URL | 설명 |
|---|---|---|
| GET  | /api/editor/contents/{id} | 조회 |
| POST | /api/editor/contents | 등록 `{title, content}` |
| PUT  | /api/editor/contents/{id} | 수정 `{title, content}` |
| POST | /api/editor/upload/image | 이미지 업로드(multipart `file`) → `{url}` |
| GET  | /api/editor/formats | 서식 목록 (use_yn='Y', sort_order 순) |

## 의존성 (build.gradle)
```groovy
implementation 'org.springframework.boot:spring-boot-starter-web'
implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
implementation 'org.springframework.boot:spring-boot-starter-validation'
implementation 'org.jsoup:jsoup:1.18.1'   // 서버 측 HTML sanitize (필수)
```

## application.yml
```yaml
jm-editor:
  upload-dir: /var/app/uploads/editor   # 이미지 저장 경로
  upload-url-prefix: /uploads/editor    # 정적 리소스로 노출되는 URL 접두사
spring:
  servlet:
    multipart:
      max-file-size: 10MB
```
`upload-url-prefix` 를 `upload-dir` 로 매핑하는 `WebMvcConfigurer.addResourceHandlers` 는 `UploadConfig` 참고.

## 서버 sanitize 규칙 (`HtmlSanitizer`)
클라이언트 Sanitizer 와 동일 범위: p, br, strong, em, u, s, h1~h3, ul, ol, li, blockquote, a[href,target,rel], img[src,alt,width,height],
table/tbody/thead/tr/td/th(colspan, rowspan, style), span[style], div[data-type=gallery][data-cols][data-auto], p[data-role=title].
style 은 `color` / `background-color` 만 허용.
