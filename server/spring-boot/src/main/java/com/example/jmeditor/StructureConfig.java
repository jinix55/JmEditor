package com.example.jmeditor;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

/**
 * 퍼블리싱 구조 보존 설정 (application.yml jm-editor.structure.*) → {@link StructurePolicy} 빈.
 * 클라이언트 window.JmEditorConfig.structure 와 같은 값으로 맞춘다. 기본 켜짐 (끄려면 enabled: false).
 * <pre>
 * jm-editor:
 *   structure:
 *     enabled: true        # 생략하면 켜짐
 *     tags: [section, article, aside, div, dl, dt, dd, figure, figcaption, caption, header, footer, nav, h4, h5, h6, small, sub, sup]
 *     class-pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$"
 *     class-allow: [tit-*, box-gray]   # 없으면 형식만 검사
 *     class-deny: [btn-admin*]
 *     id-pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$"
 *     id-deny: [gnb, site-*]          # 예약 전역(JmEditorConfig 등)·jm-* 는 설정과 무관하게 항상 제거
 * </pre>
 */
@Configuration
@EnableConfigurationProperties(StructureConfig.Props.class)
public class StructureConfig {

    /** 설정값 (없는 항목은 null → 기본값. enabled 가 없으면 켜짐) */
    @ConfigurationProperties("jm-editor.structure")
    public record Props(Boolean enabled, List<String> tags, String classPattern, List<String> classAllow, List<String> classDeny,
                        String idPattern, List<String> idDeny) {}

    /** 정제에 쓰는 정책 */
    @Bean
    public StructurePolicy structurePolicy(Props p) {
        return new StructurePolicy(p.enabled() == null || p.enabled(), p.tags(), p.classPattern(), p.classAllow(), p.classDeny(), p.idPattern(), p.idDeny());
    }
}
