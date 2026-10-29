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
    public static final List<String> DEFAULT_TAGS = List.of("section", "article", "aside", "div", "dl", "dt", "dd", "figure", "figcaption", "caption",
            "header", "footer", "nav", "h4", "h5", "h6", "small", "sub", "sup");
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

    /** 기본 id 형식 */
    public static final String DEFAULT_ID_PATTERN = "^[A-Za-z][A-Za-z0-9_-]{0,63}$";
    /**
     * 예약 id — 설정과 무관하게 항상 제거. 라이브러리·뷰어·지도 스크립트가 window 에서 읽는 전역 이름만 (DOM clobbering 방지).
     * 브라우저 속성 이름 전체를 막지 않는다(history·location·content 같은 흔한 퍼블 id 는 남김). 클라이언트 RESERVED_IDS 와 같아야 한다.
     */
    public static final Set<String> RESERVED_IDS = Set.of("JmEditorConfig", "JmEditor", "JmViewer", "JM", "kakao", "daum", "EyeDropper");
    /** id 길이 한계(ReDoS 완화), aria id 토큰 최대 개수, aria-label 최대 길이 — 클라이언트와 같은 값 */
    public static final int ID_MAX = 64;
    public static final int ARIA_IDS_MAX = 8;
    public static final int ARIA_LABEL_MAX = 200;
    /** 남길 aria 속성 (출력 순서도 이 순서 — 클라이언트 ARIA_ATTRS 와 같음) */
    public static final List<String> ARIA_ATTRS = List.of("aria-labelledby", "aria-describedby", "aria-label", "aria-hidden");
    /** id 에 들어가면 안 되는 문자: 제어 문자·공백(유니코드 공백 포함 — JS 정규식 공백과 맞추려고 U+FEFF 도) */
    private static final Pattern ID_BAD_CHARS = Pattern.compile("(?U)[\\u0000-\\u001f\\u007f\\s\\uFEFF]");
    /** 제어 문자 (aria-label 금지) */
    private static final Pattern CONTROL_CHARS = Pattern.compile("[\\u0000-\\u001f\\u007f]");
    /** JS trim() 이 지우는 공백 (빈 aria-label 판정용 — Java strip() 은 nbsp 를 남김) */
    private static final Pattern JS_SPACE = Pattern.compile("(?U)[\\s\\uFEFF]");
    /** JS trim() 이 지우는 앞뒤 공백 (jsTrim 용) */
    private static final Pattern JS_EDGE_SPACE = Pattern.compile("(?U)^[\\s\\uFEFF]+|[\\s\\uFEFF]+$");
    /** aria id 목록 구분자: HTML ASCII 공백 */
    private static final Pattern ASCII_SPACES = Pattern.compile("[ \\t\\n\\f\\r]+");

    private final boolean enabled;
    private final Set<String> tags;
    private final Pattern classPattern;
    private final List<String> classAllow;
    private final List<String> classDeny;
    private final Pattern idPattern;
    private final List<String> idDeny;

    /**
     * @param enabled      켜기
     * @param tags         허용할 구조 태그 (null 이면 기본값, 빈 목록이면 없음 — 클라이언트와 같은 해석. {@link #TAG_LIMIT} 밖은 무시)
     * @param classPattern class 이름 형식 (null·잘못된 정규식이면 기본값)
     * @param classAllow   null 이면 형식만 검사, 목록이면 그 이름·접두어(xxx-*)만
     * @param classDeny    막을 이름·접두어
     */
    public StructurePolicy(boolean enabled, List<String> tags, String classPattern, List<String> classAllow, List<String> classDeny) {
        this(enabled, tags, classPattern, classAllow, classDeny, null, null);
    }

    /**
     * @param enabled      켜기
     * @param tags         허용할 구조 태그 (null 이면 기본값)
     * @param classPattern class 이름 형식 (null·잘못된 정규식이면 기본값)
     * @param classAllow   null 이면 형식만 검사, 목록이면 그 이름·접두어(xxx-*)만
     * @param classDeny    막을 class 이름·접두어
     * @param idPattern    id 형식 (null·잘못된 정규식이면 기본값)
     * @param idDeny       막을 id 이름·접두어(xxx-*)
     */
    public StructurePolicy(boolean enabled, List<String> tags, String classPattern, List<String> classAllow, List<String> classDeny,
                           String idPattern, List<String> idDeny) {
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
        this.idPattern = compileOr(idPattern, DEFAULT_ID_PATTERN);
        this.idDeny = idDeny == null ? List.of() : List.copyOf(idDeny);
    }

    /** 사용자 정규식 컴파일 (없거나 너무 길거나 잘못되면 기본값) */
    private static Pattern compileOr(String src, String def) {
        try { return Pattern.compile(src == null || src.isBlank() || src.length() > PATTERN_MAX ? def : src); }
        catch (PatternSyntaxException e) { return Pattern.compile(def); }
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

    /**
     * id 속성값 검사 (값은 손대지 않음 — 앞뒤 공백이 있으면 통째로 거부)
     * @param value id 속성값
     * @return 통과하면 그대로, 아니면 빈 문자열 (꺼져 있으면 항상 빈 문자열)
     */
    public String cleanId(String value) {
        return enabled && value != null && okId(value) ? value : "";
    }

    /**
     * aria 속성값 검사 (클라이언트 cleanAria 와 같음): aria-labelledby·aria-describedby 는 id 토큰 1~8개(각 토큰 id 규칙),
     * aria-label 은 제어 문자 없는 200자 이하(빈 값 제외), aria-hidden 은 "true" 만.
     * @param name  속성 이름 (소문자)
     * @param value 속성값
     * @return 남길 값(id 목록은 한 칸 공백으로 정리), 아니면 빈 문자열
     */
    public String cleanAria(String name, String value) {
        if (!enabled || value == null) return "";
        switch (name) {
            case "aria-hidden": return value.equals("true") ? value : "";
            case "aria-label":
                return !isJsBlank(value) && value.length() <= ARIA_LABEL_MAX && !CONTROL_CHARS.matcher(value).find() ? value : "";
            case "aria-labelledby":
            case "aria-describedby": {
                List<String> toks = new ArrayList<>();
                for (String t : ASCII_SPACES.split(value)) if (!t.isEmpty()) toks.add(t);
                if (toks.isEmpty() || toks.size() > ARIA_IDS_MAX) return "";
                for (String t : toks) if (!okId(t)) return "";
                return String.join(" ", toks);
            }
            default: return "";
        }
    }

    /**
     * JS 의 {@code value.trim() === ''} 와 같은 판정 (유니코드 공백·U+FEFF 까지 공백으로 본다)
     * @param value 검사할 문자열
     * @return 공백뿐이거나 비었으면 true
     */
    static boolean isJsBlank(String value) {
        return value == null || JS_SPACE.matcher(value).replaceAll("").isEmpty();
    }

    /**
     * JS 의 {@code value.trim()} 과 같은 앞뒤 공백 제거 (NBSP·U+FEFF 등 유니코드 공백 포함 — Java trim()·strip() 은 NBSP 를 남김)
     * @param value 자를 문자열 (null 이면 "")
     * @return 앞뒤 공백을 뺀 문자열
     */
    static String jsTrim(String value) {
        return value == null ? "" : JS_EDGE_SPACE.matcher(value).replaceAll("");
    }

    /** id 값 하나가 남아도 되는지: 길이·공백·제어 문자, 형식, jm- 접두(대소문자 무시), 예약 전역(정확한 이름), idDeny */
    private boolean okId(String v) {
        return !v.isEmpty() && v.length() <= ID_MAX && !ID_BAD_CHARS.matcher(v).find() && idPattern.matcher(v).find()
                && !v.regionMatches(true, 0, "jm-", 0, 3) && !RESERVED_IDS.contains(v) && !matchesAny(v, idDeny);
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
