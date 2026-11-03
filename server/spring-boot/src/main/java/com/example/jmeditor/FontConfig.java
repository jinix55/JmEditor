package com.example.jmeditor;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

/**
 * 글꼴 허용 목록 설정 (application.yml jm-editor.font.families·legacy) → {@link FontPolicy} 빈.
 * 클라이언트 window.JmEditorConfig.font.families·legacy 와 같은 값으로 맞춘다. 생략하면 기본 목록.
 */
@Configuration
@EnableConfigurationProperties(FontConfig.Props.class)
public class FontConfig {

    /** 설정값 (없으면 null → 기본 목록). families 툴바 목록, legacy 옛 글꼴 */
    @ConfigurationProperties("jm-editor.font")
    public record Props(List<String> families, List<String> legacy) {}

    /** 정제에 쓰는 글꼴 정책 */
    @Bean
    public FontPolicy fontPolicy(Props p) {
        return new FontPolicy(p.families(), p.legacy());
    }
}
