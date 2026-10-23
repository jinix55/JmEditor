package com.example.jmeditor;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

/**
 * 퍼블리싱 구조 보존 설정 (application.yml jm-editor.structure.*) → {@link StructurePolicy} 빈.
 * 클라이언트 window.JmEditorConfig.structure 와 같은 값으로 맞춘다.
 * <pre>
 * jm-editor:
 *   structure:
 *     enabled: true
 *     tags: [section, article, aside, div, dl, dt, dd, figure, figcaption, caption]
 *     class-pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$"
 *     class-allow: [tit-*, box-gray]   # 없으면 형식만 검사
 *     class-deny: [btn-admin*]
 * </pre>
 */
@Configuration
@EnableConfigurationProperties(StructureConfig.Props.class)
public class StructureConfig {

    /** 설정값 (없는 항목은 null → 기본값) */
    @ConfigurationProperties("jm-editor.structure")
    public record Props(boolean enabled, List<String> tags, String classPattern, List<String> classAllow, List<String> classDeny) {}

    /** 정제에 쓰는 정책 */
    @Bean
    public StructurePolicy structurePolicy(Props p) {
        return new StructurePolicy(p.enabled(), p.tags(), p.classPattern(), p.classAllow(), p.classDeny());
    }
}
