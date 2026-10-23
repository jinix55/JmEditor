package com.example.jmeditor;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * 퍼블리싱 구조 보존 정책 (구조 태그·class 허용 범위) — 클라이언트 src/core/structure-policy.js 와 같은 규칙.
 * <p>
 * 기본은 켜짐(StructureConfig). 끄면 예전 규칙: class 를 지우고 div→p, 모르는 태그는 벗긴다.
 * 켜져 있으면 {@link #tags()} 의 구조 태그와 허용 태그의 class(토큰 검사 통과분)를 남긴다. 플러그인 블록(div[data-type]) 안은 예외.
 * 클라이언트(window.JmEditorConfig.structure)와 같은 값으로 켜야 저장 때 구조가 지워지지 않는다.
 */
public final class StructurePolicy {

    /** 기본 구조 태그 */
    public static final List<String> DEFAULT_TAGS = List.of("section", "article", "aside", "div", "dl", "dt", "dd", "figure", "figcaption", "caption");
    /** 설정해도 이 밖의 태그는 열지 않는다 (script·form 등 차단) */
    public static final Set<String> TAG_LIMIT = Set.of("section", "article", "aside", "div", "dl", "dt", "dd", "figure", "figcaption", "caption",
            "header", "footer", "nav", "h4", "h5", "h6", "small", "sub", "sup");
    /** 기본 class 이름 형식 */
    public static final String DEFAULT_CLASS_PATTERN = "^[A-Za-z][A-Za-z0-9_-]{0,63}$";
    /** class 토큰 한계: 이름 길이·개수 (사용자 정규식이 느려도 입력 크기가 제한되게 — ReDoS 완화, 클라이언트와 같은 값) */
    public static final int CLASS_TOKEN_MAX = 64;
    public static final int CLASS_TOKENS_MAX = 32;
    /** 사용자 정규식 길이 한계 (넘으면 기본 형식) */
    private static final int PATTERN_MAX = 200;
    /** 에디터 예약 class — 설정과 무관하게 항상 제거 (jm-* 전부 + 아래 이름). is-active 는 퍼블에서 흔해 예약하지 않음 */
    public static final Set<String> RESERVED_CLASSES = Set.of("is-selected", "is-empty", "is-dragging", "is-block-dragging", "is-dragover", "is-resizing",
            "is-img", "is-current", "is-on", "is-invalid", "is-checked", "needs-sel", "drop-before", "drop-after", "has-sub");

    private final boolean enabled;
    private final Set<String> tags;
    private final Pattern classPattern;
    private final List<String> classAllow;
    private final List<String> classDeny;

    /**
     * @param enabled      켜기
     * @param tags         허용할 구조 태그 (null 이면 기본값, 빈 목록이면 없음 — 클라이언트와 같은 해석. {@link #TAG_LIMIT} 밖은 무시)
     * @param classPattern class 이름 형식 (null·잘못된 정규식이면 기본값)
     * @param classAllow   null 이면 형식만 검사, 목록이면 그 이름·접두어(xxx-*)만
     * @param classDeny    막을 이름·접두어
     */
    public StructurePolicy(boolean enabled, List<String> tags, String classPattern, List<String> classAllow, List<String> classDeny) {
        this.enabled = enabled;
        Set<String> t = new LinkedHashSet<>();
        for (String s : tags == null ? DEFAULT_TAGS : tags) {
            String n = s == null ? "" : s.trim().toLowerCase(Locale.ROOT);
            if (TAG_LIMIT.contains(n)) t.add(n);
        }
        this.tags = Set.copyOf(t);
        Pattern p;
        try { p = Pattern.compile(classPattern == null || classPattern.isBlank() || classPattern.length() > PATTERN_MAX ? DEFAULT_CLASS_PATTERN : classPattern); }
        catch (PatternSyntaxException e) { p = Pattern.compile(DEFAULT_CLASS_PATTERN); }
        this.classPattern = p;
        this.classAllow = classAllow == null ? null : List.copyOf(classAllow);
        this.classDeny = classDeny == null ? List.of() : List.copyOf(classDeny);
    }

    /** 꺼진 정책 (지금 정리 규칙) */
    public static StructurePolicy disabled() {
        return new StructurePolicy(false, null, null, null, null);
    }

    /** 기본값으로 켠 정책 */
    public static StructurePolicy defaults() {
        return new StructurePolicy(true, null, null, null, null);
    }

    public boolean enabled() { return enabled; }

    /** 허용 구조 태그 (꺼져 있으면 빈 집합) */
    public Set<String> tags() { return enabled ? tags : Set.of(); }

    /**
     * class 속성값에서 허용 토큰만 남긴다 (중복 제거, 순서 유지)
     * @param value class 속성값
     * @return 남는 것이 없으면 빈 문자열
     */
    public String cleanClass(String value) {
        if (!enabled || value == null) return "";
        Set<String> out = new LinkedHashSet<>();
        // (?U): 유니코드 공백(nbsp 등)도 구분자 — 클라이언트 JS \s 와 같게
        String[] toks = value.strip().split("(?U)\\s+");
        for (int i = 0; i < Math.min(toks.length, CLASS_TOKENS_MAX); i++) if (!toks[i].isEmpty() && okToken(toks[i])) out.add(toks[i]);
        return String.join(" ", new ArrayList<>(out));
    }

    private boolean okToken(String t) {
        return t.length() <= CLASS_TOKEN_MAX && classPattern.matcher(t).find() && !t.startsWith("jm-") && !RESERVED_CLASSES.contains(t)
                && (classAllow == null || matchesAny(t, classAllow)) && !matchesAny(t, classDeny);
    }

    /** 'xxx-*' 접두어 또는 정확한 이름 목록과 맞는지 */
    private static boolean matchesAny(String token, List<String> list) {
        for (String p : list) {
            if (p.endsWith("*") ? token.startsWith(p.substring(0, p.length() - 1)) : token.equals(p)) return true;
        }
        return false;
    }
}
