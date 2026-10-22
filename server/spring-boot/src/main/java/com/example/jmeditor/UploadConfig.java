package com.example.jmeditor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 업로드 폴더를 정적 리소스 URL 로 노출 (upload-url-prefix/** → upload-dir)
 * 업로드 파일 응답에는 보안 헤더를 붙인다 — 이미지로 위장한 파일을 브라우저가 HTML 등으로 추측(sniff)해 실행하지 않게.
 * 가능하면 업로드 파일은 별도 도메인(쿠키 없는 정적 도메인)에서 서빙하는 것을 권장.
 */
@Configuration
public class UploadConfig implements WebMvcConfigurer {

    @Value("${jm-editor.upload-dir}")
    private String uploadDir;

    @Value("${jm-editor.upload-url-prefix}")
    private String urlPrefix;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler(urlPrefix + "/**")
                .addResourceLocations("file:" + (uploadDir.endsWith("/") ? uploadDir : uploadDir + "/"));
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new UploadHeaderInterceptor()).addPathPatterns(urlPrefix + "/**");
    }

    /** 업로드 파일 응답 보안 헤더: 내용 추측 금지 + 문서로 열려도 스크립트 실행 불가(sandbox) */
    static class UploadHeaderInterceptor implements HandlerInterceptor {
        @Override
        public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
            return true;
        }
    }
}
