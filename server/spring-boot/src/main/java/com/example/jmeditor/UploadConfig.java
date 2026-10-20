package com.example.jmeditor;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** 업로드 폴더를 정적 리소스 URL 로 노출 (upload-url-prefix/** → upload-dir) */
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
}
