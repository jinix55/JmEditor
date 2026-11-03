package com.example.jmeditor;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 글꼴 허용 목록 — style font-family 값 정규화 (클라이언트 core/font-policy.js 와 같은 규칙).
 * 쉼표 목록에서 허용 목록에 있는 첫 이름만 남기고, 없으면 지운다 (serif 같은 일반 패밀리만 있어도 지워짐).
 * 허용 목록은 툴바 목록(families) 다음에 옛 글꼴(legacy). 저장 값은 {@code "이름", serif|sans-serif}.
 */
public final class FontPolicy {

    /** 기본 툴바 글꼴 목록 (무료 공개 웹폰트) */
    public static final List<String> DEFAULT_FAMILIES = List.of("Noto Sans KR", "Noto Serif KR");
    /** 기본 옛 글꼴 목록 (툴바에는 없고 지우지만 않음) */
    public static final List<String> DEFAULT_LEGACY = List.of("맑은 고딕", "Noto Sans", "Roboto", "굴림", "돋움", "바탕", "궁서", "함초롬바탕", "함초롬돋움", "한컴바탕", "HY헤드라인M", "Apple SD Gothic Neo", "Arial", "Helvetica Neue", "Times New Roman");

    /** 영문 별칭 → 목록 이름 (소문자로 비교) */
    private static final Map<String, String> ALIASES = Map.of("malgun gothic", "맑은 고딕", "hcr batang", "함초롬바탕", "gulim", "굴림", "dotum", "돋움", "batang", "바탕", "helveticaneue", "Helvetica Neue");
    /** 설정 목록에 쓸 수 있는 이름 형식 (따옴표·세미콜론 등이 style 로 나가지 않게) */
    private static final Pattern NAME_OK = Pattern.compile("^[\\p{L}\\p{N} _-]{1,64}$");
    /** 명조 계열 이름 (대체 글꼴 serif). 그 밖은 sans-serif */
    private static final Pattern SERIF = Pattern.compile("serif|myeongjo|명조|바탕|batang|궁서|gungsuh|times", Pattern.CASE_INSENSITIVE); // ASCII 만 대소문자 무시 (클라이언트 /i 와 같게)
    private static final Pattern SANS = Pattern.compile("sans", Pattern.CASE_INSENSITIVE);

    private final List<String> families;
    private final List<String> lower;

    /**
     * @param families 툴바 글꼴 목록 (null 이면 기본 목록, 형식에 어긋난 이름은 버림). 옛 글꼴은 기본 목록
     */
    public FontPolicy(List<String> families) {
        this(families, null);
    }

    /**
     * @param families 툴바 글꼴 목록 (null 이면 기본 목록)
     * @param legacy 옛 글꼴 목록 (null 이면 기본 목록, 빈 목록이면 툴바 목록만 허용)
     */
    public FontPolicy(List<String> families, List<String> legacy) {
        LinkedHashSet<String> names = new LinkedHashSet<>();
        addNames(names, families == null ? DEFAULT_FAMILIES : families);
        addNames(names, legacy == null ? DEFAULT_LEGACY : legacy);
        this.families = List.copyOf(names);
        this.lower = this.families.stream().map(f -> f.toLowerCase(Locale.ROOT)).toList();
    }

    /** 형식에 맞는 이름만 순서대로 더한다 */
    private static void addNames(LinkedHashSet<String> names, List<String> list) {
        for (String f : list) {
            String n = f == null ? "" : StructurePolicy.jsTrim(f);
            if (NAME_OK.matcher(n).matches()) names.add(n);
        }
    }

    /**
     * 저장할 font-family 값: 이름과 대체 글꼴
     * @param name 허용 목록의 이름
     * @return 예: {@code "Noto Serif KR", serif}
     */
    public static String cssValue(String name) {
        boolean serif = SERIF.matcher(name).find() && !SANS.matcher(name).find();
        return "\"" + name + "\", " + (serif ? "serif" : "sans-serif");
    }

    /** @return 기본 목록을 쓰는 정책 */
    public static FontPolicy defaults() {
        return new FontPolicy(null);
    }

    /** @return 정리한 허용 목록 (툴바 목록 + 옛 글꼴) */
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
