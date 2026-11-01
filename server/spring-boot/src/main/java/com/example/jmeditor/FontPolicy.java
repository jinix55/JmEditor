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
 */
public final class FontPolicy {

    /** 기본 글꼴 목록 */
    public static final List<String> DEFAULT_FAMILIES = List.of("맑은 고딕", "Noto Sans KR", "Noto Sans", "굴림", "돋움", "바탕", "궁서", "함초롬바탕", "함초롬돋움", "HY헤드라인M", "Arial", "Times New Roman");

    /** 영문 별칭 → 목록 이름 (소문자로 비교) */
    private static final Map<String, String> ALIASES = Map.of("malgun gothic", "맑은 고딕", "hcr batang", "함초롬바탕", "gulim", "굴림", "dotum", "돋움", "batang", "바탕");
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
