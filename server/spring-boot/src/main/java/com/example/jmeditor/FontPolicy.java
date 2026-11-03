package com.example.jmeditor;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 글꼴 허용 목록 — style font-family 값 정규화 (클라이언트 core/font-policy.js 와 같은 규칙).
 * 쉼표 목록에서 허용 목록에 있는 첫 이름을 남긴다. 목록 밖 글꼴만 있으면 기본 글꼴(Pretendard)로 바꾸고,
 * serif·inherit 같은 일반 패밀리·키워드만 있으면 지운다.
 * 저장 값에는 대체 글꼴을 붙인다: 이름 → (비슷한 무료 웹폰트) → Pretendard → serif|sans-serif.
 */
public final class FontPolicy {

    /** 기본 글꼴 — 목록 밖 글꼴을 바꿀 글꼴이자 모든 저장 값의 마지막 대체 글꼴 */
    public static final String DEFAULT_FONT = "Pretendard";

    /** 기본 글꼴 목록 */
    public static final List<String> DEFAULT_FAMILIES = List.of(DEFAULT_FONT, "맑은 고딕", "Noto Sans KR", "Noto Sans", "Roboto", "굴림", "돋움", "바탕", "궁서");

    /** 영문 별칭 → 목록 이름 (소문자로 비교) */
    private static final Map<String, String> ALIASES = Map.of("malgun gothic", "맑은 고딕", "gulim", "굴림", "dotum", "돋움", "batang", "바탕", "gungsuh", "궁서");
    /** 설치되지 않았을 때 먼저 쓸 비슷한 무료 웹폰트 (jm-editor.fonts.css 가 불러옴) */
    private static final Map<String, String> SIMILAR = Map.of("굴림", "Nanum Gothic", "돋움", "Nanum Gothic", "바탕", "Nanum Myeongjo");
    /** 명조 계열 (마지막 대체가 serif) */
    private static final Set<String> SERIF_FONTS = Set.of("바탕");
    /** 글꼴 이름이 아닌 일반 패밀리·CSS 전역 키워드·예약어 (소문자). '-' 로 시작하는 브라우저 전용 이름도 제외 */
    private static final Set<String> NOT_FONT_NAMES = Set.of("serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji", "fangsong", "-apple-system", "blinkmacsystemfont", "inherit", "initial", "unset", "revert", "revert-layer", "default");
    /** 설정 목록에 쓸 수 있는 이름 형식 (따옴표·세미콜론 등이 style 로 나가지 않게) */
    private static final Pattern NAME_OK = Pattern.compile("^[\\p{L}\\p{N} _-]{1,64}$");

    private final List<String> families;
    private final List<String> lower;

    /**
     * @param families 허용 목록 (null 이면 기본 목록, 형식에 어긋난 이름은 버림)
     */
    public FontPolicy(List<String> families) {
        LinkedHashSet<String> names = new LinkedHashSet<>();
        for (String f : families == null ? DEFAULT_FAMILIES : families) {
            String n = f == null ? "" : StructurePolicy.jsTrim(f);
            if (NAME_OK.matcher(n).matches()) names.add(n);
        }
        this.families = List.copyOf(names);
        this.lower = this.families.stream().map(f -> f.toLowerCase(Locale.ROOT)).toList();
    }

    /** @return 기본 목록을 쓰는 정책 */
    public static FontPolicy defaults() {
        return new FontPolicy(null);
    }

    /** @return 정리한 허용 목록 */
    public List<String> families() {
        return families;
    }

    /**
     * font-family 값에서 허용 목록의 첫 이름을 찾는다 (대소문자 무시, 영문 별칭 변환)
     * @param value 쉼표 목록
     * @return 목록에 적힌 이름, 없으면 null
     */
    public String name(String value) {
        for (String name : splitNames(value == null ? "" : value)) {
            String key = name.toLowerCase(Locale.ROOT);
            int at = lower.indexOf(key);
            if (at < 0 && ALIASES.containsKey(key)) at = lower.indexOf(ALIASES.get(key).toLowerCase(Locale.ROOT));
            if (at >= 0) return families.get(at);
        }
        return null;
    }

    /**
     * 저장할 글꼴 이름: 허용 목록의 첫 이름. 없고 목록 밖 글꼴 이름이 있으면 기본 글꼴(허용 목록에 있을 때만),
     * 일반 패밀리·키워드뿐이거나 기본 글꼴을 허용하지 않으면 null (빈 목록 = 글꼴 끔)
     * @param value 쉼표 목록
     * @return 글꼴 이름 또는 null
     */
    public String storedName(String value) {
        String name = name(value);
        if (name != null) return name;
        if (!lower.contains(DEFAULT_FONT.toLowerCase(Locale.ROOT))) return null;
        for (String n : splitNames(value == null ? "" : value)) {
            String key = n.toLowerCase(Locale.ROOT);
            if (NAME_OK.matcher(n).matches() && !key.startsWith("-") && !NOT_FONT_NAMES.contains(key)) return DEFAULT_FONT;
        }
        return null;
    }

    /**
     * 저장할 font-family 값: 이름 → 비슷한 무료 웹폰트 → 기본 글꼴 → serif|sans-serif
     * @param name {@link #storedName} 결과
     * @return 예: {@code "바탕", "Nanum Myeongjo", "Pretendard", serif}
     */
    public static String cssValue(String name) {
        LinkedHashSet<String> chain = new LinkedHashSet<>();
        chain.add(name);
        if (SIMILAR.containsKey(name)) chain.add(SIMILAR.get(name));
        chain.add(DEFAULT_FONT);
        StringBuilder sb = new StringBuilder();
        for (String n : chain) sb.append('"').append(n).append("\", ");
        return sb.append(SERIF_FONTS.contains(name) ? "serif" : "sans-serif").toString();
    }

    /** 쉼표 목록을 따옴표를 지켜 나눈다 (앞뒤 공백·감싼 따옴표 제거) */
    private static List<String> splitNames(String value) {
        List<String> names = new ArrayList<>();
        char quote = 0;
        int start = 0;
        for (int i = 0; i <= value.length(); i++) {
            char c = i < value.length() ? value.charAt(i) : ',';
            if (quote != 0 && i < value.length()) { if (c == quote) quote = 0; }
            else if (c == '"' || c == '\'') quote = c;
            else if (c == ',') {
                String n = StructurePolicy.jsTrim(value.substring(start, i));
                if (n.length() >= 2 && (n.charAt(0) == '"' || n.charAt(0) == '\'') && n.charAt(n.length() - 1) == n.charAt(0)) n = StructurePolicy.jsTrim(n.substring(1, n.length() - 1));
                if (!n.isEmpty()) names.add(n);
                start = i + 1;
            }
        }
        return names;
    }
}
